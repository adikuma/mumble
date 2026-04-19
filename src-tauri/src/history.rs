use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use parking_lot::Mutex;
use rusqlite::{params, Connection};
use serde::Serialize;
use std::sync::Arc;

use crate::paths;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Transcript {
    pub id: String,
    pub created_at: DateTime<Utc>,
    pub duration_sec: f64,
    pub text: String,
    pub input_device: Option<String>,
    pub model: String,
}

#[derive(Clone)]
pub struct HistoryStore {
    conn: Arc<Mutex<Connection>>,
}

impl HistoryStore {
    pub fn open() -> Result<Self> {
        let path = paths::history_db_path()?;
        let conn = Connection::open(&path)
            .with_context(|| format!("open sqlite at {}", path.display()))?;
        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS transcripts (
                id TEXT PRIMARY KEY,
                created_at TEXT NOT NULL,
                duration_sec REAL NOT NULL,
                text TEXT NOT NULL,
                input_device TEXT,
                model TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_transcripts_created_at
                ON transcripts(created_at DESC);
            "#,
        )?;
        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
        })
    }

    pub fn insert(&self, t: &Transcript) -> Result<()> {
        let conn = self.conn.lock();
        conn.execute(
            "INSERT INTO transcripts (id, created_at, duration_sec, text, input_device, model)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                t.id,
                t.created_at.to_rfc3339(),
                t.duration_sec,
                t.text,
                t.input_device,
                t.model,
            ],
        )?;
        Ok(())
    }

    pub fn list(&self, query: Option<&str>, limit: i64) -> Result<Vec<Transcript>> {
        let conn = self.conn.lock();
        let (sql, like_param): (&str, String) = match query {
            Some(q) if !q.trim().is_empty() => (
                "SELECT id, created_at, duration_sec, text, input_device, model
                 FROM transcripts
                 WHERE text LIKE ?1
                 ORDER BY created_at DESC
                 LIMIT ?2",
                format!("%{}%", q),
            ),
            _ => (
                "SELECT id, created_at, duration_sec, text, input_device, model
                 FROM transcripts
                 ORDER BY created_at DESC
                 LIMIT ?2",
                String::new(),
            ),
        };

        let mut stmt = conn.prepare(sql)?;
        let rows = stmt.query_map(params![like_param, limit], |row| {
            let created_at: String = row.get(1)?;
            Ok(Transcript {
                id: row.get(0)?,
                created_at: DateTime::parse_from_rfc3339(&created_at)
                    .map(|d| d.with_timezone(&Utc))
                    .unwrap_or_else(|_| Utc::now()),
                duration_sec: row.get(2)?,
                text: row.get(3)?,
                input_device: row.get(4)?,
                model: row.get(5)?,
            })
        })?;
        rows.collect::<rusqlite::Result<Vec<_>>>()
            .context("collect transcript rows")
    }

    pub fn delete(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock();
        conn.execute("DELETE FROM transcripts WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn clear(&self) -> Result<()> {
        let conn = self.conn.lock();
        conn.execute("DELETE FROM transcripts", [])?;
        Ok(())
    }

    pub fn get(&self, id: &str) -> Result<Option<Transcript>> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare(
            "SELECT id, created_at, duration_sec, text, input_device, model
             FROM transcripts WHERE id = ?1",
        )?;
        let mut rows = stmt.query(params![id])?;
        if let Some(row) = rows.next()? {
            let created_at: String = row.get(1)?;
            Ok(Some(Transcript {
                id: row.get(0)?,
                created_at: DateTime::parse_from_rfc3339(&created_at)
                    .map(|d| d.with_timezone(&Utc))
                    .unwrap_or_else(|_| Utc::now()),
                duration_sec: row.get(2)?,
                text: row.get(3)?,
                input_device: row.get(4)?,
                model: row.get(5)?,
            }))
        } else {
            Ok(None)
        }
    }
}
