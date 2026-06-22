# Shared mechanics — gender-neutral

These rules are observed identically across **all women (001-005) AND men
(001-006) samples** — confirmed **gender-independent**. They describe HOW a slot
is prescribed, not WHICH muscles a gender prioritizes. Split selection & muscle
emphasis are gender-specific — see [mujer/LOGIC.md](mujer/LOGIC.md) /
[hombre/LOGIC.md](hombre/LOGIC.md).

## M1 — Set-scheme vocabulary (the `Reps` string encodes set type)

| Rep string | Scheme | Typical RIR | Descanso | Comentario (rule) |
|------------|--------|-------------|----------|-------------------|
| `6 a 8` | effective compound (principal) | 2 | 2-3 min | HACER SERIES DE APROXIMACIÓN |
| `6` | strength-leaning compound | 2 | 2 min | — |
| `8` / `8 a 10` / `10 a 12` | effective accessory | 2 → 1 | 1:45-2 / 1:30 min | (eccentric cue if applicable) |
| `10x10x10` | drop set (carga/descarga) | - | 2 min | DISMINUIR PESO CADA 10 REPES |
| `10 - 8 - 6` | ascending pyramid | 2 | 1:45-2 min | AUMENTAR PESO AL FINALIZAR CADA SERIE |
| `8x6x4x6x8` | superserie carga/descarga | - | 2 min | (no intra-rest) |
| `30 seg` / `40 seg` / `30 seg + 10 cad` / `10 C/L` | time / time+reps / per-side core | - | 1 min | technique cue |
| `fallo` | to-failure (forearms, men) | - | 2 min | — |

## M2 — RIR by slot-role (descends through a muscle block)
principal compound `6a8` → **RIR 2**; second compound → RIR 2 or 1; isolation
accessory → RIR 1; drop-set / superset / pyramid-finisher / core → RIR `-`
(unmeasured). Within one muscle block the intensity ladder *descends* (2 → 1 → -).

## M3 — Rest by role
`2-3 min` (principal) → `2 min` (heavy 2nd / drop set) → `1:45-2 min` (accessory)
→ `1:30 min` (light isolation finisher) → `1 min` (core / warmup).

## M4 — Comentario = scheme-rule ⊕ exercise-cue
- **Scheme part** (deterministic from M1): drop→"DISMINUIR PESO CADA 10 REPES";
  pyramid→"AUMENTAR PESO AL FINALIZAR CADA SERIE"; principal→"HACER SERIES DE
  APROXIMACIÓN".
- **Exercise part** (keyed to the movement): eccentric control on hamstring
  curls / RDL / mariposa ("CONTROLAR VELOCIDAD EN LA BAJADA/VUELTA"), form cues
  ("NO BALANCEARSE", "INCLINARSE LEVEMENTE HACIA DELANTE", step cues).

## M5 — Warmups
Count = (number of lower↔upper region transitions in the day) + 1. Warmup 1 =
region articular or a light version of the day's main lift. Warmup 2 (only when
the day crosses regions) = "Movimiento Articular con/sin elástico". Always
`2×10`, RIR `-`, 1 min.

## M6 — Progression already aligns
The app's `progression-helpers.ts` already advances these exact scheme strings
(`10x10x10→12x12x12`, `10-8-6→12-10-8`, `8x6x4x6x8→10x8x6x8x10`). The generator
is the missing half: it doesn't *assign* schemes/RIR/rest/comentario by role at
creation time. Closing that gap (M1-M5) makes generation and progression speak
the same vocabulary.

## M7 — Cardio (two forms)
- **HIIT finisher** (women): structured `N × (work interval / rest interval)`
  appended after lifting (Excel column P). The filename time budget
  ("15-30 MIN" / "30MIN") is THIS block's length, not the lifting session's.
- **Steady-state slot** (men, 1-leg-day variants): a single cardio slot inside
  the leg day ("Bicicleta Fija 15 min, CONSTANTE NO SUAVE NO INTENSO").
- Either way the lifting body stays ~8-10 slots; cardio is the variable add-on.
