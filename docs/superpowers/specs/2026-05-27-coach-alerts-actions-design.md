# Coach Alerts: Actionable Resolutions

**Status:** Draft, approved for plan
**Date:** 2026-05-27
**Author:** mmaldonado@zennovia.com (with Claude)
**Related code:** `backend/src/routes/admin-alerts.ts`, `backend/src/services/alert.service.ts`, `backend/src/services/engine.service.ts`, `frontend/src/pages/admin/Alerts.tsx`

## Problem

`/admin/alerts` lists coach alerts (SOS pain, SOS machine, RPE flag, RM skipped, RM week starting) as a card stream. The only actions are "Marcar leída" and "Resolver", both of which flip boolean flags and do nothing useful for the athlete. An SOS pain report — the highest-signal alert in the product — produces no actual change to the athlete's routine. The coach has to leave the page, navigate to the athlete's rutina, mutate slots manually, and remember to come back and mark the alert resolved.

## Goals

1. Turn the alerts page into a dense, scannable triage table.
2. Every alert resolution is a real decision: swap an exercise, skip a week, regenerate the skeleton, reduce intensity, contact, or acknowledge. Resolution and decision are the same action.
3. Decisions automatically propagate to the athlete's next session via a weekly-scoped override layer over the active skeleton — without mutating the skeleton itself.
4. Keep a tight audit trail on each alert (what action was taken, by whom, with what note).

## Non-Goals

- Push the athlete in-app when the coach takes an action. The current `sos_resolved` notification stays; no new athlete-facing channel for swaps/skips.
- Permanent edits to the skeleton from an alert. Overrides are per-week. Permanent edits stay in the rutinas admin page.
- Multi-step audit (multiple actions per alert). One alert = one resolution decision.
- Bulk actions, realtime, websocket. 30 s polling stays.
- Full action UX for RM-class alerts. Backend supports them; the UI ships acknowledge + note only this iteration.

## Decisions

| # | Decision | Why |
|---|---|---|
| D1 | Resolution = action. One alert → one `resolution_action` + payload + optional note. | User chose "Acción cierra alerta + audita". Avoids decoupled "did anything happen?" ambiguity. |
| D2 | Layout: dense table, action column with `⋯` icon button → Popover with the action menu → Dialog for actions that need a sub-step (swap, intensity, note). | User chose popover-from-icon-button. Drawer rejected (too heavy for triage). |
| D3 | Swap / skip / reduce scope = "rest of the current week". | User chose. Keeps blast radius small; no skeleton mutation. |
| D4 | All five alert types in scope, but each type exposes a different action set. | User chose "Todos". Action × type matrix below. |
| D5 | "Contactar atleta" is a coach-internal note only. No push, no message to athlete. | User chose. Coach reaches athlete via WhatsApp/external. |
| D6 | Overrides live in a new `weekly_overrides` table consumed by `engine.service.buildTodaySession`. Skeleton is never mutated by an alert resolution. | Smallest blast radius. Filters by `program_week`/`expires_after_week` auto-expire. Skeleton regen leaves overrides harmless (the week filter kills them). |
| D7 | Reject overriding an exercise that is already coming from an active override (no override-of-override). | Avoid layered surprises in a single week. |

## Action × Type Matrix

| Alert type | Available actions |
|---|---|
| `sos_pain` | `swap_exercise`, `skip_week`, `regen_skeleton`, `note_only` |
| `sos_machine` | `approve_switch`, `revert_switch`, `swap_exercise`, `note_only` |
| `rpe_flag` | `reduce_intensity`, `skip_week`, `note_only` |
| `rm_skipped` | `reschedule_rm`, `skip_rm_block`, `note_only` |
| `rm_week_starting` | `acknowledge`, `note_only` |

Every alert also supports `mark_read` (separate, does not resolve).

`resolve` validates the chosen action is in the type's matrix; otherwise 422.

## Side-Effect Per Action

Applied inside the same transaction as the `UPDATE coach_alerts` that records the resolution.

| Action | Side-effect |
|---|---|
| `swap_exercise` | INSERT `weekly_overrides (override_type='swap', original_exercise_id, replacement_exercise_id, expires_after_week=current_week, source_alert_id)` |
| `skip_week` | INSERT `weekly_overrides (override_type='skip', replacement_exercise_id=NULL)` |
| `reduce_intensity` | INSERT `weekly_overrides (override_type='reduce_intensity', intensity_payload={ sets_delta?, weight_pct?, rpe_delta? })` |
| `regen_skeleton` | Call `skeleton-regen.service.regenerateSkeleton(athlete_id)`. Existing service; reuse. |
| `approve_switch` | INSERT swap override using `payload.switched_to_exercise_id` from the original alert payload. |
| `revert_switch` | No-op. Records the coach's decision; the athlete's runtime switch already happened in the session. |
| `reschedule_rm` / `skip_rm_block` | Minimal: store the decision in `resolution_payload`. UI surfaces the badge; deeper integration is future scope. |
| `acknowledge` / `note_only` | Audit only. No rutina change. |

`resolved_at = NOW()`, `resolved_by = req.user.id` set on every action.

## Data Model

### `coach_alerts` — extend

```sql
ALTER TABLE coach_alerts
  ADD COLUMN resolution_action TEXT
    CHECK (resolution_action IN (
      'swap_exercise','skip_week','regen_skeleton','approve_switch',
      'revert_switch','reduce_intensity','reschedule_rm','skip_rm_block',
      'acknowledge','note_only'
    )),
  ADD COLUMN resolution_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN resolution_note TEXT,
  ADD COLUMN resolved_by UUID REFERENCES users(id);
```

(`resolved_at` already exists.)

### `weekly_overrides` — new

```sql
CREATE TABLE weekly_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  program_week INT NOT NULL,
  day_of_week INT,                          -- NULL = applies all days of the week
  original_exercise_id INT NOT NULL REFERENCES exercises(id),
  replacement_exercise_id INT REFERENCES exercises(id),  -- NULL when override_type='skip'
  override_type TEXT NOT NULL CHECK (override_type IN
    ('swap','skip','reduce_intensity')),
  intensity_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_alert_id UUID REFERENCES coach_alerts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  expires_after_week INT NOT NULL CHECK (expires_after_week >= program_week)
);

CREATE INDEX idx_weekly_overrides_lookup
  ON weekly_overrides(athlete_id, program_week);
```

Migration file: `backend/src/db/migrations/024_alert_resolutions_and_overrides.sql`.

## API

All under `/api/admin/alerts` (auth: `requireAuth + requireAdmin`).

```
GET   /admin/alerts
  Query: ?status=open|resolved|all (default: open)
         ?type=sos_pain|sos_machine|rpe_flag|rm_skipped|rm_week_starting
         ?severity=red|yellow|info
         ?athlete_id=<uuid>
         ?limit=50&page=1
  Response: { items: AlertRow[], total: number }
  AlertRow now includes: resolution_action, resolution_note,
                         resolved_by_name, athlete_id, exercise_id.

GET   /admin/alerts/:id/context
  Response: {
    alert: AlertRow,
    suggestedAlternative: { id, name } | null,   // from alternatives.service
    painHistory: { zone, intensity, created_at }[],  // last 6 of same athlete+zone
    activeSlot: { skeleton_slot_id, exercise_id, day_of_week } | null
  }
  Lazy-loaded when the popover or a dialog opens. Keeps list endpoint cheap.

POST  /admin/alerts/:id/resolve
  Body: { action: AlertResolutionAction, payload: object, note?: string }
  Validates action ∈ matrix[alert.type]. 422 otherwise.
  409 if alert already has resolution_action set.
  Runs side-effect + UPDATE inside one transaction.
  Returns: updated AlertRow.

PATCH /admin/alerts/:id/read
  Unchanged. Sets read_at. Independent from resolution.
```

The duplicate handler at `/api/admin/operations/alerts*` (in `routes/admin-ops.ts`) is removed once the new `/admin/alerts` covers it. Sidebar and frontend hook update to the single path.

## Engine Integration

`engine.service.buildTodaySession(athleteId, dayOfWeek)` already drives the athlete's mobile session. Add an overrides lookup after the slots query, before exercise resolution:

```ts
const ovR = await pool.query<WeeklyOverride>(
  `SELECT * FROM weekly_overrides
     WHERE athlete_id = $1
       AND program_week <= $2 AND expires_after_week >= $2
       AND (day_of_week = $3 OR day_of_week IS NULL)`,
  [athleteId, state.current_week, dayOfWeek],
);
const ovByOrig = new Map(ovR.rows.map(o => [o.original_exercise_id, o]));

const effectiveSlots = slotsR.rows
  .map(slot => {
    const ov = ovByOrig.get(slot.exercise_id);
    if (!ov) return slot;
    if (ov.override_type === 'skip') return null;
    if (ov.override_type === 'swap')
      return { ...slot, exercise_id: ov.replacement_exercise_id!, _override: ov };
    return { ...slot, _override: ov };
  })
  .filter((s): s is SkeletonSlot & { _override?: WeeklyOverride } => s !== null);
```

`buildItem` accepts an optional `_override`. When `override_type === 'reduce_intensity'`, it applies `intensity_payload.sets_delta`, `intensity_payload.weight_pct`, `intensity_payload.rpe_delta` to the computed `series`, `weight`, and `target_rpe` of the item respectively. Out-of-bounds values are clamped to the engine's existing limits.

`reconcileWithServer` on the mobile app already refetches the active session; overrides become visible on the next pull. No mobile-side change required.

## Frontend Structure

```
frontend/src/pages/admin/Alerts.tsx              (refactor → table)
frontend/src/components/admin/alerts/
  AlertsFilters.tsx                              (chips + atleta search)
  AlertsTable.tsx                                (shadcn Table)
  AlertRowActions.tsx                            (Popover anchored to ⋯ icon)
  dialogs/
    SwapExerciseDialog.tsx                       (uses /context for alternatives)
    SkipWeekDialog.tsx
    ReduceIntensityDialog.tsx                    (form: % peso, Δseries, Δrpe)
    RegenSkeletonDialog.tsx                      (destructive confirm + reason)
    ApproveSwitchDialog.tsx                      (from→to of the athlete's switch)
    RevertSwitchDialog.tsx                       (note + confirm)
    ContactNoteDialog.tsx                        (textarea note)
    AcknowledgeDialog.tsx                        (one-click confirm)
frontend/src/hooks/useAlerts.ts                  (extend)
frontend/src/types/api.ts                        (AlertResolutionAction enum, AlertContext)
```

Table columns: `Sev · Atleta · Tipo · Detalle · Hace · ⋯`. Severity is a colored dot. `Detalle` is a compact summary derived from `type` + `payload`. `Hace` is relative time.

Filters default to `status=open`. A `Resueltas` tab loads `status=resolved` and shows the `resolution_action` badge + author + note tooltip.

A resolved row is read-only (no `⋯` actions).

`AlertRowActions` reads the row's `type`, looks up the matrix, renders the corresponding items. Selecting an item that needs sub-data opens the matching dialog and lazy-loads `/context`. One-click actions (acknowledge, revert_switch, regen_skeleton confirm) skip the context fetch.

## Testing

Backend:

```
backend/tests/integration/alerts.test.ts           (extend)
  - resolve sos_pain → swap_exercise inserts weekly_override + sets resolution_*
  - resolve sos_pain → skip_week inserts skip override
  - resolve sos_pain → regen_skeleton calls regenerateSkeleton
  - resolve with action not in matrix for type → 422
  - resolve an already-resolved alert → 409
  - mark_read does not set resolution_*, vice versa
  - context endpoint returns suggested alternative + pain history

backend/tests/integration/weekly-overrides.test.ts (new)
  - buildTodaySession with swap override → replacement exercise in items
  - skip override → slot dropped
  - reduce_intensity override → series/rpe modified
  - expired override (current_week > expires_after_week) → ignored
  - day_of_week=NULL matches every day

backend/tests/integration/engine.service.test.ts   (regression — if missing, add)
  - no overrides → identical output to current behavior
```

Frontend:

```
frontend/src/pages/admin/__tests__/Alerts.test.tsx
  - table renders rows from /admin/alerts
  - ⋯ opens popover with the expected items per type
  - swap dialog: pickea alternativa, submit → POST resolve with correct payload
  - resolved row shows badge + note tooltip
  - filters update query string
```

## Migration / Rollout

1. Ship migration `024_alert_resolutions_and_overrides.sql` (additive, no destructive change).
2. Ship backend (new `/resolve` body shape, `/context` endpoint). Old PATCH `/resolve` is replaced; the duplicate `/admin/operations/alerts*` handler is removed in the same change.
3. Ship frontend refactor.
4. No data backfill needed: existing resolved alerts have NULL `resolution_action`, render as legacy "Resuelta (sin detalle)".

No feature flag. Single deploy.

## Risks and Open Items

- **Override leakage across weeks.** Filter is `program_week <= current_week AND expires_after_week >= current_week`. Increments of `current_week` (handled by existing progression service) auto-expire week-3 overrides at the start of week 4. Verify in a test.
- **Override on a slot that is already overridden.** `resolveAlert` rejects if there is an active `weekly_overrides` row for the same `athlete_id`/`current_week`/`exercise_id` whose `replacement_exercise_id` is the current slot's exercise. Returns 409.
- **Skeleton regen during an active override.** Overrides keep their `original_exercise_id` but the new skeleton may not contain that exercise. The override becomes inert (no match) and dies at end of week. Acceptable.
- **`approve_switch` source.** The original `sos_machine` alert's payload has `switched_to_exercise_id`. The resolve handler reads from the alert row, not from the request body, to prevent the coach from approving a different exercise than the one the athlete actually swapped to.
- **Idempotency.** Two coaches double-resolving: second request returns 409. UI invalidates the query after the first success so the second coach sees the resolved state.

## Out of Scope (Future)

- Athlete-facing push when the coach takes a swap/skip action.
- Permanent skeleton edits driven from an alert.
- Multi-action audit per alert.
- Bulk resolve.
- Realtime channel.
- Full action UX for `reschedule_rm` and `skip_rm_block` (this iteration ships ack + note only for RM-class alerts).
