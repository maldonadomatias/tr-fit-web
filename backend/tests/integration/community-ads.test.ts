import { jest } from '@jest/globals';

export const storageOps: {
  saved: string[];
  deleted: string[];
  failOn: string | null;
} = { saved: [], deleted: [], failOn: null };
jest.unstable_mockModule('../../src/config/firebase.js', () => ({
  getStorageBucket: () => ({
    name: 'test-bucket',
    file: (path: string) => ({
      save: async () => {
        if (storageOps.failOn && path.endsWith(storageOps.failOn))
          throw new Error('boom');
        storageOps.saved.push(path);
      },
      delete: async () => {
        storageOps.deleted.push(path);
      },
    }),
  }),
  getFirebaseApp: () => ({}),
}));
jest.unstable_mockModule('../../src/services/push.service.js', () => ({
  sendPush: async () => 'sent',
}));

const { resetDatabase, ensureMigrated, closePool } =
  await import('./helpers/test-db.js');
const pool = (await import('../../src/db/connect.js')).default;
const request = (await import('supertest')).default;
const app = (await import('../../src/app.js')).default;
const { makeUser, enableCommunity, insertPost, tinyJpeg } =
  await import('./community-helpers.js');
const ads = await import('../../src/services/community-ads.service.js');

beforeAll(async () => {
  await ensureMigrated();
});
beforeEach(async () => {
  await resetDatabase();
  storageOps.saved.length = 0;
  storageOps.deleted.length = 0;
  storageOps.failOn = null;
});
afterAll(async () => {
  await closePool();
});

async function insertAd(opts: {
  fee?: number;
  starts: string;
  ends: string;
  archivedAt?: string | null;
  brand?: string;
}): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO community_ads (brand_name, body, image_path, image_url, cta_label, cta_url,
                                monthly_fee_ars, starts_on, ends_on, archived_at)
     VALUES ($1, 'b', 'community-ads/x.jpg', 'https://img', 'Ver', 'https://brand.example', $2, $3, $4, $5)
     RETURNING id`,
    [
      opts.brand ?? 'Marca',
      opts.fee ?? 10000,
      opts.starts,
      opts.ends,
      opts.archivedAt ?? null,
    ]
  );
  return rows[0].id;
}

describe('adRevenueForMonth', () => {
  it('an ad covering a single day of the month counts in full', async () => {
    await insertAd({ fee: 20000, starts: '2026-10-31', ends: '2026-11-30' });
    expect(await ads.adRevenueForMonth('2026-10-01')).toBe(20000);
    expect(await ads.adRevenueForMonth('2026-11-01')).toBe(20000);
  });
  it('out of range does not count', async () => {
    await insertAd({ fee: 20000, starts: '2026-12-01', ends: '2026-12-31' });
    expect(await ads.adRevenueForMonth('2026-11-01')).toBe(0);
  });
  it('archived ad keeps counting in its live months, not after', async () => {
    await insertAd({
      fee: 15000,
      starts: '2026-10-01',
      ends: '2027-03-31',
      archivedAt: '2026-11-10T15:00:00Z',
    });
    expect(await ads.adRevenueForMonth('2026-10-01')).toBe(15000);
    expect(await ads.adRevenueForMonth('2026-11-01')).toBe(15000);
    expect(await ads.adRevenueForMonth('2026-12-01')).toBe(0);
  });
  it('ad archived before it started never counts', async () => {
    await insertAd({
      fee: 15000,
      starts: '2026-10-20',
      ends: '2026-12-31',
      archivedAt: '2026-10-05T15:00:00Z',
    });
    expect(await ads.adRevenueForMonth('2026-10-01')).toBe(0);
  });
  it('sums several ads', async () => {
    await insertAd({ fee: 10000, starts: '2026-10-01', ends: '2026-10-31' });
    await insertAd({ fee: 25000.5, starts: '2026-09-15', ends: '2026-10-02' });
    expect(await ads.adRevenueForMonth('2026-10-01')).toBe(35000.5);
  });
});

describe('ad events + metrics', () => {
  it('views are deduplicated per user and day', async () => {
    const u = await makeUser('athlete');
    const id = await insertAd({ starts: '2020-01-01', ends: '2099-12-31' });
    await ads.recordAdEvent(id, u.id, 'view');
    await ads.recordAdEvent(id, u.id, 'view');
    await ads.recordAdEvent(id, u.id, 'click');
    const m = await ads.adMetrics(id, '2020-01-01', '2099-12-31');
    expect(m).toMatchObject({ views: 1, clicks: 1, reach: 1 });
    expect(m.daily).toHaveLength(1);
    expect(m.daily[0]).toMatchObject({ views: 1, clicks: 1 });
  });
  it('reach counts distinct viewers', async () => {
    const a = await makeUser('athlete');
    const b = await makeUser('athlete');
    const id = await insertAd({ starts: '2020-01-01', ends: '2099-12-31' });
    await pool.query(
      `INSERT INTO community_ad_events (ad_id, user_id, day, kind) VALUES
         ($1, $2, '2026-09-01', 'view'), ($1, $2, '2026-09-02', 'view'), ($1, $3, '2026-09-02', 'view')`,
      [id, a.id, b.id]
    );
    const m = await ads.adMetrics(id, '2026-09-01', '2026-09-30');
    expect(m).toMatchObject({ views: 3, clicks: 0, reach: 2 });
    expect(m.daily.map((d) => d.day)).toEqual(['2026-09-01', '2026-09-02']);
  });
  it('unknown ad -> AdError 404', async () => {
    const u = await makeUser('athlete');
    await expect(
      ads.recordAdEvent('00000000-0000-0000-0000-000000000000', u.id, 'view')
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('listAds / activeAdsForFeed / archiveAd', () => {
  it('classifies and filters', async () => {
    const active = await insertAd({
      starts: '2020-01-01',
      ends: '2099-12-31',
      brand: 'Active',
    });
    await insertAd({
      starts: '2098-01-01',
      ends: '2099-12-31',
      brand: 'Upcoming',
    });
    await insertAd({
      starts: '2020-01-01',
      ends: '2020-12-31',
      brand: 'Expired',
    });
    const list = await ads.listAds();
    const byBrand = Object.fromEntries(
      list.map((a) => [a.brand_name, a.status])
    );
    expect(byBrand).toEqual({
      Active: 'active',
      Upcoming: 'upcoming',
      Expired: 'expired',
    });
    expect((await ads.activeAdsForFeed()).map((a) => a.id)).toEqual([active]);
    await ads.archiveAd(active);
    expect(await ads.activeAdsForFeed()).toEqual([]);
    expect((await ads.listAds()).find((a) => a.id === active)?.status).toBe(
      'archived'
    );
  });
});

describe('createAd', () => {
  it('uploads the image and rolls back on invalid type', async () => {
    const adm = await makeUser('admin');
    const created = await ads.createAd(
      {
        brand_name: 'Proteína X',
        body: 'Promo',
        cta_label: 'Comprar',
        cta_url: 'https://x.example',
        monthly_fee_ars: 50000,
        starts_on: '2026-10-01',
        ends_on: '2026-12-31',
        image: {
          buffer: tinyJpeg,
          mimetype: 'image/jpeg',
          size: tinyJpeg.length,
        },
      },
      adm.id
    );
    expect(created).toMatchObject({
      brand_name: 'Proteína X',
      monthly_fee_ars: 50000,
      starts_on: '2026-10-01',
    });
    expect(storageOps.saved).toEqual([`community-ads/${created.id}.jpg`]);
    await expect(
      ads.createAd(
        {
          brand_name: 'x',
          body: '',
          cta_label: 'x',
          cta_url: 'https://x.example',
          monthly_fee_ars: 1,
          starts_on: '2026-10-01',
          ends_on: '2026-10-01',
          image: { buffer: tinyJpeg, mimetype: 'image/gif', size: 10 },
        },
        adm.id
      )
    ).rejects.toMatchObject({ code: 'invalid_type' });
  });
});

describe('feed interleaving over HTTP', () => {
  it('inserts an ad after every 8 posts and rotates across pages', async () => {
    await enableCommunity();
    const a = await makeUser('athlete');
    await insertAd({ starts: '2020-01-01', ends: '2099-12-31', brand: 'A' });
    await insertAd({ starts: '2020-01-01', ends: '2099-12-31', brand: 'B' });
    for (let i = 0; i < 30; i++) {
      await insertPost(a.id, {
        body: `p${i}`,
        createdAt: new Date(Date.UTC(2026, 8, 1, 0, i)).toISOString(),
      });
    }
    const auth = { Authorization: `Bearer ${a.token}` };
    const p1 = await request(app).get('/api/community/feed').set(auth);
    const types1 = p1.body.items.map(
      (x: { type: string; brand_name?: string }) =>
        x.type === 'ad' ? x.brand_name : 'post'
    );
    expect(types1[8]).toBe('A');
    expect(types1[17]).toBe('B');
    expect(p1.body.items).toHaveLength(22);
    const p2 = await request(app)
      .get(`/api/community/feed?cursor=${p1.body.next_cursor}`)
      .set(auth);
    const types2 = p2.body.items.map(
      (x: { type: string; brand_name?: string }) =>
        x.type === 'ad' ? x.brand_name : 'post'
    );
    // global post 24 is the 4th post of page 2 -> ad after index 3, slot 3 -> 'A'
    expect(types2[4]).toBe('A');
    expect(
      p2.body.items.filter((x: { type: string }) => x.type === 'post')
    ).toHaveLength(10);
  });

  it('ad shape in feed', async () => {
    await enableCommunity();
    const a = await makeUser('athlete');
    await insertAd({ starts: '2020-01-01', ends: '2099-12-31' });
    for (let i = 0; i < 8; i++) await insertPost(a.id);
    const r = await request(app)
      .get('/api/community/feed')
      .set('Authorization', `Bearer ${a.token}`);
    expect(Object.keys(r.body.items[8]).sort()).toEqual([
      'body',
      'brand_name',
      'cta_label',
      'cta_url',
      'id',
      'image_url',
      'type',
    ]);
  });
});

describe('ads HTTP', () => {
  it('records events via /community/ads/:id/events', async () => {
    await enableCommunity();
    const a = await makeUser('athlete');
    const id = await insertAd({ starts: '2020-01-01', ends: '2099-12-31' });
    await request(app)
      .post(`/api/community/ads/${id}/events`)
      .set('Authorization', `Bearer ${a.token}`)
      .send({ kind: 'view' })
      .expect(204);
    await request(app)
      .post(`/api/community/ads/${id}/events`)
      .set('Authorization', `Bearer ${a.token}`)
      .send({ kind: 'view' })
      .expect(204);
    const bad = await request(app)
      .post(`/api/community/ads/${id}/events`)
      .set('Authorization', `Bearer ${a.token}`)
      .send({ kind: 'x' });
    expect(bad.status).toBe(400);
    const n = await pool.query(
      `SELECT count(*)::int AS n FROM community_ad_events`
    );
    expect(n.rows[0].n).toBe(1);
  });

  it('admin creates, lists, archives and reads metrics', async () => {
    const adm = await makeUser('admin');
    const auth = { Authorization: `Bearer ${adm.token}` };
    const c = await request(app)
      .post('/api/admin/community/ads')
      .set(auth)
      .field('brand_name', 'Marca')
      .field('body', 'Promo')
      .field('cta_label', 'Ver')
      .field('cta_url', 'https://marca.example')
      .field('monthly_fee_ars', '50000')
      .field('starts_on', '2026-10-01')
      .field('ends_on', '2026-12-31')
      .attach('image', tinyJpeg, {
        filename: 'ad.jpg',
        contentType: 'image/jpeg',
      });
    expect(c.status).toBe(201);
    expect(c.body.monthly_fee_ars).toBe(50000);
    const list = await request(app).get('/api/admin/community/ads').set(auth);
    expect(list.body).toHaveLength(1);
    const m = await request(app)
      .get(`/api/admin/community/ads/${c.body.id}/metrics`)
      .set(auth);
    expect(m.body).toEqual({ views: 0, clicks: 0, reach: 0, daily: [] });
    await request(app)
      .post(`/api/admin/community/ads/${c.body.id}/archive`)
      .set(auth)
      .expect(204);

    const noImg = await request(app)
      .post('/api/admin/community/ads')
      .set(auth)
      .field('brand_name', 'x')
      .field('cta_label', 'x')
      .field('cta_url', 'https://x.example')
      .field('monthly_fee_ars', '1')
      .field('starts_on', '2026-10-01')
      .field('ends_on', '2026-10-01');
    expect(noImg.status).toBe(400);
    const badRange = await request(app)
      .post('/api/admin/community/ads')
      .set(auth)
      .field('brand_name', 'x')
      .field('cta_label', 'x')
      .field('cta_url', 'https://x.example')
      .field('monthly_fee_ars', '1')
      .field('starts_on', '2026-10-02')
      .field('ends_on', '2026-10-01')
      .attach('image', tinyJpeg, {
        filename: 'ad.jpg',
        contentType: 'image/jpeg',
      });
    expect(badRange.status).toBe(400);
  });
});

describe('GET /admin/community/summary', () => {
  it('module off', async () => {
    const adm = await makeUser('admin');
    const r = await request(app)
      .get('/api/admin/community/summary')
      .set('Authorization', `Bearer ${adm.token}`);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      enabled: false,
      launched_on: null,
      revision_date: null,
      days_to_revision: null,
      revision_applied_at: null,
    });
  });

  it('module on: dates, this-month revenue and projection', async () => {
    const adm = await makeUser('admin');
    const today = new Date().toLocaleDateString('en-CA', {
      timeZone: 'America/Argentina/Buenos_Aires',
    });
    await pool.query(
      `UPDATE platform_fee_config SET community_launched_on = $1::date - 10 WHERE id = 1`,
      [today]
    );
    await insertAd({ fee: 20000, starts: '2020-01-01', ends: '2099-12-31' });
    const r = await request(app)
      .get('/api/admin/community/summary')
      .set('Authorization', `Bearer ${adm.token}`);
    expect(r.body.enabled).toBe(true);
    expect(r.body.ad_revenue_this_month).toBe(20000);
    expect(r.body.ad_share_this_month).toBe(3000);
    expect(r.body.projected_community_fee).toBe(40000); // avg 20000 < 50000
    expect(r.body.days_to_revision).toBeGreaterThan(150);
  });
});
