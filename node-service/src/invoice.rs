use ldk_node::lightning_invoice::{Bolt11InvoiceDescription, Description};
use crate::db::NewOrder;
use crate::types::{AppError, AppState, CreateInvoiceRequest, InvoiceResponse};
use axum::extract::{Path, State};
use axum::Json;

pub async fn create_invoice
(State(state): State<AppState>,
Json(req): Json<CreateInvoiceRequest>,
) -> Result<Json<InvoiceResponse>, AppError> {
    let description = Bolt11InvoiceDescription::Direct(Description::new(req.description.clone())?
    );

    let expire = req.expiry_secs.unwrap_or(3600);
    println!("max_lsp_fee_msat {:?}", req.max_lsp_fee_msat);
    let invoice = match req.amount_msat {
        Some(amount) => state.node
        .bolt11_payment()
        .receive_via_jit_channel(amount, &description, expire, req.max_lsp_fee_msat)?,
        None => state.node.bolt11_payment().receive_variable_amount_via_jit_channel(&description, expire, None)?,
    };

    let payment_hash = invoice.payment_hash().to_string();

    let bolt11 = invoice.to_string();

    state.db.insert_order(&NewOrder{
        payment_hash: payment_hash.clone(),
        bolt11: bolt11.clone(),
        amount_msat: req.amount_msat,
        description: req.description,
        product_id: req.product_id,
    })?;

    let expiry_unix = invoice.expires_at().unwrap_or(std::time::Duration::from_secs(3600)).as_secs().try_into().unwrap();
    Ok(Json(InvoiceResponse { payment_hash, bolt11, amount_msat: req.amount_msat, expiry_unix, status: "pending".into() }))
}

pub async fn get_invoice(
    State(state): State<AppState>,
    Path(payment_hash): Path<String>,
) -> Result<Json<InvoiceResponse>, AppError> {
    let order = state
        .db
        .get_order(&payment_hash)?
        .ok_or_else(|| anyhow::anyhow!("invoice not found"))?;

    Ok(Json(InvoiceResponse {
        payment_hash: order.payment_hash,
        bolt11: order.bolt11,
        amount_msat: order.amount_msat,
        expiry_unix: order.created_at + 3600,
        status: order.status,
    }))
}