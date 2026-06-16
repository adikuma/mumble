//! local sqlite history and insights aggregations.
//!
//! privacy first. nothing leaves this file. same path hex takes (transcripts
//! land in `~/Library/Application Support/Hex/transcripts.db` over there).
//! we keep ours at `%APPDATA%\Mumble\history.db`. the insights view queries
//! this same table. no separate telemetry pipeline.

use anyhow::{Context, Result};
use chrono::{DateTime, Datelike, Duration, Local, TimeZone, Timelike, Utc};
use parking_lot::Mutex;
use rusqlite::{params, Connection, OptionalExtension};
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
    /// real time saved versus typing, in seconds. estimated from word count
    /// against an assumed typing speed, not raw seconds spoken.
    pub time_saved_sec: f64,
    pub top_words: Vec<TopEntry>,
    /// per bucket trend that the chart and sparklines read from. hourly for
    /// the day range, daily otherwise, zero filled and calendar aligned.
    pub series: Vec<Bucket>,
    /// dictation intensity by weekday and hour over the last 7 days.
    pub heatmap: HeatMap,
    /// current daily streak in days.
    pub streak: u64,
    /// average pace over the range in wpm. null when nothing qualifies.
    pub pace: Option<u64>,
    /// fastest single dictation pace over the range in wpm. tiny clips ignored.
    pub fastest: Option<u64>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TopEntry {
    pub label: String,
    pub count: u64,
}

/// one point on the trend axis. matches the frontend Bucket shape exactly.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Bucket {
    pub label: String,
    pub words: u64,
    pub dictations: u64,
    pub duration_sec: f64,
    pub wpm: Option<u64>,
    pub latency_ms: Option<u64>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HeatMap {
    /// 7 rows (Mon..Sun) x 24 cols (0..23) of dictation counts.
    pub matrix: Vec<Vec<u64>>,
    pub max: u64,
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

    /// open an ephemeral in memory store. used by tests and as the fallback
    /// when the on disk database is corrupt and cannot be recovered, so the
    /// app can still boot. data written here is lost when the app exits.
    pub fn open_in_memory() -> Result<Self> {
        let conn = Connection::open_in_memory()?;
        Self::from_connection(conn)
    }

    fn from_connection(conn: Connection) -> Result<Self> {
        // sqlite tuning. wal lets readers and writers coexist without
        // blocking each other. synchronous normal is the recommended
        // pairing for wal and is durable across app crashes (only an os
        // crash can lose a recently committed txn). busy timeout gives
        // any concurrent writer five seconds before bailing instead of
        // returning busy immediately. foreign keys are off by default in
        // sqlite, we want them on for future schema work.
        conn.execute_batch(
            r#"
            PRAGMA journal_mode=WAL;
            PRAGMA synchronous=NORMAL;
            PRAGMA busy_timeout=5000;
            PRAGMA foreign_keys=ON;
            "#,
        )?;

        // fresh dbs get the full schema. existing dbs get migrated below.
        // wrap multi statement schema setup in a transaction so a crash
        // mid migration leaves the db in a known state.
        let tx = conn.unchecked_transaction()?;
        tx.execute_batch(
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
        migrate_in_tx(&tx)?;
        tx.commit()?;

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
        // the previous implementation always bound a placeholder string for
        // the no query branch, which left sqlite to ignore it. split the
        // path into two prepared statements that only bind what they need.
        match query {
            Some(q) if !q.trim().is_empty() => {
                let like_param = format!("%{}%", q);
                let mut stmt = conn.prepare(
                    "SELECT id, created_at, duration_sec, text, input_device, model, latency_ms, target_app, target_app_path
                     FROM transcripts
                     WHERE text LIKE ?1
                     ORDER BY created_at DESC
                     LIMIT ?2",
                )?;
                let rows = stmt.query_map(params![like_param, limit], row_to_transcript)?;
                rows.collect::<rusqlite::Result<Vec<_>>>()
                    .context("collect transcript rows")
            }
            _ => {
                let mut stmt = conn.prepare(
                    "SELECT id, created_at, duration_sec, text, input_device, model, latency_ms, target_app, target_app_path
                     FROM transcripts
                     ORDER BY created_at DESC
                     LIMIT ?1",
                )?;
                let rows = stmt.query_map(params![limit], row_to_transcript)?;
                rows.collect::<rusqlite::Result<Vec<_>>>()
                    .context("collect transcript rows")
            }
        }
    }

    pub fn delete(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock();
        conn.execute("DELETE FROM transcripts WHERE id = ?1", params![id])?;
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
        // .optional() maps no row to None but keeps real db errors as Err, so
        // a locked or corrupt db is not misreported to the user as not found.
        let prev: Option<String> = conn
            .query_row(
                "SELECT text FROM transcripts WHERE id = ?1",
                params![id],
                |r| r.get(0),
            )
            .optional()?;
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

    pub fn delete_dictionary_entry(&self, id: i64) -> Result<()> {
        let conn = self.conn.lock();
        conn.execute("DELETE FROM dictionary WHERE id = ?1", params![id])?;
        Ok(())
    }

    /// aggregate metrics over the full table for the insights page. computed in
    /// rust (rather than sql) because we tokenize transcript text and bucket on
    /// local calendar day boundaries. this is the single source of truth: the
    /// headline summary, chart series, heatmap, streak and pace all come from
    /// here so they cannot disagree on screen.
    ///
    /// `range_days` selects the window: 1 means the local calendar today with
    /// 24 hourly buckets, otherwise N daily buckets ending today.
    pub fn insights(&self, range_days: u32) -> Result<InsightsData> {
        // read the whole table. the streak and heatmap need windows the range
        // cutoff would clip, and the row count is bounded by usage not by a
        // ui page limit, so there is no 500 row cap here.
        let conn = self.conn.lock();
        let mut stmt =
            conn.prepare("SELECT created_at, duration_sec, text, latency_ms FROM transcripts")?;
        let rows = stmt
            .query_map([], |row| {
                let created_at: String = row.get(0)?;
                Ok(InsightRow {
                    created_at: DateTime::parse_from_rfc3339(&created_at)
                        .map(|d| d.with_timezone(&Local))
                        .unwrap_or_else(|_| Local::now()),
                    duration_sec: row.get(1)?,
                    text: row.get(2)?,
                    latency_ms: row.get(3)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        drop(stmt);
        drop(conn);

        let now = Local::now();
        Ok(compute_insights(&rows, range_days, now))
    }
}

struct InsightRow {
    created_at: DateTime<Local>,
    duration_sec: f64,
    text: String,
    latency_ms: Option<i64>,
}

/// assumed typing speed in words per minute, used to estimate time saved
/// versus typing the same text by hand.
const TYPING_WPM: f64 = 40.0;

/// upper bound on a plausible single dictation pace. press duration is the key
/// hold time, which pre roll can make shorter than the spoken audio, so a short
/// clip with many words can compute an impossible wpm. anything above this is an
/// artifact and is excluded from the fastest stat (human speech tops out ~300).
const MAX_REALISTIC_WPM: f64 = 300.0;

/// per bucket accumulator. mirrors the frontend Accum.
#[derive(Default, Clone)]
struct Accum {
    words: u64,
    dictations: u64,
    duration_sec: f64,
    latency_sum: i64,
    latency_n: u64,
}

impl Accum {
    fn add(&mut self, words: u64, duration_sec: f64, latency_ms: Option<i64>) {
        self.words += words;
        self.dictations += 1;
        self.duration_sec += duration_sec;
        if let Some(ms) = latency_ms {
            self.latency_sum += ms;
            self.latency_n += 1;
        }
    }

    fn finalize(&self, label: String) -> Bucket {
        let wpm = if self.duration_sec > 0.0 {
            Some((self.words as f64 / self.duration_sec * 60.0).round() as u64)
        } else {
            None
        };
        let latency_ms = if self.latency_n > 0 {
            Some((self.latency_sum as f64 / self.latency_n as f64).round() as u64)
        } else {
            None
        };
        Bucket {
            label,
            words: self.words,
            dictations: self.dictations,
            duration_sec: self.duration_sec,
            wpm,
            latency_ms,
        }
    }
}

const WEEKDAY: [&str; 7] = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/// pure aggregation over the rows. split out so a unit test can drive it with
/// a fixed `now` and synthetic transcripts.
fn compute_insights(rows: &[InsightRow], range_days: u32, now: DateTime<Local>) -> InsightsData {
    // summary totals and top words span the selected range, day aligned.
    let range_start = start_of_day(now) - Duration::days((range_days.max(1) - 1) as i64);

    let mut sessions: u64 = 0;
    let mut total_words: u64 = 0;
    let mut time_saved_sec: f64 = 0.0;
    let mut latencies: Vec<i64> = Vec::new();
    let mut word_counts: HashMap<String, u64> = HashMap::new();
    let mut pace_words: u64 = 0;
    let mut pace_sec: f64 = 0.0;
    let mut fastest: Option<f64> = None;

    for row in rows {
        if row.created_at < range_start {
            continue;
        }
        sessions += 1;
        let wc = word_count(&row.text);
        total_words += wc;

        // real time saved versus typing. positive only when speaking beat
        // typing the same words at the assumed wpm.
        let typed_sec = wc as f64 / TYPING_WPM * 60.0;
        time_saved_sec += (typed_sec - row.duration_sec).max(0.0);

        if let Some(ms) = row.latency_ms {
            latencies.push(ms);
        }

        // pace and fastest over the range. ignore zero and tiny clips, and
        // cap fastest at a realistic ceiling so a short clip with a short press
        // duration cannot report an impossible speed.
        if row.duration_sec >= 0.5 {
            pace_words += wc;
            pace_sec += row.duration_sec;
            let wpm = wc as f64 / row.duration_sec * 60.0;
            if wpm <= MAX_REALISTIC_WPM && fastest.is_none_or(|b| wpm > b) {
                fastest = Some(wpm);
            }
        }

        // word frequency for top words. keep digits, trim only outer punctuation.
        for raw in row.text.split_whitespace() {
            let cleaned: String = raw
                .trim_matches(|c: char| !c.is_alphanumeric())
                .to_lowercase();
            if cleaned.is_empty() || STOPWORDS.contains(&cleaned.as_str()) {
                continue;
            }
            *word_counts.entry(cleaned).or_default() += 1;
        }
    }

    let avg_latency_ms = if latencies.is_empty() {
        None
    } else {
        let sum: i64 = latencies.iter().sum();
        let avg = sum as f64 / latencies.len() as f64;
        Some(avg.round().max(0.0) as u64)
    };

    let pace = if pace_sec > 0.0 {
        Some((pace_words as f64 / pace_sec * 60.0).round() as u64)
    } else {
        None
    };
    let fastest = fastest.map(|w| w.round() as u64);

    // return extra so the ui can show a longer top words list (it shows 6).
    let top_words = top_n(word_counts, 10);

    let series = build_series(rows, range_days, now);
    let heatmap = hour_weekday_buckets(rows, now);
    let streak = current_streak_days(rows, now);

    InsightsData {
        words: total_words,
        sessions,
        avg_latency_ms,
        time_saved_sec,
        top_words,
        series,
        heatmap,
        streak,
        pace,
        fastest,
    }
}

/// local start of the calendar day for `d`.
fn start_of_day(d: DateTime<Local>) -> DateTime<Local> {
    Local
        .with_ymd_and_hms(d.year(), d.month(), d.day(), 0, 0, 0)
        .single()
        .unwrap_or(d)
}

fn word_count(text: &str) -> u64 {
    text.split_whitespace().filter(|w| !w.is_empty()).count() as u64
}

/// bucket transcripts across the selected range. day means 24 hourly buckets
/// for today, otherwise N daily buckets ending today, zero filled and calendar
/// aligned. ported from the frontend buildSeries with local day boundaries.
fn build_series(rows: &[InsightRow], range_days: u32, now: DateTime<Local>) -> Vec<Bucket> {
    if range_days == 1 {
        let mut buckets = vec![Accum::default(); 24];
        let today = start_of_day(now);
        for row in rows {
            if start_of_day(row.created_at) != today {
                continue;
            }
            let h = row.created_at.hour() as usize;
            buckets[h].add(word_count(&row.text), row.duration_sec, row.latency_ms);
        }
        return buckets
            .iter()
            .enumerate()
            .map(|(h, acc)| acc.finalize(hour_label(h as u32)))
            .collect();
    }

    let days = range_days as usize;
    let mut buckets = vec![Accum::default(); days];
    let today_start = start_of_day(now);
    // start key (local day start) for each bucket, oldest first.
    let mut start_keys: Vec<DateTime<Local>> = Vec::with_capacity(days);
    let mut labels: Vec<String> = Vec::with_capacity(days);
    for i in (0..days).rev() {
        let day_start = today_start - Duration::days(i as i64);
        start_keys.push(day_start);
        let label = if range_days == 7 {
            WEEKDAY[day_start.weekday().num_days_from_sunday() as usize].to_string()
        } else {
            day_start.day().to_string()
        };
        labels.push(label);
    }
    let index_by_day: HashMap<i64, usize> = start_keys
        .iter()
        .enumerate()
        .map(|(i, k)| (k.timestamp(), i))
        .collect();
    for row in rows {
        let key = start_of_day(row.created_at).timestamp();
        if let Some(&idx) = index_by_day.get(&key) {
            buckets[idx].add(word_count(&row.text), row.duration_sec, row.latency_ms);
        }
    }
    buckets
        .iter()
        .enumerate()
        .map(|(i, acc)| acc.finalize(labels[i].clone()))
        .collect()
}

fn hour_label(h: u32) -> String {
    if h == 0 {
        "12a".to_string()
    } else if h == 12 {
        "12p".to_string()
    } else if h < 12 {
        format!("{h}a")
    } else {
        format!("{}p", h - 12)
    }
}

/// dictation intensity by weekday (Mon..Sun) and hour over the last 7 days.
/// ported from the frontend hourWeekdayBuckets including the Mon first remap.
fn hour_weekday_buckets(rows: &[InsightRow], now: DateTime<Local>) -> HeatMap {
    let mut matrix: Vec<Vec<u64>> = vec![vec![0u64; 24]; 7];
    let cutoff = now - Duration::days(7);
    let mut max = 0u64;
    for row in rows {
        if row.created_at < cutoff {
            continue;
        }
        // map sunday first weekday (0=sun..6=sat) to row 0=mon..6=sun.
        let row_idx = ((row.created_at.weekday().num_days_from_sunday() + 6) % 7) as usize;
        let col = row.created_at.hour() as usize;
        matrix[row_idx][col] += 1;
        if matrix[row_idx][col] > max {
            max = matrix[row_idx][col];
        }
    }
    HeatMap { matrix, max }
}

/// current daily streak in days. ported from the frontend currentStreakDays.
fn current_streak_days(rows: &[InsightRow], now: DateTime<Local>) -> u64 {
    let days: std::collections::HashSet<i64> = rows
        .iter()
        .map(|r| start_of_day(r.created_at).timestamp())
        .collect();
    let mut cursor = start_of_day(now);
    // if nothing today yet, count from yesterday so a day still in progress
    // does not read as a broken streak.
    if !days.contains(&cursor.timestamp()) {
        cursor -= Duration::days(1);
    }
    let mut streak = 0u64;
    while days.contains(&cursor.timestamp()) {
        streak += 1;
        cursor -= Duration::days(1);
    }
    streak
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

fn migrate_in_tx(tx: &rusqlite::Transaction<'_>) -> Result<()> {
    let cols: Vec<String> = tx
        .prepare("PRAGMA table_info(transcripts)")?
        .query_map([], |row| row.get::<_, String>(1))?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    if !cols.iter().any(|c| c == "latency_ms") {
        tx.execute("ALTER TABLE transcripts ADD COLUMN latency_ms INTEGER", [])?;
    }
    if !cols.iter().any(|c| c == "target_app") {
        tx.execute("ALTER TABLE transcripts ADD COLUMN target_app TEXT", [])?;
    }
    if !cols.iter().any(|c| c == "target_app_path") {
        tx.execute(
            "ALTER TABLE transcripts ADD COLUMN target_app_path TEXT",
            [],
        )?;
    }
    Ok(())
}

const STOPWORDS: &[&str] = &[
    "the",
    "a",
    "an",
    "and",
    "or",
    "but",
    "is",
    "are",
    "was",
    "were",
    "i",
    "you",
    "he",
    "she",
    "it",
    "we",
    "they",
    "this",
    "that",
    "to",
    "of",
    "in",
    "on",
    "for",
    "with",
    "as",
    "at",
    "by",
    "be",
    "been",
    "being",
    "have",
    "has",
    "had",
    "do",
    "does",
    "did",
    "will",
    "would",
    "should",
    "can",
    "could",
    "may",
    "might",
    "must",
    "not",
    "no",
    "so",
    "if",
    "then",
    "than",
    "from",
    "into",
    "out",
    "up",
    "down",
    "very",
    "just",
    "about",
    "what",
    "when",
    "where",
    "how",
    "who",
    "why",
    "which",
    "these",
    "those",
    "my",
    "your",
    "their",
    "our",
    "us",
    "them",
    "him",
    "her",
    "his",
    "its",
    "any",
    "all",
    "some",
    "one",
    "two",
    "three",
    "four",
    "five",
    "yeah",
    "okay",
    "ok",
    "right",
    "well",
    "like",
    // common contractions. tokenizer keeps the apostrophe stripped so we list
    // both the bare stem and the apostrophe form.
    "im",
    "i'm",
    "its",
    "it's",
    "dont",
    "don't",
    "whats",
    "what's",
    "youre",
    "you're",
    "thats",
    "that's",
    "im",
    "ive",
    "i've",
    "ill",
    "i'll",
    "id",
    "i'd",
    "cant",
    "can't",
    "wont",
    "won't",
    "isnt",
    "isn't",
    "arent",
    "aren't",
    "wasnt",
    "wasn't",
    "werent",
    "weren't",
    "hasnt",
    "hasn't",
    "havent",
    "haven't",
    "doesnt",
    "doesn't",
    "didnt",
    "didn't",
    "wouldnt",
    "wouldn't",
    "couldnt",
    "couldn't",
    "shouldnt",
    "shouldn't",
    "theres",
    "there's",
    "heres",
    "here's",
    "wheres",
    "where's",
    "hes",
    "he's",
    "shes",
    "she's",
    "weve",
    "we've",
    "theyre",
    "they're",
    "theyve",
    "they've",
    "youve",
    "you've",
    "youll",
    "you'll",
    "lets",
    "let's",
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
        assert!(store
            .update_transcript_text("missing", "x")
            .unwrap()
            .is_none());
    }

    fn row(at: DateTime<Local>, dur: f64, text: &str, latency: Option<i64>) -> InsightRow {
        InsightRow {
            created_at: at,
            duration_sec: dur,
            text: text.to_string(),
            latency_ms: latency,
        }
    }

    // the headline summary words must equal the sum of the series bucket words.
    // this proves the chart and the headline read the same single source.
    #[test]
    fn summary_words_equal_series_words() {
        let now = Local
            .with_ymd_and_hms(2026, 6, 17, 14, 30, 0)
            .single()
            .unwrap();
        let today = start_of_day(now);
        let rows = vec![
            row(
                today + Duration::hours(9),
                4.0,
                "hello there friend",
                Some(120),
            ),
            row(
                today + Duration::hours(10),
                6.0,
                "the quick brown fox jumps",
                Some(80),
            ),
            row(
                today - Duration::days(2) + Duration::hours(11),
                3.0,
                "two days ago",
                None,
            ),
            row(
                today - Duration::days(6) + Duration::hours(8),
                5.0,
                "edge of the week window",
                Some(50),
            ),
        ];

        // week range: all four rows fall inside the 7 day window.
        let week = compute_insights(&rows, 7, now);
        let series_words: u64 = week.series.iter().map(|b| b.words).sum();
        assert_eq!(week.words, series_words, "week headline must match series");
        assert_eq!(week.sessions, 4);
        assert_eq!(week.series.len(), 7);

        // day range: only today rows count and the 24 hourly buckets must sum
        // to the headline.
        let day = compute_insights(&rows, 1, now);
        let day_series_words: u64 = day.series.iter().map(|b| b.words).sum();
        assert_eq!(
            day.words, day_series_words,
            "day headline must match series"
        );
        assert_eq!(day.sessions, 2);
        assert_eq!(day.series.len(), 24);
    }

    // tiny clips and pre roll artifacts must not produce an impossible fastest.
    #[test]
    fn fastest_ignores_tiny_clips() {
        let now = Local
            .with_ymd_and_hms(2026, 6, 17, 14, 30, 0)
            .single()
            .unwrap();
        let today = start_of_day(now);
        let rows = vec![
            // ten words in 0.2s would be 3000 wpm, under the floor, ignored.
            row(today + Duration::hours(9), 0.2, "a b c d e f g h i j", None),
            // ten words in 0.6s passes the floor but is 1000 wpm, above the
            // realistic ceiling, so the cap must exclude it.
            row(today + Duration::hours(11), 0.6, "a b c d e f g h i j", None),
            // a realistic clip: 5 words in 3s is 100 wpm.
            row(
                today + Duration::hours(10),
                3.0,
                "one two three four five",
                None,
            ),
        ];
        let data = compute_insights(&rows, 1, now);
        assert_eq!(data.fastest, Some(100));
    }
}
