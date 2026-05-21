// FORMA Rutinas — Right detail pane.
// Header sticky · 4 tabs (Rutina / Contexto / Historial / Diff)
// · collapsible rationale · action footer sticky.

const I = window.Icons;
const { useState, useEffect } = React;

function DetailPane({ rutina, onApprove, onReject, onSkip, onOpenEdit, modifiedSlots, openSlotEditAt }) {
  const [tab, setTab] = useState('rutina');
  const [rationaleOpen, setRationaleOpen] = useState(true);

  // Reset tab when rutina changes
  useEffect(() => { setTab('rutina'); }, [rutina.id]);

  // Keyboard hooks: 1-4 to switch tabs (handled by global hook in app.jsx, but
  // we listen here too so this component is portable).
  useEffect(() => {
    function onKey(e) {
      if (e.target.matches?.('input, textarea')) return;
      if (e.key === '1') setTab('rutina');
      if (e.key === '2') setTab('contexto');
      if (e.key === '3') setTab('historial');
      if (e.key === '4' && rutina.diff?.length) setTab('diff');
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rutina]);

  const athlete = rutina.athlete;
  const hasDiff = (rutina.diff?.length ?? 0) > 0;

  return (
    <div className="detail-pane">
      <DetailHeader rutina={rutina} athlete={athlete} />

      <div className="detail-tabs">
        <TabBtn n="1" active={tab === 'rutina'} onClick={() => setTab('rutina')}>Rutina</TabBtn>
        <TabBtn n="2" active={tab === 'contexto'} onClick={() => setTab('contexto')}>Contexto</TabBtn>
        <TabBtn n="3" active={tab === 'historial'} onClick={() => setTab('historial')}>Historial</TabBtn>
        <TabBtn n="4" active={tab === 'diff'} onClick={() => setTab('diff')} disabled={!hasDiff}>
          Diff {hasDiff && <span className="tab-num">{rutina.diff.length}</span>}
        </TabBtn>
      </div>

      <div className="detail-body">
        {tab === 'rutina' && (
          <TabRutina
            rutina={rutina}
            onOpenEdit={onOpenEdit}
            modifiedSlots={modifiedSlots}
            openSlotEditAt={openSlotEditAt}
          />
        )}
        {tab === 'contexto' && <TabContexto athlete={athlete} />}
        {tab === 'historial' && <TabHistorial rutina={rutina} />}
        {tab === 'diff' && <TabDiff rutina={rutina} />}

        {/* Rationale is shown under EVERY tab */}
        <RationaleCard
          open={rationaleOpen}
          setOpen={setRationaleOpen}
          rationale={rutina.rationale}
          confidence={rutina.confidence}
        />
      </div>

      <ActionFooter onApprove={onApprove} onReject={onReject} onSkip={onSkip} />
    </div>
  );
}

function TabBtn({ children, active, onClick, n, disabled }) {
  return (
    <button
      className={cn('tab', active && 'active')}
      onClick={onClick}
      disabled={disabled}
      style={disabled ? { opacity: 0.4, cursor: 'not-allowed' } : null}
    >
      <span>{children}</span>
      <span className="tab-num">{n}</span>
    </button>
  );
}

function DetailHeader({ rutina, athlete }) {
  const { ago } = window.RutinaData;
  return (
    <div className="detail-header">
      <Eyebrow tone="brand">
        Rutina · {rutina.id.toUpperCase()}
      </Eyebrow>
      <div className="top-row">
        <MonoAvatar name={athlete.name} size={40} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1>{athlete.name}</h1>
          <div className="athlete-meta">
            {athlete.age}a · {athlete.sex} · {athlete.level} · {athlete.days_per_week}d/sem · {athlete.goal}
          </div>
        </div>
        <ConfidenceBadge value={rutina.confidence} />
      </div>
      <div className="confidence-row">
        <span>Generada hace {ago(rutina.createdAt)}</span>
        <span style={{ color: 'var(--line)' }}>·</span>
        <span>Equipo: {athlete.equipment}</span>
        {athlete.injuries?.length > 0 && (
          <>
            <span style={{ color: 'var(--line)' }}>·</span>
            <span style={{ color: 'hsl(38 92% 38%)' }}>
              <I.AlertTriangle size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: -2 }} />
              {athlete.injuries[0]}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

// ---------- Tab: Rutina ----------
function TabRutina({ rutina, onOpenEdit, modifiedSlots, openSlotEditAt }) {
  // Count modifications including the data-baked ones + admin-applied ones
  const modCount =
    (rutina.routine?.flatMap((d) => d.slots.filter((s) => s.modified)) ?? []).length
    + Object.keys(modifiedSlots ?? {}).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {modCount > 0 && (
        <div>
          <span className="modified-banner">
            <I.Edit size={11} />
            MODIFICADA POR ADMIN · {modCount} {modCount === 1 ? 'cambio' : 'cambios'}
          </span>
        </div>
      )}

      {rutina.routine.map((day) => (
        <div key={day.day} className="day-block">
          <div className="day-eyebrow">
            <span className="num-pill">DÍA {day.day}</span>
            <Eyebrow tone="muted">{day.focus}</Eyebrow>
            <span style={{
              marginLeft: 'auto', fontSize: 11,
              fontFamily: 'var(--font-mono)', color: 'var(--fg-muted)',
            }}>
              {day.slots.length} ejercicios
            </span>
          </div>
          <div className="slot-list">
            {day.slots.map((slot) => (
              <SlotRow
                key={slot.id}
                slot={slot}
                isOpen={openSlotEditAt === slot.id}
                isLocallyModified={!!modifiedSlots?.[slot.id]}
                onEdit={(target) => onOpenEdit(slot.id, target)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function SlotRow({ slot, onEdit, isOpen, isLocallyModified }) {
  const isMod = slot.modified || isLocallyModified;
  return (
    <div className={cn('slot-row', isMod && 'is-modified')}>
      <div>
        <div className="slot-name">{slot.name}</div>
      </div>
      <div className="slot-spec">
        {slot.sets} <span className="sep">×</span> {slot.reps}
        <span className="sep">·</span> RIR {slot.rir}
      </div>
      <button
        className="slot-edit-btn"
        title="Editar slot"
        onClick={(e) => onEdit(e.currentTarget)}
      >
        <I.Edit size={14} />
      </button>
    </div>
  );
}

// ---------- Tab: Contexto ----------
function TabContexto({ athlete }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="card card-pad-lg">
        <div className="detail-section-title">
          <I.Users size={11} /> Perfil del atleta
        </div>
        <dl className="detail-kv">
          <dt>Nivel</dt><dd>{athlete.level}</dd>
          <dt>Objetivo</dt><dd>{athlete.goal}</dd>
          <dt>Edad</dt><dd className="mono">{athlete.age} años</dd>
          <dt>Frecuencia</dt><dd className="mono">{athlete.days_per_week} días / semana</dd>
          <dt>Días</dt><dd className="mono">{athlete.days_specific.join(' · ')}</dd>
          <dt>Equipo</dt><dd>{athlete.equipment}</dd>
          <dt>Lesiones</dt>
          <dd>
            {athlete.injuries.length > 0
              ? athlete.injuries.join(' · ')
              : <span style={{ color: 'var(--fg-muted)' }}>Ninguna reportada</span>}
          </dd>
        </dl>
      </div>

      <div className="card card-pad-lg">
        <div className="detail-section-title">
          <I.Star size={11} /> Preferencias declaradas
        </div>
        {athlete.preferences?.length > 0 ? (
          <ul style={{
            margin: 0, padding: 0, listStyle: 'none',
            display: 'flex', flexDirection: 'column', gap: 8,
          }}>
            {athlete.preferences.map((p, i) => (
              <li key={i} style={{
                display: 'flex', alignItems: 'flex-start', gap: 10,
                fontSize: 13, color: 'var(--fg)',
              }}>
                <I.Dot size={16} className="text-brand" style={{ marginTop: 2, flexShrink: 0 }} />
                {p}
              </li>
            ))}
          </ul>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--fg-muted)' }}>
            Sin preferencias declaradas en el perfil.
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Tab: Historial ----------
function TabHistorial({ rutina }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="card">
        <div className="card-head">
          <div className="detail-section-title" style={{ margin: 0 }}>
            <I.History size={11} /> Últimas rutinas aprobadas
          </div>
        </div>
        {(rutina.prevRoutines ?? []).map((r) => (
          <div key={r.id} className="history-card">
            <div className="hc-date">{r.date}</div>
            <div className="hc-title">{r.label}</div>
            <div className="hc-meta">{r.duration}</div>
            <a href="#">VER →</a>
          </div>
        ))}
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="card-head">
          <div className="detail-section-title" style={{ margin: 0 }}>
            <I.Activity size={11} /> Últimas 10 sesiones registradas
          </div>
          <span className="badge muted" style={{ height: 18, fontSize: 10 }}>
            RPE prom · {avg((rutina.sessions ?? []).map((s) => s.rpe))}
          </span>
        </div>
        <table className="history-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Ejercicio</th>
              <th style={{ textAlign: 'right' }}>Top peso</th>
              <th style={{ textAlign: 'right' }}>RPE</th>
              <th style={{ textAlign: 'right' }}>RIR</th>
            </tr>
          </thead>
          <tbody>
            {(rutina.sessions ?? []).map((s, i) => (
              <tr key={i}>
                <td className="mono" style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{s.date}</td>
                <td>{s.exercise}</td>
                <td className="num">{s.top}</td>
                <td className="num">{s.rpe.toFixed(1)}</td>
                <td className="num">{s.rir.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function avg(arr) {
  if (!arr.length) return '—';
  return (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1);
}

// ---------- Tab: Diff ----------
function TabDiff({ rutina }) {
  const diff = rutina.diff ?? [];
  if (diff.length === 0) {
    return (
      <div className="empty">
        Sin cambios estructurales respecto a la rutina anterior.
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        fontSize: 12, color: 'var(--fg-muted)',
      }}>
        <DiffLegend kind="added" label="Agregado" />
        <DiffLegend kind="removed" label="Removido" />
        <DiffLegend kind="modified" label="Modificado" />
      </div>
      {diff.map((day) => (
        <div key={day.day} className="card" style={{ overflow: 'hidden' }}>
          <div className="card-head">
            <div className="detail-section-title" style={{ margin: 0 }}>
              <span className="num-pill" style={{ marginRight: 6 }}>DÍA {day.day}</span>
              <Eyebrow tone="muted">{day.focus}</Eyebrow>
            </div>
            <span className="badge muted" style={{ height: 18, fontSize: 10 }}>
              {day.changes.length} {day.changes.length === 1 ? 'cambio' : 'cambios'}
            </span>
          </div>
          <div>
            {day.changes.map((c, i) => <DiffRow key={i} change={c} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

function DiffLegend({ kind, label }) {
  const symbol = kind === 'added' ? '+' : kind === 'removed' ? '−' : '↔';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span className={cn('diff-marker', kind)} style={{ width: 16, height: 16, fontSize: 10 }}>
        {symbol}
      </span>
      {label}
    </span>
  );
}

function DiffRow({ change }) {
  const symbol = change.kind === 'added' ? '+' : change.kind === 'removed' ? '−' : '↔';
  return (
    <div className="diff-row">
      <div className={cn('diff-marker', change.kind)}>{symbol}</div>
      <div className="diff-detail">
        <div className={cn('name', change.kind === 'removed' && 'removed-name')}>
          {change.name}
        </div>
        {change.kind === 'modified' ? (
          <>
            <div className="spec">
              <span className="before">{change.before}</span>
              <I.ArrowRight size={11} className="arrow" />
              <span className="after">{change.after}</span>
            </div>
            {change.reason && (
              <div style={{
                marginTop: 6, fontSize: 12, color: 'var(--fg-muted)',
                fontStyle: 'italic',
              }}>
                {change.reason}
              </div>
            )}
          </>
        ) : (
          change.spec && <div className="spec"><span>{change.spec}</span></div>
        )}
      </div>
    </div>
  );
}

// ---------- Rationale card ----------
function RationaleCard({ open, setOpen, rationale, confidence }) {
  if (!rationale) return null;
  return (
    <div className={cn('rationale', open && 'is-open')}>
      <button className="rationale-head" onClick={() => setOpen((v) => !v)}>
        <I.Sparkles size={14} className="text-brand" />
        <span style={{
          fontSize: 11, fontWeight: 600,
          letterSpacing: '0.22em', textTransform: 'uppercase',
          color: 'var(--fg)',
        }}>
          Rationale IA
        </span>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 11,
          color: 'var(--fg-muted)', marginLeft: 8,
        }}>
          confidence · {confidence}%
        </span>
        <I.ChevronDown size={14} className="chev" />
      </button>
      {open && (
        <div className="rationale-body">
          {rationale}
        </div>
      )}
    </div>
  );
}

// ---------- Action footer ----------
function ActionFooter({ onApprove, onReject, onSkip }) {
  return (
    <div className="action-footer">
      <Btn
        variant="outline"
        leftIcon={<I.X size={14} />}
        kbd="R"
        onClick={onReject}
        style={{ color: 'hsl(var(--destructive))', borderColor: 'hsl(var(--destructive) / 0.4)' }}
      >
        Rechazar
      </Btn>

      <Btn
        variant="ghost"
        leftIcon={<I.SkipForward size={13} />}
        kbd="J"
        onClick={onSkip}
      >
        Skip
      </Btn>

      <div className="right-group">
        <Btn
          variant="brand"
          leftIcon={<I.Check size={14} />}
          kbd="A"
          onClick={onApprove}
        >
          Aprobar
        </Btn>
      </div>
    </div>
  );
}

Object.assign(window, { DetailPane });
