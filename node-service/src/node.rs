use ldk_node::bitcoin::Network;
use ldk_node::Builder;
use ldk_node::lightning::ln::msgs::SocketAddress;
use ldk_node::bitcoin::secp256k1::PublicKey;
use crate::AppConfig;
use ldk_node::entropy::NodeEntropy;
use ldk_node::Node;
use std::sync::Arc;
use std::str::FromStr;

pub fn build_node(config: &AppConfig, entropy: NodeEntropy) -> anyhow::Result<Arc<Node>> {
    let mut builder = Builder::new();

    builder.set_network(config.network);
    builder.set_chain_source_esplora(config.esplora_url.clone(), None);
    builder.set_gossip_source_p2p();
    builder.set_storage_dir_path(config.storage_dir.clone());

    let lsp_node_id = PublicKey::from_str(&config.lsp_node_id)?;
    let lsp_address = config.lsp_address.parse::<SocketAddress>()?;
    builder.set_liquidity_source_lsps2(lsp_node_id, lsp_address, config.lsp_token.clone());

    let node = builder.build(entropy)?;
    Ok(Arc::new(node))
}

pub fn connect_to_lsp(node: &Node, config: &AppConfig) -> anyhow::Result<()> {
    let lsp_node_id = PublicKey::from_str(&config.lsp_node_id)?;
    let lsp_address = config.lsp_address.parse::<SocketAddress>()?;
    // persist = true so ldk-node re-establishes the connection automatically on restart.
    // We log a warning instead of failing — a connection error here should not prevent
    // the server from starting. The invoice endpoint will surface the error if the LSP
    // is still unreachable when a payment is attempted.
    match node.connect(lsp_node_id, lsp_address, true) {
        Ok(()) => tracing::info!("Connected to LSP peer: {}", config.lsp_node_id),
        Err(e) => tracing::warn!(
            "Could not connect to LSP peer {} at {} — {:?}. \
             Check LSP_NODE_ID and LSP_ADDRESS in .env. \
             The server will start but invoices will fail until the LSP is reachable.",
            config.lsp_node_id, config.lsp_address, e
        ),
    }
    Ok(())
}
