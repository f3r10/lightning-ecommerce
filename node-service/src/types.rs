use std::sync::Arc;
use std::sync::atomic::AtomicUsize;

use ldk_node::Node;
use serde::Deserialize;
use serde::Serialize;
use crate::db::AppDb;
use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;
use thiserror::Error;
use crate::config::AppConfig;

#[derive(Deserialize)]
pub struct CreateInvoiceRequest {
    pub amount_msat: Option<u64>,      // None = variable amount
    pub description: String,
    pub expiry_secs: Option<u32>,      // default 3600
    pub product_id: Option<String>,
    pub max_lsp_fee_msat: Option<u64>,
}

#[derive(Serialize)]
pub struct InvoiceResponse {
    pub payment_hash: String,
    pub bolt11: String,
    pub amount_msat: Option<u64>,
    pub expiry_unix: i64,
    pub status: String,
}

#[derive(Serialize)]
pub struct NodeInfoResponse {
    pub node_id: String,
    pub network: String,
    pub num_channels: usize,
    pub lsp_connected: bool,
    pub onchain_balance_sats: u64,
    pub onchain_address: String,
}

#[derive(Clone)]
pub struct AppState {
    pub node: Arc<Node>,
    pub db: Arc<AppDb>,
    pub config: AppConfig,
    /// Number of JIT channels currently opening. Incremented on ChannelPending,
    /// decremented on ChannelReady. Used to surface "opening_channel" status.
    pub channel_pending_count: Arc<AtomicUsize>,
}


// Note: Replace `sqlx::Error` with `rusqlite::Error` or `anyhow::Error`
// depending on what your `state.db.insert_order` function actually returns.
#[derive(Error, Debug)]
pub enum AppError {
    #[error("Failed to create invoice description: {0}")]
    InvoiceDescription(#[from] ldk_node::lightning_invoice::CreationError),

    #[error("Lightning node error: {0}")]
    Node(#[from] ldk_node::NodeError),

    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("Anyhow error: {0}")]
    Anyhow(#[from] anyhow::Error),

    #[error("{0}")]
    Validation(String),
}

/// Tell axum how to convert `AppError` into an HTTP response.
impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        // Map different error types to appropriate HTTP status codes
        let (status, error_message) = match self {
            AppError::InvoiceDescription(err) => {
                (StatusCode::BAD_REQUEST, err.to_string())
            },
            AppError::Validation(msg) => {
                (StatusCode::UNPROCESSABLE_ENTITY, msg)
            },
            AppError::Node(err) => {
                tracing::error!("LDK Node error: {}", err);
                (StatusCode::INTERNAL_SERVER_ERROR, format!("Node error: {err:?}"))
            }
            AppError::Database(err) => {
                // Don't leak raw database errors to the client for security
                tracing::error!("Database error: {}", err);
                (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error".to_string())
            }
            AppError::Anyhow(err) => {
                tracing::error!("Internal error: {}", err);
                (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error".to_string())
            }
        };

        // Format the error as a JSON response
        let body = Json(json!({
            "error": error_message
        }));

        // Return the tuple of (status code, body) which axum converts into a Response
        (status, body).into_response()
    }
}
