use ldk_node::bitcoin::Network;
use dotenvy::dotenv;
use std::env;
use anyhow::{Context, anyhow, Result};
 
 #[derive(Clone)]

 pub struct AppConfig {
      pub network: Network,           // "mutinynet" | "signet" | "mainnet"
      pub esplora_url: String,        // https://mutinynet.com/api
      pub lsp_node_id: String,        // hex pubkey
      pub lsp_address: String,        // host:port
      pub lsp_token: Option<String>,
      pub storage_dir: String,        // /data/ldk
      pub admin_api_key: String,
      pub port: u16,                  // 3001
      pub mnemonic_encrypt_key: Option<String>,
  }

  impl AppConfig {
      pub fn from_env() -> anyhow::Result<Self> { 
        // 1. Load the .env file into the process environment.
        // We use .ok() because we don't want the app to crash if the file 
        // is missing (e.g., in a production Docker env where vars are set directly).
        dotenv().ok();

        let network_str = env::var("NETWORK").context("NETWORK not set")?.to_lowercase();
        
        // Map "mutinynet" to Signet, otherwise try to parse normally
        let network = match network_str.as_str() {
            "mutinynet" => Network::Signet,
            _ => network_str.parse().map_err(|_| anyhow!("Invalid network: {}", network_str))?,
        };

        Ok(Self {
            network,

            esplora_url: env::var("ESPLORA_URL")
                .context("ESPLORA_URL not set")?,

            lsp_node_id: env::var("LSP_NODE_ID")
                .context("LSP_NODE_ID not set")?,

            lsp_address: env::var("LSP_ADDRESS")
                .context("LSP_ADDRESS not set")?,

            lsp_token: env::var("LSP_TOKEN").ok().filter(|s| !s.is_empty()),

            storage_dir: env::var("STORAGE_DIR")
                .unwrap_or_else(|_| "./data/ldk".to_string()),

            admin_api_key: env::var("ADMIN_API_KEY")
                .context("ADMIN_API_KEY not set")?,

            port: env::var("PORT")
                .unwrap_or_else(|_| "3001".to_string())
                .parse()
                .context("Failed to parse PORT as u16")?,

            mnemonic_encrypt_key: env::var("MNEMONIC_ENCRYPT_KEY").ok().filter(|s| !s.is_empty()),
        })
     }
  }