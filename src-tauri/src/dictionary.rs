//! local custom dictionary. two pure pieces.
//!   * apply runs after transcription to swap wrong text for right text.
//!   * extract_corrections diffs an original transcript against the user
//!     edited version to learn new wrong to right pairs.
//!
//! storage and crud live on HistoryStore. this module stays pure so the
//! matching and diff logic can be unit tested without a database.

use serde::{Deserialize, Serialize};
use std::cmp::Reverse;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DictEntry {
    pub id: i64,
    pub pattern: String,
    pub replacement: String,
    pub case_sensitive: bool,
    pub fuzzy: bool,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Correction {
    pub original: String,
    pub corrected: String,
}

// classic two row levenshtein. operates on chars.
pub fn levenshtein(a: &str, b: &str) -> usize {
    let a: Vec<char> = a.chars().collect();
    let b: Vec<char> = b.chars().collect();
    if a.is_empty() {
        return b.len();
    }
    if b.is_empty() {
        return a.len();
    }
    let mut prev: Vec<usize> = (0..=b.len()).collect();
    let mut cur = vec![0usize; b.len() + 1];
    for (i, ca) in a.iter().enumerate() {
        cur[0] = i + 1;
        for (j, cb) in b.iter().enumerate() {
            let cost = if ca == cb { 0 } else { 1 };
            cur[j + 1] = (prev[j + 1] + 1).min(cur[j] + 1).min(prev[j] + cost);
        }
        std::mem::swap(&mut prev, &mut cur);
    }
    prev[b.len()]
}

// edit distance normalised by the longer string. 0.0 means identical.
pub fn edit_ratio(a: &str, b: &str) -> f64 {
    let max = a.chars().count().max(b.chars().count());
    if max == 0 {
        return 0.0;
    }
    levenshtein(a, b) as f64 / max as f64
}

// fuzzy apply only fires for very close single token variants, so we do
// not silently rewrite unrelated words. capture is more lenient than this.
const FUZZY_APPLY_MAX_RATIO: f64 = 0.25;

fn is_word_char(c: char) -> bool {
    c.is_alphanumeric()
}

// replace whole word (or whole phrase) occurrences of pattern. a match must
// be bounded by a non word char or a string edge on both sides so "cat"
// never hits inside "category".
fn replace_exact(text: &str, pattern: &str, replacement: &str, case_sensitive: bool) -> String {
    if pattern.is_empty() {
        return text.to_string();
    }
    let hay: Vec<char> = text.chars().collect();
    let needle_cmp: Vec<char> = if case_sensitive {
        pattern.chars().collect()
    } else {
        pattern.to_lowercase().chars().collect()
    };
    let hay_cmp: Vec<char> = if case_sensitive {
        hay.clone()
    } else {
        text.to_lowercase().chars().collect()
    };

    let mut out = String::with_capacity(text.len());
    let mut i = 0usize;
    while i < hay.len() {
        let end = i + needle_cmp.len();
        let matches = end <= hay_cmp.len() && hay_cmp[i..end] == needle_cmp[..];
        let left_ok = i == 0 || !is_word_char(hay[i - 1]);
        let right_ok = end >= hay.len() || !is_word_char(hay[end]);
        if matches && left_ok && right_ok {
            out.push_str(replacement);
            i = end;
        } else {
            out.push(hay[i]);
            i += 1;
        }
    }
    out
}

// replace single tokens whose edit ratio to the pattern is within the
// fuzzy threshold. multi word fuzzy patterns are out of scope, they fall
// back to exact behaviour.
fn replace_fuzzy(text: &str, pattern: &str, replacement: &str) -> String {
    if pattern.contains(' ') {
        return replace_exact(text, pattern, replacement, false);
    }
    let pat = pattern.to_lowercase();
    let mut out = String::with_capacity(text.len());
    let mut token = String::new();
    for c in text.chars() {
        if is_word_char(c) {
            token.push(c);
        } else {
            flush_fuzzy_token(&mut token, &mut out, &pat, replacement);
            out.push(c);
        }
    }
    flush_fuzzy_token(&mut token, &mut out, &pat, replacement);
    out
}

fn flush_fuzzy_token(token: &mut String, out: &mut String, pat: &str, replacement: &str) {
    if token.is_empty() {
        return;
    }
    if edit_ratio(&token.to_lowercase(), pat) <= FUZZY_APPLY_MAX_RATIO {
        out.push_str(replacement);
    } else {
        out.push_str(token);
    }
    token.clear();
}

// run every dictionary entry over the text. longest patterns first so a
// multi word rule wins over a sub word rule.
pub fn apply(text: &str, entries: &[DictEntry]) -> String {
    let mut sorted: Vec<&DictEntry> = entries.iter().collect();
    sorted.sort_by_key(|e| Reverse(e.pattern.chars().count()));
    let mut out = text.to_string();
    for e in sorted {
        out = if e.fuzzy {
            replace_fuzzy(&out, &e.pattern, &e.replacement)
        } else {
            replace_exact(&out, &e.pattern, &e.replacement, e.case_sensitive)
        };
    }
    out
}

// learning thresholds. lenient on capture so phonetic fixes survive, but
// reject wholesale rewrites and trivially short words.
const CAPTURE_MAX_RATIO: f64 = 0.65;
const CAPTURE_MIN_WORD_LEN: usize = 3;
const CAPTURE_MAX_CHANGED_FRACTION: f64 = 0.5;

fn words(s: &str) -> Vec<String> {
    s.split_whitespace().map(|w| w.to_string()).collect()
}

// length only is not enough, we need the full table to walk the diff.
fn lcs_table(a: &[String], b: &[String]) -> Vec<Vec<usize>> {
    let mut t = vec![vec![0usize; b.len() + 1]; a.len() + 1];
    for i in (0..a.len()).rev() {
        for j in (0..b.len()).rev() {
            t[i][j] = if a[i] == b[j] {
                t[i + 1][j + 1] + 1
            } else {
                t[i + 1][j].max(t[i][j + 1])
            };
        }
    }
    t
}

enum Op {
    Equal,
    Delete(String),
    Insert(String),
}

fn diff_ops(a: &[String], b: &[String]) -> Vec<Op> {
    let t = lcs_table(a, b);
    let mut ops = Vec::new();
    let (mut i, mut j) = (0usize, 0usize);
    while i < a.len() && j < b.len() {
        if a[i] == b[j] {
            ops.push(Op::Equal);
            i += 1;
            j += 1;
        } else if t[i + 1][j] >= t[i][j + 1] {
            ops.push(Op::Delete(a[i].clone()));
            i += 1;
        } else {
            ops.push(Op::Insert(b[j].clone()));
            j += 1;
        }
    }
    while i < a.len() {
        ops.push(Op::Delete(a[i].clone()));
        i += 1;
    }
    while j < b.len() {
        ops.push(Op::Insert(b[j].clone()));
        j += 1;
    }
    ops
}

fn alnum_core(s: &str) -> String {
    s.trim_matches(|c: char| !c.is_alphanumeric()).to_string()
}

// diff the original transcript against the user edited version and return
// the substitutions worth learning. a delete immediately followed by an
// insert is a substitution.
pub fn extract_corrections(original: &str, edited: &str) -> Vec<Correction> {
    let a = words(original);
    let b = words(edited);
    if a.is_empty() {
        return Vec::new();
    }

    let ops = diff_ops(&a, &b);

    // bail on wholesale rewrites. count changed words against the original.
    let deletes = ops.iter().filter(|o| matches!(o, Op::Delete(_))).count();
    if deletes as f64 > a.len() as f64 * CAPTURE_MAX_CHANGED_FRACTION {
        return Vec::new();
    }

    let mut out: Vec<Correction> = Vec::new();
    let mut k = 0usize;
    while k < ops.len() {
        if let Op::Delete(orig) = &ops[k] {
            if let Some(Op::Insert(corr)) = ops.get(k + 1) {
                let o = alnum_core(orig);
                let c = alnum_core(corr);
                let keep = o.chars().count() >= CAPTURE_MIN_WORD_LEN
                    && !c.is_empty()
                    && o.to_lowercase() != c.to_lowercase()
                    && edit_ratio(&o.to_lowercase(), &c.to_lowercase()) <= CAPTURE_MAX_RATIO;
                if keep {
                    out.push(Correction {
                        original: o,
                        corrected: c,
                    });
                }
                k += 2;
                continue;
            }
        }
        k += 1;
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn levenshtein_basics() {
        assert_eq!(levenshtein("kitten", "sitting"), 3);
        assert_eq!(levenshtein("", "abc"), 3);
        assert_eq!(levenshtein("same", "same"), 0);
    }

    #[test]
    fn ratio_is_distance_over_maxlen() {
        let r = edit_ratio("clema", "klema");
        assert!((r - 0.2).abs() < 1e-6);
    }

    fn entry(pattern: &str, replacement: &str, fuzzy: bool, case_sensitive: bool) -> DictEntry {
        DictEntry {
            id: 0,
            pattern: pattern.into(),
            replacement: replacement.into(),
            case_sensitive,
            fuzzy,
        }
    }

    #[test]
    fn apply_exact_whole_word_case_insensitive() {
        let e = vec![entry("klema", "Kléma", false, false)];
        assert_eq!(apply("hi klema and Klema", &e), "hi Kléma and Kléma");
    }

    #[test]
    fn apply_does_not_match_inside_words() {
        let e = vec![entry("cat", "dog", false, false)];
        assert_eq!(apply("category cat", &e), "category dog");
    }

    #[test]
    fn apply_multi_word_pattern() {
        let e = vec![entry("get solar", "GetSolar", false, false)];
        assert_eq!(apply("at get solar today", &e), "at GetSolar today");
    }

    #[test]
    fn apply_case_sensitive_respects_case() {
        let e = vec![entry("Flow", "Flow", false, true)];
        assert_eq!(apply("flow and Flow", &e), "flow and Flow");
    }

    #[test]
    fn apply_fuzzy_catches_close_variant() {
        let e = vec![entry("klema", "Kléma", true, false)];
        assert_eq!(apply("the clema file", &e), "the Kléma file");
    }

    #[test]
    fn apply_longest_pattern_wins() {
        let e = vec![
            entry("new york", "NYC", false, false),
            entry("york", "York", false, false),
        ];
        assert_eq!(apply("in new york now", &e), "in NYC now");
    }

    #[test]
    fn extract_single_word_fix() {
        let got = extract_corrections("call klema today", "call Kléma today");
        assert_eq!(
            got,
            vec![Correction {
                original: "klema".into(),
                corrected: "Kléma".into()
            }]
        );
    }

    #[test]
    fn extract_skips_tiny_words() {
        let got = extract_corrections("a cat", "an cat");
        assert!(got.is_empty());
    }

    #[test]
    fn extract_rejects_full_rewrite() {
        let got = extract_corrections("one two three four", "alpha beta gamma four");
        assert!(got.is_empty());
    }

    #[test]
    fn extract_rejects_unrelated_swap() {
        let got = extract_corrections("the dog ran", "the elephant ran");
        assert!(got.is_empty());
    }

    #[test]
    fn extract_handles_word_count_change() {
        let got = extract_corrections("meet shunade now", "meet Sinead now");
        assert_eq!(
            got,
            vec![Correction {
                original: "shunade".into(),
                corrected: "Sinead".into()
            }]
        );
    }
}
