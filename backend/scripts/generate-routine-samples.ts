// Generate sample routines across the profile matrix so the coach can review
// what the AI produces, without touching the app. Writes one markdown file per
// profile under docs/routine-samples/ plus an index.
//
// Usage (from backend/):
//   npx tsx scripts/generate-routine-samples.ts            # full matrix
//   npx tsx scripts/generate-routine-samples.ts --only mujer-4d,hombre-3d-1p
//
// Requires: dev postgres up (docker compose up -d postgres) + OPENAI_API_KEY.
// Cost: 1-5 OpenAI calls per profile (retries on validator rejections).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pool from '../src/db/connect.js';
import { generateRoutine } from '../src/services/routine-generation.service.js';
import { listExercisesForAthlete } from '../src/services/exercise.service.js';
import type { AthleteProfile, Exercise } from '../src/domain/types.js';
import type { AiSkeletonOutput } from '../src/domain/schemas.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../../docs/routine-samples');

interface SampleSpec {
  key: string;
  label: string;
  profile: AthleteProfile;
}

const baseProfile: Omit<
  AthleteProfile,
  'gender' | 'days_per_week' | 'leg_days'
> = {
  user_id: 'sample', name: 'Sample', age: 30, height_cm: 172, weight_kg: 72,
  level: 'medio', goal: 'hipertrofia', equipment: 'gym_completo',
  injuries: [], coach_id: null, onboarded_at: new Date().toISOString(),
  phone: null, plan_interest: null, training_mode: 'gym',
  commitment: 'normal', exercise_minutes: 60, days_specific: null,
  referral_source: null, sport_focus: null,
};

const spec = (
  key: string,
  label: string,
  over: Partial<AthleteProfile> &
    Pick<AthleteProfile, 'gender' | 'days_per_week' | 'leg_days'>,
): SampleSpec => ({ key, label, profile: { ...baseProfile, ...over } });

const SPECS: SampleSpec[] = [
  // Women — corpus combos
  spec('mujer-3d', 'Mujer · 3 días · 60min', {
    gender: 'female', days_per_week: 3, leg_days: null,
  }),
  spec('mujer-4d', 'Mujer · 4 días · 60min', {
    gender: 'female', days_per_week: 4, leg_days: null,
  }),
  spec('mujer-5d', 'Mujer · 5 días · 60min', {
    gender: 'female', days_per_week: 5, leg_days: null,
  }),
  // Men — corpus combos (days × leg days)
  spec('hombre-3d-1p', 'Hombre · 3 días · 1 pierna · 60min', {
    gender: 'male', days_per_week: 3, leg_days: 1,
  }),
  spec('hombre-3d-2p', 'Hombre · 3 días · 2 piernas · 60min', {
    gender: 'male', days_per_week: 3, leg_days: 2,
  }),
  spec('hombre-4d-1p', 'Hombre · 4 días · 1 pierna · 60min', {
    gender: 'male', days_per_week: 4, leg_days: 1,
  }),
  spec('hombre-4d-2p', 'Hombre · 4 días · 2 piernas · 60min', {
    gender: 'male', days_per_week: 4, leg_days: 2,
  }),
  spec('hombre-5d-1p', 'Hombre · 5 días · 1 pierna · 60min', {
    gender: 'male', days_per_week: 5, leg_days: 1,
  }),
  spec('hombre-5d-2p', 'Hombre · 5 días · 2 piernas · 60min', {
    gender: 'male', days_per_week: 5, leg_days: 2,
  }),
  // Variations — personalization sanity checks
  spec('mujer-4d-principiante', 'Mujer · 4 días · nivel bajo (principiante)', {
    gender: 'female', days_per_week: 4, leg_days: null, level: 'bajo',
  }),
  spec('hombre-4d-1p-rodilla', 'Hombre · 4 días · 1 pierna · lesión rodilla', {
    gender: 'male', days_per_week: 4, leg_days: 1, injuries: ['rodilla'],
  }),
  spec('mujer-3d-45min', 'Mujer · 3 días · 45min', {
    gender: 'female', days_per_week: 3, leg_days: null, exercise_minutes: 45,
  }),
];

function renderDay(
  dayIndex: number,
  day: AiSkeletonOutput['days'][number],
  byId: Map<number, Exercise>,
): string {
  const lines: string[] = [];
  lines.push(`### Día ${dayIndex} — ${day.focus}`);
  lines.push('');
  lines.push('| # | Rol | Grupo | Ejercicio | Series | Reps | Descanso | Comentario |');
  lines.push('|---|-----|-------|-----------|--------|------|----------|------------|');
  for (const s of day.slots) {
    const ex = byId.get(s.exercise_id);
    const name = ex?.name ?? `id ${s.exercise_id}`;
    const mg = ex?.muscle_group ?? '?';
    const isAcc = s.role === 'accesorio';
    lines.push(
      `| ${s.slot_index} | ${s.role} | ${mg} | ${name} | ` +
        `${isAcc ? s.series ?? '-' : '·'} | ${isAcc ? s.reps ?? '-' : '·'} | ` +
        `${isAcc ? s.descanso ?? '-' : '·'} | ${s.notes ?? ''} |`,
    );
  }
  lines.push('');
  return lines.join('\n');
}

function renderSample(
  s: SampleSpec,
  out: AiSkeletonOutput,
  exercises: Exercise[],
  attemptsNote: string,
): string {
  const byId = new Map(exercises.map((e) => [e.id, e]));
  const p = s.profile;
  const lines: string[] = [];
  lines.push(`# ${s.label}`);
  lines.push('');
  lines.push(
    `- **Perfil**: ${p.gender === 'female' ? 'mujer' : 'hombre'}, ` +
      `${p.age} años, nivel ${p.level}, objetivo ${p.goal}, ` +
      `${p.days_per_week} días/semana` +
      (p.gender === 'male' ? `, ${p.leg_days ?? 1} día(s) de pierna` : '') +
      `, ${p.exercise_minutes} min` +
      (p.injuries.length ? `, lesiones: ${p.injuries.join(', ')}` : '') +
      '.',
  );
  lines.push(`- **Generado**: ${new Date().toISOString().slice(0, 16)} · ${attemptsNote}`);
  lines.push(`- **Rationale**: ${out.rationale}`);
  lines.push('');
  lines.push(
    '> En principales (·) las series/reps/descanso las fija la periodización de 30 semanas; acá se muestra sólo la prescripción por accesorio, igual que en la app.',
  );
  lines.push('');
  out.days.forEach((d, i) => lines.push(renderDay(i + 1, d, byId)));
  return lines.join('\n');
}

async function main() {
  const onlyArg = process.argv.indexOf('--only');
  const only =
    onlyArg >= 0 ? new Set(process.argv[onlyArg + 1]!.split(',')) : null;
  const specs = only ? SPECS.filter((s) => only.has(s.key)) : SPECS;
  if (specs.length === 0) {
    console.error('No specs matched --only filter');
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const indexRows: string[] = [];

  for (const s of specs) {
    process.stdout.write(`Generating ${s.key} ... `);
    const exercises = await listExercisesForAthlete(s.profile);
    const t0 = Date.now();
    try {
      const gen = await generateRoutine({ profile: s.profile, exercises });
      const secs = ((Date.now() - t0) / 1000).toFixed(1);
      const genNote =
        gen.source === 'template'
          ? `plantilla literal del coach (${gen.templateSource}) · sin IA · ${secs}s`
          : `plantilla ${gen.templateSource} + ajuste IA (${process.env.OPENAI_MODEL ?? '?'}) · motivos: ${gen.reasons.length} · ${secs}s`;
      const md = renderSample(s, gen.skeleton, exercises, genNote);
      fs.writeFileSync(path.join(OUT_DIR, `${s.key}.md`), md);
      indexRows.push(
        `| [${s.label}](${s.key}.md) | ✅ ${gen.source === 'template' ? 'plantilla' : 'plantilla+IA'} | ${secs}s |`,
      );
      console.log(`ok (${gen.source}, ${secs}s)`);
    } catch (e) {
      const secs = ((Date.now() - t0) / 1000).toFixed(1);
      indexRows.push(`| ${s.label} | ❌ ${(e as Error).message} | ${secs}s |`);
      console.log(`FAILED: ${(e as Error).message}`);
    }
  }

  // A partial --only run must not clobber the full index.
  if (only) {
    console.log(`\nWrote ${specs.length} files to ${OUT_DIR} (index untouched — partial run)`);
    await pool.end();
    return;
  }

  const index = [
    '# Muestras de rutinas generadas por IA — para revisión del coach',
    '',
    `Generado el ${new Date().toISOString().slice(0, 10)} con el modelo ` +
      `\`${process.env.OPENAI_MODEL ?? '?'}\` y el catálogo real de ejercicios. ` +
      'Cada archivo es una rutina completa tal como la generaría la app para ese perfil ' +
      '(antes de la revisión del coach en la cola de pendientes).',
    '',
    'Regenerar: `cd backend && npx tsx scripts/generate-routine-samples.ts`',
    '',
    '| Perfil | Estado | Tiempo |',
    '|--------|--------|--------|',
    ...indexRows,
    '',
  ].join('\n');
  fs.writeFileSync(path.join(OUT_DIR, 'README.md'), index);
  console.log(`\nWrote ${specs.length + 1} files to ${OUT_DIR}`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
