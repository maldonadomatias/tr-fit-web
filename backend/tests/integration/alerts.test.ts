import { jest } from '@jest/globals';

jest.unstable_mockModule('resend', () => {
  const send = jest.fn();
  return {
    Resend: jest.fn().mockImplementation(() => ({ emails: { send } })),
    __mockSend: send,
  };
});

type MockSend = jest.Mock<(opts: { to: string; subject: string; html: string; from: string }) => Promise<{ data: { id: string }; error: null }>>;
const resendMod = (await import('resend')) as unknown as { __mockSend: MockSend };

const { resetDatabase, ensureMigrated, closePool } = await import('./helpers/test-db.js');
const { createAdmin, createAthlete } = await import('./helpers/fixtures.js');
const {
  createPainAlert, createMachineAlert,
  listAlertsForCoach, markRead, markResolved,
} = await import('../../src/services/alert.service.js');
const poolMod = await import('../../src/db/connect.js');
const pool = poolMod.default;

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => {
  await resetDatabase();
  resendMod.__mockSend.mockReset();
  resendMod.__mockSend.mockResolvedValue({ data: { id: 'msg' }, error: null });
});
afterAll(async () => { await closePool(); });

async function setup() {
  const coach = await createAdmin();
  const ath = await createAthlete(coach);
  const ex = await pool.query<{ id: number }>(
    `SELECT id FROM exercises LIMIT 1`,
  );
  return { coach, ath, exerciseId: ex.rows[0].id };
}

it('createPainAlert inserts row + sends email', async () => {
  const { coach, ath, exerciseId } = await setup();
  const out = await createPainAlert({
    athleteId: ath, exerciseId, zone: 'lumbar', intensity: 7,
  });
  expect(out.emailSendFailed).toBe(false);
  expect(resendMod.__mockSend).toHaveBeenCalledTimes(1);
  const alerts = await listAlertsForCoach(coach, true);
  expect(alerts).toHaveLength(1);
});

it('createMachineAlert info-severity, no email', async () => {
  const { coach, ath, exerciseId } = await setup();
  const ex2 = await pool.query<{ id: number }>(
    `SELECT id FROM exercises WHERE id != $1 LIMIT 1`, [exerciseId],
  );
  await createMachineAlert({
    athleteId: ath, exerciseId,
    switchedToExerciseId: ex2.rows[0].id,
  });
  expect(resendMod.__mockSend).not.toHaveBeenCalled();
  const alerts = await listAlertsForCoach(coach, true);
  expect(alerts).toHaveLength(1);
});

it('createPainAlert with stale sessionLogId stores NULL, does not throw', async () => {
  const { coach, ath, exerciseId } = await setup();
  // Simulate persisted client state pointing at a session_log that no
  // longer exists in the DB (env switch / reset / manual delete).
  const stale = '380a76dc-bcf4-4f8b-9b41-e465742caf97';
  const out = await createPainAlert({
    athleteId: ath, exerciseId, sessionLogId: stale,
    zone: 'lumbar', intensity: 8,
  });
  expect(out.emailSendFailed).toBe(false);
  const alerts = await listAlertsForCoach(coach, true);
  expect(alerts).toHaveLength(1);
  const r = await pool.query<{ session_log_id: string | null }>(
    `SELECT session_log_id FROM coach_alerts WHERE id = $1`, [out.alertId],
  );
  expect(r.rows[0].session_log_id).toBeNull();
});

it('markRead + markResolved flip flags', async () => {
  const { coach, ath, exerciseId } = await setup();
  const { alertId } = await createPainAlert({
    athleteId: ath, exerciseId, zone: 'rodilla', intensity: 5,
  });
  await markRead(alertId, coach);
  await markResolved(alertId, coach);
  const r = await pool.query(
    `SELECT read_at, resolved_at FROM coach_alerts WHERE id = $1`, [alertId],
  );
  expect(r.rows[0].read_at).toBeTruthy();
  expect(r.rows[0].resolved_at).toBeTruthy();
});

const { resolveAlert } = await import('../../src/services/alert.service.js');

it('resolve sos_pain with swap_exercise inserts a swap override + stamps audit', async () => {
  const { coach, ath, exerciseId } = await setup();
  const altR = await pool.query<{ id: number }>(
    `SELECT id FROM exercises WHERE id != $1 LIMIT 1`, [exerciseId],
  );
  const replId = altR.rows[0].id;

  const { alertId } = await createPainAlert({
    athleteId: ath, exerciseId, zone: 'lumbar', intensity: 8,
  });
  // Seed minimal athlete_program_state so resolveAlert can read current_week.
  await pool.query(
    `INSERT INTO athlete_program_state (athlete_id, current_week, rm_test_blocking, start_date)
     VALUES ($1, 3, false, CURRENT_DATE) ON CONFLICT (athlete_id) DO UPDATE SET current_week = 3`,
    [ath],
  );

  await resolveAlert(alertId, coach, {
    action: 'swap_exercise',
    payload: { replacement_exercise_id: replId },
    note: 'Sustituye sentadilla por dolor lumbar',
  });

  const a = await pool.query<{
    resolution_action: string; resolution_note: string; resolved_at: string;
    resolved_by: string;
  }>(`SELECT resolution_action, resolution_note, resolved_at, resolved_by
        FROM coach_alerts WHERE id = $1`, [alertId]);
  expect(a.rows[0].resolution_action).toBe('swap_exercise');
  expect(a.rows[0].resolution_note).toContain('Sustituye');
  expect(a.rows[0].resolved_at).toBeTruthy();
  expect(a.rows[0].resolved_by).toBe(coach);

  const ov = await pool.query(
    `SELECT * FROM weekly_overrides WHERE source_alert_id = $1`, [alertId],
  );
  expect(ov.rowCount).toBe(1);
  expect(ov.rows[0].override_type).toBe('swap');
  expect(ov.rows[0].replacement_exercise_id).toBe(replId);
  expect(ov.rows[0].expires_after_week).toBe(3);
});

it('resolve with action not in matrix for type returns 422-style error', async () => {
  const { coach, ath, exerciseId } = await setup();
  const { alertId } = await createPainAlert({
    athleteId: ath, exerciseId, zone: 'rodilla', intensity: 5,
  });
  await expect(
    resolveAlert(alertId, coach, {
      action: 'approve_switch', payload: {},
    }),
  ).rejects.toMatchObject({ reason: 'invalid_action' });
});

it('resolve twice returns conflict error', async () => {
  const { coach, ath, exerciseId } = await setup();
  const { alertId } = await createPainAlert({
    athleteId: ath, exerciseId, zone: 'lumbar', intensity: 7,
  });
  await pool.query(
    `INSERT INTO athlete_program_state (athlete_id, current_week, rm_test_blocking, start_date)
     VALUES ($1, 1, false, CURRENT_DATE) ON CONFLICT (athlete_id) DO UPDATE SET current_week = 1`,
    [ath],
  );
  await resolveAlert(alertId, coach, {
    action: 'note_only', payload: {}, note: 'observado',
  });
  await expect(
    resolveAlert(alertId, coach, { action: 'note_only', payload: {} }),
  ).rejects.toMatchObject({ reason: 'already_resolved' });
});

it('resolve skip_week inserts a skip override', async () => {
  const { coach, ath, exerciseId } = await setup();
  const { alertId } = await createPainAlert({
    athleteId: ath, exerciseId, zone: 'hombro', intensity: 6,
  });
  await pool.query(
    `INSERT INTO athlete_program_state (athlete_id, current_week, rm_test_blocking, start_date)
     VALUES ($1, 2, false, CURRENT_DATE) ON CONFLICT (athlete_id) DO UPDATE SET current_week = 2`,
    [ath],
  );
  await resolveAlert(alertId, coach, { action: 'skip_week', payload: {} });
  const ov = await pool.query(
    `SELECT * FROM weekly_overrides WHERE source_alert_id = $1`, [alertId],
  );
  expect(ov.rows[0].override_type).toBe('skip');
  expect(ov.rows[0].replacement_exercise_id).toBeNull();
});

it('resolve note_only is audit-only (no override row)', async () => {
  const { coach, ath, exerciseId } = await setup();
  const { alertId } = await createPainAlert({
    athleteId: ath, exerciseId, zone: 'cadera', intensity: 4,
  });
  await resolveAlert(alertId, coach, {
    action: 'note_only', payload: {}, note: 'observado',
  });
  const ov = await pool.query(
    `SELECT 1 FROM weekly_overrides WHERE source_alert_id = $1`, [alertId],
  );
  expect(ov.rowCount).toBe(0);
});

it('resolve regen_skeleton triggers skeleton regen + stamps audit', async () => {
  const { coach, ath, exerciseId } = await setup();
  const { alertId } = await createPainAlert({
    athleteId: ath, exerciseId, zone: 'lumbar', intensity: 9,
  });
  // The full regeneration path requires an active program state + skeleton
  // template; this test asserts only the audit columns are stamped and no
  // override row is inserted. The actual regen logic is exercised by
  // skeleton-regen.service.test.ts (if present).
  // We mock-by-stub: insert a minimal program_state so resolveAlert reads it.
  await pool.query(
    `INSERT INTO athlete_program_state (athlete_id, current_week, rm_test_blocking, start_date)
     VALUES ($1, 3, false, CURRENT_DATE) ON CONFLICT (athlete_id) DO UPDATE SET current_week = 3, start_date = CURRENT_DATE`,
    [ath],
  );

  // regenerateSkeleton may throw because the athlete has no active skeleton
  // template / onboarding. We accept either outcome — the audit must still
  // be stamped (post-commit failure is logged but not rethrown).
  await resolveAlert(alertId, coach, {
    action: 'regen_skeleton',
    payload: { reason: 'lesion persistente' },
    note: 'regen completa',
  });

  const a = await pool.query<{
    resolution_action: string; resolution_note: string;
    resolved_at: string; resolved_by: string;
  }>(`SELECT resolution_action, resolution_note, resolved_at, resolved_by
        FROM coach_alerts WHERE id = $1`, [alertId]);
  expect(a.rows[0].resolution_action).toBe('regen_skeleton');
  expect(a.rows[0].resolved_at).toBeTruthy();
  expect(a.rows[0].resolved_by).toBe(coach);

  const ov = await pool.query(
    `SELECT 1 FROM weekly_overrides WHERE source_alert_id = $1`, [alertId],
  );
  expect(ov.rowCount).toBe(0);
});

it('resolve regen_skeleton stamps audit even if regen throws post-commit', async () => {
  const { coach, ath, exerciseId } = await setup();
  const { alertId } = await createPainAlert({
    athleteId: ath, exerciseId, zone: 'lumbar', intensity: 9,
  });
  // No athlete_program_state seeded → regenerateSkeleton will throw because
  // it cannot find one. The audit must still be set.
  await resolveAlert(alertId, coach, {
    action: 'regen_skeleton', payload: {}, note: 'expected throw',
  });
  const r = await pool.query<{ resolution_action: string; resolved_at: string }>(
    `SELECT resolution_action, resolved_at FROM coach_alerts WHERE id = $1`,
    [alertId],
  );
  expect(r.rows[0].resolution_action).toBe('regen_skeleton');
  expect(r.rows[0].resolved_at).toBeTruthy();
});

it('resolve sos_machine with approve_switch inserts swap override using alert payload', async () => {
  const { coach, ath, exerciseId } = await setup();
  const ex2 = await pool.query<{ id: number }>(
    `SELECT id FROM exercises WHERE id != $1 LIMIT 1`, [exerciseId],
  );
  const switchedToId = ex2.rows[0].id;

  const { createMachineAlert } = await import('../../src/services/alert.service.js');
  const { alertId } = await createMachineAlert({
    athleteId: ath, exerciseId,
    switchedToExerciseId: switchedToId,
  });
  await pool.query(
    `INSERT INTO athlete_program_state (athlete_id, current_week, rm_test_blocking, start_date)
     VALUES ($1, 4, false, CURRENT_DATE)
     ON CONFLICT (athlete_id) DO UPDATE SET current_week = 4, start_date = CURRENT_DATE`,
    [ath],
  );

  await resolveAlert(alertId, coach, {
    action: 'approve_switch',
    payload: {},
  });

  const ov = await pool.query(
    `SELECT * FROM weekly_overrides WHERE source_alert_id = $1`, [alertId],
  );
  expect(ov.rowCount).toBe(1);
  expect(ov.rows[0].override_type).toBe('swap');
  expect(ov.rows[0].original_exercise_id).toBe(exerciseId);
  expect(ov.rows[0].replacement_exercise_id).toBe(switchedToId);
  expect(ov.rows[0].expires_after_week).toBe(4);

  const a = await pool.query<{ resolution_action: string }>(
    `SELECT resolution_action FROM coach_alerts WHERE id = $1`, [alertId],
  );
  expect(a.rows[0].resolution_action).toBe('approve_switch');
});
