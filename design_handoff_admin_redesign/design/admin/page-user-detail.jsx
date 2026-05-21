// Detalle de usuario — header con identidad + tabs.

function PageUserDetail({ navigate, userId }) {
  const I = window.Icons;
  const user = window.USERS.find(u => u.id === userId) ?? window.USERS[0];
  const [tab, setTab] = React.useState("resumen");
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  return (
    <div>
      {/* Identity header */}
      <div className="flex items-center gap-2 mb-4">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate({ page: "users" })}>
          <I.ChevronLeft size={14} /> Volver a usuarios
        </button>
      </div>

      <div className="card mb-4">
        <div className="card-pad-lg flex items-start gap-5">
          <Avatar name={user.name} size="xl" brand />
          <div style={{ flex: 1, minWidth: 0 }}>
            <Eyebrow variant="brand">Detalle de cuenta</Eyebrow>
            <h1 className="t-title mt-1">{user.name}</h1>
            <div className="t-meta mt-2 flex items-center gap-2" style={{ flexWrap: "wrap" }}>
              <span className="num text-fg">{user.email}</span>
              {user.email_verified ? (
                <span style={{ color: "var(--brand-color)", display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <I.MailCheck size={12} /> verificado {window.fmtDateShort(user.email_verified_at)}
                </span>
              ) : (
                <span style={{ color: "hsl(38 92% 50%)", display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <I.Mail size={12} /> sin verificar
                </span>
              )}
              <span>·</span>
              <span>ID <span className="num">{user.id}</span></span>
              <button className="btn btn-ghost btn-xs" style={{ padding: 2 }} title="Copiar id">
                <I.Copy size={12} />
              </button>
              <span>·</span>
              <span>creado el <span className="num">{window.fmtDate(user.created_at)}</span></span>
            </div>
            <div className="flex gap-2 items-center mt-3" style={{ flexWrap: "wrap" }}>
              <RoleBadge role={user.role} />
              <StatusBadge status={user.status} />
              {user.subscription_tier && (
                <>
                  <TierBadge tier={user.subscription_tier} />
                  <SubStatusBadge status={user.subscription_status} />
                </>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2 items-end">
            {user.status === "pending" ? (
              <div className="flex gap-2">
                <Btn variant="outline" size="sm" icon={<I.X size={14} />}>Rechazar</Btn>
                <Btn variant="brand" size="sm" icon={<I.Check size={14} />}>Aprobar</Btn>
              </div>
            ) : (
              <div className="flex gap-2">
                <Btn variant="outline" size="sm" icon={<I.Mail size={14} />}>Reenviar verificación</Btn>
                <Btn variant="outline" size="sm" icon={<I.RefreshCw size={14} />}>Forzar logout</Btn>
              </div>
            )}
            <div className="t-meta">
              {user.sessions_30d > 0 && <><span className="num text-fg">{user.sessions_30d}</span> sesiones · últimos 30 días</>}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        {[
          { key: "resumen", label: "Resumen" },
          { key: "estado", label: "Estado de la cuenta" },
          { key: "suscripcion", label: "Suscripción" },
          { key: "actividad", label: "Actividad", count: 12 },
          { key: "peligro", label: "Zona peligrosa" },
        ].map(t => (
          <button
            key={t.key}
            className={cx("tab", tab === t.key && "active")}
            onClick={() => setTab(t.key)}
          >
            {t.label}
            {t.count != null && <span className="tab-count num">{t.count}</span>}
          </button>
        ))}
      </div>

      {tab === "resumen" && <ResumenTab user={user} />}
      {tab === "estado" && <EstadoTab user={user} />}
      {tab === "suscripcion" && <SuscripcionTab user={user} />}
      {tab === "actividad" && <ActividadTab user={user} />}
      {tab === "peligro" && <PeligroTab user={user} onAskDelete={() => setConfirmOpen(true)} />}

      <ConfirmDialog
        open={confirmOpen}
        title={`¿Eliminar a ${user.name}?`}
        body={<>
          Acción irreversible. Borra <span className="num">{user.email}</span> y todos sus datos asociados — perfil, sesiones, suscripciones, tokens.
        </>}
        confirmLabel="Eliminar definitivamente"
        onConfirm={() => setConfirmOpen(false)}
        onClose={() => setConfirmOpen(false)}
      />
    </div>
  );
}

function ResumenTab({ user }) {
  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 320px" }}>
      <div className="flex flex-col gap-4">
        <Card>
          <CardHead title="Identidad" eyebrow="Datos del usuario" />
          <div className="card-body">
            <dl className="kv">
              <dt>Nombre</dt><dd>{user.name}</dd>
              <dt>Email</dt><dd className="num">{user.email}</dd>
              <dt>Rol</dt><dd><RoleBadge role={user.role} /></dd>
              <dt>Estado</dt><dd><StatusBadge status={user.status} /></dd>
              <dt>Verificado</dt><dd>
                {user.email_verified ? (
                  <span className="num">{window.fmtDate(user.email_verified_at)}</span>
                ) : (
                  <span className="text-muted">sin verificar</span>
                )}
              </dd>
              <dt>Creado</dt><dd className="num">{window.fmtDate(user.created_at)}</dd>
              <dt>Última sesión</dt><dd className="num">
                {user.last_session_at ? window.fmtDate(user.last_session_at) : "—"}
              </dd>
            </dl>
          </div>
        </Card>

        <Card>
          <CardHead title="Suscripción" eyebrow="Plan actual" />
          <div className="card-body">
            {user.subscription_tier ? (
              <div className="flex items-center gap-4" style={{ flexWrap: "wrap" }}>
                <TierBadge tier={user.subscription_tier} />
                <SubStatusBadge status={user.subscription_status} />
                {user.current_period_end && (
                  <span className="t-meta">
                    Próxima renovación <span className="num text-fg">{window.fmtDate(user.current_period_end)}</span>
                  </span>
                )}
              </div>
            ) : (
              <div className="text-muted text-sm">Este usuario no tiene suscripción activa.</div>
            )}
          </div>
        </Card>
      </div>

      <div className="flex flex-col gap-4">
        <Card muted>
          <div className="card-pad">
            <Eyebrow variant="muted">Engagement 30 d</Eyebrow>
            <div className="flex items-center gap-4 mt-3">
              <Donut value={Math.min(100, (user.sessions_30d / 18) * 100)} size={80} stroke={8}
                label={user.sessions_30d} sub="sesiones" />
              <div className="flex flex-col gap-2">
                <div>
                  <div className="t-meta">Asistencia</div>
                  <div className="num font-semibold">{Math.round((user.sessions_30d / 18) * 100)}%</div>
                </div>
                <div>
                  <div className="t-meta">Racha</div>
                  <div className="num font-semibold">{user.sessions_30d > 0 ? Math.min(18, user.sessions_30d * 2) : 0} días</div>
                </div>
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <div className="card-pad">
            <Eyebrow variant="muted">Soporte</Eyebrow>
            <div className="flex flex-col gap-2 mt-3">
              <button className="btn btn-outline btn-sm w-full" style={{ justifyContent: "flex-start" }}>
                <window.Icons.Mail size={14} /> Reenviar email de verificación
              </button>
              <button className="btn btn-outline btn-sm w-full" style={{ justifyContent: "flex-start" }}>
                <window.Icons.RefreshCw size={14} /> Generar link de reseteo
              </button>
              <button className="btn btn-outline btn-sm w-full" style={{ justifyContent: "flex-start" }}>
                <window.Icons.ExternalLink size={14} /> Abrir como usuario
              </button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function EstadoTab({ user }) {
  const [status, setStatus] = React.useState(user.status);
  const [role, setRole] = React.useState(user.role);
  const [verified, setVerified] = React.useState(user.email_verified);
  return (
    <Card>
      <div className="card-pad-lg flex flex-col gap-6">
        <Field label="Estado de la cuenta">
          <div className="seg" style={{ alignSelf: "flex-start" }}>
            {window.STATUSES.map(s => (
              <button key={s} className={cx(status === s && "on")} onClick={() => setStatus(s)}>
                {s === "approved" ? "Aprobado" : s === "pending" ? "Pendiente" : "Rechazado"}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Rol">
          <div className="seg" style={{ alignSelf: "flex-start" }}>
            {window.ROLES.map(r => (
              <button key={r} className={cx(role === r && "on")} onClick={() => setRole(r)}>
                {r === "athlete" ? "Atleta" : r === "coach" ? "Coach" : "Admin"}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Email verificado">
          <div className="flex items-center gap-3">
            <Badge variant={verified ? "brand" : "outline"} dot>
              {verified ? "Verificado" : "Sin verificar"}
            </Badge>
            <Btn variant="outline" size="sm" onClick={() => setVerified(!verified)}>
              {verified ? "Quitar verificación" : "Forzar verificación"}
            </Btn>
            {verified && user.email_verified_at && (
              <span className="t-meta">desde <span className="num">{window.fmtDate(user.email_verified_at)}</span></span>
            )}
          </div>
        </Field>

        <div className="flex justify-end gap-2" style={{ borderTop: "1px solid var(--line)", paddingTop: 16 }}>
          <Btn variant="outline" size="sm">Descartar cambios</Btn>
          <Btn variant="primary" size="sm">Guardar</Btn>
        </div>
      </div>
    </Card>
  );
}

function SuscripcionTab({ user }) {
  const [tier, setTier] = React.useState(user.subscription_tier ?? "full");
  const [subStatus, setSubStatus] = React.useState(user.subscription_status ?? "authorized");
  const hasSub = !!user.subscription_tier;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="card-pad-lg">
          <Eyebrow variant="muted">Estado actual</Eyebrow>
          {hasSub ? (
            <div className="flex items-center gap-4 mt-3" style={{ flexWrap: "wrap" }}>
              <div>
                <div className="t-meta">Plan</div>
                <div className="mt-1"><TierBadge tier={user.subscription_tier} /></div>
              </div>
              <div style={{ width: 1, height: 36, background: "var(--line)" }} />
              <div>
                <div className="t-meta">Estado</div>
                <div className="mt-1"><SubStatusBadge status={user.subscription_status} /></div>
              </div>
              {user.current_period_end && (
                <>
                  <div style={{ width: 1, height: 36, background: "var(--line)" }} />
                  <div>
                    <div className="t-meta">Próxima renovación</div>
                    <div className="mt-1 num font-semibold">{window.fmtDate(user.current_period_end)}</div>
                  </div>
                </>
              )}
              <div style={{ marginLeft: "auto" }}>
                <Btn variant="outline" size="sm" icon={<window.Icons.ExternalLink size={14} />}>
                  Ver en MercadoPago
                </Btn>
              </div>
            </div>
          ) : (
            <div className="text-muted mt-2">Sin suscripción activa.</div>
          )}
        </div>
      </Card>

      <Card>
        <CardHead title={hasSub ? "Editar suscripción" : "Crear suscripción manual"} />
        <div className="card-body flex flex-col gap-5">
          <Field label="Plan" hint="El cambio se aplica al próximo período de cobro.">
            <div className="grid grid-cols-3 gap-2" style={{ maxWidth: 540 }}>
              {window.TIERS.map(t => (
                <button
                  key={t}
                  className="card"
                  onClick={() => setTier(t)}
                  style={{
                    textAlign: "left",
                    padding: 14,
                    borderColor: tier === t ? "var(--brand-color)" : "var(--line)",
                    background: tier === t ? "hsl(var(--brand) / 0.06)" : "var(--bg)",
                    cursor: "pointer",
                  }}
                >
                  <div className={cx("tier", t)} style={{ marginBottom: 6 }}>{t}</div>
                  <div className="num font-semibold text-sm">
                    {t === "basico" ? "$2 500" : t === "full" ? "$4 500" : "$7 800"} <span className="text-muted">/mes</span>
                  </div>
                  <div className="t-meta mt-1">
                    {t === "basico" ? "Plan ver-only" : t === "full" ? "Registro completo" : "Reportes coach"}
                  </div>
                </button>
              ))}
            </div>
          </Field>

          <Field label="Estado de pago">
            <div className="seg" style={{ alignSelf: "flex-start" }}>
              {window.SUB_STATUSES.map(s => (
                <button key={s} className={cx(subStatus === s && "on")} onClick={() => setSubStatus(s)}>
                  {s === "authorized" ? "Activa" : s === "pending" ? "Pendiente" : s === "paused" ? "Pausada" : "Cancelada"}
                </button>
              ))}
            </div>
          </Field>

          <div className="flex justify-end gap-2" style={{ borderTop: "1px solid var(--line)", paddingTop: 16 }}>
            {hasSub && user.subscription_status !== "cancelled" && (
              <Btn variant="destructive" size="sm" style={{ marginRight: "auto" }}>
                Cancelar suscripción
              </Btn>
            )}
            <Btn variant="outline" size="sm">Descartar</Btn>
            <Btn variant="primary" size="sm">{hasSub ? "Guardar cambios" : "Crear suscripción"}</Btn>
          </div>
        </div>
      </Card>
    </div>
  );
}

function ActividadTab({ user }) {
  const userEvents = [
    { id: "u1", type: "user_approved", actor: "tato@forma.app", target: user.email, time: 60 * 5 },
    { id: "u2", type: "subscription_authorized", actor: "MercadoPago", target: user.email, meta: `${user.subscription_tier ?? "full"} · $4 500/mes`, time: 60 * 6 },
    { id: "u3", type: "email_verified", actor: "system", target: user.email, time: 60 * 7 },
    { id: "u4", type: "user_created", actor: "auto-signup", target: user.email, time: 60 * 48 },
  ];
  return (
    <Card>
      <CardHead title="Actividad de esta cuenta" eyebrow="Bitácora" />
      <div className="card-body">
        <Timeline items={userEvents} />
      </div>
    </Card>
  );
}

function PeligroTab({ user, onAskDelete }) {
  const I = window.Icons;
  return (
    <Card style={{ borderColor: "hsl(var(--destructive) / 0.4)" }}>
      <div className="card-pad-lg">
        <div className="flex items-start gap-3 mb-4">
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: "hsl(var(--destructive) / 0.12)",
            color: "hsl(var(--destructive))",
            display: "grid", placeItems: "center",
          }}>
            <I.AlertTriangle size={18} />
          </div>
          <div>
            <Eyebrow variant="muted" style={{ color: "hsl(var(--destructive))" }}>Zona peligrosa</Eyebrow>
            <h3 className="t-section mt-1" style={{ color: "hsl(var(--destructive))" }}>Acciones irreversibles</h3>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <DangerRow
            title="Forzar logout en todos los dispositivos"
            body="Invalida todos los refresh tokens. El usuario va a tener que iniciar sesión de nuevo."
            action="Forzar logout"
          />
          <DangerRow
            title="Resetear contraseña"
            body="Genera un link de un solo uso y se lo envía por email al usuario."
            action="Generar link"
          />
          <DangerRow
            title="Eliminar usuario"
            body="Borra al usuario y todos sus datos asociados — perfil, sesiones, suscripciones, tokens. Esta acción no se puede deshacer."
            action="Eliminar"
            destructive
            onClick={onAskDelete}
          />
        </div>
      </div>
    </Card>
  );
}

function DangerRow({ title, body, action, destructive, onClick }) {
  return (
    <div className="flex items-center gap-4" style={{
      padding: 14,
      border: "1px solid var(--line)",
      borderRadius: "var(--radius-md)",
    }}>
      <div style={{ flex: 1 }}>
        <div className="text-sm font-semibold">{title}</div>
        <div className="t-meta">{body}</div>
      </div>
      <Btn variant={destructive ? "destructive" : "outline"} size="sm" onClick={onClick}>{action}</Btn>
    </div>
  );
}

Object.assign(window, { PageUserDetail });
