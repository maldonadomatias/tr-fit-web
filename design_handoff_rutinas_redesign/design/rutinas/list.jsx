// FORMA Rutinas — Left list pane (340px).
// Search + status/confidence filters + sort, then scrollable rows.

const I = window.Icons;
const { useState, useMemo } = React;

function ListPane({ items, activeId, onSelect, density = 'cozy' }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');    // all | pending | retry
  const [conf, setConf] = useState('all');        // all | high | med | low
  const [order, setOrder] = useState('age');      // age | conf | name

  const { ATHLETES, ago, confidenceBucket } = window.RutinaData;

  const filtered = useMemo(() => {
    let arr = items.map((it) => ({ ...it, athlete: ATHLETES[it.athleteId] }));
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      arr = arr.filter((it) => it.athlete.name.toLowerCase().includes(q));
    }
    if (status !== 'all') arr = arr.filter((it) => it.state === status);
    if (conf !== 'all') arr = arr.filter((it) => confidenceBucket(it.confidence) === conf);
    if (order === 'age') arr.sort((a, b) => a.createdAt - b.createdAt);
    if (order === 'conf') arr.sort((a, b) => a.confidence - b.confidence);
    if (order === 'name') arr.sort((a, b) => a.athlete.name.localeCompare(b.athlete.name));
    return arr;
  }, [items, query, status, conf, order, ATHLETES, confidenceBucket]);

  const total = items.length;
  const todayCount = items.filter((it) => Date.now() - it.createdAt < 24 * 60 * 60 * 1000).length;

  function clearFilters() {
    setQuery('');
    setStatus('all');
    setConf('all');
    setOrder('age');
  }

  return (
    <div className="list-pane">
      <ListFilters
        query={query} setQuery={setQuery}
        status={status} setStatus={setStatus}
        conf={conf} setConf={setConf}
        order={order} setOrder={setOrder}
      />

      <div className={cn('list-rows', density === 'compact' && 'compact')}>
        {filtered.length === 0 && (
          <div className="empty-filter">
            <span>Sin resultados para los filtros activos.</span>
            <button className="btn btn-ghost btn-sm" onClick={clearFilters}>Limpiar</button>
          </div>
        )}
        {filtered.map((it) => (
          <ListRow
            key={it.id}
            rutina={it}
            isActive={it.id === activeId}
            onClick={() => onSelect(it.id)}
          />
        ))}
      </div>

      <div className="list-footer">
        <span><b style={{ color: 'var(--fg)' }}>{total}</b> pending</span>
        <span className="sep">·</span>
        <span>{todayCount} hoy</span>
        <span style={{
          marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4,
          fontSize: 10, color: 'var(--fg-muted)',
        }}>
          <I.Clock size={10} /> avg 2m 14s
        </span>
      </div>
    </div>
  );
}

function ListFilters({ query, setQuery, status, setStatus, conf, setConf, order, setOrder }) {
  return (
    <div className="list-filters">
      <div className="input">
        <I.Search size={14} className="input-icon" />
        <input
          type="text"
          placeholder="Buscar atleta…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button onClick={() => setQuery('')} style={{ color: 'var(--fg-muted)' }}>
            <I.X size={12} />
          </button>
        )}
      </div>

      <FilterDropdown label="Estado" value={status} setValue={setStatus} options={[
        { value: 'all', label: 'Todos' },
        { value: 'pending', label: 'Pending' },
        { value: 'retry', label: 'Reintento' },
      ]} />

      <FilterDropdown label="Confidence" value={conf} setValue={setConf} options={[
        { value: 'all', label: 'Todas' },
        { value: 'high', label: '≥ 85 · Alta' },
        { value: 'med', label: '70-85 · Media' },
        { value: 'low', label: '< 70 · Baja' },
      ]} />

      <FilterDropdown label="Orden" value={order} setValue={setOrder} options={[
        { value: 'age', label: 'Antigüedad' },
        { value: 'conf', label: 'Confidence · asc' },
        { value: 'name', label: 'A — Z' },
      ]} />
    </div>
  );
}

function FilterDropdown({ label, value, setValue, options }) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value)?.label ?? '—';
  return (
    <div className="list-filter-row" style={{ position: 'relative' }}>
      <div className="label">{label}</div>
      <button className="select" onClick={() => setOpen((v) => !v)}>
        <span>{current}</span>
        <I.ChevronDown size={12} className="chev" />
      </button>
      {open && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 10 }}
            onClick={() => setOpen(false)}
          />
          <div style={{
            position: 'absolute', top: '100%', right: 0, marginTop: 4,
            background: 'var(--bg)', border: '1px solid var(--line)',
            borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-floating)',
            padding: 4, zIndex: 11, minWidth: 180,
          }}>
            {options.map((o) => (
              <button
                key={o.value}
                onClick={() => { setValue(o.value); setOpen(false); }}
                style={{
                  width: '100%', textAlign: 'left',
                  padding: '7px 10px', fontSize: 12,
                  borderRadius: 'var(--radius-sm)',
                  background: value === o.value ? 'hsl(var(--muted))' : 'transparent',
                  color: 'var(--fg)',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}
                onMouseEnter={(e) => { if (value !== o.value) e.currentTarget.style.background = 'hsl(var(--muted) / 0.5)'; }}
                onMouseLeave={(e) => { if (value !== o.value) e.currentTarget.style.background = 'transparent'; }}
              >
                {value === o.value && <I.Check size={12} className="text-brand" />}
                <span style={{ marginLeft: value === o.value ? 0 : 20 }}>{o.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ListRow({ rutina, isActive, onClick }) {
  const { ago } = window.RutinaData;
  const isRetry = rutina.state === 'retry';
  const isCritical = (rutina.retries ?? 0) >= 3;
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (isActive && ref.current) {
      const el = ref.current;
      const parent = el.parentElement;
      if (!parent) return;
      const er = el.getBoundingClientRect();
      const pr = parent.getBoundingClientRect();
      if (er.top < pr.top) {
        parent.scrollTop += er.top - pr.top - 8;
      } else if (er.bottom > pr.bottom) {
        parent.scrollTop += er.bottom - pr.bottom + 8;
      }
    }
  }, [isActive]);
  return (
    <div
      ref={ref}
      className={cn('list-row', isActive && 'is-active')}
      onClick={onClick}
      tabIndex={0}
    >
      <StatusDot state={isCritical ? 'critical' : rutina.state} isActive={isActive} />
      <div style={{ minWidth: 0 }}>
        <div className="row-name truncate">{rutina.athlete.name}</div>
        <div className="row-meta">
          hace {ago(rutina.createdAt)} · {rutina.confidence}%
          {isRetry && (
            <>
              <span style={{ color: 'var(--line)', margin: '0 4px' }}>·</span>
              <span style={{ color: 'hsl(38 92% 38%)' }}>Reintento {rutina.retries}/3</span>
            </>
          )}
          {isCritical && (
            <>
              <span style={{ color: 'var(--line)', margin: '0 4px' }}>·</span>
              <span style={{ color: 'hsl(var(--destructive))' }}>Manual</span>
            </>
          )}
        </div>
      </div>
      {isActive ? (
        <span className="badge brand" style={{ height: 18, fontSize: 10 }}>Activa</span>
      ) : (
        <I.ChevronRight size={14} className="chev" />
      )}
    </div>
  );
}

Object.assign(window, { ListPane });
