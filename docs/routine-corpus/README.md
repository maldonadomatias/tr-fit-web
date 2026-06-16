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
    └── LOGIC.md            # STUB — awaiting men samples (next)
```

- **Gender-specific** (split shape, muscle emphasis/bias) → `mujer/LOGIC.md`,
  `hombre/LOGIC.md`.
- **Gender-neutral** (HOW a slot is prescribed) → `shared-mechanics.md`.

## Pattern ledger

### Gender-neutral (→ shared-mechanics.md)

| # | Pattern | Status | Samples |
|---|---------|--------|---------|
| M1 | Rep-string encodes a set-scheme (`6a8`/`6`/`8`/`10x10x10`/`10-8-6`/`8x6x4x6x8`/time) | **confirmed** | 001-005 |
| M2 | RIR per slot-role; intensity descends through a muscle block (2→1→-) | **confirmed** | 001-005 |
| M3 | Rest by role (2-3 / 2 / 1:45-2 / 1:30 / 1 min) | **confirmed** | 001-005 |
| M4 | Comentario = scheme-rule ⊕ exercise-cue, not free text | **confirmed** | 001-005 |
| M5 | Warmup count = (lower↔upper transitions) + 1; contextual warmups | **confirmed** | 001-005 |
| M6 | Schemes already match progression-helpers; generator is the missing half | n/a (code fact) | — |
| M7 | Optional CARDIO HIIT finisher; filename time = cardio budget, not session length | **confirmed** | 001, 005 |

### Women-specific (→ mujer/LOGIC.md)

| # | Pattern | Status | Samples |
|---|---------|--------|---------|
| W1 | days ≤3 ⇒ full-body rotating emphasis; ≥4 ⇒ **lower-biased split** (never PPL) | **confirmed + threshold** | 001-005 |
| W1b | Lower-day count scales: 4d→2 lower, 5d→3 lower; upper stays ~2 | **confirmed** | 003,004,005 |
| W1c | Split day-pairing **varies** between plans (003≠005) → codify the bias, not a fixed template | **confirmed** | 003 vs 005 |
| W2 | Day opens with `3×6a8` RIR2 compound (Hip Thrust/Sentadilla/PM/Press/Jalón); 1-3 principals/day | **confirmed** | 001-005 |
| W3 | Hip Thrust is the staple glute principal; glutes/hams prioritized | **confirmed** | 001-005 |

### Men-specific
Empty — awaiting samples.

## Codification gate — OPEN
Eligible to fold into the generator now (all ≥2 women samples):
- **M1-M5** (shared mechanics) — gender-neutral, safe.
- **W1 + W1b** (split selection by frequency, lower-biased) — women branch.
- **W1c**: codify the *bias rule*, NOT a fixed day-pairing template.

Generator bugs this exposes (`openai.service.ts`):
1. Always builds PPL templates → wrong for 3-day (full-body) AND ≥4-day (lower-biased split). [:37-40]
2. Principal cap = exactly 2 → must be range 1-3. [:168]
3. Warmups clustered at start → interleave by region transition. [:33]
4. Slot count scaled off `exercise_minutes` → coach holds session ~constant, varies cardio. [slotRangeFor]

**Pending coach go-ahead before editing the generator. Men logic comes first
(coach: "luego iremos con el hombre").**
