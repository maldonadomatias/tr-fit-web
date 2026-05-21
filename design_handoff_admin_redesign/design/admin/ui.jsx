// UI primitives — small atoms used across all admin pages.

const { useState, useEffect, useRef } = React;

function cx(...parts) {
  return parts.filter(Boolean).join(" ");
}

function Avatar({ name, size = "md", brand = false }) {
  const initials = (name || "??").split(" ").map(p => p[0]).slice(0, 2).join("").toUpperCase();
  const cls = cx("avatar", size === "lg" && "lg", size === "xl" && "xl", brand && "brand");
  return <span className={cls}>{initials}</span>;
}

function Badge({ variant = "muted", dot = false, children }) {
  return (
    <span className={cx("badge", variant, dot && "dot")}>{children}</span>
  );
}

function StatusBadge({ status }) {
  const map = {
    approved: { v: "brand", label: "Aprobado" },
    pending:  { v: "warning", label: "Pendiente" },
    rejected: { v: "destructive", label: "Rechazado" },
  };
  const m = map[status] ?? { v: "muted", label: status };
  return <Badge variant={m.v} dot>{m.label}</Badge>;
}

function TierBadge({ tier }) {
  if (!tier) return <span className="t-meta">—</span>;
  return <span className={cx("tier", tier)}>{tier}</span>;
}

function SubStatusBadge({ status }) {
  if (!status) return null;
  const map = {
    authorized: { v: "brand", label: "Activa" },
    pending:    { v: "warning", label: "Pendiente" },
    paused:     { v: "warning", label: "Pausada" },
    cancelled:  { v: "outline", label: "Cancelada" },
  };
  const m = map[status] ?? { v: "muted", label: status };
  return <Badge variant={m.v}>{m.label}</Badge>;
}

function RoleBadge({ role }) {
  const map = {
    athlete: "Atleta",
    coach: "Coach",
    admin: "Admin",
  };
  return <span className="badge muted">{map[role] ?? role}</span>;
}

function Eyebrow({ children, variant = "brand" }) {
  return <div className={cx("eyebrow", variant)}>{children}</div>;
}

function Card({ children, muted = false, className = "" }) {
  return <div className={cx("card", muted && "muted", className)}>{children}</div>;
}

function CardHead({ title, eyebrow, action }) {
  return (
    <div className="card-head">
      <div>
        {eyebrow && <Eyebrow variant="muted">{eyebrow}</Eyebrow>}
        <h3 className="t-card">{title}</h3>
      </div>
      {action}
    </div>
  );
}

function Btn({ variant = "outline", size = "md", icon, children, onClick, type = "button", disabled, ...rest }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cx("btn", `btn-${variant}`, size === "sm" && "btn-sm", size === "xs" && "btn-xs")}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}

function Seg({ options, value, onChange }) {
  return (
    <div className="seg" role="tablist">
      {options.map(o => (
        <button
          key={o.key}
          className={cx(value === o.key && "on")}
          onClick={() => onChange(o.key)}
        >
          {o.label}
          {o.count != null && (
            <span className="font-mono" style={{ marginLeft: 6, opacity: 0.6 }}>{o.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

function PageHeader({ eyebrow, title, sub, actions, breadcrumb }) {
  return (
    <div className="page-header">
      <div>
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h1 className="t-title mt-1">{title}</h1>
        {sub && <div className="t-meta meta-row">{sub}</div>}
      </div>
      {actions && <div className="flex gap-2 items-center">{actions}</div>}
    </div>
  );
}

function Field({ label, children, hint }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="label">{label}</div>
      {children}
      {hint && <div className="t-meta">{hint}</div>}
    </div>
  );
}

function Input({ icon, ...props }) {
  return (
    <div className="input">
      {icon && <span className="input-icon">{icon}</span>}
      <input {...props} />
    </div>
  );
}

function Sparkline({ data, width = 120, height = 36, color = "var(--brand-color)" }) {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data), min = Math.min(...data);
  const range = max - min || 1;
  const step = width / (data.length - 1);
  const points = data.map((v, i) => [i * step, height - ((v - min) / range) * (height - 2) - 1]);
  const path = points.reduce((acc, [x, y], i) => acc + (i === 0 ? `M${x},${y}` : ` L${x},${y}`), "");
  const area = path + ` L${width},${height} L0,${height} Z`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id="sparkfill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#sparkfill)" />
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Donut({ value, size = 110, stroke = 10, label, sub }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (value / 100) * c;
  return (
    <div className="donut-wrap" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size/2} cy={size/2} r={r}
          fill="none" stroke="hsl(var(--muted))" strokeWidth={stroke} />
        <circle cx={size/2} cy={size/2} r={r}
          fill="none" stroke="var(--brand-color)" strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          transform={`rotate(-90 ${size/2} ${size/2})`} />
      </svg>
      <div className="donut-center">
        <div className="num" style={{ fontSize: 22, fontWeight: 700 }}>{label}</div>
        {sub && <div className="t-micro" style={{ marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
}

function ConfirmDialog({ open, title, body, confirmLabel, confirmVariant = "destructive", onConfirm, onClose }) {
  if (!open) return null;
  return (
    <div className="scrim" onClick={onClose}>
      <div className="dialog" onClick={e => e.stopPropagation()}>
        <div className="dialog-head">
          <h3 className="t-section">{title}</h3>
        </div>
        <div className="dialog-body t-body text-muted">{body}</div>
        <div className="dialog-foot">
          <Btn variant="ghost" size="sm" onClick={onClose}>Cancelar</Btn>
          <Btn variant={confirmVariant} size="sm" onClick={onConfirm}>{confirmLabel}</Btn>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, {
  cx, Avatar, Badge, StatusBadge, TierBadge, SubStatusBadge, RoleBadge,
  Eyebrow, Card, CardHead, Btn, Seg, PageHeader, Field, Input,
  Sparkline, Donut, ConfirmDialog,
});
