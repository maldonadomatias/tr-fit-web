// Usuarios — lista densa con filtros.

function PageUsers({ navigate }) {
  const I = window.Icons;
  const [status, setStatus] = React.useState("all");
  const [role, setRole] = React.useState("all");
  const [q, setQ] = React.useState("");

  const filtered = window.USERS.filter(u => {
    if (status !== "all" && u.status !== status) return false;
    if (role !== "all" && u.role !== role) return false;
    if (q.trim()) {
      const needle = q.toLowerCase();
      if (!u.email.toLowerCase().includes(needle) &&
          !(u.name && u.name.toLowerCase().includes(needle)) &&
          !u.id.includes(needle)) return false;
    }
    return true;
  });

  const counts = {
    all: window.USERS.length,
    pending: window.USERS.filter(u => u.status === "pending").length,
    approved: window.USERS.filter(u => u.status === "approved").length,
    rejected: window.USERS.filter(u => u.status === "rejected").length,
  };

  return (
    <div>
      <PageHeader
        eyebrow="02 — Gestión"
        title="Usuarios"
        sub={<><span className="num">{filtered.length}</span> de <span className="num">{window.USERS.length}</span> · todos los roles y estados</>}
        actions={<>
          <Btn variant="outline" size="sm" icon={<I.Download size={14} />}>Exportar CSV</Btn>
          <Btn variant="primary" size="sm" icon={<I.Plus size={14} />}>Nuevo usuario</Btn>
        </>}
      />

      {/* Filter bar */}
      <div className="card mb-4" style={{ padding: "12px 14px" }}>
        <div className="flex items-center gap-3" style={{ flexWrap: "wrap" }}>
          <div className="input" style={{ width: 280 }}>
            <I.Search size={14} className="input-icon" />
            <input
              placeholder="Buscar por email, nombre o id…"
              value={q}
              onChange={e => setQ(e.target.value)}
            />
          </div>
          <div style={{ width: 1, height: 22, background: "var(--line)" }} />
          <Seg
            value={status}
            onChange={setStatus}
            options={[
              { key: "all", label: "Todos", count: counts.all },
              { key: "pending", label: "Pendientes", count: counts.pending },
              { key: "approved", label: "Aprobados", count: counts.approved },
              { key: "rejected", label: "Rechazados", count: counts.rejected },
            ]}
          />
          <div style={{ width: 1, height: 22, background: "var(--line)" }} />
          <Seg
            value={role}
            onChange={setRole}
            options={[
              { key: "all", label: "Cualquier rol" },
              { key: "athlete", label: "Atletas" },
              { key: "coach", label: "Coaches" },
              { key: "admin", label: "Admins" },
            ]}
          />
          <button className="btn btn-ghost btn-sm" style={{ marginLeft: "auto" }} onClick={() => { setStatus("all"); setRole("all"); setQ(""); }}>
            Limpiar
          </button>
        </div>
      </div>

      {/* Table */}
      <Card>
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ width: 28 }}></th>
              <th>Usuario</th>
              <th>Rol</th>
              <th>Estado</th>
              <th>Suscripción</th>
              <th>Última sesión</th>
              <th className="col-num">Alta</th>
              <th style={{ width: 60 }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(u => (
              <UserRow key={u.id} u={u} onOpen={() => navigate({ page: "user", userId: u.id })} />
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div style={{ padding: 40 }} className="text-center text-muted text-sm">
            Sin usuarios con esos filtros. <button className="text-fg" style={{ textDecoration: "underline" }} onClick={() => { setStatus("all"); setRole("all"); setQ(""); }}>Limpiar filtros</button>
          </div>
        )}
      </Card>

      <div className="mt-3 flex items-center justify-between">
        <div className="t-meta">
          Mostrando <span className="num">{filtered.length}</span> usuarios
        </div>
        <div className="flex gap-1">
          <Btn variant="outline" size="sm" icon={<I.ChevronLeft size={14} />} disabled>Anterior</Btn>
          <Btn variant="outline" size="sm" disabled>Siguiente <I.ChevronRight size={14} /></Btn>
        </div>
      </div>
    </div>
  );
}

function UserRow({ u, onOpen }) {
  const I = window.Icons;
  return (
    <tr className={u.status === "pending" ? "is-pending" : ""} onClick={onOpen}>
      <td>
        {u.status === "pending" && <span className="dot" style={{ color: "var(--brand-color)" }} />}
      </td>
      <td>
        <div className="avatar-cell">
          <Avatar name={u.name} brand={u.status === "pending"} />
          <div style={{ minWidth: 0 }}>
            <div className="text-sm font-semibold truncate">{u.name}</div>
            <div className="t-meta truncate num">
              {u.email}
              {!u.email_verified && <span style={{ marginLeft: 6, color: "hsl(38 92% 50%)" }}>· sin verificar</span>}
            </div>
          </div>
        </div>
      </td>
      <td><RoleBadge role={u.role} /></td>
      <td><StatusBadge status={u.status} /></td>
      <td>
        {u.subscription_tier ? (
          <div className="flex items-center gap-2">
            <TierBadge tier={u.subscription_tier} />
            <SubStatusBadge status={u.subscription_status} />
          </div>
        ) : (
          <span className="t-meta">—</span>
        )}
      </td>
      <td className="t-meta num">
        {u.last_session_at ? window.fmtMinutes(Math.floor((Date.now() - new Date(u.last_session_at).getTime()) / 60000)) : "nunca"}
      </td>
      <td className="col-num t-meta num">{window.fmtDateShort(u.created_at)}</td>
      <td>
        <div className="row-actions">
          <button className="btn btn-ghost btn-xs" onClick={e => { e.stopPropagation(); }}>
            <I.MoreHorizontal size={14} />
          </button>
        </div>
      </td>
    </tr>
  );
}

Object.assign(window, { PageUsers });
