# Women routine logic — consolidated

Source: samples 001-005 (all mujer, hipertrofia, 60min gym, gym_completo,
BLOQUE 1 SEMANA 1 HIPERTROFIA BASE). This is the **gender-specific** layer.
Gender-neutral mechanics (set-schemes, RIR/rest/comentario rules) live in
[../shared-mechanics.md](../shared-mechanics.md).

## W1 — Split selection by frequency (CONFIRMED, 5 samples)

| days/week | Structure | Lower days | Upper days |
|-----------|-----------|-----------|-----------|
| 2-3 | **Full-body** each day, rotating lower emphasis | every day (rotates glute/quad/ham) | every day |
| 4 | **Lower-biased split** | 2-3 (glute-ham + quad) | 1-2 (push, pull) |
| 5 | **Lower-biased split** | 3 (quad / glute / ham) | 2 (push, pull) |

- **Never PPL.** Women plans are **lower-body biased**: glutes & hamstrings are
  the priority, trained on ~half-or-more of the week.
- **Emphasis rotates by lower sub-region**: Cuádriceps / Glúteos / Femorales.
  Each gets its own focus day (4-5 days) or its own full-body day (3 days).
- The **exact day-pairing varies** between plans (003 ≠ 005). Do NOT hardcode a
  template. Generate: pick lower-day count by frequency (table above), assign one
  lower sub-region emphasis per lower day, fill remaining days with push / pull,
  distribute shoulders & arms across days (no pure arm day).

## W2 — Day construction

Each day = `[warmup] → block A → ([warmup2] → block B) → [core]`.

1. **Open with a heavy compound** for the day's emphasis muscle: Hip Thrust
   (glute), Sentadilla (quad), Peso Muerto/PM Smith (ham), Press Plano (chest),
   Press Militar (shoulder), Jalón al Pecho (back). Always `3×6a8` RIR 2,
   "HACER SERIES DE APROXIMACIÓN". This is the **principal**.
2. **1-3 principals per day** (range, P3): a full-body or 2-region day has 2-3;
   a tight single-region day has 1. A strength-leaning 2nd principal can be
   straight `3×6` RIR 2 (RDL/PM).
3. **Descend through the block** (N2): principal RIR 2 → secondary compound
   RIR 2/1 → isolation RIR 1 → metabolic finisher (`10x10x10` drop) RIR `-`.
4. **Warmups (P2)**: warmup count = number of lower↔upper transitions in the day
   + 1. Warmup 1 = region articular ("Movimientos Articulares Piernas") or a
   light version of the day's main lift (light Jalón before Jalón). Warmup 2
   (when the day crosses into the upper block) = "Movimiento Articular con/sin
   elástico".
5. **Core/abs** closes most days (1-3 abs slots): Giro Ruso, Rueda, Plancha
   Lateral. A dedicated glute day may stack 3 abs slots (N10).

## W3 — Lower-body vocabulary (women-specific exercise pools)
Glúteos: Hip Thrust (the staple principal), Patada Glúteos en polea, Step Up.
Femorales: Peso Muerto / PM Smith / RDL Mancuernas, Curl Femoral Acostado.
Cuádriceps: Sentadilla Barra, Búlgara, Extensión, Hack, Prensa.
Add/Abd: Aductores / Abductores en Máquina (often the `10x10x10` finisher).
Pantorrillas: Pantorrillas Máquina (`10x10x10`).

## W4 — Volume shape (60min gym, hypertrophy base)
- ~8-10 working slots/day (warmups included), **stable regardless of the
  cardio-time label** (005 correction).
- Series: principals 3, secondaries 2-3, finishers 1-2.
- Optional CARDIO HIIT finisher after the lifting session; its length is what the
  filename's "15-30 MIN" / "30MIN" refers to (P9).

## Still gender-uncertain (resolve when men samples arrive)
- Is the lower-body bias women-only, or just this coach? (men plans should show
  whether the bias flips to upper/push or balances out).
- Is Hip-Thrust-as-primary women-specific?
- Does the split pairing logic differ by gender?
