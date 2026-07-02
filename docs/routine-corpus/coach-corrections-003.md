# Coach corrections 003 — review of mujer-4d sample (2026-07-02)

Second written review from the coach (generated `mujer-4d` + general rules).
Authoritative, same as 001/002.

## C12 — Women 4 days = LEGS 3× PER WEEK ★ hard rule (revises W1b)

"Las rutinas de 4 días hacen piernas 3 veces por semana" (it's in the Excel
filenames). 4 días = **3 días de pierna + 1 día upper** — not 2+2.
- Leg days sit on the **alternating calendar pattern** of the athlete's
  `days_specific`; the remaining (consecutive) day is the upper day:
  - lun-mar-mié-vie → pierna lun/mié/vie, upper mar
  - lun-mié-jue-vie → pierna lun/mié/vie, upper jue
  - mar-mié-jue-sáb → pierna mar/jue/sáb, upper mié
  - mar-jue-vie-sáb → pierna mar/jue/sáb, upper vie
- Codified: `buildSplitGuidance` female `leg_days = days<=3 ? days : 3`,
  split text rewritten; prompt DÍAS CONSECUTIVOS section extended with the
  mapping; MUJER_4D few-shot example rebuilt on mujer/005's 3-leg shape.

## C13 — Exercise-level preferences

- **Tríceps**: pirámide `10 - 8 - 6` → con **barra plana corta** en polea;
  descarga `10x10x10` → con **soga** en polea alta.
- **Descarga de remo**: agarre **triángulo** (cerrado neutro) o neutro
  abierto; NUNCA con soga (incómodo para descargar rápido).
- **No repetir estímulo** en el día: curl femoral acostado + curl femoral
  sentado = mismo estímulo 2×; reemplazar el segundo por **Aductores** si no
  se hicieron en la semana (generaliza C5 sentadilla+prensa).
- **Vuelos laterales** van después del press inclinado en un día push.
- **Bíceps** (refuerza C7): barra primero, martillo segundo, finisher
  opcional `10x10x10` en bíceps máquina si el presupuesto de series da.
- **Abdomen por nivel**: "Elevaciones de Pierna Colgado es de avanzados" —
  priorizar Giro Ruso / Rueda / planchas para no-avanzados. Migration 049
  sube su `level_min` a `avanzado` (estaba `principiante`), así el filtro de
  catálogo lo excluye solo.

## C14 — Weekly programming checklist ★ hard rule (extends C9)

"Usar cierto filtro para que la IA detecte que no falte programar":
**1) PIERNAS 2) PECHO 3) ESPALDA 4) HOMBROS 5) BÍCEPS 6) TRÍCEPS 7) ABDOMEN.**
Validator now rejects any ≥60-min week missing one of the seven (was only
Triceps+Hombros from C9). Prompt lists the checklist verbatim.

## Positive signals from this review

- Push day (D2): "Excelente distribución. La IA hizo un excelente trabajo
  imitando la rutina base que envié" — few-shot injection working as intended.
- Sentadilla→Búlgara unilateral pattern (C5) validated as "excelente".
