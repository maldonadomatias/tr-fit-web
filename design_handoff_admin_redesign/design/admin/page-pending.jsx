// Cola de pendientes — focused queue for users awaiting approval.

function PagePending({ navigate }) {
  const I = window.Icons;
  const pending = window.USERS.filter(u => u.status === "pending");

  return (
    <div>
      <PageHeader
        eyebrow="Acción requerida"
        title="Cola de pendientes"
        sub={<>
          <span className="num">{pending.length}</span> usuarios esperando aprobación · ordenados por antigüedad
        </>}
        actions={<>
          <Btn variant="outline" size="sm" icon={<I.RefreshCw size={14} />}>Actualizar</Btn>
          <Btn variant="primary" size="sm">Aprobar todos los athletes</Btn>
        </>}
      />

      {pending.length === 0 ? (
        <div className="empty">No hay usuarios pendientes.</div>
      ) : (
        <div className="flex flex-col gap-3">
          {pending.map(u => <PendingCard key={u.id} user={u} onOpen={() => navigate({ page: "user", userId: u.id })} />)}
        </div>
      )}

      <div className="mt-6">
        <Card muted>
          <div className="card-pad flex gap-3 items-start">
            <I.Info size={16} className="text-muted" style={{ marginTop: 2 }} />
            <div className="text-sm">
              <div className="font-semibold mb-1">Cómo funciona la aprobación</div>
              <div className="text-muted">
                Los athletes se aprueban en cuanto confirman email. Coaches y admins requieren tu aprobación manual.
                Al rechazar, el usuario recibe un email genérico — no se exponen motivos al usuario final.
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function PendingCard({ user, onOpen }) {
  const I = window.Icons;
  const ageMin = Math.floor((Date.now() - new Date(user.created_at).getTime()) / 60000);
  const isUrgent = ageMin > 60 * 24;

  return (
    <Card>
      <div className="card-pad flex items-center gap-4">
        <Avatar name={user.name} size="lg" brand />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="flex items-center gap-2 mb-1">
            <span className="t-section">{user.name}</span>
            <RoleBadge role={user.role} />
            {!user.email_verified && (
              <Badge variant="warning" dot>Email sin verificar</Badge>
            )}
            {isUrgent && <Badge variant="destructive" dot>{`> 24 h`}</Badge>}
          </div>
          <div className="text-sm text-muted">
            <span className="num">{user.email}</span>
            <span style={{ margin: "0 8px" }}>·</span>
            registrado <span className="num">{window.fmtMinutes(ageMin)}</span>
            <span style={{ margin: "0 8px" }}>·</span>
            id <span className="num">{user.id}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <Btn variant="outline" size="sm" icon={<I.Eye size={14} />} onClick={onOpen}>Ver perfil</Btn>
          <Btn variant="outline" size="sm" icon={<I.X size={14} />}>Rechazar</Btn>
          <Btn variant="brand" size="sm" icon={<I.Check size={14} />}>Aprobar</Btn>
        </div>
      </div>
    </Card>
  );
}

Object.assign(window, { PagePending });
