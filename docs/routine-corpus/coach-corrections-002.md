# Coach corrections 002 — series-per-time budget (C11 resolved, 2026-07-02)

Follow-up WhatsApp exchange resolving C11 from
[coach-corrections-001.md](coach-corrections-001.md).

## The coach's model

- **"La serie es lo que define el tiempo, más que el ejercicio."** Session
  length is budgeted in SERIES, not exercises/slots.
- One serie (execution + rest + transition) takes **4.5-6 minutes** in a real
  gym (waiting for machines, longer rests, heavy loads).
- **Hard ceiling: 20 series TOTALES per training day**, always.
- Warmups count in the budget (1 serie each — see C1). Coach's own 60-min
  example: 1 calentamiento + 3 principales×3 + 1 finisher×2 ≈ 12 series.
- For 60 min he explicitly recommends a **strict 12-14 total**, "mucho más
  conservador que la teoría pura" — routines the athlete can actually finish.

## Confirmed table (series TOTALES per session, warmups included)

| exercise_minutes | Series range |
|------------------|--------------|
| 30 | 5-6 |
| 45 | 7-10 |
| 60 | **10-14** |
| 75 | 12-17 |
| 90 | 15-20 |
| 105-120 | 17-20 (capped) |

## Codified

- `seriesRangeFor(minutes)` in `openai.service.ts` replaces the old
  slot-count budget (`slotRangeFor`); the **slot-count validator was removed**
  and replaced by a total-series-per-day validator (warmups = 1 serie each).
- SYSTEM_PROMPT rewritten: series budget table + the coach's 60-min example;
  constraints payload sends `series_per_day` instead of `slots_per_day`;
  `accessory_per_day_min` lowered (3 at ≥60min).
- All 9 corpus few-shot examples re-budgeted to 12-14 series/day (they carried
  the raw-Excel ~16-20 volume, now obsolete per this correction). Weekly
  Triceps+Hombros coverage kept in every example.
- Note: this supersedes the corpus observation "gym body is ~constant 8-10
  slots" (mujer/005, M7 note) — the coach's new realistic-pace model wins.
