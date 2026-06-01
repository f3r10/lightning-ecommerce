use ldk_node::lightning_invoice::{Bolt11InvoiceDescription, Description};
use crate::db::NewOrder;
use crate::types::{AppError, AppState, CreateInvoiceRequest, InvoiceResponse};
use axum::extract::{Path, State};
use axum::Json;

// Minimum invoice amount for JIT anchor channels.
//
// LDK deducts anchor outputs (2×330 sat), the commitment tx fee, and the
// counterparty channel reserve (MIN_THEIR_CHAN_RESERVE_SATOSHIS=1000 sat hard
// floor) from next_outbound_htlc_limit_msat after a 0-conf JIT channel opens.
// For small payments the channel is too tight to forward the HTLC.
//
// The minimum scales with the current fee rate:
//   min ≈ (fee_rate_sat/vbyte × 250 + 1,660) / 0.2475
//
// Regtest (1 sat/vbyte) empirical min: ~8,213 sat.
// Mutinynet (6 sat/vbyte typical) empirical min: ~12,768 sat.
// 15,000 sat covers up to ~8 sat/vbyte.
//
// Proper fix: apply the ZeroConfZeroReserve + anchor-overhead-inflation stash
// in ldk-node, which makes the minimum fee-rate-independent.
const MIN_INVOICE_AMOUNT_MSAT: u64 = 12_000_000; // 12,000 sat

pub async fn create_invoice(
    State(state): State<AppState>,
    Json(req): Json<CreateInvoiceRequest>,
) -> Result<Json<InvoiceResponse>, AppError> {
    if let Some(amount) = req.amount_msat {
        if amount < MIN_INVOICE_AMOUNT_MSAT {
            return Err(AppError::Validation(format!(
                "amount_msat must be at least {} ({} sat)",
                MIN_INVOICE_AMOUNT_MSAT,
                MIN_INVOICE_AMOUNT_MSAT / 1000,
            )));
        }
    }

    let description = Bolt11InvoiceDescription::Direct(Description::new(req.description.clone())?);

    let expire = req.expiry_secs.unwrap_or(3600);
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