# 001 — 3-day women, hypertrophy, 60min (+15-30min cardio)

- **Source file**: `APP RUTINA 3 DIAS MUJER (LUN-MIER-VIER / LUN-JUE-SAB / LUN-MIE-SAB / MAR-JUE-SAB) 1 HS 15-30 MIN.xlsx`
- **Profile inferred**: gender=mujer, goal=hipertrofia, days_per_week=3,
  exercise_minutes≈60 + optional 15-30min cardio HIIT, level≈medio,
  equipment=gym_completo.
- **Day-pattern offered**: LUN-MIER-VIER / LUN-JUE-SAB / LUN-MIE-SAB / MAR-JUE-SAB
  (4 weekly schedules, same 3 sessions — schedule ≠ content).
- **Block sampled**: BLOQUE 1 - SEMANA 1 - HIPERTROFIA BASE.

## Workbook anatomy (for importer reference)

| Sheet | Role |
|-------|------|
| `LEER!` | Methodology: RIR, PESO logging rules, REPS MAX checklist, set-schemes (guion/X), aproximación, color legend (green=up, yellow=down, red=new/error). |
| `Base de Datos` | 844 rows. Cols A-B = master exercise list by muscle group. Cols D..DS = **120 "Filtrados N" curated pools** (pre-filtered exercise subsets per slot/context). |
| `Mis Datos` | Athlete profile + anthropometrics + RM test grid (Sentadilla/Peso Muerto/Press Plano/Press Militar/Remo × reps 1-10). |
| `Entrenamiento` | The live routine. Per-day table: Grupo Muscular / Ejercicio / Peso / Series / Reps / SERIE1-3 checkboxes / RIR / Descanso / Comentarios. Col P = CARDIO HIIT block. |
| `RM` | Estimated 1RM per principal lift (RM1/RM2/RM3). |
| `Progreso`, `Cache` | Computed state. |

## Ground truth — the 3 sessions (Semana 1)

Format: `GrupoMuscular | Ejercicio | Series×Reps | RIR | Descanso | Comentario`

### DÍA 1 — full-body (gluteo-focus + back/shoulders)
1. Calentamiento — Elevación de Cadera espalda en el piso — 2×10 — RIR - — 1min
2. **Piernas-Gluteos — Hip Thrust — 3×6a8 — RIR 2 — 2-3min — HACER SERIES DE APROXIMACIÓN** ⟵ principal
3. Piernas-Gluteos — Patada Glúteos polea — 2×8 — RIR 1 — 1:45min
4. Piernas-Abductores — Abductores en Máquina — 2×**10x10x10** — RIR - — 2min — DISMINUIR PESO CADA 10 REPES
5. **Calentamiento — Movimiento Articular con/sin elástico — 2×10 — 1min** ⟵ 2nd warmup, mid-session
6. **Espalda — Jalón al Pecho agarre Cerrado — 3×6a8 — RIR 1 — 1:45-2min — APROXIMAR SI ES NECESARIO** ⟵ principal
7. Espalda — Remo en Máquina Sentado — 2×**10x10x10** — RIR - — 2min — DISMINUIR PESO CADA 10 REPES
8. **Hombros — Press Militar c/Mancuernas — 3×6a8 — RIR 2 — 2min — APROXIMAR SI ES NEC.** ⟵ principal
9. Biceps — Curl Barra pequeña en Polea — 2×8 — RIR 1 — 2min
10. Abdomen — Oblicuos Plancha Lateral — 3×`30 seg + 10 cad` — RIR - — 1min

### DÍA 2 — full-body (quad-focus + chest/shoulders)
1. Calentamiento — Movimientos Articulares Piernas — 2×10 — 1min
2. **Piernas-Cuadriceps — Sentadilla con Barra Plana — 3×6a8 — RIR 2 — 2-3min — APROXIMACIÓN** ⟵ principal
3. Piernas-Cuadriceps — Sentadilla Búlgara c/Mancuernas — 3×8 — RIR 2 — 2min
4. Piernas-Cuadriceps — Extensión Cuádriceps — 2×10x10x10 — RIR - — 2min — DISMINUIR PESO CADA 10
5. Piernas-Pantorrillas — Pantorrillas en Máquina — 2×10x10x10 — RIR - — 2min — DISMINUIR PESO CADA 10
6. **Calentamiento — Movimiento Articular c/elástico — 2×10 — 1min** ⟵ 2nd warmup
7. **Pecho-Mayor — Press Plano c/Mancuernas — 3×6a8 — RIR 2 — 1:45-2min — APROXIMAR** ⟵ principal
8. Hombros — Vuelos Laterales c/Mancuerna — 3×8a10 — RIR 1 — 1:45min
9. Pecho-Mayor — Pecho Sentado en Mariposa — 2×10x10x10 — RIR - — 2min — DISMINUIR PESO CADA 10
10. Abdomen — Oblicuos Giro Ruso — 3×10 — RIR - — 1min — CONTROLAR VELOCIDAD DE GIRO

### DÍA 3 — full-body (glute/ham-focus + shoulders/arms)
1. Calentamiento — Movimientos Articulares Piernas — 2×10 — 1min
2. **Piernas-Gluteos — Hip Thrust — 3×6a8 — RIR 1 — 2-3min — APROXIMACIÓN** ⟵ principal
3. Piernas-Femorales — Peso Muerto Rumano c/Mancuernas — 2×8 — RIR 2 — 2min — CONTROLAR BAJADA
4. Piernas-Femorales — Curl Femoral Acostado — 3×8 — RIR 1 — 2min — CONTROLAR BAJADA
5. **Calentamiento — Movimiento Articular c/elástico — 2×10 — 1min** ⟵ 2nd warmup
6. Hombros — Vuelos Laterales c/Mancuerna — 3×8a10 — RIR 1 — 1:45min
7. Hombros — Posteriores en Máquina Mariposa — 2×10x10x10 — RIR - — 1:45min — DISMINUIR PESO
8. Biceps — Curl de Biceps con Barra W — 3×8 — RIR 2 — 1:45-2min
9. Triceps — Triceps en Polea alta barra plana — 2×`10 - 8` — RIR 2 — 1:45-2min — AUMENTAR PESO al finalizar cada serie
10. Triceps — Triceps con Soga en Polea Alta — 2×10x10x10 — RIR - — 2min — DISMINUIR PESO CADA 10

### Optional CARDIO HIIT (col P, "hacer cuando la planilla lo indique")
Sequence of interval pairs, e.g. `SALTO SOBRE STEP A 1 PIERNA` / `DESCANSO 25 SEG`;
`REPIQUETEO 15 SEG INTENSOS + 15 SEG SUAVES`; `BURPEES`; `SPRINT 10 SEG MAX + 10 SUAVES`;
`SOGA 50 SEG`. Pattern = N work/rest interval pairs appended after main session.

---

## Extracted patterns

### P1 — Low frequency ⇒ full-body, not PPL  ★ priority
All 3 days are **full-body** (legs + back/chest + shoulders + arms + abs each
session), with a rotating *emphasis* (D1 glute, D2 quad, D3 ham/glute). This is
the opposite of the current generator, whose split templates
([openai.service.ts:37-40](../../backend/src/services/openai.service.ts)) are
Push/Pull/Legs. **Rule to learn:** `days_per_week ≤ 3` → full-body each day with
rotating emphasis; `4-6` → split.

### P2 — Two warmup blocks, interleaved
Each day: warmup(1) → lower block → **warmup(2) articular** → upper block. The
current prompt clusters both calentamientos at the very start
([:33](../../backend/src/services/openai.service.ts)). Coach re-primes between
regions. The 2nd warmup is always "Movimiento Articular con/sin elástico".

### P3 — 3 heavy compound lifts/day
Day 1 has Hip Thrust + Jalón + Press Militar all at `3×6a8` RIR 1-2 across 3
distinct base groups. Current code hard-caps principals at 2 and rejects a 3rd
([:34, :168](../../backend/src/services/openai.service.ts)). Full-body days need 3.

### P4 — Rep-string IS a set-scheme  ★ priority
The `Reps` string is not just a number — it encodes set semantics that
deterministically set rest + comment:

| Rep string | Scheme | RIR | Descanso | Comentario |
|------------|--------|-----|----------|------------|
| `6 a 8` | effective compound | 2 | 2-3min | HACER SERIES DE APROXIMACIÓN |
| `8` / `8 a 10` | effective accessory | 1 | 1:45-2min | (none / technique cue) |
| `10x10x10` | drop set (carga/descarga) | - | 2min | DISMINUIR PESO CADA 10 REPES |
| `10 - 8 - 6` | ascending pyramid | 2 | ~2min | AUMENTAR PESO al finalizar cada serie |
| `8x6x4x6x8` | superserie carga/descarga | - | 2min | (no descanso intra-serie) |
| `30 seg + 10 cad` | core time+reps | - | 1min | technique cue |

This is already partly modeled: progression-helpers advances these exact strings
(`10x10x10→12x12x12`, `10-8-6→12-10-8`, `8x6x4x6x8→10x8x6x8x10`). But the
*generator* doesn't assign schemes by role, and rest/comment aren't derived.

### P5 — RIR per slot-role  ★ priority
Within one day RIR is not constant: **principal compound = RIR 2**, secondary
accessory = RIR 1, drop-set/superset/core/pyramid-finisher = RIR `-` (unmeasured).
Current periodization sets RIR per *block*, globally. Need per-role assignment.

### P6 — Rest scales with role
principal 2-3min → secondary 1:45-2min → drop-set 2min → core/warmup 1min.
Finer than the 2-tier `principal_descanso` / `accesorio_descanso`.

### P7 — Comentario is rule-derived
Every comment maps 1:1 from the set-scheme (see P4 table) or is a fixed technique
cue per exercise. Current `notes` is free text ([:56](../../backend/src/services/openai.service.ts)).
Could be generated deterministically from (role, scheme).

### P8 — Contextual warmups
Warmup 1 matches the day's first region (glute bridge before Hip Thrust day; leg
articular before squat day). Not a generic pull from "Calentamiento".

### P9 — Optional cardio HIIT finisher
Structured `N × (work interval / rest interval)`. No app concept yet.
The "+15-30 MIN" in the filename = this block's duration budget.

### P10 — Curated "Filtrados" pools
Coach selects exercises from 120 pre-built filtered columns, not a flat catalog.
Each pool ≈ a slot archetype (e.g. "glute accessory on cable", "core anti-rotation").
The app's flat catalog + `movement_pattern` filter is a coarser proxy.

## Open questions (resolve with more samples before codifying)
- Is "3 principals on full-body day" universal, or specific to 3-day? (need a
  4-5 day example to compare).
- Is the 2nd warmup always "Movimiento Articular", or region-specific?
- Does emphasis rotation (glute→quad→ham) follow a fixed weekly logic?
- Exact rest/RIR for each scheme across other blocks (this is only Semana 1 base).
