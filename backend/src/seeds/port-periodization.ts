import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface PrincipalCfg {
  series: number;
  reps: string;
  descanso: string;
  pct?: number;
  rmSource?: 10 | 20 | 30;
  useCasilleros?: boolean;
  isRmTest?: boolean;
  isDeload?: boolean;
}

// Direct port of Apps Script obtenerConfiguracionSemana()
const principal: Record<number, PrincipalCfg> = {
  1:  { series: 3, reps: '6 a 8',  descanso: '2 a 3 min', pct: 0.75, rmSource: 30 },
  2:  { series: 3, reps: '6 a 8',  descanso: '2 a 3 min', pct: 0.75, rmSource: 30 },
  3:  { series: 3, reps: '6 a 8',  descanso: '2 a 3 min', useCasilleros: true },
  4:  { series: 3, reps: '6 a 8',  descanso: '2 a 3 min', useCasilleros: true },
  5:  { series: 3, reps: '6 a 8',  descanso: '2 a 3 min', useCasilleros: true },
  6:  { series: 3, reps: '6 a 8',  descanso: '2 a 3 min', useCasilleros: true },
  7:  { series: 3, reps: '4 a 6',  descanso: '2 a 3 min', useCasilleros: true },
  8:  { series: 3, reps: '3',      descanso: '3 min',     useCasilleros: true },
  9:  { series: 1, reps: '5',      descanso: '2 a 3 min', pct: 0.8,  rmSource: 10, isDeload: true },
  10: { series: 1, reps: '1',      descanso: '3 a 5 min', isRmTest: true },
  11: { series: 3, reps: '8 a 10', descanso: '2 a 3 min', pct: 0.72, rmSource: 10 },
  12: { series: 3, reps: '8',      descanso: '2 a 3 min', pct: 0.75, rmSource: 10 },
  13: { series: 3, reps: '6 a 8',  descanso: '2 a 3 min', pct: 0.65, rmSource: 10 },
  14: { series: 3, reps: '5',      descanso: '2 a 3 min', pct: 0.77, rmSource: 10 },
  15: { series: 4, reps: '4',      descanso: '2 a 3 min', pct: 0.80, rmSource: 10 },
  16: { series: 4, reps: '3',      descanso: '3 min',     pct: 0.82, rmSource: 10 },
  17: { series: 3, reps: '3',      descanso: '3 min',     pct: 0.85, rmSource: 10 },
  18: { series: 1, reps: '6 a 8',  descanso: '2 a 3 min', pct: 0.6,  rmSource: 10, isDeload: true },
  19: { series: 3, reps: '3',      descanso: '3 min',     pct: 0.88, rmSource: 10 },
  20: { series: 1, reps: '1',      descanso: '3 a 5 min', isRmTest: true },
  21: { series: 3, reps: '6',      descanso: '2 a 3 min', pct: 0.75, rmSource: 20 },
  22: { series: 3, reps: '6',      descanso: '2 a 3 min', pct: 0.77, rmSource: 20 },
  23: { series: 3, reps: '6 a 8',  descanso: '2 a 3 min', pct: 0.70, rmSource: 20 },
  24: { series: 3, reps: '6',      descanso: '2 a 3 min', pct: 0.78, rmSource: 20 },
  25: { series: 3, reps: '4',      descanso: '3 min',     pct: 0.80, rmSource: 20 },
  26: { series: 3, reps: '3',      descanso: '3 min',     pct: 0.83, rmSource: 20 },
  27: { series: 1, reps: '6 a 8',  descanso: '2 a 3 min', pct: 0.6,  rmSource: 20, isDeload: true },
  28: { series: 3, reps: '6 a 8',  descanso: '2 a 3 min', pct: 0.75, rmSource: 20 },
  29: { series: 2, reps: '3',      descanso: '3 a 5 min', pct: 0.72, rmSource: 20, isDeload: true },
  30: { series: 1, reps: '1',      descanso: '3 a 5 min', isRmTest: true },
};

// Apps Script obtenerDescripcionSemana()
const labels: Record<number, string> = {
  1: 'HIPERTROFIA BASE', 2: 'HIPERTROFIA BASE',
  3: 'HIPERTROFIA', 4: 'HIPERTROFIA', 5: 'HIPERTROFIA', 6: 'HIPERTROFIA',
  7: 'FUERZA SUBMÁXIMA', 8: 'FUERZA MÁXIMA',
  9: 'DESCARGA', 10: 'TESTEO RM',
  11: 'HIPERTROFIA', 12: 'HIPERTROFIA',
  13: 'TPO. BAJO TENSIÓN (BAJAR EN 2 SEG, MANTENER 1 SEG, SUBIR EN 1 SEG.)',
  14: 'FUERZA BASE', 15: 'FUERZA',
  16: 'FUERZA MÁXIMA', 17: 'FUERZA MÁXIMA',
  18: 'DESCARGA',
  19: 'FUERZA MÁXIMA', 20: 'TESTEO RM',
  21: 'HIPERTROFIA', 22: 'HIPERTROFIA',
  23: 'TPO. BAJO TENSIÓN (BAJAR EN 2 SEG, MANTENER 1 SEG, SUBIR EN 1 SEG.)',
  24: 'FUERZA BASE', 25: 'FUERZA',
  26: 'FUERZA MÁXIMA',
  27: 'DESCARGA',
  28: 'HIPERTROFIA',
  29: 'DESCARGA - PRE RM',
  30: 'TESTEO RM',
};

// Accesorio defaults (rough — accesorios use bumpeo by casilleros, see progression-helpers)
function accesorioFor(week: number): { series: number; reps: string; descanso: string } {
  const cfg = principal[week];
  if (cfg.isRmTest) return { series: 3, reps: '10 a 12', descanso: '60 a 90 seg' };
  if (cfg.isDeload) return { series: 2, reps: '12', descanso: '60 seg' };
  // Hipertrofia bias by default for accesorios
  return { series: 3, reps: '10 a 12', descanso: '60 a 90 seg' };
}

function rowFor(week: number): string {
  const p = principal[week];
  const a = accesorioFor(week);
  const notes =
    week === 13 || week === 23
      ? 'TIEMPO BAJO TENSIÓN 2-1-1'
      : null;
  const pct = p.pct ?? null;
  const rmSrc = p.rmSource ?? null;
  return `INSERT INTO periodization_config (
    week_number, block_label, is_rm_test, is_deload,
    principal_series, principal_reps, principal_descanso,
    principal_pct_rm, principal_rm_source, principal_use_casilleros,
    accesorio_series, accesorio_reps, accesorio_descanso, notes
  ) VALUES (
    ${week}, '${labels[week].replace(/'/g, "''")}',
    ${p.isRmTest ?? false}, ${p.isDeload ?? false},
    ${p.series}, '${p.reps}', '${p.descanso}',
    ${pct === null ? 'NULL' : pct},
    ${rmSrc === null ? 'NULL' : rmSrc},
    ${p.useCasilleros ?? false},
    ${a.series}, '${a.reps}', '${a.descanso}',
    ${notes === null ? 'NULL' : `'${notes.replace(/'/g, "''")}'`}
  ) ON CONFLICT (week_number) DO NOTHING;`;
}

function main() {
  const lines = [
    '-- Auto-generated from src/seeds/port-periodization.ts',
    '-- Source of truth: Google Apps Script obtenerConfiguracionSemana()',
    '',
  ];
  for (let w = 1; w <= 30; w++) lines.push(rowFor(w));
  const out = path.join(__dirname, 'periodization_config.sql');
  fs.writeFileSync(out, lines.join('\n') + '\n');
  console.log(`Wrote 30 weeks to ${out}`);
}

main();
