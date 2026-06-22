# Men routine logic — consolidated

Source: samples 001-006 (all hombre, hipertrofia, 60min gym, gym_completo,
BLOQUE 1 SEMANA 1). Gender-specific layer. Gender-neutral mechanics →
[../shared-mechanics.md](../shared-mechanics.md).

## H0 — Leg-day count is a USER CHOICE (the big one)

Men plans ship in **two variants per frequency**: "1 día pierna" and "2 días
piernas". The athlete picks how many leg days. Women had **no** such choice
(always lower-biased automatically).

→ **Product gap**: the app has no `leg_days` / leg-frequency preference input for
men. The generator must take it. Women don't need it (bias is implicit).

## H1 — Split selection by (frequency × leg-day choice)

| days | legs | Split | Bias |
|------|------|-------|------|
| 3 | 1 | **PPL** — Push / Legs / Pull | upper (2up/1leg) |
| 3 | 2 | Quad+Back / Push+Arms / Ham+Shoulders | lower-priority |
| 4 | 1 | Push / Pull / Legs / Shoulders+UpperChest | upper (3up/1leg) |
| 4 | 2 | Quads / Push / Pull / Hams | balanced (2/2) |
| 5 | 1 | Push / Pull / Legs / Shoulders+Chest / Pull+Arms | upper-dominant (4up/1leg) |
| 5 | 2 | Quads / Push / Pull / Hams / Push2 | 3up/2leg |

- **Men default to UPPER-biased** — the mirror of women's lower-bias. With 1 leg
  day, the extra days go to push (chest/delts) and pull (back/arms).
- **3-day/1-leg is true PPL** — the only PPL in the entire corpus. (Women never PPL.)
- **2 leg days always split quad-day + ham-day** (same sub-region split as women).
  1 leg day = one full-leg session (quad + ham + calf).
- Day-pairing for the non-leg days is **not fixed** (push/pull/shoulder ordering
  varies) → codify the bias + leg-day rule, not a literal template (same caution
  as women W1c).

## H2 — Muscle emphasis / vocabulary
- **Principals open each day** with `3×6a8` RIR 2 + "APROXIMACIÓN": Press Plano
  con Barra (push), Press Militar (shoulders/push), Remo con Barra / Jalón (pull),
  Sentadilla (quad), Peso Muerto con Barra (ham).
- **No Hip Thrust.** Glute work is absent as a principal — men's leg day is
  squat/deadlift-centric (quad + ham), not glute-centric. This is the sharpest
  exercise-level gender difference.
- Emphasis muscles: **chest, delts, back, arms** get the volume; legs are 1-2 days.
- New: **Antebrazos** (forearms) appear as a slot (`2×fallo`), absent in women.

## H3 — Day construction (same engine as women)
Identical to women's W2: warmup(s) → principal `6a8` RIR2 → descending RIR ladder
→ finisher `10x10x10` RIR- → core. 1-3 principals/day. 2 warmups when the day
crosses lower↔upper (leg+arm days). 9-10 slots/day, stable.

## H4 — Cardio
1-leg-day variants embed **steady-state cardio as an in-session slot on the leg
day** ("Bicicleta Fija 15min, CONSTANTE NO SUAVE NO INTENSO"), distinct from
women's HIIT finisher column. 2-leg variants drop it (legs cover the volume).

## Men vs Women — the contrast in one line
Women = lower-biased, glute/ham priority (Hip Thrust staple), no leg-day choice.
Men = upper-biased default, chest/delt/back priority (squat/deadlift legs, no Hip
Thrust), leg-day count is a user choice (1 or 2). Shared mechanics M1-M7 identical.
