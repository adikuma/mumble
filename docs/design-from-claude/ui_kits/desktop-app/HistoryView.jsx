/* global React, MumblePrimitives */
const {
  Icon, Button, Badge, Input, Separator, Dialog,
} = window.MumblePrimitives;

const SAMPLE = [
  {
    id: "t1",
    createdAt: "2 min ago",
    durationSec: 12,
    text: "Let's ship the new dictation flow before end of week. I think we can get the hotkey latency under 80 milliseconds if we drop rdev and write the hook directly in windows-rs.",
    inputDevice: "System Default",
    model: "Parakeet-TDT v3",
  },
  {
    id: "t2",
    createdAt: "18 min ago",
    durationSec: 5,
    text: "Remind me to check the Parakeet model size before we add it to the bundle — I think we'll need a first-run download instead of shipping it in the installer.",
    inputDevice: "System Default",
    model: "Parakeet-TDT v3",
  },
  {
    id: "t3",
    createdAt: "1 hr ago",
    durationSec: 27,
    text: "The ring buffer approach from Hex is actually genius. They keep one second of audio warm at all times, and on hotkey press they prepend roughly four hundred and fifty milliseconds of it to the file. That's why it catches the first syllable.",
    inputDevice: "System Default",
    model: "Parakeet-TDT v3",
  },
  {
    id: "t4",
    createdAt: "3 hr ago",
    durationSec: 8,
    text: "Okay testing this on VS Code now. Pressing right control, speaking, releasing. Looks clean.",
    inputDevice: "System Default",
    model: "Parakeet-TDT v3",
  },
  {
    id: "t5",
    createdAt: "Yesterday",
    durationSec: 42,
    text: "Long-form test. We want to verify that sherpa-onnx handles three minute clips without running out of memory or chopping off the end.",
    inputDevice: "System Default",
    model: "Parakeet-TDT v3",
  },
];

function fmtDur(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function HistoryView({ toast }) {
  const [items, setItems] = React.useState(SAMPLE);
  const [query, setQuery] = React.useState("");
  const [selectedId, setSelectedId] = React.useState(SAMPLE[0].id);
  const [confirmClear, setConfirmClear] = React.useState(false);

  const list = items.filter((t) =>
    !query.trim() ? true : t.text.toLowerCase().includes(query.toLowerCase())
  );
  const selected = list.find((t) => t.id === selectedId) ?? list[0];

  function handleCopy(id) {
    toast?.("Copied to clipboard");
  }
  function handleRepaste() {
    toast?.("Pasted to last app");
  }
  function handleDelete(id) {
    setItems((xs) => xs.filter((t) => t.id !== id));
    toast?.("Deleted");
  }
  function handleClearAll() {
    setItems([]);
    setConfirmClear(false);
    toast?.("History cleared");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* Search bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "12px 16px",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
        }}
      >
        <div style={{ position: "relative", flex: 1 }}>
          <span
            style={{
              position: "absolute",
              left: 10,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--muted-foreground)",
              pointerEvents: "none",
            }}
          >
            <Icon name="search" size={14} />
          </span>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search transcripts…"
            style={{ paddingLeft: 32 }}
          />
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Clear all history"
          onClick={() => items.length > 0 && setConfirmClear(true)}
          style={items.length === 0 ? { opacity: 0.4, cursor: "not-allowed" } : undefined}
        >
          <Icon name="trash-2" size={16} />
        </Button>
      </div>

      {/* List + Detail */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1.5fr)", flex: 1, minHeight: 0 }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            overflowY: "auto",
            borderRight: "1px solid var(--border)",
          }}
        >
          {list.length === 0 ? (
            <EmptyState query={query} />
          ) : (
            list.map((t) => (
              <Row
                key={t.id}
                t={t}
                active={t.id === selected?.id}
                onSelect={() => setSelectedId(t.id)}
                onCopy={() => handleCopy(t.id)}
                onRepaste={() => handleRepaste(t.id)}
                onDelete={() => handleDelete(t.id)}
              />
            ))
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", overflowY: "auto" }}>
          {selected ? (
            <Detail
              t={selected}
              onCopy={() => handleCopy(selected.id)}
              onRepaste={() => handleRepaste(selected.id)}
              onDelete={() => handleDelete(selected.id)}
            />
          ) : null}
        </div>
      </div>

      <Dialog open={confirmClear} onOpenChange={setConfirmClear}>
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Clear all history?</h2>
          <p style={{ fontSize: 13, color: "var(--muted-foreground)", marginTop: 8 }}>
            This deletes every transcript permanently. Nothing leaves your machine — it's a local delete.
          </p>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button variant="ghost" onClick={() => setConfirmClear(false)}>Cancel</Button>
          <Button variant="destructive" onClick={handleClearAll}>Clear all</Button>
        </div>
      </Dialog>
    </div>
  );
}

function Row({ t, active, onSelect, onCopy, onRepaste, onDelete }) {
  const [hover, setHover] = React.useState(false);
  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        padding: "12px 16px",
        borderBottom: "1px solid var(--border)",
        textAlign: "left",
        cursor: "pointer",
        background: active || hover ? "rgba(228,228,231,0.5)" : "transparent",
        transition: "background-color 150ms",
        position: "relative",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{t.createdAt}</span>
          <Badge variant="muted">{fmtDur(t.durationSec)}</Badge>
        </div>
        {hover && (
          <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
            <RowAction icon="copy" label="Copy" onClick={(e) => { e.stopPropagation(); onCopy(); }} />
            <RowAction icon="corner-down-left" label="Paste again" onClick={(e) => { e.stopPropagation(); onRepaste(); }} />
            <RowAction icon="trash-2" label="Delete" onClick={(e) => { e.stopPropagation(); onDelete(); }} />
          </div>
        )}
      </div>
      <p
        style={{
          fontSize: 13,
          color: "var(--foreground)",
          margin: 0,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {t.text}
      </p>
    </div>
  );
}

function RowAction({ icon, label, onClick }) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      style={{
        width: 24,
        height: 24,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        border: "none",
        background: "transparent",
        color: "var(--muted-foreground)",
        cursor: "pointer",
        borderRadius: 4,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <Icon name={icon} size={14} />
    </button>
  );
}

function Detail({ t, onCopy, onRepaste, onDelete }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{t.createdAt}</span>
          <Badge variant="muted">{fmtDur(t.durationSec)}</Badge>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <Button variant="ghost" size="icon" aria-label="Copy" onClick={onCopy}><Icon name="copy" size={16} /></Button>
          <Button variant="ghost" size="icon" aria-label="Paste again" onClick={onRepaste}><Icon name="corner-down-left" size={16} /></Button>
          <Button variant="ghost" size="icon" aria-label="Delete" onClick={onDelete}><Icon name="trash-2" size={16} /></Button>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px" }}>
        <p style={{ fontSize: 15, lineHeight: 1.65, color: "var(--foreground)", margin: 0, whiteSpace: "pre-wrap" }}>
          {t.text}
        </p>
      </div>
      <Separator />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 24px",
          fontSize: 11,
          color: "var(--muted-foreground)",
        }}
      >
        <span>Input: {t.inputDevice}</span>
        <span>{t.model} · en</span>
      </div>
    </div>
  );
}

function EmptyState({ query }) {
  const hasQuery = query.trim().length > 0;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding: 32,
        textAlign: "center",
        height: "100%",
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: "50%",
          background: "var(--muted)",
          color: "var(--muted-foreground)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name={hasQuery ? "search" : "mic-off"} size={20} />
      </div>
      <p style={{ fontSize: 13, fontWeight: 500, margin: 0 }}>
        {hasQuery ? "No matches" : "No transcripts yet"}
      </p>
      <p style={{ fontSize: 11, color: "var(--muted-foreground)", margin: 0 }}>
        {hasQuery ? "Try a different search query." : "Hold your hotkey anywhere to dictate."}
      </p>
      {!hasQuery && (
        <Badge variant="outline" style={{ marginTop: 4 }}>Right Ctrl</Badge>
      )}
    </div>
  );
}

window.MumbleHistoryView = HistoryView;
