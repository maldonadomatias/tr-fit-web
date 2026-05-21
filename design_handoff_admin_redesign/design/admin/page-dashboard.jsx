// Dashboard / Resumen — KPI cards + pending queue snapshot + recent activity.

function PageDashboard({ navigate }) {
  const I = window.Icons;
  const K = window.KPI;
  const pending = window.USERS.filter(u => u.status === "pending");
  const recent = window.ACTIVITY.slice(0, 6);

  return (
    <div>
      <PageHeader
        eyebrow="01 — Panel"
        title="Hola Tato, esto es lo que está pasando"
        sub={<span>Resumen del último mes · actualizado <span className="num">hace 4 min</span></span>}
        actions={<>
          <Btn variant="outline" size="sm" icon={<I.Download size={14} />}>Exportar</Btn>
          <Btn variant="primary" size="sm" icon={<I.Plus size={14} />}>Nuevo usuario</Btn>
        </>}
      />

      {/* KPI row */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <KpiCard
          eyebrow="Altas 30 d"
          icon={<I.UserPlus size={12} />}
          value={K.signupsMonth}
          delta={K.signupsDelta}
          deltaSuffix="%"
          spark={K.signupsTrend}
        />
        <KpiCard
          eyebrow="Pendientes"
          icon={<I.Clock size={12} />}
          value={K.pendingCount}
          sub={<button className="t-meta" style={{ textDecoration: "underline" }} onClick={() => navigate({ page: "pending" })}>revisar cola →</button>}
          highlight
        />
        <KpiCard
          eyebrow="Suscripciones activas"
          icon={<I.CheckCircle size={12} />}
          value={K.activeSubs}
          delta={K.activeSubsDelta}
          sub={<>de <span className="num">{window.USERS.filter(u => u.role === "athlete").length}</span> atletas</>}
        />
        <KpiCard
          eyebrow="MRR estimado"
          icon={<I.TrendingUp size={12} />}
          value={window.fmtARS(K.mrr)}
          mono
          delta={K.mrrDelta}
          deltaSuffix="%"
          spark={K.mrrTrend}
        />
      </div>

      {/* secondary row */}
      <div className="grid gap-4 mb-6" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
        <Card>
          <div className="card-pad flex items-center gap-4">
            <Donut value={K.verifiedPct} size={96} stroke={9}
              label={`${K.verifiedPct}%`} sub="verificado" />
            <div>
              <Eyebrow variant="muted">Email verificado</Eyebrow>
              <div className="t-section mt-2">{Math.round(window.USERS.length * K.verifiedPct / 100)} de {window.USERS.length}</div>
              <div className="t-meta mt-1">
                {window.USERS.filter(u => !u.email_verified).length} sin verificar — el flujo nuevo de magic-link debería bajarlo a cero.
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <div className="card-pad">
            <div className="flex items-center justify-between mb-3">
              <div>
                <Eyebrow variant="muted">Altas por día</Eyebrow>
                <div className="t-section mt-1">Últimas 4 semanas</div>
              </div>
              <span className="num text-muted text-xs">total <span className="text-fg font-semibold">{K.signupsMonth}</span></span>
            </div>
            <div className="bar-chart">
              {K.signupsTrend.map((v, i) => {
                const max = Math.max(...K.signupsTrend);
                const h = (v / max) * 100;
                const isLast = i >= K.signupsTrend.length - 3;
                return (
                  <div key={i}
                    className={cx("bar", isLast ? "brand" : "dim")}
                    style={{ height: h + "%" }}
                    title={`Día ${i + 1}: ${v}`} />
                );
              })}
            </div>
          </div>
        </Card>

        <Card>
          <div className="card-pad">
            <Eyebrow variant="muted">Distribución por plan</Eyebrow>
            <div className="t-section mt-1 mb-3">Suscripciones activas</div>
            <TierBars />
            <div className="mt-3 flex items-center justify-between">
              <span className="t-meta">
                <span className="num">{K.churnPct}%</span> churn ·
                <span className={cx("num", K.churnDelta < 0 ? "text-brand" : "text-destructive")}> {K.churnDelta > 0 ? "+" : ""}{K.churnDelta}pp</span>
              </span>
              <button className="btn btn-ghost btn-xs" onClick={() => navigate({ page: "subscriptions" })}>
                Detalle <I.ChevronRight size={12} />
              </button>
            </div>
          </div>
        </Card>
      </div>

      {/* Pending queue snapshot + activity */}
      <div className="split-grid">
        <Card>
          <div className="card-head">
            <div>
              <Eyebrow variant="brand">Acción requerida</Eyebrow>
              <h3 className="t-section mt-1">Cola de pendientes</h3>
            </div>
            <Btn variant="outline" size="sm" onClick={() => navigate({ page: "pending" })}>
              Ver los {pending.length}
              <I.ChevronRight size={12} />
            </Btn>
          </div>
          <div>
            {pending.slice(0, 4).map(u => (
              <PendingRow key={u.id} user={u} onOpen={() => navigate({ page: "user", userId: u.id })} />
            ))}
          </div>
        </Card>

        <Card>
          <div className="card-head">
            <div>
              <Eyebrow variant="muted">Bitácora</Eyebrow>
              <h3 className="t-section mt-1">Actividad reciente</h3>
            </div>
            <button className="btn btn-ghost btn-xs" onClick={() => navigate({ page: "activity" })}>
              Todo <I.ChevronRight size={12} />
            </button>
          </div>
          <div className="card-body">
            <Timeline items={recent} />
          </div>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({ eyebrow, icon, value, delta, deltaSuffix = "", sub, spark, mono = true, highlight = false }) {
  const I = window.Icons;
  return (
    <div className="kpi" style={highlight ? { borderColor: "hsl(var(--brand) / 0.4)", background: "hsl(var(--brand) / 0.04)" } : null}>
      <div className="eyebrow muted">{icon}{eyebrow}</div>
      <div className={cx("kpi-value", !mono && "font-sans")}>{value}</div>
      <div className="flex items-center gap-2">
        {delta != null && (
          <span className={cx("kpi-delta", delta >= 0 ? "up" : "down")}>
            {delta >= 0 ? <I.ArrowUpRight size={12} /> : <I.ArrowDownRight size={12} />}
            {delta >= 0 ? "+" : ""}{delta}{deltaSuffix}
          </span>
        )}
        {sub && <span className="kpi-sub">{sub}</span>}
      </div>
      {spark && (
        <div className="kpi-spark">
          <Sparkline data={spark} width={140} height={50} />
        </div>
      )}
    </div>
  );
}

function PendingRow({ user, onOpen }) {
  const I = window.Icons;
  const ageMin = Math.floor((Date.now() - new Date(user.created_at).getTime()) / 60000);
  return (
    <div className="card-body" style={{ borderTop: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 12 }}>
      <Avatar name={user.name} brand />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold truncate">{user.name}</span>
          <RoleBadge role={user.role} />
        </div>
        <div className="t-meta truncate">{user.email} · esperando <span className="num">{window.fmtMinutes(ageMin)}</span></div>
      </div>
      <div className="flex gap-1">
        <Btn variant="outline" size="xs" icon={<I.X size={12} />}>Rechazar</Btn>
        <Btn variant="brand" size="xs" icon={<I.Check size={12} />}>Aprobar</Btn>
        <button className="btn btn-ghost btn-xs" onClick={onOpen} title="Abrir detalle">
          <I.ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

function Timeline({ items }) {
  return (
    <div className="timeline">
      {items.map(ev => (
        <div key={ev.id} className={cx("timeline-item", ev.severity)}>
          <div>
            <div className="ti-title">{window.ACTIVITY_LABELS[ev.type]}</div>
            <div className="ti-sub">
              <span className="num">{ev.target}</span>
              {ev.meta && <> · {ev.meta}</>}
            </div>
          </div>
          <div className="ti-time">{window.fmtMinutes(ev.time)}</div>
        </div>
      ))}
    </div>
  );
}

function TierBars() {
  const subs = window.USERS.filter(u => u.subscription_status === "authorized");
  const breakdown = ["premium", "full", "basico"].map(t => ({
    tier: t,
    count: subs.filter(s => s.subscription_tier === t).length,
  }));
  const max = Math.max(...breakdown.map(b => b.count));
  return (
    <div className="flex flex-col gap-2">
      {breakdown.map(b => (
        <div key={b.tier} className="flex items-center gap-3">
          <div style={{ width: 70 }}>
            <TierBadge tier={b.tier} />
          </div>
          <div style={{ flex: 1, height: 8, background: "hsl(var(--muted))", borderRadius: 4, overflow: "hidden" }}>
            <div style={{
              width: (b.count / max) * 100 + "%",
              height: "100%",
              background: b.tier === "premium" ? "var(--brand-color)" : "hsl(var(--primary))",
              opacity: b.tier === "basico" ? 0.5 : 1,
            }} />
          </div>
          <div className="num text-sm" style={{ width: 30, textAlign: "right" }}>{b.count}</div>
        </div>
      ))}
    </div>
  );
}

Object.assign(window, { PageDashboard, KpiCard, PendingRow, Timeline });
