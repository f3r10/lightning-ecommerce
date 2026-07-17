use ldk_node::Builder;
use ldk_node::config::Config;
use ldk_node::lightning::ln::msgs::SocketAddress;
use ldk_node::bitcoin::secp256k1::PublicKey;
use crate::AppConfig;
use ldk_node::entropy::NodeEntropy;
use ldk_node::Node;
use std::sync::Arc;
use std::str::FromStr;

pub fn build_node(config: &AppConfig, entropy: NodeEntropy) -> anyhow::Result<Arc<Node>> {
    let mut node_config = Config::default();
    node_config.network = config.network;
    node_config.storage_dir_path = config.storage_dir.clone();

    // Parse all LSP entries upfront so we can populate trusted_peers before building.
    let parsed_lsps: Vec<(PublicKey, SocketAddress, Option<String>)> = config.lsps.iter()
        .map(|lsp| -> anyhow::Result<_> {
            let node_id = PublicKey::from_str(&lsp.node_id)?;
            let address = lsp.address.parse::<SocketAddress>()?;
            Ok((node_id, address, lsp.token.clone()))
        })
        .collect::<anyhow::Result<_>>()?;

    // Exempt all LSPs from the per-channel reserve — they open JIT anchor channels
    // and are trusted to broadcast the commitment tx if needed.
    for (node_id, _, _) in &parsed_lsps {
        node_config.anchor_channels_config.trusted_peers_no_reserve.push(*node_id);
    }

    let mut builder = Builder::from_config(node_config);
    builder.set_chain_source_esplora(config.esplora_url.clone(), None);
    builder.set_gossip_source_p2p();

    // Register each LSP as a liquidity source. ldk-node queries all of them via
    // LSPS0 on startup and picks the cheapest when a JIT channel is needed.
    for (node_id, address, token) in parsed_lsps {
        builder.add_liquidity_source(node_id, address, token, true);
    }

    let node = builder.build(entropy)?;
    Ok(Arc::new(node))
}

pub fn connect_to_lsp(node: &Arc<Node>, pubkey: PublicKey, address: SocketAddress) -> anyhow::Result<()> {
    // persist=true so ldk-node re-establishes the connection automatically on restart.
    match node.connect(pubkey, address.clone(), true) {
        Ok(()) => tracing::info!("Connected to LSP peer: {}", pubkey),
        Err(e) => tracing::warn!(
            "Could not connect to LSP peer {} at {} — {:?}. \
             The server will start but invoices may fail until the LSP is reachable.",
            pubkey, address, e
        ),
    }
    Ok(())
}
