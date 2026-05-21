// Sidebar + topbar shell.

function Sidebar({ route, navigate }) {
  const I = window.Icons;
  const pendingCount = window.USERS.filter(u => u.status === "pending").length;

  const items = [
    { section: "Panel" },
    { key: "dashboard",    label: "Resumen",       icon: <I.Home size={16} className="nav-icon" /> },
    { key: "pending",      label: "Pendientes",    icon: <I.Clock size={16} className="nav-icon" />, count: pendingCount },
    { key: "activity",     label: "Actividad",     icon: <I.Activity size={16} className="nav-icon" /> },
    { section: "Gestión" },
    { key: "users",        label: "Usuarios",      icon: <I.Users size={16} className="nav-icon" /> },
    { key: "subscriptions",label: "Suscripciones", icon: <I.CreditCard size={16} className="nav-icon" /> },
    { section: "Sistema" },
    { key: "settings",     label: "Ajustes",       icon: <I.Settings size={16} className="nav-icon" />, soon: true },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-mark">
          <I.Dumbbell size={16} stroke={2.5} />
        </div>
        <div>
          <div className="brand-word">FORMA</div>
          <div className="brand-tag">Admin · ARG</div>
        </div>
      </div>

      {items.map((it, i) => {
        if (it.section) {
          return <div key={"s" + i} className="nav-section-label">{it.section}</div>;
        }
        const active = route.page === it.key || (it.key === "users" && route.page === "user");
        return (
          <button
            key={it.key}
            className={cx("nav-item", active && "active")}
            onClick={() => !it.soon && navigate({ page: it.key })}
            disabled={it.soon}
            aria-disabled={it.soon || undefined}
          >
            {it.icon}
            <span>{it.label}</span>
            {it.count > 0 && <span className="nav-count">{it.count}</span>}
            {it.soon && <span className="t-micro" style={{ marginLeft: "auto" }}>pronto</span>}
          </button>
        );
      })}

      <div className="sidebar-footer">
        <div className="avatar">TR</div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="text-sm font-semibold truncate">Tato Robles</div>
          <div className="t-meta truncate">tato@forma.app</div>
        </div>
        <button className="btn btn-ghost" style={{ width: 28, height: 28, padding: 0 }} title="Salir">
          <I.LogOut size={14} />
        </button>
      </div>
    </aside>
  );
}

function Topbar({ route, navigate, theme, setTheme }) {
  const I = window.Icons;
  const labels = {
    dashboard: "Resumen", pending: "Pendientes", users: "Usuarios",
    subscriptions: "Suscripciones", activity: "Actividad", settings: "Ajustes",
  };
  const crumbs = (() => {
    if (route.page === "user") {
      const u = window.USERS.find(x => x.id === route.userId);
      return [
        { label: "Usuarios", to: { page: "users" } },
        { label: u?.email ?? route.userId, current: true },
      ];
    }
    return [{ label: labels[route.page] ?? "Admin", current: true }];
  })();

  return (
    <header className="topbar">
      <div className="crumb">
        {crumbs.map((c, i) => (
          <React.Fragment key={i}>
            {i > 0 && <span className="sep">/</span>}
            {c.current ? (
              <span className="current">{c.label}</span>
            ) : (
              <button onClick={() => navigate(c.to)} className="btn btn-ghost btn-xs" style={{ padding: "0 4px", height: 22 }}>
                {c.label}
              </button>
            )}
          </React.Fragment>
        ))}
      </div>

      <div className="search">
        <I.Search size={14} className="input-icon" />
        <span className="flex-1">Buscar email, id, suscripción…</span>
        <kbd>⌘K</kbd>
      </div>

      <button
        className="icon-btn"
        title={theme === "dark" ? "Modo claro" : "Modo oscuro"}
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      >
        {theme === "dark" ? <I.Sun size={16} /> : <I.Moon size={16} />}
      </button>
      <button className="icon-btn" title="Notificaciones" style={{ position: "relative" }}>
        <I.Bell size={16} />
        <span style={{
          position: "absolute", top: 6, right: 6,
          width: 6, height: 6, borderRadius: 999,
          background: "var(--brand-color)",
        }} />
      </button>
    </header>
  );
}

Object.assign(window, { Sidebar, Topbar });
