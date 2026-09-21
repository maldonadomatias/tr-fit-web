import { randomUUID } from 'node:crypto';
import pool from '../db/connect.js';
import { uploadBufferToStorage, deleteFromStorage } from './storage.service.js';
import {
  ALLOWED_IMAGE_MIME,
  MAX_IMAGE_BYTES,
} from './community-media.service.js';

const TZ = 'America/Argentina/Buenos_Aires';

export class AdError extends Error {
  constructor(
    public status: number,
    public code: string
  ) {
    super(code);
  }
}

export interface AdDTO {
  type: 'ad';
  id: string;
  brand_name: string;
  body: string;
  image_url: string;
  cta_label: string;
  cta_url: string;
}

export interface AdminAdDTO {
  id: string;
  brand_name: string;
  body: string;
  image_url: string;
  cta_label: string;
  cta_url: string;
  monthly_fee_ars: number;
  starts_on: string;
  ends_on: string;
  archived_at: string | null;
  created_at: string;
  status: 'active' | 'upcoming' | 'expired' | 'archived';
}

export interface CreateAdInput {
  brand_name: string;
  body: string;
  cta_label: string;
  cta_url: string;
  monthly_fee_ars: number;
  starts_on: string;
  ends_on: string;
  image: { buffer: Buffer; mimetype: string; size: number };
}

export function todayBA(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ });
}

/** DATE columns come back as text via ::text to avoid JS timezone shifts. */
const ADMIN_SELECT = `
  SELECT id, brand_name, body, image_url, cta_label, cta_url, monthly_fee_ars,
         starts_on::text AS starts_on, ends_on::text AS ends_on, archived_at, created_at,
         CASE
           WHEN archived_at IS NOT NULL THEN 'archived'
           WHEN starts_on > (now() AT TIME ZONE '${TZ}')::date THEN 'upcoming'
           WHEN ends_on < (now() AT TIME ZONE '${TZ}')::date THEN 'expired'
           ELSE 'active'
         END AS status
    FROM community_ads`;

interface AdRow {
  id: string;
  brand_name: string;
  body: string;
  image_url: string;
  cta_label: string;
  cta_url: string;
  monthly_fee_ars: string;
  starts_on: string;
  ends_on: string;
  archived_at: Date | null;
  created_at: Date;
  status: AdminAdDTO['status'];
}

const toAdmin = (r: AdRow): AdminAdDTO => ({
  ...r,
  monthly_fee_ars: Number(r.monthly_fee_ars),
  archived_at: r.archived_at ? new Date(r.archived_at).toISOString() : null,
  created_at: new Date(r.created_at).toISOString(),
});

export async function createAd(
  input: CreateAdInput,
  createdBy: string
): Promise<AdminAdDTO> {
  if (!ALLOWED_IMAGE_MIME.has(input.image.mimetype))
    throw new AdError(400, 'invalid_type');
  if (input.image.size > MAX_IMAGE_BYTES)
    throw new AdError(400, 'image_too_large');
  if (input.ends_on < input.starts_on) throw new AdError(400, 'invalid_range');
  const id = randomUUID();
  const imagePath = `community-ads/${id}.jpg`;
  const imageUrl = await uploadBufferToStorage(
    imagePath,
    input.image.buffer,
    input.image.mimetype
  );
  try {
    await pool.query(
      `INSERT INTO community_ads (id, brand_name, body, image_path, image_url, cta_label, cta_url,
                                  monthly_fee_ars, starts_on, ends_on, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        id,
        input.brand_name,
        input.body,
        imagePath,
        imageUrl,
        input.cta_label,
        input.cta_url,
        input.monthly_fee_ars,
        input.starts_on,
        input.ends_on,
        createdBy,
      ]
    );
  } catch (e) {
    await deleteFromStorage(imagePath);
    throw e;
  }
  const r = await pool.query<AdRow>(`${ADMIN_SELECT} WHERE id = $1`, [id]);
  return toAdmin(r.rows[0]);
}

export async function listAds(): Promise<AdminAdDTO[]> {
  const r = await pool.query<AdRow>(
    `${ADMIN_SELECT} ORDER BY starts_on DESC, created_at DESC`
  );
  return r.rows.map(toAdmin);
}

export async function archiveAd(id: string): Promise<void> {
  const r = await pool.query(
    `UPDATE community_ads SET archived_at = COALESCE(archived_at, now()) WHERE id = $1`,
    [id]
  );
  if (!r.rowCount) throw new AdError(404, 'ad_not_found');
}

export async function activeAdsForFeed(): Promise<AdDTO[]> {
  const r = await pool.query<Omit<AdDTO, 'type'>>(
    `SELECT id, brand_name, body, image_url, cta_label, cta_url
       FROM community_ads
      WHERE archived_at IS NULL
        AND (now() AT TIME ZONE '${TZ}')::date BETWEEN starts_on AND ends_on
      ORDER BY created_at, id`
  );
  return r.rows.map((row) => ({ type: 'ad' as const, ...row }));
}

export async function recordAdEvent(
  adId: string,
  userId: string,
  kind: 'view' | 'click'
): Promise<void> {
  const exists = await pool.query(`SELECT 1 FROM community_ads WHERE id = $1`, [
    adId,
  ]);
  if (!exists.rowCount) throw new AdError(404, 'ad_not_found');
  await pool.query(
    `INSERT INTO community_ad_events (ad_id, user_id, day, kind)
     VALUES ($1, $2, (now() AT TIME ZONE '${TZ}')::date, $3)
     ON CONFLICT DO NOTHING`,
    [adId, userId, kind]
  );
}

export async function adMetrics(
  adId: string,
  from?: string,
  to?: string
): Promise<{
  views: number;
  clicks: number;
  reach: number;
  daily: Array<{ day: string; views: number; clicks: number }>;
}> {
  const ad = await pool.query<{ starts_on: string; ends_on: string }>(
    `SELECT starts_on::text AS starts_on, ends_on::text AS ends_on FROM community_ads WHERE id = $1`,
    [adId]
  );
  if (!ad.rows[0]) throw new AdError(404, 'ad_not_found');
  const f = from ?? ad.rows[0].starts_on;
  const t = to ?? ad.rows[0].ends_on;
  const daily = await pool.query<{
    day: string;
    views: number;
    clicks: number;
  }>(
    `SELECT day::text AS day,
            count(*) FILTER (WHERE kind = 'view')::int AS views,
            count(*) FILTER (WHERE kind = 'click')::int AS clicks
       FROM community_ad_events
      WHERE ad_id = $1 AND day BETWEEN $2::date AND $3::date
      GROUP BY day ORDER BY day`,
    [adId, f, t]
  );
  const reach = await pool.query<{ n: number }>(
    `SELECT count(DISTINCT user_id)::int AS n FROM community_ad_events
      WHERE ad_id = $1 AND kind = 'view' AND day BETWEEN $2::date AND $3::date`,
    [adId, f, t]
  );
  return {
    views: daily.rows.reduce((a, d) => a + d.views, 0),
    clicks: daily.rows.reduce((a, d) => a + d.clicks, 0),
    reach: reach.rows[0].n,
    daily: daily.rows,
  };
}

/**
 * Sum of monthly fees of ads whose effective range overlaps the month.
 * Effective end = LEAST(ends_on, archived date in BA). No proration.
 */
export async function adRevenueForMonth(periodISO: string): Promise<number> {
  const r = await pool.query<{ total: string }>(
    `SELECT COALESCE(SUM(monthly_fee_ars), 0) AS total
       FROM community_ads
      WHERE starts_on <= (date_trunc('month', $1::date) + interval '1 month - 1 day')::date
        AND LEAST(ends_on, COALESCE((archived_at AT TIME ZONE '${TZ}')::date, ends_on))
            >= date_trunc('month', $1::date)::date
        AND COALESCE((archived_at AT TIME ZONE '${TZ}')::date, ends_on) >= starts_on`,
    [periodISO]
  );
  return Number(r.rows[0].total);
}
