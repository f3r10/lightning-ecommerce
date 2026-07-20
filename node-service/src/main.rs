use crate::{config::AppConfig, db::AppDb, types::AppState};
use std::sync::Arc;
use std::sync::Mutex;
use std::collections::HashSet;
use std::time::Duration;

mod config;
mod entropy;
mod node;
mod db;
mod types;
mod invoice;
mod api;
mod event_loop;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
      tracing_subscriber::fmt::init();
      //dotenvy::dotenv().ok();
      //dotenvy::dotenv().expect("Failed to find .env file");
      //let config = AppConfig::from_env()?;
      //println!("config {:?}", config.network);
      //tracing::info!("Config loaded: network={:?}", config.network);
      //Ok(())
    let config = AppConfig::from_env()?;
    let entropy = entropy::load_or_create(&config)?;
    let db = Arc::new(AppDb::open(&config.storage_dir)?);

    let node = node::build_node(&config, entropy)?;
    node.start()?;
    tracing::info!("Node started. ID: {}", node.node_id());

    // Connect to every configured LSP. ldk-node needs an active peer connection
    // before it can negotiate JIT channels via LSPS2.
    let lsp_pubkeys: Vec<ldk_node::bitcoin::secp256k1::PublicKey> = config.lsps.iter()
        .map(|lsp| lsp.node_id.parse().expect("invalid LSP node_id in config"))
        .collect();

    for lsp in &config.lsps {
        let pubkey = lsp.node_id.parse().expect("invalid LSP node_id in config");
        let address = lsp.address.parse().expect("invalid LSP address in config");
        node::connect_to_lsp(&node, pubkey, address)?;
    }

    // Wait for the first esplora sync to complete before accepting requests.
    // Without this, receive_via_jit_channel can fail because the node doesn't
    // yet know the current block height needed to set invoice expiry correctly.
    tracing::info!("Waiting for initial sync...");
    loop {
        if node.status().latest_onchain_wallet_sync_timestamp.is_some() {
            tracing::info!("Sync complete.");
            break;
        }
        tokio::time::sleep(Duration::from_secs(1)).await;
    }

    // If JIT channels from a previous session exist, wait until at least one is
    // live before accepting payment requests. This prevents HTLCIntercepted events
    // from being forwarded to a peer-disconnected channel (immediate PeerOffline).
    // is_usable: channel_ready exchanged, peer connected, no shutdown in progress.
    tracing::info!("Checking LSP channel state ({} LSP(s) configured)...", lsp_pubkeys.len());
    let mut lsp_channel_ready = false;
    for _ in 0..30u8 {
        let channels = node.list_channels();
        let lsp_channels: Vec<_> = channels.iter()
            .filter(|ch| lsp_pubkeys.contains(&ch.counterparty.node_id))
            .collect();

        if lsp_channels.is_empty() {
            tracing::info!("No existing LSP channels — will open JIT on first payment.");
            lsp_channel_ready = true;
            break;
        }
        if lsp_channels.iter().any(|ch| ch.is_usable) {
            let usable = lsp_channels.iter().filter(|ch| ch.is_usable).count();
            tracing::info!("{}/{} LSP channel(s) live.", usable, lsp_channels.len());
            lsp_channel_ready = true;
            break;
        }
        tracing::debug!("LSP channels not yet usable, waiting...");
        tokio::time::sleep(Duration::from_secs(1)).await;
    }
    if !lsp_channel_ready {
        tracing::warn!("No LSP channel became live within 30s; payments may fail until an LSP reconnects.");
    }

    // spawn event loop
    let jit_channels_pending = Arc::new(Mutex::new(HashSet::new()));
    tokio::spawn(event_loop::run(Arc::clone(&node), Arc::clone(&db), Arc::clone(&jit_channels_pending)));

    // start the HTTP server
    let port = config.port;
    let state = AppState { node: Arc::clone(&node), db, config, jit_channels_pending };
    let app = api::router(state);
    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{}", port)).await?;
    tracing::info!("Listening on port {}", port);
    axum::serve(listener, app).await?;
    //tracing::info!("Syncing...");

    

    //node.stop()?;
    Ok(())
  }
