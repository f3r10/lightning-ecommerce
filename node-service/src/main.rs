use crate::{config::AppConfig, db::AppDb, types::AppState};
use std::sync::Arc;
use std::sync::atomic::AtomicUsize;
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

    // Connect to the LSP peer immediately. Required before receive_via_jit_channel can work —
    // ldk-node does not auto-connect from set_liquidity_source_lsps2 alone.
    let lsp_node_id: ldk_node::bitcoin::secp256k1::PublicKey = config.lsp_node_id.parse().expect("invalid LSP_NODE_ID");
    let lsp_address = config.lsp_address.parse().expect("invalid LSP_ADDRESS");
    node::connect_to_lsp(&node, lsp_node_id, lsp_address)?;

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

    // If a JIT channel from a previous session exists, wait for it to become live
    // (peer connected + channel ready) before accepting payment requests. This prevents
    // HTLCIntercepted events from forwarding to a peer-disconnected channel, which
    // causes immediate PeerOffline failures in send_htlc.
    // is_usable: channel_ready exchanged, peer connected, no shutdown in progress.
    tracing::info!("Checking LSP channel state...");
    let mut lsp_channel_ready = false;
    for _ in 0..30u8 {
        let channels = node.list_channels();
        let lsp_channel = channels.iter().find(|ch| ch.counterparty_node_id == lsp_node_id);
        match lsp_channel {
            None => {
                tracing::info!("No existing LSP channel — will open JIT on first payment.");
                lsp_channel_ready = true;
                break;
            }
            Some(ch) if ch.is_usable => {
                tracing::info!("LSP channel is live (outbound_capacity={} sats).", ch.outbound_capacity_msat / 1000);
                lsp_channel_ready = true;
                break;
            }
            Some(ch) => {
                tracing::debug!(
                    "LSP channel not yet usable (is_usable={}, is_channel_ready={}), waiting...",
                    ch.is_usable, ch.is_channel_ready
                );
            }
        }
        tokio::time::sleep(Duration::from_secs(1)).await;
    }
    if !lsp_channel_ready {
        tracing::warn!("LSP channel did not become live within 30s; payments may fail until the LSP reconnects.");
    }

    // spawn event loop
    let channel_pending_count = Arc::new(AtomicUsize::new(0));
    tokio::spawn(event_loop::run(Arc::clone(&node), Arc::clone(&db), Arc::clone(&channel_pending_count)));

    // start the HTTP server
    let port = config.port;
    let state = AppState { node: Arc::clone(&node), db, config, channel_pending_count };
    let app = api::router(state);
    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{}", port)).await?;
    tracing::info!("Listening on port {}", port);
    axum::serve(listener, app).await?;
    //tracing::info!("Syncing...");

    

    //node.stop()?;
    Ok(())
  }
