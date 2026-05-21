// FORMA Rutinas — Shell: sidebar (new IA) + topbar.
// Sidebar mirrors the post-redesign IA from the spec:
//   Panel:    Resumen · Pendientes · Alertas · Actividad
//   Gestión:  Usuarios · Suscripciones · Rutinas (← new)
//   Sistema:  Ajustes

const I = window.Icons;

function Sidebar({ active = 'rutinas', pendingUsersCount = 4, pendingRutinasCount = 12 }) {
  const groups = [
    {
      label: 'Panel',
      items: [
        { key: 'dashboard', label: 'Resumen', icon: 'Home' },
        { key: 'pending-users', label: 'Pendientes', icon: 'Clock', count: pendingUsersCount },
        { key: 'alerts', label: 'Alertas', icon: 'AlertCircle' },
        { key: 'activity', label: 'Actividad', icon: 'Activity' },
      ],
    },
    {
      label: 'Gestión',
      items: [
        { key: 'users', label: 'Usuarios', icon: 'Users' },
        { key: 'subs', label: 'Suscripciones', icon: 'CreditCard' },
        { key: 'rutinas', label: 'Rutinas', icon: 'ClipboardList', count: pendingRutinasCount },
      ],
    },
    {
      label: 'Sistema',
      items: [
        { key: 'settings', label: 'Ajustes', icon: 'Settings', soon: true },
      ],
    },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-mark"><I.Dumbbell size={16} stroke={2.5} /></div>
        <div>
          <div className="brand-word">TR-FIT</div>
          <div className="brand-tag">Admin · ARG</div>
        </div>
      </div>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {groups.map((g) => (
          <div key={g.label} className="nav-section">
            <div className="nav-section-label">{g.label}</div>
            {g.items.map((it) => {
              const Icon = I[it.icon];
              const isActive = it.key === active;
              const isSoon = it.soon;
              return (
                <button
                  key={it.key}
                  className={cn('nav-item', isActive && 'active', isSoon && 'is-soon')}
                  style={isSoon ? { opacity: 0.6, cursor: 'not-allowed' } : null}
                  disabled={isSoon}
                >
                  <Icon size={16} className="nav-icon" />
                  <span>{it.label}</span>
                  {it.count != null && it.count > 0 && (
                    <span className="nav-count">{it.count}</span>
                  )}
                  {isSoon && (
                    <span style={{
                      marginLeft: 'auto', fontSize: 9, fontWeight: 600,
                      letterSpacing: '0.18em', textTransform: 'uppercase',
                      color: 'var(--fg-muted)',
                    }}>
                      pronto
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="avatar">TR</div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            fontSize: 13, fontWeight: 600,
          }}>
            <span>tato</span>
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700,
              padding: '1px 5px', borderRadius: 999,
              background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))',
              letterSpacing: '0.14em', textTransform: 'uppercase',
            }}>
              Super
            </span>
          </div>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            tato@trfit.com
          </div>
        </div>
        <button className="btn-ghost" style={{
          width: 26, height: 26, display: 'grid', placeItems: 'center',
          borderRadius: 'var(--radius-md)', color: 'var(--fg-muted)',
        }}>
          <I.LogOut size={14} />
        </button>
      </div>
    </aside>
  );
}

function Topbar({ onOpenShortcuts, onOpenSearch }) {
  return (
    <div className="topbar">
      <div className="crumb">
        <span>Gestión</span>
        <span className="sep">/</span>
        <span className="current">Rutinas</span>
        <span className="sep">·</span>
        <span style={{ color: 'var(--fg-muted)' }}>Pendientes de aprobación</span>
      </div>
      <div className="search" onClick={onOpenSearch} style={{ cursor: 'text' }}>
        <I.Search size={14} className="input-icon" />
        <span>Buscar atletas, rutinas, alertas…</span>
        <kbd>⌘ K</kbd>
      </div>
      <button className="icon-btn" onClick={onOpenShortcuts} title="Atajos">
        <I.Keyboard size={16} />
      </button>
      <button className="icon-btn" title="Notificaciones">
        <I.Bell size={16} />
      </button>
    </div>
  );
}

Object.assign(window, { Sidebar, Topbar });
