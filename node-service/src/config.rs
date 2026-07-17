use ldk_node::bitcoin::Network;
use dotenvy::dotenv;
use std::env;
use anyhow::{Context, anyhow};

#[derive(Clone, Debug)]
pub struct LspEntry {
    pub node_id: String,
    pub address: String,
    pub token: Option<String>,
}

#[derive(Clone)]
pub struct AppConfig {
    pub network: Network,
    pub esplora_url: String,
    pub lsps: Vec<LspEntry>,
    pub storage_dir: String,
    pub admin_api_key: String,
    pub port: u16,
    pub mnemonic_encrypt_key: Option<String>,
}

impl AppConfig {
    pub fn from_env() -> anyhow::Result<Self> {
        dotenv().ok();

        let network_str = env::var("NETWORK").context("NETWORK not set")?.to_lowercase();
        let network = match network_str.as_str() {
            "mutinynet" => Network::Signet,
            _ => network_str.parse().map_err(|_| anyhow!("Invalid network: {}", network_str))?,
        };

        // Parse indexed LSP entries: LSP_1_NODE_ID, LSP_1_ADDRESS, LSP_1_TOKEN, LSP_2_*, ...
        // Scanning stops at the first missing index.
        let mut lsps = Vec::new();
        let mut i = 1u32;
        loop {
            match (env::var(format!("LSP_{i}_NODE_ID")), env::var(format!("LSP_{i}_ADDRESS"))) {
                (Ok(node_id), Ok(address)) => {
                    let token = env::var(format!("LSP_{i}_TOKEN")).ok().filter(|s| !s.is_empty());
                    lsps.push(LspEntry { node_id, address, token });
                    i += 1;
                }
                _ => break,
            }
        }

        if lsps.is_empty() {
            return Err(anyhow!(
                "No LSP configured. Set at least LSP_1_NODE_ID and LSP_1_ADDRESS."
            ));
        }

        Ok(Self {
            network,
            esplora_url: env::var("ESPLORA_URL").context("ESPLORA_URL not set")?,
            lsps,
            storage_dir: env::var("STORAGE_DIR").unwrap_or_else(|_| "./data/ldk".to_string()),
            admin_api_key: env::var("ADMIN_API_KEY").context("ADMIN_API_KEY not set")?,
            port: env::var("PORT")
                .unwrap_or_else(|_| "3001".to_string())
                .parse()
                .context("Failed to parse PORT as u16")?,
            mnemonic_encrypt_key: env::var("MNEMONIC_ENCRYPT_KEY").ok().filter(|s| !s.is_empty()),
        })
    }
}
