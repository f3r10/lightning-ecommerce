use ldk_node::bitcoin::Network;
use ldk_node::lightning::ln::msgs::SocketAddress;
use ldk_node::{Builder, Event};
use ldk_node::liquidity::LSPS2ServiceConfig;
use ldk_node::entropy::{NodeEntropy, generate_entropy_mnemonic};
use std::time::Duration;

const DATA_DIR: &str = "./data/lsp";
const SEED_FILE: &str = "./data/lsp/seed";
const LISTEN_ADDR: &str = "127.0.0.1:9737";

fn load_or_create_entropy() -> anyhow::Result<NodeEntropy> {
    std::fs::create_dir_all(DATA_DIR)?;
    if std::path::Path::new(SEED_FILE).exists() {
        let bytes = std::fs::read(SEED_FILE)?;
        let seed: [u8; 64] = bytes.try_into().map_err(|_| anyhow::anyhow!("bad seed file"))?;
        Ok(NodeEntropy::from_seed_bytes(seed))
    } else {
        let mnemonic = generate_entropy_mnemonic(None);
        println!("LSP mnemonic (save this): {}", mnemonic);
        let seed: [u8; 64] = mnemonic.to_seed("");
        std::fs::write(SEED_FILE, seed)?;
        Ok(NodeEntropy::from_seed_bytes(seed))
    }
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let entropy = load_or_create_entropy()?;

    let lsps2_config = LSPS2ServiceConfig {
        require_token: None,
        advertise_service: true,
        channel_opening_fee_ppm: 10_000,
        channel_over_provisioning_ppm: 250_000,
        min_channel_opening_fee_msat: 0,
        min_channel_lifetime: 144,
        max_client_to_self_delay: 1024,
        min_payment_size_msat: 1_000,
        max_payment_size_msat: 100_000_000_000,
        client_trusts_lsp: true,
        disable_client_reserve: false,
    };

    let mut builder = Builder::new();
    builder.set_network(Network::Signet);
    builder.set_chain_source_esplora("https://mutinynet.com/api".to_string(), None);
    builder.set_gossip_source_p2p();
    builder.set_storage_dir_path(DATA_DIR.to_string());
    builder.set_liquidity_provider_lsps2(lsps2_config);
    builder.set_listening_addresses(vec![LISTEN_ADDR.parse::<SocketAddress>()?])?;

    let node = builder.build(entropy)?;

    let start_ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)?
        .as_secs();

    node.start()?;

    println!("LSP node ID : {}", node.node_id());
    println!("LSP address : {}", LISTEN_ADDR);
    println!("Onchain address: {}", node.onchain_payment().new_address()?);

    println!("Waiting for sync...");
    loop {
        let synced = node.status().latest_onchain_wallet_sync_timestamp
            .map_or(false, |t| t >= start_ts);
        if synced { break; }
        tokio::time::sleep(Duration::from_secs(1)).await;
    }

    let balance = node.list_balances().spendable_onchain_balance_sats;
    println!("Onchain balance: {} sats", balance);

    if balance < 200_000 {
        println!("\nNeeds funding to open JIT channels.");
        println!("Send >=200,000 sats to the address above from https://faucet.mutinynet.com/");
        println!("Then restart lsp-service.");
        node.stop()?;
        return Ok(());
    }

    println!("\nLSP ready. Configure node-service .env with:");
    println!("  LSP_NODE_ID={}", node.node_id());
    println!("  LSP_ADDRESS={}", LISTEN_ADDR);
    println!("  LSP_TOKEN=");

    loop {
        match node.next_event_async().await {
            Event::ChannelReady { channel_id, counterparty_node_id, .. } => {
                println!("Channel ready: {:?} with {:?}", channel_id, counterparty_node_id);
                node.event_handled()?;
            }
            Event::PaymentForwarded { total_fee_earned_msat, .. } => {
                println!("Payment forwarded, fee: {:?} msat", total_fee_earned_msat);
                node.event_handled()?;
            }
            Event::ChannelClosed { channel_id, reason, .. } => {
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
