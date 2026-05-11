export {};
const { resetDatabase, ensureMigrated, closePool } = await import('./helpers/test-db.js');
const poolMod = await import('../../src/db/connect.js');
const pool = poolMod.default;

beforeAll(async () => { await ensureMigrated(); });
beforeEach(async () => { await resetDatabase(); });
afterAll(async () => { await closePool(); });

it('athlete_profiles has new columns', async () => {
  const r = await pool.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
      WHERE table_name='athlete_profiles'
        AND column_name IN ('phone','plan_interest','training_mode','commitment',
                            'exercise_minutes','days_specific','referral_source','sport_focus')`,
  );
  expect(r.rows.map((r) => r.column_name).sort()).toEqual([
    'commitment','days_specific','exercise_minutes','phone',
    'plan_interest','referral_source','sport_focus','training_mode',
  ]);
});

it('level enum accepts 5 values', async () => {
  const { rows: u1 } = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, role)
     VALUES ('x@t.local','x','athlete') RETURNING id`,
  );
  await pool.query(
    `INSERT INTO athlete_profiles
       (user_id,name,gender,age,height_cm,weight_kg,level,goal,
        days_per_week,equipment,injuries,phone,plan_interest,
        training_mode,commitment,exercise_minutes,days_specific,referral_source)
     VALUES ($1,'A','male',30,175,75,'muy_avanzado','hipertrofia',
             4,'gym_completo','{}','+5491111111111','full',
             'gym','exigente',60,'{lun,mar,jue,sab}','google')`,
    [u1[0].id],
  );
  const { rows: u2 } = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, role)
     VALUES ('n@t.local','x','athlete') RETURNING id`,
  );
  await pool.query(
    `INSERT INTO athlete_profiles
       (user_id,name,gender,age,height_cm,weight_kg,level,goal,
        days_per_week,equipment,injuries,phone,plan_interest,
        training_mode,commitment,exercise_minutes,days_specific,referral_source)
     VALUES ($1,'N','female',25,165,60,'nunca','hipertrofia',
             3,'gym_basico','{}','+5491111111118','basico',
             'casa','suave',30,'{lun,mie,vie}','otro')`,
    [u2[0].id],
  );
  const c = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM athlete_profiles WHERE level IN ('muy_avanzado','nunca')`,
  );
  expect(c.rows[0].count).toBe('2');
});

it('rejects legacy level value principiante', async () => {
  const { rows: u } = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, role)
     VALUES ('lp@t.local','x','athlete') RETURNING id`,
  );
  await expect(
    pool.query(
      `INSERT INTO athlete_profiles
         (user_id,name,gender,age,height_cm,weight_kg,level,goal,
          days_per_week,equipment,injuries,phone,plan_interest,
          training_mode,commitment,exercise_minutes,days_specific,referral_source)
       VALUES ($1,'P','male',30,175,75,'principiante','hipertrofia',
               4,'gym_completo','{}','+5491111111119','full',
               'gym','normal',60,'{lun,mar,jue,sab}','google')`,
      [u[0].id],
    ),
  ).rejects.toThrow();
});

it('days_per_week accepts 2', async () => {
  const { rows: u } = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, role)
     VALUES ('y@t.local','x','athlete') RETURNING id`,
  );
  await expect(
    pool.query(
      `INSERT INTO athlete_profiles
         (user_id,name,gender,age,height_cm,weight_kg,level,goal,
          days_per_week,equipment,injuries,phone,plan_interest,
          training_mode,commitment,exercise_minutes,days_specific,referral_source)
       VALUES ($1,'B','male',30,175,75,'bajo','hipertrofia',
               2,'gym_basico','{}','+5491111111112','basico',
               'casa','suave',45,'{lun,jue}','instagram')`,
      [u[0].id],
    ),
  ).resolves.not.toThrow();
});

it('athlete_measurements table exists with constraints', async () => {
  const { rows: u } = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, role)
     VALUES ('z@t.local','x','athlete') RETURNING id`,
  );
  await pool.query(
    `INSERT INTO athlete_measurements
       (athlete_id, chest_cm, waist_cm, hip_cm, thigh_cm, calf_cm, bicep_cm, source)
     VALUES ($1, 100.5, 80, 95, 55, 38, 35, 'onboarding')`,
    [u[0].id],
  );
  const c = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM athlete_measurements WHERE athlete_id=$1`,
    [u[0].id],
  );
  expect(c.rows[0].count).toBe('1');
});

it('goal enum accepts perdida_grasa', async () => {
  const { rows: u } = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, role)
     VALUES ('p@t.local','x','athlete') RETURNING id`,
  );
  await pool.query(
    `INSERT INTO athlete_profiles
       (user_id,name,gender,age,height_cm,weight_kg,level,goal,
        days_per_week,equipment,injuries,phone,plan_interest,
        training_mode,commitment,exercise_minutes,days_specific,referral_source)
     VALUES ($1,'P','male',30,175,75,'medio','perdida_grasa',
             4,'gym_completo','{}','+5491111111113','full',
             'gym','normal',60,'{lun,mar,jue,sab}','google')`,
    [u[0].id],
  );
  const c = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM athlete_profiles WHERE goal='perdida_grasa'`,
  );
  expect(c.rows[0].count).toBe('1');
});

it('days_specific rejects cardinality mismatch with days_per_week', async () => {
  const { rows: u } = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, role)
     VALUES ('d1@t.local','x','athlete') RETURNING id`,
  );
  await expect(
    pool.query(
      `INSERT INTO athlete_profiles
         (user_id,name,gender,age,height_cm,weight_kg,level,goal,
          days_per_week,equipment,injuries,phone,plan_interest,
          training_mode,commitment,exercise_minutes,days_specific,referral_source)
       VALUES ($1,'D','male',30,175,75,'bajo','hipertrofia',
               4,'gym_completo','{}','+5491111111114','basico',
               'gym','suave',45,'{lun,mar}','instagram')`,
      [u[0].id],
    ),
  ).rejects.toThrow();
});

it('days_specific rejects invalid weekday token', async () => {
  const { rows: u } = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, role)
     VALUES ('d2@t.local','x','athlete') RETURNING id`,
  );
  await expect(
    pool.query(
      `INSERT INTO athlete_profiles
         (user_id,name,gender,age,height_cm,weight_kg,level,goal,
          days_per_week,equipment,injuries,phone,plan_interest,
          training_mode,commitment,exercise_minutes,days_specific,referral_source)
       VALUES ($1,'D','male',30,175,75,'bajo','hipertrofia',
               3,'gym_completo','{}','+5491111111115','basico',
               'gym','suave',45,'{lun,mar,xyz}','instagram')`,
      [u[0].id],
    ),
  ).rejects.toThrow();
});

it('days_specific rejects duplicate weekdays', async () => {
  const { rows: u } = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, role)
     VALUES ('d3@t.local','x','athlete') RETURNING id`,
  );
  await expect(
    pool.query(
      `INSERT INTO athlete_profiles
         (user_id,name,gender,age,height_cm,weight_kg,level,goal,
          days_per_week,equipment,injuries,phone,plan_interest,
          training_mode,commitment,exercise_minutes,days_specific,referral_source)
       VALUES ($1,'D','male',30,175,75,'bajo','hipertrofia',
               4,'gym_completo','{}','+5491111111116','basico',
               'gym','suave',45,'{lun,lun,mar,mar}','instagram')`,
      [u[0].id],
    ),
  ).rejects.toThrow();
});
