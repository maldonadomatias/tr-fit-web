import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  overrides, MUSCLE_GROUP_DEFAULTS, PRINCIPAL_NAMES,
  type Equipment, type Override,
} from './exercise-overrides.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface RawEntry { 'Grupo Muscular': string; Ejercicios: string }

function inferEquipment(name: string): Equipment {
  const n = name.toLowerCase();
  if (n.includes('smith')) return 'smith';
  if (n.includes('polea') || n.includes('soga')) return 'polea';
  if (n.includes('mancuerna')) return 'mancuerna';
  if (n.includes('pesa rusa')) return 'pesa_rusa';
  if (n.includes('elastico')) return 'elastico';
  if (n.includes('disco')) return 'disco';
  if (n.includes('barra')) return 'barra';
  if (n.includes('maquina') || n.includes('máquina') ||
      n.includes('mariposa') || n.includes('prensa') ||
      n.includes('extension cuadriceps') || n.includes('curl femoral')) {
    return 'maquina';
  }
  if (n.includes('flexion') || n.includes('fondos') ||
      n.includes('dominadas') || n.includes('plancha')) {
    return 'bw';
  }
  return 'mancuerna'; // safe default; will be flagged in review
}

function escapeSqlString(s: string): string {
  return s.replace(/'/g, "''");
}

function arrayToSqlText(arr: string[]): string {
  if (arr.length === 0) return "'{}'";
  return `ARRAY[${arr.map((s) => `'${escapeSqlString(s)}'`).join(',')}]::TEXT[]`;
}

function buildRow(name: string, muscleGroup: string): string {
  const ovr: Override = overrides[name] || {};
  const equipment = ovr.equipment ?? inferEquipment(name);
  const pattern = ovr.movement_pattern ??
    MUSCLE_GROUP_DEFAULTS[muscleGroup] ?? 'isolation';
  const isPrincipal = ovr.is_principal ?? PRINCIPAL_NAMES.has(name);
  const isUnilateral = ovr.is_unilateral ??
    /unilateral|una pierna|a 1 pierna|a una mano/i.test(name);
  const levelMin = ovr.level_min ?? 'principiante';
  const contra = ovr.contraindicated_for ?? [];
  const incrementMap: Record<Equipment, number> = {
    barra: 2.5, smith: 2.5, mancuerna: 1, pesa_rusa: 1,
    maquina: 1, polea: 1, bw: 1, elastico: 1, disco: 5,
  };
  const inc = ovr.default_increment_kg ?? incrementMap[equipment];

  return `INSERT INTO exercises (name, muscle_group, equipment, movement_pattern, is_principal, is_unilateral, level_min, contraindicated_for, default_increment_kg) VALUES ('${escapeSqlString(name)}', '${escapeSqlString(muscleGroup)}', '${equipment}', '${pattern}', ${isPrincipal}, ${isUnilateral}, '${levelMin}', ${arrayToSqlText(contra)}, ${inc}) ON CONFLICT (name) DO NOTHING;`;
}

function main() {
  const jsonPath = path.join(__dirname, '..', 'assets', 'exercises.json');
  const raw: RawEntry[] = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

  // De-dup by name (some entries appear multiple times under different groups)
  const seen = new Map<string, string>();
  for (const row of raw) {
    const name = row.Ejercicios.trim();
    if (!seen.has(name)) seen.set(name, row['Grupo Muscular']);
  }

  const lines = [
    '-- Auto-generated from src/assets/exercises.json by enrich-exercises.ts',
    '-- DO NOT EDIT MANUALLY — run `npm run db:seed:exercises` to regenerate',
    '',
  ];
  for (const [name, group] of seen) {
    lines.push(buildRow(name, group));
  }
  const out = path.join(__dirname, 'exercises.sql');
  fs.writeFileSync(out, lines.join('\n') + '\n');
  console.log(`Wrote ${seen.size} exercises to ${out}`);
}

main();
