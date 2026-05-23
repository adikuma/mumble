//! local sqlite history and insights aggregations.
//!
//! privacy first. nothing leaves this file. same path hex takes (transcripts
//! land in `~/Library/Application Support/Hex/transcripts.db` over there).
//! we keep ours at `%APPDATA%\Mumble\history.db`. the insights view queries
//! this same table. no separate telemetry pipeline.

use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use parking_lot::Mutex;
use rusqlite::{params, Connection};
use serde::Serialize;
use std::collections::HashMap;
use std::sync::Arc;

use crate::dictionary::DictEntry;
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
    /// wall clock latency from hotkey release to paste completed. optional
    /// because (a) old rows from before this column existed may be `NULL`,
    /// (b) `auto_paste = false` rows have no paste step.
    pub latency_ms: Option<i64>,
    /// foreground app exe name at paste time (e.g. `notepad.exe`). `NULL` when
    /// `auto_paste` is off or the capture failed.
    pub target_app: Option<String>,
    /// full path to the foreground app exe at paste time. used to extract the
    /// real app icon. `NULL` for old rows and when the capture failed.
    pub target_app_path: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InsightsData {
    pub words: u64,
    pub sessions: u64,
    pub avg_latency_ms: Option<u64>,
    pub time_saved_sec: f64,
    pub daily_activity: Vec<DailyBucket>,
    pub top_apps: Vec<TopEntry>,
    pub top_words: Vec<TopEntry>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyBucket {
    pub day: String,
    pub count: u64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TopEntry {
    pub label: String,
    pub count: u64,
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
        Self::from_connection(conn)
    }

    #[cfg(test)]
    pub fn open_in_memory() -> Result<Self> {
        let conn = Connection::open_in_memory()?;
        Self::from_connection(conn)
    }

    fn from_connection(conn: Connection) -> Result<Self> {
        // fresh dbs get the full schema. existing dbs get migrated below.
        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS transcripts (
                id TEXT PRIMARY KEY,
                created_at TEXT NOT NULL,
                duration_sec REAL NOT NULL,
                text TEXT NOT NULL,
                input_device TEXT,
                model TEXT NOT NULL,
                latency_ms INTEGER,
                target_app TEXT,
                target_app_path TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_transcripts_created_at
                ON transcripts(created_at DESC);
            CREATE TABLE IF NOT EXISTS dictionary (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                pattern TEXT NOT NULL UNIQUE,
                replacement TEXT NOT NULL,
                case_sensitive INTEGER NOT NULL DEFAULT 0,
                fuzzy INTEGER NOT NULL DEFAULT 0,
                hits INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            );
            "#,
        )?;
        migrate(&conn)?;

        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
        })
    }

    pub fn insert(&self, t: &Transcript) -> Result<()> {
        let conn = self.conn.lock();
        conn.execute(
            "INSERT INTO transcripts (id, created_at, duration_sec, text, input_device, model, latency_ms, target_app, target_app_path)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                t.id,
                t.created_at.to_rfc3339(),
                t.duration_sec,
                t.text,
                t.input_device,
                t.model,
                t.latency_ms,
                t.target_app,
                t.target_app_path,
            ],
        )?;
        Ok(())
    }

    pub fn list(&self, query: Option<&str>, limit: i64) -> Result<Vec<Transcript>> {
        let conn = self.conn.lock();
        let (sql, like_param): (&str, String) = match query {
            Some(q) if !q.trim().is_empty() => (
                "SELECT id, created_at, duration_sec, text, input_device, model, latency_ms, target_app, target_app_path
                 FROM transcripts
                 WHERE text LIKE ?1
                 ORDER BY created_at DESC
                 LIMIT ?2",
                format!("%{}%", q),
            ),
            _ => (
                "SELECT id, created_at, duration_sec, text, input_device, model, latency_ms, target_app, target_app_path
                 FROM transcripts
                 ORDER BY created_at DESC
                 LIMIT ?2",
                String::new(),
            ),
        };

        let mut stmt = conn.prepare(sql)?;
        let rows = stmt.query_map(params![like_param, limit], |row| {
            row_to_transcript(row)
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
            "SELECT id, created_at, duration_sec, text, input_device, model, latency_ms, target_app, target_app_path
             FROM transcripts WHERE id = ?1",
        )?;
        let mut rows = stmt.query(params![id])?;
        if let Some(row) = rows.next()? {
            Ok(Some(row_to_transcript(row)?))
        } else {
            Ok(None)
        }
    }

    // update a transcript's text in place and return the previous text so
    // the caller can diff it for learning. returns None if the id is unknown.
    pub fn update_transcript_text(&self, id: &str, text: &str) -> Result<Option<String>> {
        let conn = self.conn.lock();
        let prev: Option<String> = conn
            .query_row(
                "SELECT text FROM transcripts WHERE id = ?1",
                params![id],
                |r| r.get(0),
            )
            .ok();
        if prev.is_none() {
            return Ok(None);
        }
        conn.execute(
            "UPDATE transcripts SET text = ?2 WHERE id = ?1",
            params![id, text],
        )?;
        Ok(prev)
    }

    pub fn list_dictionary(&self) -> Result<Vec<DictEntry>> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare(
            "SELECT id, pattern, replacement, case_sensitive, fuzzy
             FROM dictionary ORDER BY created_at DESC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(DictEntry {
                id: row.get(0)?,
                pattern: row.get(1)?,
                replacement: row.get(2)?,
                case_sensitive: row.get::<_, i64>(3)? != 0,
                fuzzy: row.get::<_, i64>(4)? != 0,
            })
        })?;
        rows.collect::<rusqlite::Result<Vec<_>>>()
            .context("collect dictionary")
    }

    pub fn add_dictionary_entry(
        &self,
        pattern: &str,
        replacement: &str,
        case_sensitive: bool,
        fuzzy: bool,
    ) -> Result<DictEntry> {
        let conn = self.conn.lock();
        conn.execute(
            "INSERT INTO dictionary (pattern, replacement, case_sensitive, fuzzy, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(pattern) DO UPDATE SET
                replacement = excluded.replacement,
                case_sensitive = excluded.case_sensitive,
                fuzzy = excluded.fuzzy",
            params![
                pattern,
                replacement,
                case_sensitive as i64,
                fuzzy as i64,
                Utc::now().to_rfc3339()
            ],
        )?;
        let id = conn.query_row(
            "SELECT id FROM dictionary WHERE pattern = ?1",
            params![pattern],
            |r| r.get(0),
        )?;
        Ok(DictEntry {
            id,
            pattern: pattern.to_string(),
            replacement: replacement.to_string(),
            case_sensitive,
            fuzzy,
        })
    }

    pub fn update_dictionary_entry(
        &self,
        id: i64,
        pattern: &str,
        replacement: &str,
        case_sensitive: bool,
        fuzzy: bool,
    ) -> Result<()> {
        let conn = self.conn.lock();
        conn.execute(
            "UPDATE dictionary SET pattern = ?2, replacement = ?3, case_sensitive = ?4, fuzzy = ?5
             WHERE id = ?1",
            params![id, pattern, replacement, case_sensitive as i64, fuzzy as i64],
        )?;
        Ok(())
    }

    pub fn delete_dictionary_entry(&self, id: i64) -> Result<()> {
        let conn = self.conn.lock();
        conn.execute("DELETE FROM dictionary WHERE id = ?1", params![id])?;
        Ok(())
    }

    /// aggregate metrics for the last `range_days` days. computed in rust
    /// (rather than sql) because we tokenize transcript text for word stats.
    pub fn insights(&self, range_days: u32) -> Result<InsightsData> {
        let cutoff = Utc::now() - chrono::Duration::days(range_days as i64);
        let cutoff_str = cutoff.to_rfc3339();

        let conn = self.conn.lock();
        let mut stmt = conn.prepare(
            "SELECT created_at, duration_sec, text, latency_ms, target_app
             FROM transcripts
             WHERE created_at >= ?1",
        )?;
        let rows = stmt
            .query_map(params![cutoff_str], |row| {
                Ok(InsightRow {
                    created_at: row.get(0)?,
                    duration_sec: row.get(1)?,
                    text: row.get(2)?,
                    latency_ms: row.get(3)?,
                    target_app: row.get(4)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        drop(stmt);
        drop(conn);

        let sessions = rows.len() as u64;
        let mut total_words: u64 = 0;
        let mut total_duration: f64 = 0.0;
        let mut latencies: Vec<i64> = Vec::new();
        let mut app_counts: HashMap<String, u64> = HashMap::new();
        let mut word_counts: HashMap<String, u64> = HashMap::new();
        let mut day_counts: HashMap<String, u64> = HashMap::new();

        for row in &rows {
            total_duration += row.duration_sec;
            if let Some(ms) = row.latency_ms {
                latencies.push(ms);
            }
            if let Some(app) = &row.target_app {
                *app_counts.entry(app.clone()).or_default() += 1;
            }

            // word totals and per word frequency for top words.
            for raw in row.text.split_whitespace() {
                total_words += 1;
                let cleaned: String = raw
                    .trim_matches(|c: char| !c.is_alphabetic())
                    .to_lowercase();
                if cleaned.is_empty() || STOPWORDS.contains(&cleaned.as_str()) {
                    continue;
                }
                *word_counts.entry(cleaned).or_default() += 1;
            }

            // daily bucket. take the date prefix from rfc3339.
            if let Some(date) = row.created_at.get(..10) {
                *day_counts.entry(date.to_string()).or_default() += 1;
            }
        }

        let avg_latency_ms = if latencies.is_empty() {
            None
        } else {
            let sum: i64 = latencies.iter().sum();
            let avg = sum / latencies.len() as i64;
            Some(avg.max(0) as u64)
        };

        let top_apps = top_n(app_counts, 4);
        let top_words = top_n(word_counts, 4);

        // build last n days window with zeros filled in.
        let mut daily_activity = Vec::with_capacity(range_days as usize);
        for i in (0..range_days as i64).rev() {
            let day = (Utc::now() - chrono::Duration::days(i))
                .format("%Y-%m-%d")
                .to_string();
            let count = day_counts.get(&day).copied().unwrap_or(0);
            daily_activity.push(DailyBucket { day, count });
        }

        Ok(InsightsData {
            words: total_words,
            sessions,
            avg_latency_ms,
            time_saved_sec: total_duration,
            daily_activity,
            top_apps,
            top_words,
        })
    }
}

struct InsightRow {
    created_at: String,
    duration_sec: f64,
    text: String,
    latency_ms: Option<i64>,
    target_app: Option<String>,
}

fn top_n(counts: HashMap<String, u64>, n: usize) -> Vec<TopEntry> {
    let mut entries: Vec<TopEntry> = counts
        .into_iter()
        .map(|(label, count)| TopEntry { label, count })
        .collect();
    entries.sort_by(|a, b| b.count.cmp(&a.count));
    entries.truncate(n);
    entries
}

fn row_to_transcript(row: &rusqlite::Row<'_>) -> rusqlite::Result<Transcript> {
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
        latency_ms: row.get(6)?,
        target_app: row.get(7)?,
        target_app_path: row.get(8)?,
    })
}

fn migrate(conn: &Connection) -> Result<()> {
    let cols: Vec<String> = conn
        .prepare("PRAGMA table_info(transcripts)")?
        .query_map([], |row| row.get::<_, String>(1))?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    if !cols.iter().any(|c| c == "latency_ms") {
        conn.execute(
            "ALTER TABLE transcripts ADD COLUMN latency_ms INTEGER",
            [],
        )?;
    }
    if !cols.iter().any(|c| c == "target_app") {
        conn.execute("ALTER TABLE transcripts ADD COLUMN target_app TEXT", [])?;
    }
    if !cols.iter().any(|c| c == "target_app_path") {
        conn.execute(
            "ALTER TABLE transcripts ADD COLUMN target_app_path TEXT",
            [],
        )?;
    }
    Ok(())
}

const STOPWORDS: &[&str] = &[
    "the", "a", "an", "and", "or", "but", "is", "are", "was", "were", "i", "you", "he", "she",
    "it", "we", "they", "this", "that", "to", "of", "in", "on", "for", "with", "as", "at", "by",
    "be", "been", "being", "have", "has", "had", "do", "does", "did", "will", "would", "should",
    "can", "could", "may", "might", "must", "not", "no", "so", "if", "then", "than", "from",
    "into", "out", "up", "down", "very", "just", "about", "what", "when", "where", "how", "who",
    "why", "which", "these", "those", "my", "your", "their", "our", "us", "them", "him", "her",
    "his", "its", "any", "all", "some", "one", "two", "three", "four", "five", "yeah", "okay",
    "ok", "right", "well", "like",
];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dictionary_crud_roundtrip() {
        let store = HistoryStore::open_in_memory().unwrap();
        let e = store
            .add_dictionary_entry("klema", "Kléma", false, false)
            .unwrap();
        assert_eq!(e.pattern, "klema");
        let all = store.list_dictionary().unwrap();
        assert_eq!(all.len(), 1);
        store
            .update_dictionary_entry(e.id, "klema", "Klema", true, false)
            .unwrap();
        assert_eq!(store.list_dictionary().unwrap()[0].replacement, "Klema");
        store.delete_dictionary_entry(e.id).unwrap();
        assert!(store.list_dictionary().unwrap().is_empty());
    }

    #[test]
    fn update_transcript_text_returns_previous() {
        let store = HistoryStore::open_in_memory().unwrap();
        let t = Transcript {
            id: "t1".into(),
            created_at: Utc::now(),
            duration_sec: 1.0,
            text: "call klema".into(),
            input_device: None,
            model: "test".into(),
            latency_ms: None,
            target_app: None,
            target_app_path: None,
        };
        store.insert(&t).unwrap();
        let prev = store.update_transcript_text("t1", "call Kléma").unwrap();
        assert_eq!(prev.as_deref(), Some("call klema"));
        assert_eq!(store.get("t1").unwrap().unwrap().text, "call Kléma");
        assert!(store.update_transcript_text("missing", "x").unwrap().is_none());
    }
}
