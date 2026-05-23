/* global React, MumblePrimitives */
const { Icon, Badge } = window.MumblePrimitives;

function Sidebar({ view, onChange, hotkey, collapsed }) {
  const NAV = [
    { id: "history", label: "History", icon: "history" },
    { id: "settings", label: "Settings", icon: "settings" },
  ];

  return (
    <aside
      data-collapsed={String(!!collapsed)}
      style={{
        width: collapsed ? 56 : 240,
        height: "100%",
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        borderRight: "1px solid var(--sidebar-border)",
        background: "var(--sidebar)",
        color: "var(--sidebar-foreground)",
        transition: "width 200ms ease",
      }}
    >
      {/* App mark + version */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: collapsed ? "16px 8px" : "16px",
          justifyContent: collapsed ? "center" : "flex-start",
        }}
      >
        <Icon name="mic" size={20} style={{ color: "var(--foreground)" }} />
        {!collapsed && (
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Mumble</span>
            <span style={{ fontSize: 10, color: "var(--muted-foreground)" }}>v0.1.0</span>
          </div>
        )}
      </div>

      <nav
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 2,
          padding: "0 8px",
          flex: 1,
        }}
      >
        {NAV.map((item) => {
          const active = view === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onChange(item.id)}
              title={collapsed ? item.label : undefined}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                height: 36,
                padding: collapsed ? 0 : "0 12px",
                justifyContent: collapsed ? "center" : "flex-start",
                background: active ? "var(--sidebar-accent)" : "transparent",
                color: active
                  ? "var(--sidebar-accent-foreground)"
                  : "var(--sidebar-foreground)",
                borderRadius: 6,
                border: "none",
                fontSize: 13,
                fontWeight: 500,
                fontFamily: "inherit",
                cursor: "pointer",
                transition: "background-color 150ms, color 150ms",
              }}
              onMouseEnter={(e) => {
                if (!active) {
                  e.currentTarget.style.background = "var(--sidebar-accent)";
                  e.currentTarget.style.color = "var(--sidebar-accent-foreground)";
                }
              }}
              onMouseLeave={(e) => {
                if (!active) {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "var(--sidebar-foreground)";
                }
              }}
            >
              <Icon name={item.icon} size={16} />
              {!collapsed && <span>{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {!collapsed && (
        <div
          style={{
            borderTop: "1px solid var(--sidebar-border)",
            padding: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>Push-to-talk</span>
          <Badge variant="outline">{hotkey}</Badge>
        </div>
      )}
    </aside>
  );
}

window.MumbleSidebar = Sidebar;
