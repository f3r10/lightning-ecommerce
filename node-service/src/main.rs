use crate::{config::AppConfig, db::AppDb, types::AppState};
use std::sync::Arc;
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
    let node = node::build_node(&config, entropy)?;
    let db = Arc::new(AppDb::open(&config.storage_dir)?);


    node.start()?;
    tracing::info!("Node started. ID: {}", node.node_id());
    // block until synced
    tokio::time::sleep(Duration::from_secs(10)).await;
    tracing::info!("Status: {:?}", node.status());

    // Connect to the LSP peer. Required before receive_via_jit_channel can work —
    // ldk-node does not auto-connect from set_liquidity_source_lsps2 alone.
    node::connect_to_lsp(&node, &config)?;

    // Wait for the first esplora sync to complete before accepting requests.
    // Without this, receive_via_jit_channel can fail because the node doesn't
    // yet know the current block height needed to set invoice expiry correctly.
    tracing::info!("Waiting for initial sync...");
    loop {
        if node.status().latest_onchain_wallet_sync_timestamp.is_some() {
            tracing::info!("Sync complete, ready to accept requests.");
            break;
        }
        tokio::time::sleep(std::time::Duration::from_secs(1)).await;
    }

    // spawn event loop
    tokio::spawn(event_loop::run(Arc::clone(&node), Arc::clone(&db)));

    // start the HTTP server
    let port = config.port;
    let state = AppState {node: Arc::clone(&node), db, config};
    let app = api::router(state);
    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{}", port)).await?;
    tracing::info!("Listening on port {}", port);
    axum::serve(listener, app).await?;
    //tracing::info!("Syncing...");

    

    //node.stop()?;
    Ok(())
  }
