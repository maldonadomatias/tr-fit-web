# INTERACTIONS

Toda la lógica reactiva, atajos, data fetching, y conflict handling del
screen `/admin/rutinas`. Mapeado al stack de `tr-fit-web/frontend`
(React 19 + TanStack Query + React Router v6).

---

## 1. Atajos de teclado

Implementación: agregar `react-hotkeys-hook` a `frontend/package.json` si
no está. (Si está, reusar.)

```ts
import { useHotkeys } from 'react-hotkeys-hook';

useHotkeys('j', goToNext, { enableOnFormTags: false });
useHotkeys('k', goToPrev, { enableOnFormTags: false });
useHotkeys('a', approve, { enableOnFormTags: false });
useHotkeys('r', () => setShowReject(true), { enableOnFormTags: false });
useHotkeys('e', () => focusFirstSlotEdit(), { enableOnFormTags: false });
useHotkeys('?', () => setShowShortcuts(true));
useHotkeys('1', () => setTab('rutina'));
useHotkeys('2', () => setTab('contexto'));
useHotkeys('3', () => setTab('historial'));
useHotkeys('4', () => setTab('diff'), { enabled: !!rutina?.diff?.length });
useHotkeys('mod+k', () => searchInputRef.current?.focus(), { preventDefault: true });
useHotkeys('mod+enter', confirmActiveModal, { enableOnFormTags: ['input', 'textarea'] });
useHotkeys('esc', closeAnyModal);
```

**Reglas de bloqueo**:
- Cuando `showReject || showShortcuts || editSlotOpen`, deshabilitar
  todos los atajos excepto `Esc` y `mod+enter`. Esto se hace con
  `{ enabled: !modalOpen }` por atajo, o un guard en el handler.
- En inputs/textarea, `enableOnFormTags: false` (default). Excepción:
  `mod+enter` confirma en el modal abierto aunque foco esté en un input.

---

## 2. Navegación del queue

`queue: Rutina[]` mantenido en TanStack Query:

```ts
const { data: queue = [] } = useQuery({
  queryKey: ['rutinas', 'pending', filters],
  queryFn: () => api.get('/rutinas/pending', { params: filters }),
});
```

Estado activo:

```ts
const { id: activeIdParam } = useParams();
const navigate = useNavigate();
const activeId = activeIdParam ?? queue[0]?.id;

function setActiveId(id: string) {
  navigate(`/admin/rutinas/${id}${location.search}`, { replace: false });
}

function goToNext() {
  const i = queue.findIndex((x) => x.id === activeId);
  if (i < queue.length - 1) setActiveId(queue[i + 1].id);
}
function goToPrev() {
  const i = queue.findIndex((x) => x.id === activeId);
  if (i > 0) setActiveId(queue[i - 1].id);
}
```

**Reset al cambiar de rutina activa**:
- Modified slots locales se descartan (`setModifiedSlots({})`).
- Tab vuelve a `rutina`.
- Rationale abierto/cerrado **persiste** (UX preference por sesión).

---

## 3. Approve

```ts
async function approve() {
  if (!activeRutina) return;
  try {
    await api.post(`/rutinas/${activeId}/approve`, {
      slot_overrides: Object.entries(modifiedSlots).map(([id, payload]) => ({
        slot_id: id, ...payload,
      })),
    });
    toast.success('Rutina aprobada · pasando a la siguiente');
    queryClient.setQueryData(['rutinas', 'pending', filters], (old) =>
      (old ?? []).filter((x) => x.id !== activeId)
    );
    goToNextOrEmpty();
  } catch (e) {
    if (e.response?.status === 409) {
      // alguien la aprobó / rechazó mientras tanto
      toast.info('Ya fue aprobada por otro admin · pasando a la siguiente');
      queryClient.invalidateQueries({ queryKey: ['rutinas', 'pending'] });
      goToNextOrEmpty();
    } else {
      toast.error('No se pudo aprobar · intentá de nuevo');
    }
  }
}
```

`goToNextOrEmpty()` = `goToNext()` si hay siguiente; si no, `navigate('/admin/rutinas')`
(URL sin `:id`) y mostrar `<EmptyAllDone />`.

---

## 4. Reject

Payload extendido (extender el endpoint actual si no soporta):

```ts
type RejectPayload = {
  reject_reasons: string[];      // ["Volumen:Mucho", "Lesión:Riesgo articular"]
  detail?: string;               // texto libre opcional
  critical: boolean;
};

async function rejectSubmit(payload: RejectPayload) {
  setShowReject(false);
  try {
    await api.post(`/rutinas/${activeId}/reject`, payload);
    toast.info('Regenerando rutina · ~30s');
    queryClient.setQueryData(['rutinas', 'pending', filters], (old) =>
      (old ?? []).filter((x) => x.id !== activeId)
    );
    goToNextOrEmpty();
  } catch {
    toast.error('No se pudo rechazar');
  }
}
```

**Backend nuevo**: el handler de reject pasa `reject_reasons[]` + `detail`
+ `critical` al próximo prompt de IA. Si la regen vuelve a generar algo
malo, sube `retries` en la nueva rutina (`retries + 1`).

**Retry tracking**:
- La rutina regenerada hereda `retries = parent.retries + 1`.
- Si `retries >= 3` el badge en la lista pasa a `Manual` (destructive) y
  requiere intervención offline (slack / mail al coach).

---

## 5. Skip

```ts
function skip() {
  goToNext();
  // No backend call. Skip es puramente UI: pasa la rutina al final del
  // queue local hasta que el usuario refresque o recargue la query.
}
```

Opcional: marcar la rutina como `skipped_at` en backend para que no
vuelva a estar #1 del queue. Pero según el spec, skip no toca backend.

---

## 6. Edit slot popover

Estado local en `<DetailPane>`:

```ts
type ModifiedSlot = {
  name: string;
  sets: number;
  reps: string;
  rir: number;
  notes?: string;
};
const [modifiedSlots, setModifiedSlots] = useState<Record<string, ModifiedSlot>>({});

function saveSlotEdit(slotId: string, payload: ModifiedSlot) {
  setModifiedSlots((m) => ({ ...m, [slotId]: payload }));
  setEditSlot(null);
  toast.success('Slot actualizado · cambios locales');
}
```

**Reglas**:
- `setModifiedSlots` no llama al backend.
- En `approve()` se envían los overrides como `slot_overrides[]`.
- Si el usuario cambia de rutina activa, `modifiedSlots` se descarta
  silenciosamente (sin warn de "pérdida de cambios" para no fricción).
- Si quisieras agregar warn, el patrón es `confirm()` simple — no es
  prioridad.

**Combobox ejercicios** (endpoint que probablemente no existe):

```ts
const { data: exercises = [] } = useQuery({
  queryKey: ['exercises', searchQ],
  queryFn: () => api.get('/exercises', { params: { q: searchQ } }),
  enabled: comboboxOpen,
  staleTime: 5 * 60 * 1000,
});
```

**Fallback recomendado**: si `/api/exercises` no existe, crear
`lib/exercisesCatalog.ts` con el array de 30 ejercicios de `data.jsx`
(o más) y filtrar in-memory. Abrir issue para endpoint real más tarde.

---

## 7. Filtros + query params

URL como source of truth de filtros + orden:

```
/admin/rutinas?status=pending&conf=high&order=age&q=ana
```

Implementación:

```ts
const [searchParams, setSearchParams] = useSearchParams();
const filters = {
  status: searchParams.get('status') ?? 'all',
  conf:   searchParams.get('conf') ?? 'all',
  order:  searchParams.get('order') ?? 'age',
  q:      searchParams.get('q') ?? '',
};
function setFilter(key, value) {
  setSearchParams((p) => {
    if (!value || value === 'all') p.delete(key);
    else p.set(key, value);
    return p;
  });
}
```

Ventajas: refresh mantiene contexto, compartir vista filtrada al equipo,
back/forward del browser funciona.

Search query con debounce 250ms (`useDebounce` o `lodash.debounce`).

---

## 8. Deeplink + auto-select

- `/admin/rutinas` sin `:id` → auto-select primera del queue filtrada:
  `useEffect(() => { if (!activeIdParam && queue[0]) setActiveId(queue[0].id, {replace:true}); }, [queue]);`
- `/admin/rutinas/:id` con id no presente en queue:
  - Si está aprobada o rechazada hace poco → toast `Esta rutina ya fue
    procesada` y redirect a `/admin/rutinas`.
  - Si no existe → 404 inline.
- Approve/Reject/Skip → push `/admin/rutinas/<next-id>` con
  `navigate(url)` (no replace; permite back/forward).

---

## 9. Loading / Error / Empty states

| Estado | Componente | Trigger |
|---|---|---|
| Lista loading | `<ListSkeleton count={6} />` | `isLoading` del query queue |
| Lista empty | `<EmptyAllDone />` en pane derecha | `queue.length === 0` |
| Lista empty filtrada | inline en `.list-rows` | `filtered.length === 0 && queue.length > 0` |
| Detail loading | `<DetailSkeleton />` | `isLoading` del query detail |
| Detail error | `<DetailErrorCard />` con Reintentar | `error` no-409 |
| 409 conflict | toast + auto-skip | `error.response?.status === 409` |

---

## 10. Optimistic UI

- **Approve / Reject**: optimistic remove de la queue local con
  `queryClient.setQueryData`. Si la mutation falla con 409, el item ya
  está fuera del queue local pero la query se invalidará al refetch
  (no vuelve a aparecer porque ya no está pending en backend).
- **Edit slot**: solo estado local, no hay optimistic con backend.

---

## 11. Toasts (Sonner)

Reusar el `<Toaster>` del shell existente. Mensajes:

```ts
toast.success('Rutina aprobada · pasando a la siguiente');
toast.info('Regenerando rutina · ~30s');
toast.info('Ya fue aprobada por otro admin · pasando a la siguiente');
toast.success('Slot actualizado · cambios locales');
toast.error('No se pudo aprobar · intentá de nuevo');
toast.error('No se pudo rechazar');
```

Duración default Sonner (4s). No persistir.

---

## 12. Testing (Vitest)

Cubrir:

| Test | Qué cubre |
|---|---|
| `filterRutinas.spec.ts` | función pura `filterAndSort(items, filters)` |
| `slotOverrides.spec.ts` | reducer de modifiedSlots (set, reset, count, mergeOnApprove) |
| `hotkeys.spec.tsx` | atajos disparan los handlers correctos (mock useApprove/useReject) |
| `conflict-409.spec.tsx` | 409 → toast + auto-skip a next |
| `keyboard-disabled-when-modal.spec.tsx` | atajos bloqueados con modal abierto, salvo Esc y ⌘↵ |

No E2E en este scope (queda para una fase separada con Playwright).

---

## 13. Accessibility

- Tab order: search input → filter selects → list rows (tabIndex 0) →
  detail (focusable headers) → action footer buttons.
- Focus ring visible: `outline: 2px solid hsl(var(--ring))` en
  `:focus-visible`.
- ARIA en list row: `role="button"` + `aria-current="true"` cuando activa.
- ARIA en dialog: shadcn Dialog ya provee `role="dialog"` y focus trap.
- Atajos NO interfieren con screen readers (no usamos `preventDefault`
  donde no haga falta).

---

## 14. Performance notes

- Queue rara vez pasa de 50 items, pero igual usar `key={r.id}` por row
  para que React no remonte al reordenar.
- Slot rows: `useMemo` para el flatten de overrides + slots actuales si
  hay > 50 slots por rutina (raro).
- Combobox de ejercicios: limit a 8 resultados, `staleTime: 5min`.
