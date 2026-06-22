# Routine Corpus — real coach routines that drive the generator

Living knowledge base. Each entry analyzes a **real human-made routine** (Excel
templates from the coach) and extracts the patterns the AI generator should
reproduce.

## Why this exists

The app generates routine skeletons via `backend/src/services/openai.service.ts`
(`SYSTEM_PROMPT`) + the 30-week `periodization_config`. Those rules were written
from first principles. This corpus grounds them in **actual coach output**.

Workflow:
1. Coach hands over an Excel → add a sample analysis under the right gender dir.
2. Tag each pattern **single-sample** vs **confirmed** (≥2 samples).
3. Once confirmed, fold it into the generator and mark it `applied` here.
   Do not change the generator from a single sample — the corpus is the gate.

## Structure — logic is split by gender (coach request, 2026-06-16)

```
routine-corpus/
├── shared-mechanics.md     # gender-NEUTRAL: set-schemes, RIR/rest/comentario, warmups
├── mujer/
│   ├── LOGIC.md            # consolidated WOMEN logic (split selection, emphasis)
│   ├── 001-3dias-hipertrofia-60min.md
│   ├── 002-3dias-hipertrofia-60min.md
│   ├── 003-4dias-hipertrofia-60min.md
│   ├── 004-5dias-hipertrofia-60min.md
│   └── 005-4dias-hipertrofia-60min-cardio30.md
└── hombre/
    ├── LOGIC.md            # consolidated MEN logic
    ├── 001-3dias-1pierna-60min.md   ├── 002-3dias-2piernas-60min.md
    ├── 003-4dias-1pierna-60min.md   ├── 004-4dias-2piernas-60min.md
    └── 005-5dias-1pierna-60min.md   └── 006-5dias-2piernas-60min.md
```

- **Gender-specific** (split shape, muscle emphasis/bias) → `mujer/LOGIC.md`,
  `hombre/LOGIC.md`.
- **Gender-neutral** (HOW a slot is prescribed) → `shared-mechanics.md`.

## Pattern ledger

### Gender-neutral (→ shared-mechanics.md)

| # | Pattern | Status | Samples |
|---|---------|--------|---------|
| M1 | Rep-string encodes a set-scheme (`6a8`/`6`/`8`/`10x10x10`/`10-8-6`/`8x6x4x6x8`/time/`fallo`) | **confirmed (both genders)** | ♀001-005 ♂001-006 |
| M2 | RIR per slot-role; intensity descends through a muscle block (2→1→-) | **confirmed (both)** | ♀+♂ all |
| M3 | Rest by role (2-3 / 2 / 1:45-2 / 1:30 / 1 min) | **confirmed (both)** | ♀+♂ all |
| M4 | Comentario = scheme-rule ⊕ exercise-cue, not free text | **confirmed (both)** | ♀+♂ all |
| M5 | Warmup count = (lower↔upper transitions) + 1; contextual warmups | **✅ applied (prompt)** | ♀+♂ all |
| M6 | Schemes already match progression-helpers; generator is the missing half | n/a (code fact) | — |
| M7 | Cardio = HIIT finisher (♀) or steady-state leg-day slot (♂); time label = cardio budget | **confirmed (both)** | ♀001,005 ♂001,003,005 |

### Women-specific (→ mujer/LOGIC.md)

| # | Pattern | Status | Samples |
|---|---------|--------|---------|
| W1 | days ≤3 ⇒ full-body rotating emphasis; ≥4 ⇒ **lower-biased split** (never PPL) | **✅ applied** | 001-005 |
| W1b | Lower-day count scales: 4d→2 lower, 5d→3 lower; upper stays ~2 | **confirmed** | 003,004,005 |
| W1c | Split day-pairing **varies** between plans (003≠005) → codify the bias, not a fixed template | **confirmed** | 003 vs 005 |
| W2 | Day opens with a heavy compound; 1-3 principals/day | **✅ applied (range)** | 001-005 |
| W3 | Hip Thrust is the staple glute principal; glutes/hams prioritized | **confirmed** | 001-005 |

### Men-specific (→ hombre/LOGIC.md)

| # | Pattern | Status | Samples |
|---|---------|--------|---------|
| H0 | **Leg-day count is a USER CHOICE** (1 vs 2 leg days) — new `leg_days` field | **✅ applied** | ♂001-006 (variant pairs) |
| H1 | Split by (frequency × leg-choice): 3d/1leg = **PPL**; men **upper-biased** by default | **✅ applied** | ♂001-006 |
| H2 | 2 leg days → quad-day + ham-day; 1 leg day → one full-leg day | **confirmed** | ♂ all |
| H3 | **No Hip Thrust** (men); legs squat/deadlift-centric | **✅ applied (prompt)** | ♂ all |
| H4 | Steady-state cardio embedded as a leg-day slot (1-leg variants) | **confirmed** | ♂001,003,005 |

**Men vs Women**: women lower-biased (glute/ham, Hip Thrust, no leg-choice);
men upper-biased (chest/delt/back, squat/deadlift legs, leg-count is user choice).

## Codification status

### ✅ APPLIED (branch `feat/gender-aware-routine-generation`)
Implemented in `backend/src/services/openai.service.ts` (`buildSplitGuidance` +
rewritten `SYSTEM_PROMPT` + validators) and the H0 data-model plumbing:
1. **Gender-aware split** (W1, H1): `buildSplitGuidance(profile)` → ♀ lower-biased,
   ♂ upper-biased; days ≤3 full-body / ≥4 split; men 3d/1-leg = PPL. Passed to the
   model as `split_guidance` + enforced via the prompt.
2. **H0 leg_days**: new `leg_days` (1|2, nullable) — `AthleteProfile` type,
   `onboardingPayload` + `profileUpdatePayload`, migration `037_leg_days.sql`,
   onboarding INSERT. Drives the men split.
3. **Principal range 1-3** (P3/W2): validator cap raised from exactly-2 to 1-3,
   distinct-base-group rule kept.
4. **Interleaved warmups** (M5): prompt now places a 2nd warmup before a
   lower↔upper transition instead of clustering at the start.
5. **slotRangeFor widened** to the real ~8-10 (60min) corpus range.
6. **notes guidance** (M4 partial): prompt derives comentario from set-scheme.

### ✅ APPLIED — phase 2: per-accessory set-scheme (M1, M3 partial)
Implemented (branch `feat/per-slot-accessory-prescription`):
- Migration `038_skeleton_slot_prescription.sql`: nullable `series`/`reps`/
  `descanso` on `skeleton_slots`.
- Generator emits per-accessory `series`/`reps`/`descanso` (drop-set `10x10x10`
  finisher, pyramid `10-8-6`, straight reps, core time) via the `aiSkeletonOutput`
  schema + SYSTEM_PROMPT scheme table; nulled for principals/warmups.
- `skeleton.service` persists them (create + reorder-preserve).
- `engine.service`: accessories use the slot prescription over periodization
  defaults; the athlete's progressed `current_reps_text` still wins once
  progression runs. **Principals untouched — they keep the 30-week periodization
  (RM/AMRAP/pct).**
- ✅ Frontend `leg_days` collected (tr-fit-app, branch `feat/onboarding-leg-days`).

### ⏳ STILL DEFERRED
- **M2 RIR per slot-role**: `SessionItem` has no `target_rir` field and the mobile
  app doesn't render RIR — surfacing it is a cross-repo change.
- **M7 cardio** as a first-class block/slot (HIIT finisher ♀ / steady-state ♂).
- Day-pairing stays model-driven (W1c/H1: pairings vary), not hardcoded.
