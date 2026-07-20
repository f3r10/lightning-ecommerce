use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};

use chrono::Utc;
use ldk_node::{Event, Node};

use crate::db::AppDb;

pub async fn run(node: Arc<Node>, db: Arc<AppDb>, channel_pending_count: Arc<AtomicUsize>) {
    loop {
        match node.next_event_async().await {
            Event::PaymentReceived { payment_hash, amount_msat, .. } => {
                let hash_hex = hex::encode(payment_hash.0);
                tracing::info!("Payment received: {}, msat hash={}", amount_msat, hash_hex);
                if let Err(e) = db.mark_paid(&hash_hex, amount_msat, Utc::now().timestamp()) {
                    tracing::error!("Failed to mark payment as paid: {}", e);
                }
                // Decrement here, not on ChannelReady: keep "opening_channel" visible
                // until the payment actually lands, not just until the channel is ready.
                let prev = channel_pending_count.load(Ordering::Relaxed);
                if prev > 0 {
                    channel_pending_count.fetch_sub(1, Ordering::Relaxed);
                }
                node.event_handled().unwrap();
            }
            Event::ChannelReady { channel_id, .. } => {
                tracing::info!("Channel ready: {}", channel_id);
                node.event_handled().unwrap();
            }
            Event::ChannelPending { channel_id, .. } => {
                tracing::info!("Channel pending (JIT opening): {}", channel_id);
                channel_pending_count.fetch_add(1, Ordering::Relaxed);
                node.event_handled().unwrap();
            }
            Event::ChannelClosed { channel_id, .. } => {
                // Safety valve: if a channel closes before PaymentReceived (e.g. HTLC
                // timed out or payment failed), prevent the counter staying stuck.
                tracing::info!("Channel closed: {}", channel_id);
                let prev = channel_pending_count.load(Ordering::Relaxed);
                if prev > 0 {
                    channel_pending_count.fetch_sub(1, Ordering::Relaxed);
                }
                node.event_handled().unwrap();
            }
            event => {
                tracing::debug!("Unhandled event: {:?}", event);
                node.event_handled().unwrap();
            }
        }
    }
}