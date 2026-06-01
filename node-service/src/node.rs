use ldk_node::bitcoin::Network;
use ldk_node::Builder;
use ldk_node::config::Config;
use ldk_node::lightning::ln::msgs::SocketAddress;
use ldk_node::bitcoin::secp256k1::PublicKey;
use crate::AppConfig;
use crate::types::{LspConfig, LspInfoResponse};
use ldk_node::entropy::NodeEntropy;
use ldk_node::Node;
use std::sync::Arc;
use std::str::FromStr;

pub fn build_node(config: &AppConfig, entropy: NodeEntropy) -> anyhow::Result<Arc<Node>> {
    let lsp_node_id = PublicKey::from_str(&config.lsp_node_id)?;
    let lsp_address = config.lsp_address.parse::<SocketAddress>()?;

    let mut node_config = Config::default();
    node_config.network = config.network;
    node_config.storage_dir_path = config.storage_dir.clone();

    // The LSP opens JIT Anchor channels on our behalf. Exempt it from the per-channel
    // on-chain reserve requirement — the LSP is trusted and will broadcast the anchor
    // commitment tx if needed.
    if let Some(ref mut anchor_cfg) = node_config.anchor_channels_config {
        anchor_cfg.trusted_peers_no_reserve.push(lsp_node_id);
    }

    let mut builder = Builder::from_config(node_config);
    builder.set_chain_source_esplora(config.esplora_url.clone(), None);
    builder.set_gossip_source_p2p();
    builder.set_liquidity_source_lsps2(lsp_node_id, lsp_address, config.lsp_token.clone());

    let node = builder.build(entropy)?;
    Ok(Arc::new(node))
}

pub async fn build_node_dynamic(config: &AppConfig, discovery_url: &str, entropy: NodeEntropy) -> anyhow::Result<(Arc<Node>, LspConfig)> {
    // 1. Discover the LSP details dynamically
    let lsp = discover_lsp_config(discovery_url).await?;
    tracing::info!("Discovered LSP: {} at {}", lsp.node_id, lsp.address);

    let mut builder = Builder::new();
    builder.set_network(config.network);
    builder.set_chain_source_esplora(config.esplora_url.clone(), None);
    builder.set_gossip_source_p2p();
    builder.set_storage_dir_path(config.storage_dir.clone());

    // 2. Plug in the discovered credentials
    builder.set_liquidity_source_lsps2(lsp.node_id, lsp.address.clone(), None);

    let node = builder.build(entropy)?;
    Ok((Arc::new(node), lsp))
}

pub async fn discover_lsp_config(url: &str) -> anyhow::Result<LspConfig> {
    let client = reqwest::Client::new();
    let response: LspInfoResponse = client
        .get(url)
        .send()
        .await?
        .json()
        .await?;

    // Most LSPs provide at least one URI in the format "pubkey@host:port"
    let raw_uri = response.uris.first()
        .ok_or_else(|| anyhow::anyhow!("No URIs found in LSP discovery response"))?;

    let parts: Vec<&str> = raw_uri.split('@').collect();
    if parts.len() != 2 {
        return Err(anyhow::anyhow!("Malformed LSP URI: {}", raw_uri));
    }

    let node_id = PublicKey::from_str(parts[0])?;
    let address = SocketAddress::from_str(parts[1])?;

    Ok(LspConfig { node_id, address })
}

pub fn connect_to_lsp(node: &Arc<Node>, pubkey: PublicKey, address: SocketAddress) -> anyhow::Result<()> {
    //let lsp_node_id = PublicKey::from_str(&config.lsp_node_id)?;
    //let lsp_address = config.lsp_address.parse::<SocketAddress>()?;
    // persist = true so ldk-node re-establishes the connection automatically on restart.
    // We log a warning instead of failing — a connection error here should not prevent
    // the server from starting. The invoice endpoint will surface the error if the LSP
    // is still unreachable when a payment is attempted.
    match node.connect(pubkey, address.clone(), true) {
        Ok(()) => tracing::info!("Connected to LSP peer: {}", pubkey),
        Err(e) => tracing::warn!(
            "Could not connect to LSP peer {} at {} — {:?}. \
             Check LSP_NODE_ID and LSP_ADDRESS in .env. \
             The server will start but invoices will fail until the LSP is reachable.",
            pubkey, address, e
        ),
    }
    Ok(())
}
