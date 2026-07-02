# Coach corrections 001 — review of AI-generated samples (2026-07-02)

Direct written feedback from the coach after reviewing the generated samples in
`docs/routine-samples/` (mainly `mujer-3d`). **This is authoritative coach
instruction, not an inferred pattern — no ≥2-sample gate needed.** Where it
contradicts older corpus samples, the corrections win (the coach updated his
own methodology: "con la nueva actualización de los videos").

## C1 — Warmups: always 1 SERIE (updates M5)

"Ya NO es necesario dar 2 SERIES de calentamiento. Siempre dar 1 serie."
- Number of warmup *slots* per day (interleaved, transitions+1) stays as M5.
- The warmup *prescription* changes: 1×10 (was 2×10).
- Enforced in `engine.service.ts buildWarmupItem` (series 2 → 1).

## C2 — Warmup selection by block (refines P8)

- Any leg work in the day → warmup 1 is **"Movimientos Articulares completos
  Piernas"**, SIEMPRE.
- Hombros/pecho block → **"Movimiento Articular completo con y sin elástico"**.
- Espalda block → activation with light Jalón/Remo is correct.
- Glúteos day → "Elevación de Cadera" (pies en cajón = harder variant, OK).

## C3 — Drop-set (10x10x10) whitelist ★ hard rule

A descarga needs quick weight changes → only machines/cables. Coach list:
Extensión de Cuádriceps sentado en máquina; Femorales acostado en máquina;
Pantorrillas parado en máquina / en Smith; Remo en máquina sentado (todos los
agarres); Vuelos laterales con mancuerna (depende del caso); Vuelos laterales
en polea; Vuelos frontales con soga en polea; Bíceps en máquina sentado;
Tríceps con soga en polea alta; Patada de glúteos en polea media alta;
Abductores en máquina sentado; Pecho en máquina Mariposa; Apertura pectoral en
polea media alta; Cruces en polea alta/baja.

**NEVER**: Prensa ("imposible hacer una descarga en una prensa"), Step Up,
free-weight compounds.
→ Enforced as validator: `10x10x10` only on equipment `maquina|polea|smith`.

## C4 — Drop-set placement & volume ★ hard rule

- Only as **finisher** of a muscle block (end of that muscle's work).
- **Max 2 descargas per training day.** Allowed as 2 consecutive slots
  (cuádriceps máquina → pantorrillas), but then no more that day.
- Each descarga: **max 2 series**.

## C5 — Block construction pattern (refines W2/N2)

Per muscle block: 1º principal (levantar según programa) → 2º ejercicio
**preferentemente unilateral** (búlgaras si no hay lesión) → 3º descarga /
finisher. Avoid redundant stimuli in the same day (Sentadilla + Prensa = same
stimulus, wrong).

## C6 — Principal validity ★ hard rule

Role `principal` only for true program lifts (catalog `is_principal = true`):
- "Peso Muerto Rumano con Mancuernas NO ES UN EJERCICIO PRINCIPAL" → the ham
  principal is Peso Muerto con barra (if no injury).
- "Remo en Polea Baja agarre neutro NO ES UN PRINCIPAL."
- Only **1 espalda principal per week**; the second espalda block opens with
  Jalón al Pecho agarre cerrado as heavy accessory.

## C7 — Exercise preferences

- Aperturas planas con mancuernas: weak — prefer **poleas o máquina mariposa**.
- Pullover con mancuerna: weak for hypertrophy loading.
- Bíceps: **always start with barra** (Scott/W/recta), martillo after (braquial).
- Rowing cue: "movimiento de la mancuerna hacia el bolsillo".
- Hombro finishers: deltoides en máquina mariposa / Face Pull are good variants.

## C8 — Abdomen: 3 series SIEMPRE; mix stimulus

Every abs exercise = **3 series** (was 2 in prompt). Don't make all abs
isométrico — include at least one weighted/dynamic abs exercise in the day.

## C9 — Weekly coverage ★ hard rule

"Error grave: no se ha trabajado TRÍCEPS, DELTOIDES." A week must include
tríceps and deltoides (hombros) work. → validator: Triceps + Hombros present
across the week (60-min plans).

## C10 — Consecutive training days

3-day full-body assumes non-consecutive days (Lu-Mi-Vi and variants). If the
athlete trains 2+ consecutive days, the same-emphasis repetition is wrong →
use `days_specific` when available: avoid repeating emphasis on adjacent days.

## C11 — Time budget formula (deferred)

"Predefinir: X series + X ejercicios = tiempo de entrenamiento." Formalize the
slot-count/series-count → session-duration mapping (today approximated by
`slotRangeFor`). Needs the coach's exact formula — ask before codifying.

## Codification status

| Rule | Where | Status |
|------|-------|--------|
| C1 warmup 1 serie | engine.service buildWarmupItem | ✅ applied |
| C2 warmup selection | SYSTEM_PROMPT | ✅ applied |
| C3 drop-set whitelist | validator (equipment) + prompt (coach list) | ✅ applied |
| C4 ≤2 descargas/day, ≤2 series | validator + normalization + prompt | ✅ applied |
| C5 block pattern | SYSTEM_PROMPT | ✅ applied |
| C6 principal validity | validator (is_principal) + prompt (1 espalda ppal/week) | ✅ applied |
| C7 exercise preferences | SYSTEM_PROMPT | ✅ applied |
| C8 abs 3 series + mix | normalization + prompt | ✅ applied |
| C9 weekly triceps/deltoides | validator | ✅ applied |
| C10 consecutive days | payload days_specific + prompt | ✅ applied |
| C11 time formula | seriesRangeFor + validator (see [coach-corrections-002](coach-corrections-002.md)) | ✅ applied |
