use anyhow::{anyhow, Context};
use dotenvy::dotenv;
use ldk_node::bitcoin::Network;
use std::env;

pub struct LspConfig {
    pub network: Network,
    pub esplora_url: String,
    pub listen_address: String,
    /// Peer-reachable address printed in startup instructions. Defaults to
    /// `listen_address` when `ADVERTISE_ADDRESS` is not set, which is correct
    /// for local/dev use. Set it explicitly when binding on `0.0.0.0` or
    /// behind NAT so node-service gets a routable address.
    pub advertise_address: String,
    pub storage_dir: String,
    // LSPS2 fee parameters
    pub lsps2_token: Option<String>,
    pub lsps2_advertise_service: bool,
    pub lsps2_channel_opening_fee_ppm: u32,
    pub lsps2_channel_over_provisioning_ppm: u32,
    pub lsps2_min_channel_opening_fee_msat: u64,
    pub lsps2_min_channel_lifetime: u32,
    pub lsps2_max_client_to_self_delay: u32,
    pub lsps2_min_payment_size_msat: u64,
    pub lsps2_max_payment_size_msat: u64,
}

impl LspConfig {
    pub fn from_env() -> anyhow::Result<Self> {
        if let Err(e) = dotenv() {
            if !e.not_found() {
                return Err(e.into());
            }
        }

        let network_str = env::var("NETWORK")
            .unwrap_or_else(|_| "mutinynet".to_string())
            .to_lowercase();

        let network = match network_str.as_str() {
            "mutinynet" => Network::Signet,
            other => other
                .parse()
                .map_err(|_| anyhow!("Invalid NETWORK: {}", other))?,
        };

        let esplora_url = env::var("ESPLORA_URL")
            .unwrap_or_else(|_| "https://mutinynet.com/api".to_string());

        let listen_address = env::var("LISTEN_ADDRESS")
            .unwrap_or_else(|_| "127.0.0.1:9737".to_string());

        let advertise_address = env::var("ADVERTISE_ADDRESS")
            .unwrap_or_else(|_| listen_address.clone());

        let storage_dir = env::var("STORAGE_DIR")
            .unwrap_or_else(|_| "./data/lsp".to_string());

        let lsps2_token = env::var("LSPS2_TOKEN")
            .ok()
            .filter(|s| !s.is_empty());

        let lsps2_advertise_service = env::var("LSPS2_ADVERTISE_SERVICE")
            .unwrap_or_else(|_| "true".to_string())
            .parse::<bool>()
            .context("LSPS2_ADVERTISE_SERVICE must be true or false")?;

        let lsps2_channel_opening_fee_ppm = env::var("LSPS2_CHANNEL_OPENING_FEE_PPM")
            .unwrap_or_else(|_| "10000".to_string())
            .parse::<u32>()
            .context("LSPS2_CHANNEL_OPENING_FEE_PPM must be a u32")?;

        let lsps2_channel_over_provisioning_ppm =
            env::var("LSPS2_CHANNEL_OVER_PROVISIONING_PPM")
                .unwrap_or_else(|_| "250000".to_string())
                .parse::<u32>()
                .context("LSPS2_CHANNEL_OVER_PROVISIONING_PPM must be a u32")?;

        let lsps2_min_channel_opening_fee_msat =
            env::var("LSPS2_MIN_CHANNEL_OPENING_FEE_MSAT")
                .unwrap_or_else(|_| "0".to_string())
                .parse::<u64>()
                .context("LSPS2_MIN_CHANNEL_OPENING_FEE_MSAT must be a u64")?;

        let lsps2_min_channel_lifetime = env::var("LSPS2_MIN_CHANNEL_LIFETIME")
            .unwrap_or_else(|_| "144".to_string())
            .parse::<u32>()
            .context("LSPS2_MIN_CHANNEL_LIFETIME must be a u32 (blocks)")?;

        let lsps2_max_client_to_self_delay = env::var("LSPS2_MAX_CLIENT_TO_SELF_DELAY")
            .unwrap_or_else(|_| "1024".to_string())
            .parse::<u32>()
            .context("LSPS2_MAX_CLIENT_TO_SELF_DELAY must be a u32")?;

        let lsps2_min_payment_size_msat = env::var("LSPS2_MIN_PAYMENT_SIZE_MSAT")
            .unwrap_or_else(|_| "1000".to_string())
            .parse::<u64>()
            .context("LSPS2_MIN_PAYMENT_SIZE_MSAT must be a u64")?;

        let lsps2_max_payment_size_msat = env::var("LSPS2_MAX_PAYMENT_SIZE_MSAT")
            .unwrap_or_else(|_| "100000000000".to_string())
            .parse::<u64>()
            .context("LSPS2_MAX_PAYMENT_SIZE_MSAT must be a u64")?;

        Ok(Self {
            network,
            esplora_url,
            listen_address,
            advertise_address,
            storage_dir,
            lsps2_token,
            lsps2_advertise_service,
            lsps2_channel_opening_fee_ppm,
            lsps2_channel_over_provisioning_ppm,
            lsps2_min_channel_opening_fee_msat,
            lsps2_min_channel_lifetime,
            lsps2_max_client_to_self_delay,
            lsps2_min_payment_size_msat,
            lsps2_max_payment_size_msat,
        })
    }
}
