/**
 * Traspaso de alumnos: set each athlete's membership expiry (paid_until) and
 * monthly fee from the coach's roster TSV.
 *
 * Deliberately does NOT write a `payments` row — no money moved through the app
 * for these; inventing payments would corrupt the revenue numbers. It writes
 * memberships.paid_until directly, same shape registerPayment() leaves behind.
 *
 * Usage (dry run — reads only, prints the plan):
 *   npx tsx scripts/import-roster.ts <roster.tsv>
 * Apply (single transaction, all-or-nothing):
 *   npx tsx scripts/import-roster.ts <roster.tsv> --apply
 * Self-check of the parsers:
 *   npx tsx scripts/import-roster.ts --selftest
 *
 * TSV columns: NOMBRE \t VENCE EL (d/m/yyyy) \t PRECIO (25.000 | PROMO | 0)
 *              \t EMAIL (opcional — desempata cuando el nombre no coincide)
 */
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import pool from '../src/db/connect.js';

/** Argentina is UTC-03 year-round; expiry means "through the end of that day". */
const AR_OFFSET = '-03:00';

export function normalizeName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ') // "Martinez F." → "martinez f"
    .replace(/\s+/g, ' ')
    .trim();
}

/** 'd/m/yyyy' → ISO instant at 23:59:59 ART of that day. */
export function parseDueDate(s: string): string {
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) throw new Error(`fecha inválida: "${s}"`);
  const [, d, mo, y] = m;
  const iso = `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}T23:59:59${AR_OFFSET}`;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) throw new Error(`fecha inválida: "${s}"`);
  return date.toISOString();
}

/** '25.000' → 25000 (AR thousands separator); 'PROMO' → 0. */
export function parsePrice(s: string): number {
  const t = s.trim();
  if (/^promo$/i.test(t)) return 0;
  const n = Number(t.replace(/\./g, '').replace(/,/g, '.'));
  if (!Number.isFinite(n) || n < 0) throw new Error(`precio inválido: "${s}"`);
  return n;
}

interface RosterRow {
  name: string;
  paidUntil: string;
  fee: number;
  email: string | null;
}

export function parseRoster(tsv: string): RosterRow[] {
  return tsv
    .split('\n')
    .map((l) => l.replace(/\s+$/, ''))
    .filter((l) => l.trim() && !/^NOMBRE\b/i.test(l))
    .map((line) => {
      const [name, due, price, email] = line.split('\t');
      if (!name || !due || !price) throw new Error(`fila inválida: "${line}"`);
      return {
        name: name.trim(),
        paidUntil: parseDueDate(due),
        fee: parsePrice(price),
        email: email?.trim().toLowerCase() || null,
      };
    });
}

interface DbAthlete {
  id: string;
  email: string;
  name: string;
  paid_until: string | number | null;
  monthly_fee_ars: string | null;
}

/** Exact normalized match, else unique all-tokens-contained match. */
export function matchAthlete(
  rosterName: string,
  athletes: { id: string; name: string }[]
): { id: string; name: string }[] {
  const target = normalizeName(rosterName);
  const exact = athletes.filter((a) => normalizeName(a.name) === target);
  if (exact.length) return exact;
  const tokens = target.split(' ').filter((t) => t.length > 2);
  if (!tokens.length) return [];
  return athletes.filter((a) => {
    const n = normalizeName(a.name);
    return tokens.every((t) => n.includes(t));
  });
}

function fmt(v: string | number | null): string {
  if (v == null) return '—';
  if (v === Infinity || v === 'infinity') return 'infinity';
  return new Date(v).toISOString().slice(0, 10);
}

function selftest(): void {
  assert.equal(normalizeName('Gerónimo Martinez F.'), 'geronimo martinez f');
  assert.equal(normalizeName('  Pilar   Antúnez Muñoz '), 'pilar antunez munoz');
  assert.equal(parsePrice('25.000'), 25000);
  assert.equal(parsePrice('21.666'), 21666);
  assert.equal(parsePrice('PROMO'), 0);
  assert.equal(parsePrice('0'), 0);
  assert.throws(() => parsePrice('gratis'));
  // 23:59:59 ART on 3/8/2026 is 02:59:59 UTC on the 4th.
  assert.equal(parseDueDate('3/08/2026'), '2026-08-04T02:59:59.000Z');
  assert.equal(parseDueDate('30/12/2026'), '2026-12-31T02:59:59.000Z');
  assert.throws(() => parseDueDate('2026-08-03'));
  const rows = parseRoster(
    'NOMBRE\tVENCE EL\tPRECIO\nJose Araoz\t2/08/2026\t23.000\nMili\t2/08/2026\tPROMO\tA@B.com\n'
  );
  assert.deepEqual(rows, [
    { name: 'Jose Araoz', paidUntil: '2026-08-03T02:59:59.000Z', fee: 23000, email: null },
    { name: 'Mili', paidUntil: '2026-08-03T02:59:59.000Z', fee: 0, email: 'a@b.com' },
  ]);
  // Ambiguity is reported, never guessed: two Mendez rows must both come back.
  const pool2 = [
    { id: '1', name: 'Nicolas Mendez' },
    { id: '2', name: 'Nicolas Mendez Lopez' },
  ];
  assert.equal(matchAthlete('Nicolas Mendez', pool2).length, 1); // exact wins
  assert.equal(matchAthlete('Nicolas', pool2).length, 2); // token match → ambiguous
  console.log('selftest OK');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--selftest')) return selftest();

  const apply = args.includes('--apply');
  const file = args.find((a) => !a.startsWith('--'));
  if (!file) throw new Error('falta el path del TSV');

  const roster = parseRoster(readFileSync(file, 'utf8'));

  // LEFT JOIN, no JOIN: un alumno que todavía no terminó el onboarding no tiene
  // athlete_profiles pero igual paga la cuota y necesita su vencimiento. Sin
  // nombre solo se lo puede matchear por la columna EMAIL del TSV.
  const { rows: athletes } = await pool.query<DbAthlete>(
    `SELECT u.id, u.email, COALESCE(ap.name, '(sin onboarding)') AS name,
            mem.paid_until,
            COALESCE(u.monthly_fee_ars, ap.monthly_fee_ars)::text AS monthly_fee_ars
       FROM users u
       LEFT JOIN athlete_profiles ap ON ap.user_id = u.id
       LEFT JOIN memberships mem ON mem.user_id = u.id
      WHERE u.role = 'athlete'`
  );

  const plan: { row: RosterRow; hit: DbAthlete }[] = [];
  const problems: string[] = [];
  const usedIds = new Map<string, string>();

  for (const row of roster) {
    // An explicit email is authoritative — nicknames ("Mili" → "Milagro") and
    // dropped surnames make name matching unreliable for a chunk of the roster.
    const hits = row.email
      ? athletes.filter((a) => a.email.toLowerCase() === row.email)
      : matchAthlete(row.name, athletes);
    if (hits.length === 0) {
      problems.push(
        `SIN MATCH   ${row.name}${row.email ? ` <${row.email}>` : ''}`
      );
      continue;
    }
    if (hits.length > 1) {
      const who = hits.map((h) => `${h.name} <${(h as DbAthlete).email}>`).join(' | ');
      problems.push(`AMBIGUO     ${row.name} → ${who}`);
      continue;
    }
    const hit = hits[0] as DbAthlete;
    const prev = usedIds.get(hit.id);
    if (prev) {
      problems.push(`DUPLICADO   ${row.name} y ${prev} apuntan al mismo usuario`);
      continue;
    }
    usedIds.set(hit.id, row.name);
    plan.push({ row, hit });
  }

  const now = Date.now();
  console.log(`\nRoster: ${roster.length} filas · atletas en DB: ${athletes.length}\n`);
  console.log(
    'NOMBRE (roster)'.padEnd(26) +
      'EMAIL'.padEnd(32) +
      'VENCE'.padEnd(24) +
      'CUOTA'
  );
  let shortened = 0;
  for (const { row, hit } of plan) {
    const target = new Date(row.paidUntil).getTime();
    const current =
      hit.paid_until == null || hit.paid_until === Infinity
        ? null
        : new Date(hit.paid_until).getTime();
    // Recortar la fecha le saca acceso a un alumno que hoy lo tiene: se marca.
    const cuts = current != null && target < current;
    if (cuts) shortened++;
    const feeNow = hit.monthly_fee_ars == null ? '—' : Number(hit.monthly_fee_ars).toString();
    const flags =
      (target < now ? ' VENCIDO' : '') + (cuts ? ' ↓RECORTA' : '');
    console.log(
      row.name.padEnd(26) +
        hit.email.slice(0, 30).padEnd(32) +
        `${fmt(hit.paid_until)} → ${fmt(row.paidUntil)}`.padEnd(24) +
        `${feeNow} → ${row.fee}`.padEnd(16) +
        flags
    );
  }

  const inRoster = new Set(plan.map((p) => p.hit.id));
  const missing = athletes.filter((a) => !inRoster.has(a.id));
  if (missing.length) {
    console.log(`\nEn la DB pero NO en el roster (${missing.length}) — no se tocan:`);
    for (const a of missing)
      console.log(`  ${a.name} <${a.email}> vence ${fmt(a.paid_until)}`);
  }

  if (problems.length) {
    console.log(`\n${problems.length} problema(s):`);
    for (const p of problems) console.log('  ' + p);
  }
  console.log(`\nOK: ${plan.length}/${roster.length} · recortan acceso: ${shortened}`);

  if (!apply) {
    console.log('\nDRY RUN — nada escrito. Repetir con --apply para aplicar.');
    return;
  }
  if (problems.length) {
    console.log('\nABORTADO: resolvé los problemas antes de --apply.');
    process.exitCode = 1;
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const { row, hit } of plan) {
      await client.query(
        `INSERT INTO memberships (user_id, status, started_at, paid_until, updated_at)
         VALUES ($1, 'active', now(), $2, now())
         ON CONFLICT (user_id) DO UPDATE
           SET status = 'active', paid_until = $2, paused_at = NULL, updated_at = now()`,
        [hit.id, row.paidUntil]
      );
      await client.query(`UPDATE users SET monthly_fee_ars = $2 WHERE id = $1`, [
        hit.id,
        row.fee,
      ]);
    }
    await client.query('COMMIT');
    console.log(`\nAplicado: ${plan.length} alumnos actualizados.`);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
