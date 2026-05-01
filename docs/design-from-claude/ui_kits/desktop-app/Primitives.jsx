/* global React */
// Primitives — verbatim from src/components/ui/* but inline-styled so the kit
// runs without Tailwind. Variants/sizes match shadcn New York exactly.

const cn = (...a) => a.filter(Boolean).join(" ");

// ── Icon (Lucide via global lucide.icons) ─────────────────
function Icon({ name, size = 16, className, style, strokeWidth = 2, ...rest }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!ref.current || !window.lucide) return;
    ref.current.innerHTML = "";
    const el = document.createElement("i");
    el.setAttribute("data-lucide", name);
    ref.current.appendChild(el);
    window.lucide.createIcons({
      attrs: { width: size, height: size, "stroke-width": strokeWidth },
    });
  }, [name, size, strokeWidth]);
  return (
    <span
      ref={ref}
      className={className}
      style={{ display: "inline-flex", lineHeight: 0, ...style }}
      {...rest}
    />
  );
}

// ── Button ────────────────────────────────────────────────
function Button({
  variant = "default",
  size = "default",
  asChild,
  className,
  style,
  children,
  ...rest
}) {
  const Comp = "button";
  const base = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    whiteSpace: "nowrap",
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 500,
    fontFamily: "inherit",
    border: "1px solid transparent",
    cursor: "pointer",
    transition: "background-color 150ms, color 150ms, border-color 150ms",
    userSelect: "none",
  };
  const sizes = {
    default: { height: 36, padding: "0 16px" },
    sm: { height: 32, padding: "0 12px", fontSize: 12 },
    lg: { height: 40, padding: "0 24px" },
    icon: { width: 36, height: 36, padding: 0 },
  };
  const variants = {
    default: { background: "var(--primary)", color: "var(--primary-foreground)" },
    secondary: { background: "var(--secondary)", color: "var(--secondary-foreground)" },
    outline: {
      background: "var(--background)",
      color: "var(--foreground)",
      borderColor: "var(--input)",
    },
    ghost: { background: "transparent", color: "var(--foreground)" },
    destructive: {
      background: "var(--destructive)",
      color: "var(--destructive-foreground)",
    },
    link: {
      background: "transparent",
      color: "var(--foreground)",
      padding: 0,
      height: "auto",
      textDecoration: "underline",
      textUnderlineOffset: 4,
    },
  };
  return (
    <Comp
      className={className}
      data-variant={variant}
      data-size={size}
      style={{ ...base, ...sizes[size], ...variants[variant], ...style }}
      {...rest}
    >
      {children}
    </Comp>
  );
}

// ── Badge ─────────────────────────────────────────────────
function Badge({ variant = "default", className, style, children, ...rest }) {
  const base = {
    display: "inline-flex",
    alignItems: "center",
    height: 20,
    padding: "0 8px",
    borderRadius: 6,
    border: "1px solid transparent",
    fontSize: 11,
    fontWeight: 500,
    fontVariantNumeric: "tabular-nums",
  };
  const variants = {
    default: { background: "var(--secondary)", color: "var(--secondary-foreground)" },
    outline: { background: "transparent", color: "var(--foreground)", borderColor: "var(--border)" },
    muted: { background: "var(--muted)", color: "var(--muted-foreground)" },
  };
  return (
    <span className={className} style={{ ...base, ...variants[variant], ...style }} {...rest}>
      {children}
    </span>
  );
}

// ── Input ─────────────────────────────────────────────────
function Input({ className, style, ...rest }) {
  return (
    <input
      className={className}
      style={{
        height: 36,
        width: "100%",
        padding: "0 12px",
        border: "1px solid var(--input)",
        borderRadius: 6,
        background: "var(--background)",
        color: "var(--foreground)",
        fontSize: 13,
        fontFamily: "inherit",
        boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
        outline: "none",
        ...style,
      }}
      {...rest}
    />
  );
}

// ── Switch ────────────────────────────────────────────────
function Switch({ checked, onCheckedChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => !disabled && onCheckedChange?.(!checked)}
      disabled={disabled}
      style={{
        position: "relative",
        width: 36,
        height: 20,
        flexShrink: 0,
        borderRadius: 999,
        border: "2px solid transparent",
        background: checked ? "var(--primary)" : "var(--input)",
        transition: "background-color 150ms",
        cursor: disabled ? "not-allowed" : "pointer",
        padding: 0,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: 16,
          height: 16,
          background: "var(--background)",
          borderRadius: 999,
          transition: "transform 150ms",
          transform: checked ? "translateX(16px)" : "translateX(0)",
          boxShadow: "0 1px 3px rgba(0,0,0,0.18)",
        }}
      />
    </button>
  );
}

// ── Separator ─────────────────────────────────────────────
function Separator({ orientation = "horizontal", style }) {
  return (
    <div
      role="separator"
      style={{
        background: "var(--border)",
        flexShrink: 0,
        ...(orientation === "horizontal"
          ? { height: 1, width: "100%" }
          : { width: 1, height: "100%" }),
        ...style,
      }}
    />
  );
}

// ── Card primitives ───────────────────────────────────────
function Card({ children, style }) {
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 8,
        background: "var(--card)",
        color: "var(--card-foreground)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
function CardHeader({ children, style }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "16px 16px 8px", ...style }}>
      {children}
    </div>
  );
}
function CardTitle({ children, style }) {
  return (
    <h3
      style={{
        fontSize: 13,
        fontWeight: 600,
        letterSpacing: "-0.005em",
        lineHeight: 1.2,
        margin: 0,
        ...style,
      }}
    >
      {children}
    </h3>
  );
}
function CardDescription({ children, style }) {
  return (
    <p
      style={{
        fontSize: 11,
        color: "var(--muted-foreground)",
        lineHeight: 1.4,
        margin: 0,
        ...style,
      }}
    >
      {children}
    </p>
  );
}
function CardContent({ children, style }) {
  return <div style={{ padding: "8px 16px 16px", ...style }}>{children}</div>;
}

// ── Dialog (simple modal) ─────────────────────────────────
function Dialog({ open, onOpenChange, children }) {
  if (!open) return null;
  return (
    <div
      role="dialog"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.5)",
        animation: "fadeIn 150ms ease-out",
      }}
      onClick={(e) => e.target === e.currentTarget && onOpenChange?.(false)}
    >
      <div
        style={{
          background: "var(--card)",
          color: "var(--card-foreground)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: 24,
          width: "min(100%, 448px)",
          boxShadow: "0 10px 15px -3px rgba(0,0,0,0.18), 0 4px 6px -4px rgba(0,0,0,0.18)",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {children}
      </div>
    </div>
  );
}

window.MumblePrimitives = {
  Icon, Button, Badge, Input, Switch, Separator,
  Card, CardHeader, CardTitle, CardDescription, CardContent,
  Dialog, cn,
};
