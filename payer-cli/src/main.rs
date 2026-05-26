use ldk_node::bitcoin::Network;
use ldk_node::lightning::ln::msgs::SocketAddress;
use ldk_node::bitcoin::secp256k1::PublicKey;
use ldk_node::{Builder, Event};
use ldk_node::entropy::{NodeEntropy, generate_entropy_mnemonic};
use std::str::FromStr;
use std::time::Duration;

const LSP_NODE_ID: &str = "03253208ea59217373367375e40f7a1719188667f659e0a121bed50d2155f85a52";
const LSP_ADDRESS: &str = "127.0.0.1:9737";
const DATA_DIR: &str = "./data/payer";
const SEED_FILE: &str = "./data/payer/seed";

fn load_or_create_entropy() -> anyhow::Result<NodeEntropy> {
    std::fs::create_dir_all(DATA_DIR)?;
    if std::path::Path::new(SEED_FILE).exists() {
        let bytes = std::fs::read(SEED_FILE)?;
        let seed: [u8; 64] = bytes.try_into().map_err(|_| anyhow::anyhow!("bad seed file"))?;
        Ok(NodeEntropy::from_seed_bytes(seed))
    } else {
        let mnemonic = generate_entropy_mnemonic(None);
        println!("Payer mnemonic (save this): {}", mnemonic);
        let seed: [u8; 64] = mnemonic.to_seed("");
        std::fs::write(SEED_FILE, seed)?;
        Ok(NodeEntropy::from_seed_bytes(seed))
    }
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let bolt11 = std::env::args().nth(1)
        .expect("Usage: cargo run -p payer-cli -- <bolt11_invoice>");

    let entropy = load_or_create_entropy()?;

    let mut builder = Builder::new();
    builder.set_network(Network::Signet);
    builder.set_chain_source_esplora("https://mutinynet.com/api".to_string(), None);
    builder.set_gossip_source_p2p();
    builder.set_storage_dir_path(DATA_DIR.to_string());

    // Record time before starting so we wait for a *fresh* sync, not a cached
    // timestamp from a previous run that was persisted to the SQLite DB.
    let start_ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)?
        .as_secs();

    let node = builder.build(entropy)?;
    node.start()?;

    println!("Payer node ID: {}", node.node_id());

    let lsp_pubkey = PublicKey::from_str(LSP_NODE_ID)?;
    let lsp_addr = LSP_ADDRESS.parse::<SocketAddress>()?;
    match node.connect(lsp_pubkey, lsp_addr.clone(), true) {
        Ok(()) => println!("Connected to local lsp-service"),
        Err(e) => println!("Connect warning: {:?}", e),
    }

    println!("Waiting for fresh sync...");
    loop {
        let synced = node.status().latest_onchain_wallet_sync_timestamp
            .map_or(false, |t| t >= start_ts);
        if synced { break; }
        tokio::time::sleep(Duration::from_secs(1)).await;
    }

    let balance = node.list_balances().spendable_onchain_balance_sats;
    println!("On-chain balance: {} sats", balance);

    let channels = node.list_channels();
    if channels.is_empty() {
        if balance < 950_000 {
            println!("\nNo channel and insufficient funds.");
            println!("Fund this address with >=950,000 sats from https://faucet.mutinynet.com/");
            println!("Address: {}", node.onchain_payment().new_address()?);
            node.stop()?;
            return Ok(());
        }

        println!("Opening 900,000 sat channel to local lsp-service...");
        node.open_channel(lsp_pubkey, lsp_addr, 900_000, None, None)?;

        println!("Waiting for channel ready (~30s on mutinynet)...");
        loop {
            match node.next_event_async().await {
                Event::ChannelReady { channel_id, .. } => {
                    println!("Channel ready: {:?}", channel_id);
                    node.event_handled()?;
                    break;
                }
                other => {
                    println!("Event: {:?}", other);
                    node.event_handled()?;
                }
            }
        }
    } else {
        let ch = &channels[0];
        println!("Using existing channel — outbound capacity: {} sats", ch.outbound_capacity_msat / 1000);
    }

    println!("Paying invoice...");
    let invoice = bolt11.parse()?;
    let payment_id = node.bolt11_payment().send(&invoice, None)?;
    println!("Payment submitted, ID: {:?}", payment_id);

    loop {
        match node.next_event_async().await {
            Event::PaymentSuccessful { payment_hash, .. } => {
                println!("Payment successful! Hash: {:?}", payment_hash);
                node.event_handled()?;
                break;
            }
            Event::PaymentFailed { payment_hash, reason, .. } => {
                println!("Payment failed. Hash: {:?}, reason: {:?}", payment_hash, reason);
                node.event_handled()?;
                break;
            }
            other => {
                println!("Event: {:?}", other);
                node.event_handled()?;
            }
        }
    }

    node.stop()?;
    Ok(())
}
