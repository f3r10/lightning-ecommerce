use std::sync::Arc;

use chrono::Utc;
use ldk_node::{Event, Node};

use crate::db::AppDb;

pub async fn run(node: Arc<Node>, db: Arc<AppDb>) {
    loop {
        match node.next_event_async().await {
            Event::PaymentReceived { payment_hash, amount_msat, .. } => {
                let hash_hex = hex::encode(payment_hash.0);
                tracing::info!("Payment received: {}, msat hash={}", amount_msat, hash_hex);
                if let Err(e) = db.mark_paid(&hash_hex, amount_msat, Utc::now().timestamp()) {
                    tracing::error!("Failed to mark payment as paid: {}", e);
                }
                node.event_handled().unwrap();
            }
            Event::ChannelReady { channel_id, ..} => {
                tracing::info!("Channel ready: {}", channel_id);
                node.event_handled().unwrap();
            }
            Event::ChannelPending { channel_id, ..} => {
                tracing::info!("Channel pending (JIT opening): {}", channel_id);
            }
            event => {
                tracing::debug!("Unhandle event: {:?}", event);
                node.event_handled().unwrap();
            }
        }
    }
}