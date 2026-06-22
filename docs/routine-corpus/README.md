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
| M5 | Warmup count = (lower↔upper transitions) + 1; contextual warmups | **confirmed (both)** | ♀+♂ all |
| M6 | Schemes already match progression-helpers; generator is the missing half | n/a (code fact) | — |
| M7 | Cardio = HIIT finisher (♀) or steady-state leg-day slot (♂); time label = cardio budget | **confirmed (both)** | ♀001,005 ♂001,003,005 |

### Women-specific (→ mujer/LOGIC.md)

| # | Pattern | Status | Samples |
|---|---------|--------|---------|
| W1 | days ≤3 ⇒ full-body rotating emphasis; ≥4 ⇒ **lower-biased split** (never PPL) | **confirmed + threshold** | 001-005 |
| W1b | Lower-day count scales: 4d→2 lower, 5d→3 lower; upper stays ~2 | **confirmed** | 003,004,005 |
| W1c | Split day-pairing **varies** between plans (003≠005) → codify the bias, not a fixed template | **confirmed** | 003 vs 005 |
| W2 | Day opens with `3×6a8` RIR2 compound (Hip Thrust/Sentadilla/PM/Press/Jalón); 1-3 principals/day | **confirmed** | 001-005 |
| W3 | Hip Thrust is the staple glute principal; glutes/hams prioritized | **confirmed** | 001-005 |

### Men-specific (→ hombre/LOGIC.md)

| # | Pattern | Status | Samples |
|---|---------|--------|---------|
| H0 | **Leg-day count is a USER CHOICE** (1 vs 2 leg days) — needs a new profile input | **confirmed** | ♂001-006 (variant pairs) |
| H1 | Split by (frequency × leg-choice): 3d/1leg = **PPL**; men **upper-biased** by default | **confirmed** | ♂001-006 |
| H2 | 2 leg days → quad-day + ham-day; 1 leg day → one full-leg day | **confirmed** | ♂ all |
| H3 | **No Hip Thrust**; legs are squat/deadlift-centric; emphasis = chest/delts/back/arms | **confirmed** | ♂ all |
| H4 | Steady-state cardio embedded as a leg-day slot (1-leg variants) | **confirmed** | ♂001,003,005 |

**Men vs Women**: women lower-biased (glute/ham, Hip Thrust, no leg-choice);
men upper-biased (chest/delt/back, squat/deadlift legs, leg-count is user choice).

## Codification gate — OPEN (both genders covered)
Eligible to fold into the generator now:
- **M1-M7** (shared mechanics) — gender-neutral, confirmed ♀+♂, safe.
- **Women W1/W1b** (≤3 full-body, ≥4 lower-biased split).
- **Men H1/H2/H3** (split by frequency×leg-choice, upper-biased, no Hip Thrust).
- Codify the **bias + leg rules**, NOT fixed day-pairing templates (W1c/H1 both
  show pairings vary between plans).

### Generator changes this implies (`openai.service.ts`)
1. Branch split logic by **gender**: ♀ lower-biased, ♂ upper-biased. Today it
   builds one PPL template for everyone. [:37-40]
2. ≤3 days → full-body (♀) / PPL-or-full-body (♂); ≥4 → split. Not always PPL. [:37-40]
3. Principal cap = exactly 2 → range **1-3**. [:168]
4. Warmups clustered at start → **interleave** by region transition. [:33]
5. Slot count off `exercise_minutes` → coach holds session ~constant (8-10),
   varies cardio. Reconsider `slotRangeFor`. [slotRangeFor]
6. Assign **set-scheme + RIR + rest + comentario by role** at generation time
   (M1-M5) — today the skeleton has none of this; periodization fills it globally.

### Product gap (needs schema + onboarding work, not just the prompt)
- **H0 — men need a `leg_days` preference (1 vs 2)**. No such field exists in
  `AthleteProfile`. Women don't need it (lower-bias implicit). This is the one
  finding that touches the data model / onboarding, not only the generator.

**All structural patterns now confirmed across both genders. Pending coach
go-ahead to start codifying.**
