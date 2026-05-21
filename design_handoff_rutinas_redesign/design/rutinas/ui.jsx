// FORMA Rutinas — atoms shared across panels.

const { useState, useEffect, useRef, useMemo, useCallback } = React;
const I = window.Icons;

function cn(...xs) { return xs.filter(Boolean).join(' '); }

// ---------- Button ----------
function Btn({ variant = 'outline', size = 'md', children, kbd, leftIcon, rightIcon, className, ...rest }) {
  const cls = cn(
    'btn',
    variant === 'primary' && 'btn-primary',
    variant === 'brand' && 'btn-brand',
    variant === 'outline' && 'btn-outline',
    variant === 'ghost' && 'btn-ghost',
    variant === 'destructive' && 'btn-destructive',
    size === 'sm' && 'btn-sm',
    size === 'xs' && 'btn-xs',
    className,
  );
  return (
    <button className={cls} {...rest}>
      {leftIcon}
      <span>{children}</span>
      {kbd && <span className="kbd-hint">{kbd}</span>}
      {rightIcon}
    </button>
  );
}

// ---------- Eyebrow ----------
function Eyebrow({ tone = 'muted', children, className }) {
  return (
    <div className={cn('eyebrow', tone === 'brand' ? 'brand' : 'muted', className)}>
      {children}
    </div>
  );
}

// ---------- Confidence badge ----------
function ConfidenceBadge({ value }) {
  const bucket = window.RutinaData.confidenceBucket(value);
  return (
    <span className={cn('conf', bucket)}>
      <span className="conf-dot" />
      {value}%
    </span>
  );
}

// ---------- Status dot for list rows ----------
function StatusDot({ state, isActive }) {
  if (isActive) return <span className="row-dot active" />;
  if (state === 'retry') return <span className="row-dot retry" />;
  if (state === 'critical') return <span className="row-dot critical" />;
  return <span className="row-dot pending" />;
}

// ---------- Avatar circle (used in detail header) ----------
function MonoAvatar({ name, size = 36 }) {
  const initials = name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div
      className="avatar brand"
      style={{ width: size, height: size, fontSize: size <= 32 ? 11 : 12 }}
    >
      {initials}
    </div>
  );
}

// ---------- Segmented control (Tweak-style) ----------
function Seg({ value, onChange, options }) {
  return (
    <div className="seg">
      {options.map((opt) => (
        <button
          key={opt.value}
          className={value === opt.value ? 'on' : ''}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ---------- Mock select (visual only — not a real menu) ----------
function MockSelect({ label, value, onClick }) {
  return (
    <button className="select" onClick={onClick}>
      <span>{value}</span>
      <I.ChevronDown size={12} className="chev" />
    </button>
  );
}

// ---------- Kbd display ----------
function Kbd({ children }) {
  return <span className="kbd">{children}</span>;
}
function KbdSeq({ keys }) {
  return (
    <span className="kbd-group">
      {keys.map((k, i) => <Kbd key={i}>{k}</Kbd>)}
    </span>
  );
}

// ---------- Scrim / dialog ----------
function Scrim({ onClose, children }) {
  // ESC closes
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose?.(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      {children}
    </div>
  );
}

// ---------- expose ----------
Object.assign(window, {
  cn, Btn, Eyebrow, ConfidenceBadge, StatusDot, MonoAvatar,
  Seg, MockSelect, Kbd, KbdSeq, Scrim,
});
