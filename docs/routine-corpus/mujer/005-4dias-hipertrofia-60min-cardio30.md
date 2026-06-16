# 005 — 4-day women, hypertrophy, 60min gym (+30min cardio)

- **Source**: `APP RUTINA 4 DIAS MUJER (LUN-MIE-JUE-VIE / LUN-JUE-VIE-SAB / MAR-JUE-VIE-SAB) 1 HS 30MIN.xlsx`
- **Profile**: mujer, hipertrofia, **4 days**, 60min gym, gym_completo.
- **Purpose**: test whether "1 HS 30MIN" means a longer/denser session.

## KEY CORRECTION — filename time = gym + cardio finisher

This "1 HS 30MIN" file runs the **same ~8-9 slots/day** as the 60min "15-30 MIN"
files — NOT denser. So the filename time encodes **1 HS gym + a cardio finisher
of 15-30 / 30 min**, not the gym-session length. The gym body is a **stable
~8-10 slots regardless of the time label**.

→ **Revises N1**: slot count is NOT primarily duration-driven in this coach's
system. The session body is ~constant; the variable budget is the CARDIO HIIT
block (P9). This conflicts with the app generator, which scales slot count off
`exercise_minutes` (30→5, 60→8-9, 90→10-11). The coach instead holds the lifting
session ~constant and varies cardio. **Open question — resolve before changing
the generator's slot-count-by-minutes rule.**

## The 4-day split decoded (differs from 003!)

| Day | Emphasis | Block |
|-----|----------|-------|
| D1 | **Glutes/Hams** + Back | Hip Thrust 6a8 / PM Smith 6 / + Jalón 6a8 |
| D2 | **Quads** + Biceps | Sentadilla 6a8 + calves + curls |
| D3 | **Chest** + Shoulders + Triceps (push) | Press Plano 6a8 / Press Militar 6a8 |
| D4 | **Glutes/Hams** + Back | Hip Thrust 6a8 / PM Smith 6 / + Jalón 6a8 |

- 003's 4-day was D1 Quad+Shoulder / D2 Chest+Arms / D3 Back+Shoulder / D4
  Glute/Ham+Biceps. **005's is different** (glute/ham hit on D1+D4, quad on D2).
- **Invariant ≠ the exact pairing.** What's stable: lower-biased (3 of 4 days
  touch legs), glutes/hams prioritized (2 days), every block opens with a `6a8`
  RIR 2 compound, pull (Jalón) ridden into lower days. **Do NOT hardcode a fixed
  pairing** — generate a lower-biased split with rotating emphasis instead.

## Gate results
- **P1 confirmed**, and **split pairing is variable** (003 vs 005) → codify the
  *bias rule*, not a fixed template.
- **P2-P8 confirmed** identically.
- **N6 confirmed**: straight `6` for the PM/RDL strength-leaning second principal
  (now 003 + 005).
