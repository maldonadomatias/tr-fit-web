// FORMA Rutinas — App root.
// Wires sidebar + topbar + split-view list + detail + modals.
// Tweaks panel exposed: theme, list-width, density, retry-badge.

const { useState, useEffect, useMemo, useCallback } = React;
const I = window.Icons;

// ---------- Tweak defaults ----------
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "light",
  "listWidth": 340,
  "density": "cozy",
  "dotStyle": "solid",
  "showRetryBadge": true,
  "rationaleOpenByDefault": true
}/*EDITMODE-END*/;

function App() {
  // ----- Tweaks -----
  const [t, setTweak] = window.useTweaks
    ? window.useTweaks(TWEAK_DEFAULTS)
    : [TWEAK_DEFAULTS, () => {}];

  // ----- Theme -----
  useEffect(() => {
    document.documentElement.classList.toggle('dark', t.theme === 'dark');
  }, [t.theme]);

  // ----- Split-view width -----
  useEffect(() => {
    document.documentElement.style.setProperty('--list-width', t.listWidth + 'px');
  }, [t.listWidth]);

  // ----- Active rutina -----
  const { QUEUE, ATHLETES, LAST_APPROVED } = window.RutinaData;
  const [queue, setQueue] = useState(QUEUE);
  const [activeId, setActiveId] = useState(QUEUE[0].id);

  // Hydrate active item with full data (only Ana has full mock data)
  const activeRutina = useMemo(() => {
    const r = queue.find((x) => x.id === activeId);
    if (!r) return null;
    const athlete = ATHLETES[r.athleteId];
    if (r.routine) return { ...r, athlete };
    // Stub other rutinas with Ana's mock data, swapped athlete (so all UI works).
    const sample = QUEUE[0];
    return {
      ...r,
      athlete,
      rationale: r.rationale ?? sample.rationale,
      routine: sample.routine,
      diff: sample.diff,
      prevRoutines: sample.prevRoutines,
      sessions: sample.sessions,
    };
  }, [queue, activeId, ATHLETES]);

  // ----- Modal & popover state -----
  const [showReject, setShowReject] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [editSlot, setEditSlot] = useState(null); // { slotId, anchor }
  const [toast, setToast] = useState(null);
  const [modifiedSlots, setModifiedSlots] = useState({}); // { slotId: { name, sets, reps, rir, notes } }

  // ----- Navigation -----
  const goToNext = useCallback(() => {
    const idx = queue.findIndex((x) => x.id === activeId);
    if (idx < queue.length - 1) {
      setActiveId(queue[idx + 1].id);
      setModifiedSlots({});
    }
  }, [queue, activeId]);

  const goToPrev = useCallback(() => {
    const idx = queue.findIndex((x) => x.id === activeId);
    if (idx > 0) {
      setActiveId(queue[idx - 1].id);
      setModifiedSlots({});
    }
  }, [queue, activeId]);

  function approve() {
    setToast({ message: `Rutina aprobada · pasando a la siguiente`, tone: 'success' });
    setQueue((q) => q.filter((x) => x.id !== activeId));
    setTimeout(() => {
      const next = queue.find((x) => x.id !== activeId);
      if (next) setActiveId(next.id);
      setModifiedSlots({});
    }, 250);
  }

  function rejectSubmit(payload) {
    setShowReject(false);
    setToast({ message: 'Regenerando rutina · ~30s', tone: 'info' });
    setQueue((q) => q.filter((x) => x.id !== activeId));
    setTimeout(() => {
      const next = queue.find((x) => x.id !== activeId);
      if (next) setActiveId(next.id);
      setModifiedSlots({});
    }, 250);
    console.log('Reject payload:', payload);
  }

  function skip() {
    goToNext();
  }

  // ----- Keyboard shortcuts -----
  useEffect(() => {
    function onKey(e) {
      if (e.target.matches?.('input, textarea')) return;
      // Disable most shortcuts while modal/popover open
      const blocked = showReject || showShortcuts || !!editSlot;
      if (blocked) {
        if (e.key === '?') {
          // still allow opening shortcuts? no — already open or about to be.
        }
        return;
      }
      if (e.key === 'a' || e.key === 'A') { e.preventDefault(); approve(); }
      else if (e.key === 'r' || e.key === 'R') { e.preventDefault(); setShowReject(true); }
      else if (e.key === 'j' || e.key === 'J') { e.preventDefault(); goToNext(); }
      else if (e.key === 'k' || e.key === 'K') { e.preventDefault(); goToPrev(); }
      else if (e.key === '?') { e.preventDefault(); setShowShortcuts(true); }
      else if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); document.querySelector('.list-pane input')?.focus(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showReject, showShortcuts, editSlot, goToNext, goToPrev]);

  // ----- Slot edit handlers -----
  function openSlotEdit(slotId, anchor) {
    setEditSlot({ slotId, anchor });
  }
  function saveSlotEdit(changes) {
    setModifiedSlots((m) => ({ ...m, [editSlot.slotId]: changes }));
    setEditSlot(null);
    setToast({ message: 'Slot actualizado · cambios locales', tone: 'success' });
  }

  // ----- Find slot data for popover (lookup in active routine + modifications) -----
  const editSlotData = useMemo(() => {
    if (!editSlot || !activeRutina) return null;
    for (const day of activeRutina.routine ?? []) {
      const s = day.slots.find((x) => x.id === editSlot.slotId);
      if (s) {
        return modifiedSlots[s.id] ? { ...s, ...modifiedSlots[s.id] } : s;
      }
    }
    return null;
  }, [editSlot, activeRutina, modifiedSlots]);

  // ----- Render -----
  const isEmpty = queue.length === 0;

  return (
    <div className="shell" style={{ gridTemplateColumns: '232px 1fr' }}>
      <Sidebar active="rutinas" pendingRutinasCount={queue.length} />
      <Topbar
        onOpenShortcuts={() => setShowShortcuts(true)}
        onOpenSearch={() => document.querySelector('.list-pane input')?.focus()}
      />

      <div className="rutinas-split" style={{ gridTemplateColumns: `${t.listWidth}px 1fr` }}>
        <ListPane
          items={queue}
          activeId={activeId}
          onSelect={(id) => { setActiveId(id); setModifiedSlots({}); }}
          density={t.density}
        />
        {isEmpty || !activeRutina ? (
          <EmptyAllDone lastApproved={LAST_APPROVED} />
        ) : (
          <DetailPane
            rutina={activeRutina}
            onApprove={approve}
            onReject={() => setShowReject(true)}
            onSkip={skip}
            onOpenEdit={openSlotEdit}
            modifiedSlots={modifiedSlots}
            openSlotEditAt={editSlot?.slotId}
          />
        )}
      </div>

      {/* Modals */}
      {showReject && activeRutina && (
        <RejectModal
          rutina={activeRutina}
          onClose={() => setShowReject(false)}
          onSubmit={rejectSubmit}
        />
      )}
      {showShortcuts && (
        <ShortcutsModal onClose={() => setShowShortcuts(false)} />
      )}
      {editSlot && editSlotData && (
        <EditSlotPopover
          slot={editSlotData}
          anchor={editSlot.anchor}
          onClose={() => setEditSlot(null)}
          onSave={saveSlotEdit}
        />
      )}

      {/* Toast */}
      {toast && (
        <Toast
          key={toast.message + Math.random()}
          message={toast.message}
          tone={toast.tone}
          onDone={() => setToast(null)}
        />
      )}

      {/* Tweaks */}
      <RutinasTweaks t={t} setTweak={setTweak} />
    </div>
  );
}

// ============================================================
// Tweaks panel — for the Tweaks toggle in the toolbar
// ============================================================
function RutinasTweaks({ t, setTweak }) {
  if (!window.TweaksPanel) return null;
  return (
    <TweaksPanel title="Tweaks">
      <TweakSection title="Tema">
        <TweakRadio
          value={t.theme}
          onChange={(v) => setTweak('theme', v)}
          options={[{ label: 'Claro', value: 'light' }, { label: 'Oscuro', value: 'dark' }]}
        />
      </TweakSection>

      <TweakSection title="Lista">
        <TweakSlider
          label="Ancho"
          value={t.listWidth}
          min={280} max={400} step={20}
          onChange={(v) => setTweak('listWidth', v)}
          suffix="px"
        />
        <TweakRadio
          label="Densidad"
          value={t.density}
          onChange={(v) => setTweak('density', v)}
          options={[
            { label: 'Cómoda', value: 'cozy' },
            { label: 'Densa', value: 'compact' },
          ]}
        />
      </TweakSection>

      <TweakSection title="Detalles">
        <TweakToggle
          label="Mostrar reintentos"
          value={t.showRetryBadge}
          onChange={(v) => setTweak('showRetryBadge', v)}
        />
        <TweakToggle
          label="Rationale abierto"
          value={t.rationaleOpenByDefault}
          onChange={(v) => setTweak('rationaleOpenByDefault', v)}
        />
      </TweakSection>
    </TweaksPanel>
  );
}

// Boot
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
