# 002 — 3-day women, hypertrophy, 60min (+15-30min cardio)

- **Source file**: `APP RUTINA 3 DIAS MUJER (LUN-MAR-MIE / LUN-MAR-JUE / LUN-MAR-VIE / LUN-MIE-JUE / LUN-JUE-VIE / MAR-MIE-VIE / MAR-MIE-SAB / MAR-JUE-VIE / MIE-VIER-SAB) 1HS 15-30 MIN.xlsx`
- **Profile**: same as 001 (mujer, hipertrofia, 3 days, ~60min, gym_completo).
  Differs only in **schedule combos offered** (9 here vs 4 in 001) — confirms
  schedule ≠ content: same 3 sessions, many calendar layouts.
- **Block sampled**: BLOQUE 1 - SEMANA 1 - HIPERTROFIA BASE.
- **Purpose**: 2nd sample → gate check on 001's patterns.

## Ground truth — the 3 sessions (Semana 1)

Format: `Grupo | Ejercicio | Series×Reps | RIR | Descanso | Comentario`

### DÍA 1 — full-body (quad-focus + back)  · 9 slots, **2 principals**
1. Calent — Movimientos Articulares Piernas — 2×10 — - — 1min
2. **Cuadriceps — Sentadilla con Barra Plana — 3×6a8 — RIR 2 — 2-3min — APROXIMACIÓN** ⟵ principal
3. Cuadriceps — Sentadilla Búlgara c/Mancuernas — 2×8 — RIR 1 — 2min
4. Cuadriceps — Extensión Cuádriceps — 2×10x10x10 — RIR - — 2min — DISMINUIR PESO CADA 10
5. Pantorrillas — Pantorrillas en Máquina — **1**×10x10x10 — RIR - — 2min — DISMINUIR PESO CADA 10
6. **Calent — Movimiento Articular c/elástico — 2×10 — 1min** ⟵ 2nd warmup
7. **Espalda — Jalón al Pecho agarre Cerrado — 3×6a8 — RIR 1 — 2min** ⟵ principal
8. Espalda — Remo en Máquina Sentado — 2×10x10x10 — RIR - — 2min — DISMINUIR PESO CADA 10
9. Abdomen — Oblicuos Giro Ruso — 3×10 — RIR - — 1min — CONTROLAR VELOCIDAD DE GIRO

### DÍA 2 — full-body (chest/shoulders push)  · 9 slots, **2 principals**
1. Calent — Movimiento Articular c/elástico — 2×10 — - — 1min
2. **Pecho-Mayor — Press Plano c/Mancuernas — 3×6a8 — RIR 2 — 2min — APROXIMACIÓN** ⟵ principal
3. **Hombros — Press Militar c/Mancuernas Sentado — 3×6a8 — RIR 2 — 2min — APROXIMACIÓN** ⟵ principal
4. Pecho-Mayor — Pecho Sentado en Mariposa — 2×10 — RIR 1 — 1:45min — CONTROLAR VELOCIDAD EN LA VUELTA
5. Hombros — Vuelos Laterales c/Mancuerna — 3×10 — RIR 1 — 1:45min
6. Hombros — Posteriores en Máquina Mariposa — 2×10x10x10 — RIR - — 2min — DISMINUIR PESO CADA 10
7. Triceps — Triceps Polea alta barra plana — 3×`10 - 8 - 6` — RIR 2 — 1:45-2min — AUMENTAR PESO al finalizar cada serie
8. Triceps — Triceps con Soga en Polea Alta — 2×10x10x10 — RIR - — 2min — DISMINUIR PESO CADA 10
9. Abdomen — Rueda Abdominal — 3×10 — RIR - — 1min

### DÍA 3 — full-body (glute/ham + back/biceps)  · 9 slots, **1-2 principals**
1. Calent — Movimientos Articulares Piernas — 2×10 — - — 1min
2. **Gluteos — Hip Thrust — 3×6a8 — RIR 2 — 2-3min — APROXIMACIÓN** ⟵ principal
3. Femorales — Peso Muerto en Smith — 2×8 — RIR 2 — 2min
4. Femorales — Curl Femoral Acostado — 2×8 — RIR 1 — 1:45-2min — CONTROLAR VELOCIDAD EN LA VUELTA
5. Abductores — Abductores en Máquina — 2×10x10x10 — RIR - — 2min — DISMINUIR PESO CADA 10
6. **Calent — Movimiento Articular c/elástico — 2×10 — 1min** ⟵ 2nd warmup
7. Espalda — Jalón al Pecho agarre Neutro — 3×`10 - 8 - 6` — RIR 2 — 2min — AUMENTAR PESO al finalizar cada serie
8. Biceps — Curl de Biceps con Barra W — 2×8 — RIR 2 — 1:45-2min
9. Biceps — Biceps Martillo c/Mancuernas — 2×8 — RIR 1 — 1:45-2min — CONTROLAR VELOCIDAD EN LA BAJADA

## Gate results vs 001

| Pattern | Verdict | Notes |
|---------|---------|-------|
| **P1** full-body, no PPL | **CONFIRMED** | Both 3-day plans are full-body each day, rotating emphasis (002: quad→push→ham). Never a PPL split. |
| **P2** 2 warmups interleaved | **CONFIRMED** | Warmup 1 = region articular; warmup 2 = "Movimiento Articular con/sin elástico" before the upper block. Identical structure. |
| **P3** 3 principals/day | **REFUTED → revised** | 002 runs **2** principals on D1/D2 (D1: Sentadilla+Jalón; D2: Press Plano+Press Militar). 001 had 3. Invariant is **2-3 heavy compound slots at `3×6a8` RIR 2** per full-body day, not a fixed 3. The current hard cap of *exactly* 2 is still wrong (001 needs 3) — make it a **range 2-3**. |
| **P4** set-schemes | **CONFIRMED** | Same vocabulary: `6a8`, `8`, `10`, `10x10x10`, `10 - 8 - 6`. Single-series finisher `1×10x10x10` also appears. |
| **P5** RIR per role | **CONFIRMED** | principal `6a8`→RIR 2; 2nd-in-group compound→RIR 2 or 1; isolation accessory→RIR 1; drop-set/superset/core→RIR `-`; pyramid `10-8-6`→RIR 2. |
| **P6** rest by role | **CONFIRMED** | principal 2-3min, secondary 1:45-2min, drop 2min, core/warmup 1min. Byte-identical to 001. |
| **P7** comentario from scheme | **CONFIRMED** | `10x10x10`→"DISMINUIR PESO CADA 10 REPES"; `10-8-6`→"AUMENTAR PESO AL FINALIZAR CADA SERIE"; `6a8` principal→"HACER SERIES DE APROXIMACIÓN". Plus exercise-typed eccentric cues ("CONTROLAR VELOCIDAD EN LA BAJADA/VUELTA") on hamstring curls / mariposa. |

## New / refined observations

- **N1 — Slot count ~9-10 for 60min** (002 = 9/day, 001 = 10/day). Current
  generator says 60min → 8-9. Real range is **9-10**. Minor bump.
- **N2 — RIR ladder within a muscle block**: first compound RIR 2 → second
  movement RIR 2-or-1 → isolation RIR 1 → metabolic finisher RIR `-`. Intensity
  *descends* through the block.
- **N3 — Single-series finishers** exist (`1×10x10x10` calf). Series count is
  not bounded below at 2.
- **N4 — Eccentric-control cue** ("CONTROLAR VELOCIDAD EN LA BAJADA/VUELTA") is
  attached to specific exercise types (femoral curls, mariposa, RDL), not to a
  set-scheme. This part of `comentario` IS exercise-keyed, complementing P7's
  scheme-keyed part. So comentario = scheme-rule ⊕ exercise-cue.
- **N5 — Pyramid `10-8-6` can substitute for a `6a8` principal** as the heavy
  movement of the second block (002 D3 Jalón). So "heavy compound slot" ≠ only
  `6a8`; pyramid counts too.

## Promoted to `confirmed` (eligible to codify)
P1, P2, P4, P5, P6, P7. P3 revised to "2-3 heavy compounds (range)".
Still single-sample: P8 (contextual warmup — weakly supported), P9 (cardio), P10 (pools).
