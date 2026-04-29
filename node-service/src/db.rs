use rusqlite::{Connection, params};
use std::sync::Mutex;

pub struct NewOrder {
    pub payment_hash: String,
    pub bolt11: String,
    pub amount_msat: Option<u64>,
    pub description: String,
    pub product_id: Option<String>,
}

pub struct Order {
    pub payment_hash: String,
    pub bolt11: String,
    pub amount_msat: Option<u64>,
    pub description: Option<String>,
    pub product_id: Option<String>,
    pub status: String,
    pub created_at: i64,
    pub paid_at: Option<i64>,
    pub amount_received_msat: Option<u64>,
}

pub struct AppDb {
    conn: Mutex<Connection>,
}

impl AppDb {
    pub fn open(storage_dir: &str) -> anyhow::Result<Self> {
        let path = format!("{}/app.sqlite", storage_dir);
        let conn = Connection::open(path)?;
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS orders (
                payment_hash         TEXT PRIMARY KEY,
                bolt11               TEXT NOT NULL,
                amount_msat          INTEGER,
                description          TEXT,
                product_id           TEXT,
                status               TEXT NOT NULL DEFAULT 'pending',
                created_at           INTEGER NOT NULL,
                paid_at              INTEGER,
                amount_received_msat INTEGER
            );",
        )?;
        Ok(Self { conn: Mutex::new(conn) })
    }

    pub fn insert_order(&self, order: &NewOrder) -> anyhow::Result<()> {
        let conn = self.conn.lock().unwrap();
        let created_at = chrono::Utc::now().timestamp();
        conn.execute(
            "INSERT INTO orders
                (payment_hash, bolt11, amount_msat, description, product_id, status, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, 'pending', ?6)",
            params![
                order.payment_hash,
                order.bolt11,
                order.amount_msat.map(|v| v as i64),
                order.description,
                order.product_id,
                created_at,
            ],
        )?;
        Ok(())
    }

    pub fn get_order(&self, payment_hash: &str) -> anyhow::Result<Option<Order>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT payment_hash, bolt11, amount_msat, description, product_id,
                    status, created_at, paid_at, amount_received_msat
             FROM orders
             WHERE payment_hash = ?1",
        )?;
        let mut rows = stmt.query(params![payment_hash])?;
        match rows.next()? {
            Some(row) => Ok(Some(Order {
                payment_hash:         row.get(0)?,
                bolt11:               row.get(1)?,
                amount_msat:          row.get::<_, Option<i64>>(2)?.map(|v| v as u64),
                description:          row.get(3)?,
                product_id:           row.get(4)?,
                status:               row.get(5)?,
                created_at:           row.get(6)?,
                paid_at:              row.get(7)?,
                amount_received_msat: row.get::<_, Option<i64>>(8)?.map(|v| v as u64),
            })),
            None => Ok(None),
        }
    }

    pub fn mark_paid(
        &self,
        payment_hash: &str,
        amount_msat: u64,
        paid_at: i64,
    ) -> anyhow::Result<()> {
        let conn = self.conn.lock().unwrap();
        let rows_updated = conn.execute(
            "UPDATE orders
             SET status = 'succeeded', paid_at = ?1, amount_received_msat = ?2
             WHERE payment_hash = ?3",
            params![paid_at, amount_msat as i64, payment_hash],
        )?;
        if rows_updated == 0 {
            // Payment arrived for a hash not in our orders table.
            // Can happen if the invoice was created directly on the node
            // rather than through our API — log and continue.
            tracing::warn!("mark_paid: no order found for payment_hash={}", payment_hash);
        }
        Ok(())
    }

    pub fn list_orders(&self) -> anyhow::Result<Vec<Order>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT payment_hash, bolt11, amount_msat, description, product_id,
                    status, created_at, paid_at, amount_received_msat
             FROM orders
             ORDER BY created_at DESC",
        )?;
        let orders = stmt
            .query_map([], |row| {
                Ok(Order {
                    payment_hash:         row.get(0)?,
                    bolt11:               row.get(1)?,
                    amount_msat:          row.get::<_, Option<i64>>(2)?.map(|v| v as u64),
                    description:          row.get(3)?,
                    product_id:           row.get(4)?,
                    status:               row.get(5)?,
                    created_at:           row.get(6)?,
                    paid_at:              row.get(7)?,
                    amount_received_msat: row.get::<_, Option<i64>>(8)?.map(|v| v as u64),
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(orders)
    }
}
