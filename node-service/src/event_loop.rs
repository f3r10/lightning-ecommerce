use std::sync::Arc;
use std::sync::Mutex;
use std::collections::HashSet;

use chrono::Utc;
use ldk_node::lightning::ln::types::ChannelId;
use ldk_node::{Event, Node};

use crate::db::AppDb;

pub async fn run(node: Arc<Node>, db: Arc<AppDb>, jit_channels_pending: Arc<Mutex<HashSet<ChannelId>>>) {
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
            Event::ChannelPending { channel_id, .. } => {
                tracing::info!("Channel pending (JIT opening): {}", channel_id);
                jit_channels_pending.lock().unwrap().insert(channel_id);
                node.event_handled().unwrap();
            }
            Event::ChannelReady { channel_id, .. } => {
                tracing::info!("Channel ready: {}", channel_id);
                jit_channels_pending.lock().unwrap().remove(&channel_id);
                node.event_handled().unwrap();
            }
            Event::ChannelClosed { channel_id, .. } => {
                // Remove if this was a tracked JIT channel that closed before becoming ready.
                tracing::info!("Channel closed: {}", channel_id);
                jit_channels_pending.lock().unwrap().remove(&channel_id);
                node.event_handled().unwrap();
            }
            event => {
                tracing::debug!("Unhandled event: {:?}", event);
                node.event_handled().unwrap();
            }
        }
    }
}