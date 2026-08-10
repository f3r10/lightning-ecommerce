mod config;

use config::LspConfig;
use ldk_node::lightning::ln::msgs::SocketAddress;
use ldk_node::liquidity::LSPS2ServiceConfig;
use ldk_node::entropy::{NodeEntropy, generate_entropy_mnemonic};
use ldk_node::logger::LogLevel;
use ldk_node::{Builder, Event};
use std::time::Duration;

fn load_or_create_entropy(storage_dir: &str) -> anyhow::Result<NodeEntropy> {
    let seed_file = format!("{}/seed", storage_dir);
    std::fs::create_dir_all(storage_dir)?;
    if std::path::Path::new(&seed_file).exists() {
        let bytes = std::fs::read(&seed_file)?;
        let seed: [u8; 64] = bytes
            .try_into()
            .map_err(|_| anyhow::anyhow!("bad seed file"))?;
        Ok(NodeEntropy::from_seed_bytes(seed))
    } else {
        let mnemonic = generate_entropy_mnemonic(None);
        println!("LSP mnemonic (save this): {}", mnemonic);
        let seed: [u8; 64] = mnemonic.to_seed("");
        std::fs::write(&seed_file, seed)?;
        Ok(NodeEntropy::from_seed_bytes(seed))
    }
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let config = LspConfig::from_env()?;
    let entropy = load_or_create_entropy(&config.storage_dir)?;

    let lsps2_config = LSPS2ServiceConfig {
        require_token: config.lsps2_token.clone(),
        advertise_service: config.lsps2_advertise_service,
        channel_opening_fee_ppm: config.lsps2_channel_opening_fee_ppm,
        channel_over_provisioning_ppm: config.lsps2_channel_over_provisioning_ppm,
        min_channel_opening_fee_msat: config.lsps2_min_channel_opening_fee_msat,
        min_channel_lifetime: config.lsps2_min_channel_lifetime,
        max_client_to_self_delay: config.lsps2_max_client_to_self_delay,
        min_payment_size_msat: config.lsps2_min_payment_size_msat,
        max_payment_size_msat: config.lsps2_max_payment_size_msat,
        client_trusts_lsp: true,
        disable_client_reserve: true,
    };

    let mut builder = Builder::new();
    builder.set_network(config.network);
    builder.set_chain_source_esplora(config.esplora_url.clone(), None);
    builder.set_gossip_source_p2p();
    builder.set_storage_dir_path(config.storage_dir.clone());
    builder.enable_liquidity_provider(lsps2_config);
    builder.set_listening_addresses(vec![config.listen_address.parse::<SocketAddress>()?])?;
    builder.set_filesystem_logger(None, Some(LogLevel::Trace));

    let node = builder.build(entropy)?;

    let start_ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)?
        .as_secs();

    node.start()?;

    println!("LSP node ID : {}", node.node_id());
    println!("LSP address : {}", config.advertise_address);
    println!("Onchain address: {}", node.onchain_payment().new_address()?);

    println!("Waiting for sync...");
    loop {
        let synced = node
            .status()
            .latest_onchain_wallet_sync_timestamp
            .map_or(false, |t| t >= start_ts);
        if synced {
            break;
        }
        tokio::time::sleep(Duration::from_secs(1)).await;
    }

    let balance = node.list_balances().spendable_onchain_balance_sats;
    println!("Onchain balance: {} sats", balance);

    // Minimum to cover one JIT channel at the current payment floor (~18,563 sats
    // channel + ~1,500 sats funding-tx fee at typical mutinynet fee rates).
    if balance < 5_000 {
        println!("\nNeeds funding to open JIT channels.");
        match config.network {
            ldk_node::bitcoin::Network::Signet => {
                println!("Send >=25,000 sats to the address above from https://faucet.mutinynet.com/");
            }
            ldk_node::bitcoin::Network::Testnet => {
                println!("Send >=25,000 sats to the address above from a testnet4 faucet.");
            }
            ldk_node::bitcoin::Network::Bitcoin => {
                println!("Send >=25,000 sats to the address above.");
            }
            _ => {
                println!("Send >=25,000 sats to the address above.");
            }
        }
        println!("Then restart lsp-service.");
        node.stop()?;
        return Ok(());
    }

    println!("\nLSP ready. Configure node-service .env with:");
    println!("  LSP_1_NODE_ID={}", node.node_id());
    println!("  LSP_1_ADDRESS={}", config.advertise_address);
    if config.lsps2_token.is_some() {
        println!("  LSP_1_TOKEN=<set to your LSPS2_TOKEN value>");
    } else {
        println!("  LSP_1_TOKEN=");
    }

    loop {
        match node.next_event_async().await {
            Event::ChannelReady {
                channel_id,
                counterparty_node_id,
                ..
            } => {
                println!(
                    "Channel ready: {:?} with {:?}",
                    channel_id, counterparty_node_id
                );
                node.event_handled()?;
            }
            Event::PaymentForwarded {
                total_fee_earned_msat,
                ..
            } => {
                println!("Payment forwarded, fee: {:?} msat", total_fee_earned_msat);
                node.event_handled()?;
            }
            Event::ChannelClosed {
                channel_id,
                reason,
                ..
            } => {
                println!("Channel closed: {:?}, reason: {:?}", channel_id, reason);
                node.event_handled()?;
            }
            other => {
                println!("Event: {:?}", other);
                node.event_handled()?;
            }
        }
    }
}
