// FORMA Rutinas — Modals & popovers.
// · RejectModal: tag-based reasons + free text + critical checkbox.
// · ShortcutsModal: keyboard reference (?).
// · EditSlotPopover: combobox + sets/reps/rir + notes.

const I = window.Icons;
const { useState, useEffect, useRef, useMemo } = React;

// ============================================================
// Reject modal
// ============================================================
function RejectModal({ rutina, onClose, onSubmit }) {
  const [selected, setSelected] = useState({});  // { 'Volumen:Mucho': true, ... }
  const [detail, setDetail] = useState('');
  const [critical, setCritical] = useState(false);
  const { REJECT_REASONS } = window.RutinaData;

  const selCount = Object.values(selected).filter(Boolean).length;
  const canSubmit = selCount >= 1;

  function toggle(group, tag) {
    const key = group + ':' + tag;
    setSelected((s) => ({ ...s, [key]: !s[key] }));
  }

  function handleSubmit() {
    if (!canSubmit) return;
    const reasons = Object.entries(selected)
      .filter(([, v]) => v)
      .map(([k]) => k);
    onSubmit({ reasons, detail: detail.trim(), critical });
  }

  // ⌘Enter to confirm
  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        if (canSubmit) handleSubmit();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canSubmit, selected, detail, critical]);

  return (
    <Scrim onClose={onClose}>
      <div className="dialog wide" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-head">
          <Eyebrow tone="brand">REJECT · REGENERAR</Eyebrow>
          <h2 style={{
            margin: '6px 0 0 0', fontSize: 18, fontWeight: 700,
            letterSpacing: '-0.01em',
          }}>
            Rechazar rutina · {rutina.athlete.name}
          </h2>
          <p style={{
            margin: '4px 0 0 0', fontSize: 13, color: 'var(--fg-muted)',
            lineHeight: '20px',
          }}>
            Elegí al menos un motivo. La IA usa los tags + detalle para regenerar.
            El atleta no ve nada mientras se regenera.
          </p>
        </div>

        <div className="dialog-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="tag-grid">
            {REJECT_REASONS.map((g) => (
              <React.Fragment key={g.label}>
                <div className="tag-label">{g.label}</div>
                <div className="tag-chip-row">
                  {g.tags.map((tag) => {
                    const k = g.label + ':' + tag;
                    return (
                      <button
                        key={tag}
                        className={cn('tag-chip', selected[k] && 'is-on')}
                        onClick={() => toggle(g.label, tag)}
                      >
                        {selected[k] && <I.Check size={11} />}
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </React.Fragment>
            ))}
          </div>

          <div>
            <div className="label" style={{ marginBottom: 6 }}>Detalle (opcional)</div>
            <textarea
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder="Ej: cambiá sentadilla profunda por hip thrust, RPE muy alto últimas 3 sesiones."
              rows={3}
              style={{
                width: '100%', fontSize: 13, fontFamily: 'var(--font-sans)',
                padding: 10, borderRadius: 'var(--radius-md)',
                border: '1px solid var(--line)',
                background: 'var(--bg)', color: 'var(--fg)',
                resize: 'vertical', minHeight: 70,
                outline: 'none',
              }}
            />
          </div>

          <div className="check-row" onClick={() => setCritical((v) => !v)}>
            <span className={cn('checkbox', critical && 'is-on')} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)' }}>
                Marcar como crítica
              </div>
              <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>
                Manda al frente de la cola de regeneración con prioridad alta.
              </div>
            </div>
          </div>
        </div>

        <div className="dialog-foot">
          <span style={{
            fontSize: 11, color: 'var(--fg-muted)', marginRight: 'auto',
            fontFamily: 'var(--font-mono)',
          }}>
            {selCount} {selCount === 1 ? 'motivo' : 'motivos'} · <Kbd>⌘</Kbd> <Kbd>↵</Kbd> confirma
          </span>
          <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
          <Btn
            variant="destructive"
            disabled={!canSubmit}
            onClick={handleSubmit}
          >
            Rechazar y regenerar
          </Btn>
        </div>
      </div>
    </Scrim>
  );
}

// ============================================================
// Shortcuts modal
// ============================================================
function ShortcutsModal({ onClose }) {
  const NAV = [
    { keys: ['J'], desc: 'Siguiente rutina del queue' },
    { keys: ['K'], desc: 'Rutina anterior' },
    { keys: ['⌘', 'K'], desc: 'Quick search (focus buscar)' },
    { keys: ['Esc'], desc: 'Cerrar modal / popover activo' },
  ];
  const ACT = [
    { keys: ['A'], desc: 'Aprobar rutina activa' },
    { keys: ['R'], desc: 'Abrir modal reject' },
    { keys: ['E'], desc: 'Editar primer slot (focus combobox)' },
    { keys: ['1'], desc: 'Tab Rutina' },
    { keys: ['2'], desc: 'Tab Contexto' },
    { keys: ['3'], desc: 'Tab Historial' },
    { keys: ['4'], desc: 'Tab Diff' },
  ];
  const CONF = [
    { keys: ['⌘', '↵'], desc: 'Confirmar acción en modal (approve/reject)' },
  ];

  return (
    <Scrim onClose={onClose}>
      <div className="dialog shortcuts" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-head">
          <Eyebrow tone="brand">ATAJOS · REVIEW QUEUE</Eyebrow>
          <h2 style={{
            margin: '6px 0 0 0', fontSize: 18, fontWeight: 700,
            letterSpacing: '-0.01em',
          }}>
            Teclado
          </h2>
        </div>

        <div className="dialog-body">
          <ShortcutGroup label="Navegación" rows={NAV} />
          <ShortcutGroup label="Acciones" rows={ACT} />
          <ShortcutGroup label="Confirmación" rows={CONF} />
        </div>

        <div className="dialog-foot">
          <span style={{
            fontSize: 11, color: 'var(--fg-muted)', marginRight: 'auto',
          }}>
            Los atajos se deshabilitan cuando hay popover/modal abierto, excepto <Kbd>Esc</Kbd> y <Kbd>⌘</Kbd> <Kbd>↵</Kbd>.
          </span>
          <Btn variant="primary" onClick={onClose}>Entendido</Btn>
        </div>
      </div>
    </Scrim>
  );
}

function ShortcutGroup({ label, rows }) {
  return (
    <>
      <div className="shortcut-group-label">{label}</div>
      {rows.map((r, i) => (
        <div key={i} className="shortcut-row">
          <span className="desc">{r.desc}</span>
          <KbdSeq keys={r.keys} />
        </div>
      ))}
    </>
  );
}

// ============================================================
// Edit slot popover
// ============================================================
function EditSlotPopover({ slot, anchor, onClose, onSave }) {
  const [name, setName] = useState(slot.name);
  const [sets, setSets] = useState(slot.sets);
  const [reps, setReps] = useState(slot.reps);
  const [rir, setRir] = useState(slot.rir);
  const [notes, setNotes] = useState('');
  const [comboOpen, setComboOpen] = useState(false);
  const ref = useRef(null);
  const { EXERCISES } = window.RutinaData;

  // Position popover relative to anchor
  const [pos, setPos] = useState({ top: 0, left: 0 });
  useEffect(() => {
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    setPos({
      top: r.bottom + window.scrollY + 8,
      left: Math.max(16, r.right + window.scrollX - 360),
    });
  }, [anchor]);

  // Click outside closes
  useEffect(() => {
    function onDoc(e) {
      if (ref.current && !ref.current.contains(e.target) && !anchor.contains(e.target)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [anchor, onClose]);

  // ESC closes
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const filtered = useMemo(() => {
    const q = name.toLowerCase();
    return EXERCISES.filter((ex) => ex.name.toLowerCase().includes(q)).slice(0, 8);
  }, [name, EXERCISES]);

  function save() {
    onSave({ name, sets: +sets, reps, rir: +rir, notes });
  }

  return (
    <div className="popover" ref={ref} style={{ top: pos.top, left: pos.left, position: 'fixed' }}>
      <div className="popover-arrow" />

      <h4>Editar slot</h4>

      <div className="field">
        <div className="field-label">Ejercicio</div>
        <div className="input" style={{ position: 'relative' }}>
          <I.Search size={12} className="input-icon" />
          <input
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); setComboOpen(true); }}
            onFocus={() => setComboOpen(true)}
            placeholder="Buscar en catálogo…"
            autoFocus
          />
          <I.ChevronDown size={12} className="chev" />
        </div>
        {comboOpen && filtered.length > 0 && (
          <div className="combobox-list">
            {filtered.map((ex) => (
              <div
                key={ex.name}
                className={cn('combobox-item', name === ex.name && 'is-on')}
                onClick={() => { setName(ex.name); setComboOpen(false); }}
              >
                <span>{ex.name}</span>
                <span className="meta">{ex.tag}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="row3">
        <div className="field">
          <div className="field-label">Series</div>
          <div className="input">
            <input
              type="number"
              min={1}
              value={sets}
              onChange={(e) => setSets(e.target.value)}
              style={{ fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}
            />
          </div>
        </div>
        <div className="field">
          <div className="field-label">Reps</div>
          <div className="input">
            <input
              type="text"
              value={reps}
              onChange={(e) => setReps(e.target.value)}
              style={{ fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}
            />
          </div>
        </div>
        <div className="field">
          <div className="field-label">RIR</div>
          <div className="input">
            <input
              type="number"
              min={0}
              max={5}
              value={rir}
              onChange={(e) => setRir(e.target.value)}
              style={{ fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}
            />
          </div>
        </div>
      </div>

      <div className="field">
        <div className="field-label">Notas (opcional)</div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Ej: tempo 3-0-1, ajustar peso si RPE > 8"
          style={{
            width: '100%', fontSize: 12, fontFamily: 'var(--font-sans)',
            padding: 8, borderRadius: 'var(--radius-md)',
            border: '1px solid var(--line)',
            background: 'var(--bg)', color: 'var(--fg)',
            resize: 'vertical', outline: 'none',
          }}
        />
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Btn variant="ghost" size="sm" onClick={onClose}>Cancelar</Btn>
        <Btn variant="primary" size="sm" onClick={save}>Guardar</Btn>
      </div>
    </div>
  );
}

// ============================================================
// Toast (lightweight)
// ============================================================
function Toast({ message, tone = 'info', onDone }) {
  useEffect(() => {
    const t = setTimeout(() => onDone?.(), 2400);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div style={{
      position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
      zIndex: 60,
      background: tone === 'success' ? 'var(--brand-color)' : 'hsl(var(--primary))',
      color: tone === 'success' ? 'var(--brand-fg-color)' : 'hsl(var(--primary-foreground))',
      padding: '10px 16px',
      borderRadius: 'var(--radius-md)',
      boxShadow: 'var(--shadow-floating)',
      fontSize: 13, fontWeight: 500,
      display: 'flex', alignItems: 'center', gap: 10,
      fontFamily: 'var(--font-sans)',
    }}>
      {tone === 'success' && <I.Check size={14} stroke={2.5} />}
      {message}
    </div>
  );
}

// ============================================================
// 409 conflict empty (when active rutina was approved by someone else)
// ============================================================
function EmptyAllDone({ lastApproved }) {
  return (
    <div className="empty-large">
      <div className="icon-wrap">
        <I.CheckCircle size={28} stroke={2} />
      </div>
      <h2>Todo al día</h2>
      <p>Sin rutinas pendientes de revisar.</p>
      {lastApproved && (
        <div className="last-approved">
          Última aprobada · {lastApproved.agoLabel} · {lastApproved.athleteName}
        </div>
      )}
      <div style={{ marginTop: 12 }}>
        <Btn variant="outline" size="sm" leftIcon={<I.History size={13} />}>
          Ver historial
        </Btn>
      </div>
    </div>
  );
}

Object.assign(window, {
  RejectModal, ShortcutsModal, EditSlotPopover, Toast, EmptyAllDone,
});
