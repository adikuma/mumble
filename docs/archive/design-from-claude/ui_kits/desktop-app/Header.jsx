/* global React, MumblePrimitives */
const { Icon } = window.MumblePrimitives;

function ThemeToggle({ theme, onChange }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    function onClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const iconName = theme === "dark" ? "moon" : theme === "system" ? "monitor" : "sun";

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Toggle theme"
        style={{
          width: 36,
          height: 36,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          background: "transparent",
          border: "none",
          borderRadius: 6,
          color: "var(--foreground)",
          cursor: "pointer",
          transition: "background-color 150ms",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        <Icon name={iconName} size={16} />
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: 40,
            right: 0,
            width: 140,
            background: "var(--popover)",
            color: "var(--popover-foreground)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: 4,
            boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
            zIndex: 30,
            fontSize: 13,
          }}
        >
          {[
            ["light", "Light", "sun"],
            ["dark", "Dark", "moon"],
            ["system", "System", "monitor"],
          ].map(([id, label, icon]) => {
            const active = theme === id;
            return (
              <button
                key={id}
                onClick={() => {
                  onChange(id);
                  setOpen(false);
                }}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "6px 10px",
                  background: active ? "var(--accent)" : "transparent",
                  color: "var(--foreground)",
                  border: "none",
                  borderRadius: 4,
                  fontSize: 13,
                  fontFamily: "inherit",
                  cursor: "pointer",
                  textAlign: "left",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent)")}
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = active ? "var(--accent)" : "transparent")
                }
              >
                <Icon name={icon} size={14} />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Header({ view, theme, onThemeChange, appState }) {
  const stateLabel =
    appState && appState !== "idle" && appState !== "paused" ? appState : null;
  return (
    <header
      style={{
        height: 48,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 16px",
        borderBottom: "1px solid var(--border)",
        background: "var(--background)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            textTransform: "capitalize",
          }}
        >
          {view}
        </span>
        {stateLabel && (
          <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>· {stateLabel}</span>
        )}
      </div>
      <ThemeToggle theme={theme} onChange={onThemeChange} />
    </header>
  );
}

window.MumbleHeader = Header;
