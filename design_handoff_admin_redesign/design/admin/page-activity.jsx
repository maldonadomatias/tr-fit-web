// Actividad — logs / bitácora.

function PageActivity({ navigate }) {
  const I = window.Icons;
  const [filter, setFilter] = React.useState("all");

  const types = [
    { key: "all", label: "Todo" },
    { key: "users", label: "Usuarios" },
    { key: "subs", label: "Suscripciones" },
    { key: "auth", label: "Auth" },
  ];

  const matchesFilter = (ev) => {
    if (filter === "all") return true;
    if (filter === "users") return ev.type.startsWith("user_") || ev.type === "role_changed";
    if (filter === "subs") return ev.type.startsWith("subscription_");
    if (filter === "auth") return ev.type === "email_verified" || ev.type === "password_reset";
    return true;
  };

  const events = window.ACTIVITY.filter(matchesFilter);

  // Group by day bucket (just two buckets for the mock)
  const today = events.filter(e => e.time < 60 * 24);
  const yesterday = events.filter(e => e.time >= 60 * 24 && e.time < 60 * 48);
  const earlier = events.filter(e => e.time >= 60 * 48);

  return (
    <div>
      <PageHeader
        eyebrow="04 — Bitácora"
        title="Actividad del sistema"
        sub="Eventos de admin, suscripciones y autenticación · últimos 7 días"
        actions={<>
          <Btn variant="outline" size="sm" icon={<I.Download size={14} />}>Exportar</Btn>
          <Btn variant="outline" size="sm" icon={<I.RefreshCw size={14} />}>Actualizar</Btn>
        </>}
      />

      <div className="card mb-4" style={{ padding: "12px 14px" }}>
        <div className="flex items-center gap-3">
          <Seg value={filter} onChange={setFilter} options={types} />
          <div className="input" style={{ width: 280, marginLeft: "auto" }}>
            <I.Search size={14} className="input-icon" />
            <input placeholder="Buscar por usuario, evento, actor…" />
          </div>
        </div>
      </div>

      {[
        { label: "Hoy", items: today },
        { label: "Ayer", items: yesterday },
        { label: "Esta semana", items: earlier },
      ].map(group => group.items.length > 0 && (
        <div key={group.label} className="mb-5">
          <div className="eyebrow muted mb-3">{group.label}</div>
          <Card>
            <div className="card-body">
              <Timeline items={group.items} />
            </div>
          </Card>
        </div>
      ))}

      {events.length === 0 && <div className="empty">Sin eventos con ese filtro.</div>}
    </div>
  );
}

Object.assign(window, { PageActivity });
