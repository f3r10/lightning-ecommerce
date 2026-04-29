use crate::{invoice, types::AppState};
use axum::{
    Router,
    extract::{Request, State}, // State is used by get_node_info
    http::{HeaderMap, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Json, Response},
    routing::{get, post},
};
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;

pub fn router(state: AppState) -> Router {
    let public = Router::new()
        .route("/api/invoice/:hash", get(invoice::get_invoice))
        .route("/health", get(health));

    let admin_api_key = state.config.admin_api_key.clone();
    let protected = Router::new()
        .route("/api/invoice", post(invoice::create_invoice))
        .route("/api/node/info", get(get_node_info))
        .layer(middleware::from_fn(move |headers: HeaderMap, request: Request, next: Next| {
            let key = admin_api_key.clone();
            async move { bearer_auth(key, headers, request, next).await }
        }));

    Router::new()
        .merge(public)
        .merge(protected)
        .with_state(state)
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
}

// --- Health ---

async fn health() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "status": "ok" }))
}

// --- Node info ---

async fn get_node_info(
    State(state): State<AppState>,
) -> Json<crate::types::NodeInfoResponse> {
    let status = state.node.status();
    Json(crate::types::NodeInfoResponse {
        node_id: state.node.node_id().to_string(),
        network: format!("{:?}", state.config.network),
        num_channels: state.node.list_channels().len(),
        lsp_connected: status.is_running,
    })
}

// --- Auth middleware ---

async fn bearer_auth(
    admin_api_key: String,
    headers: HeaderMap,
    request: Request,
    next: Next,
) -> Result<Response, impl IntoResponse> {
    let token = headers
        .get("Authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "));

    match token {
        Some(t) if t == admin_api_key => Ok(next.run(request).await),
        _ => Err((
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({ "error": "unauthorized" })),
        )),
    }
}
