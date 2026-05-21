// Suscripciones — vista de suscripciones como entidad propia.

function PageSubscriptions({ navigate }) {
  const I = window.Icons;
  const [tier, setTier] = React.useState("all");
  const [status, setStatus] = React.useState("all");

  const subs = window.USERS.filter(u => u.subscription_tier);
  const filtered = subs.filter(u => {
    if (tier !== "all" && u.subscription_tier !== tier) return false;
    if (status !== "all" && u.subscription_status !== status) return false;
    return true;
  });

  // Stats
  const totalMRR = subs
    .filter(s => s.subscription_status === "authorized")
    .reduce((acc, s) => {
      const price = s.subscription_tier === "basico" ? 2500
        : s.subscription_tier === "full" ? 4500 : 7800;
      return acc + price;
    }, 0);

  const tierStats = ["premium", "full", "basico"].map(t => ({
    tier: t,
    count: subs.filter(s => s.subscription_tier === t && s.subscription_status === "authorized").length,
    total: subs.filter(s => s.subscription_tier === t).length,
  }));

  return (
    <div>
      <PageHeader
        eyebrow="03 — Suscripciones"
        title="Suscripciones"
        sub={<>
          <span className="num">{subs.filter(s => s.subscription_status === "authorized").length}</span> activas ·
          MRR estimado <span className="num text-fg">{window.fmtARS(totalMRR)}</span> ·
          churn <span className="num">{window.KPI.churnPct}%</span>
        </>}
        actions={<Btn variant="outline" size="sm" icon={<I.ExternalLink size={14} />}>Abrir en MercadoPago</Btn>}
      />

      {/* Tier breakdown cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {tierStats.map(t => (
          <Card key={t.tier}>
            <div className="card-pad">
              <div className="flex items-start justify-between mb-3">
                <TierBadge tier={t.tier} />
                <span className="t-meta num">
                  {t.tier === "basico" ? "$2 500" : t.tier === "full" ? "$4 500" : "$7 800"}/mes
                </span>
              </div>
              <div className="kpi-value num">{t.count}</div>
              <div className="t-meta">
                <span className="num">{t.total - t.count}</span> pausadas o canceladas · contribución{" "}
                <span className="num text-fg">{window.fmtARS(t.count * (t.tier === "basico" ? 2500 : t.tier === "full" ? 4500 : 7800))}</span>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="card mb-4" style={{ padding: "12px 14px" }}>
        <div className="flex items-center gap-3">
          <Seg
            value={tier}
            onChange={setTier}
            options={[
              { key: "all", label: "Todos los planes" },
              { key: "premium", label: "Premium" },
              { key: "full", label: "Full" },
              { key: "basico", label: "Básico" },
            ]}
          />
          <div style={{ width: 1, height: 22, background: "var(--line)" }} />
          <Seg
            value={status}
            onChange={setStatus}
            options={[
              { key: "all", label: "Cualquier estado" },
              { key: "authorized", label: "Activas" },
              { key: "paused", label: "Pausadas" },
              { key: "cancelled", label: "Canceladas" },
            ]}
          />
          <div style={{ marginLeft: "auto" }} className="t-meta">
            <span className="num">{filtered.length}</span> resultados
          </div>
        </div>
      </div>

      {/* Table */}
      <Card>
        <table className="tbl">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Plan</th>
              <th>Estado</th>
              <th>Próxima renovación</th>
              <th className="col-num">Precio</th>
              <th style={{ width: 30 }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(u => {
              const price = u.subscription_tier === "basico" ? 2500
                : u.subscription_tier === "full" ? 4500 : 7800;
              return (
                <tr key={u.id} onClick={() => navigate({ page: "user", userId: u.id })}>
                  <td>
                    <div className="avatar-cell">
                      <Avatar name={u.name} />
                      <div style={{ minWidth: 0 }}>
                        <div className="text-sm font-semibold truncate">{u.name}</div>
                        <div className="t-meta truncate num">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td><TierBadge tier={u.subscription_tier} /></td>
                  <td><SubStatusBadge status={u.subscription_status} /></td>
                  <td className="t-meta num">
                    {u.current_period_end ? window.fmtDateShort(u.current_period_end) : "—"}
                  </td>
                  <td className="col-num num font-semibold">{window.fmtARS(price)}</td>
                  <td className="text-muted"><window.Icons.ChevronRight size={14} className="chev" /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

Object.assign(window, { PageSubscriptions });
