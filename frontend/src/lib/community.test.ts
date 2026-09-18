import { describe, expect, it } from 'vitest';
import {
  buildAdReport,
  fmtAge,
  groupAds,
  reportAgeTone,
  validateAdForm,
  validatePublishForm,
  type AdFormValues,
} from './community';
import type { CommunityAd } from '@/hooks/useCommunity';

const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' });
const validAd: AdFormValues = {
  brand_name: 'Marca',
  body: '',
  cta_label: 'Ver',
  cta_url: 'https://marca.example',
  monthly_fee_ars: '50000',
  starts_on: '2026-10-01',
  ends_on: '2026-12-31',
  image: file,
};

const ad = (over: Partial<CommunityAd>): CommunityAd => ({
  id: 'a',
  brand_name: 'Marca',
  body: '',
  image_url: 'u',
  cta_label: 'Ver',
  cta_url: 'https://x',
  monthly_fee_ars: 1,
  starts_on: '2026-10-01',
  ends_on: '2026-10-31',
  archived_at: null,
  created_at: '2026-09-01T00:00:00Z',
  status: 'active',
  ...over,
});

describe('reportAgeTone', () => {
  it('turns red strictly after 20 hours', () => {
    expect(reportAgeTone(20)).toBe('normal');
    expect(reportAgeTone(20.1)).toBe('danger');
  });
});

describe('fmtAge', () => {
  it('formats minutes, hours and days', () => {
    expect(fmtAge(0.5)).toBe('30 min');
    expect(fmtAge(5.2)).toBe('5 h');
    expect(fmtAge(51)).toBe('2 d 3 h');
  });
});

describe('validateAdForm', () => {
  it('accepts a valid ad', () => {
    expect(validateAdForm(validAd)).toEqual({});
  });
  it('requires brand, image, cta and url', () => {
    const e = validateAdForm({
      ...validAd,
      brand_name: ' ',
      image: null,
      cta_label: '',
      cta_url: 'marca.com',
    });
    expect(Object.keys(e).sort()).toEqual([
      'brand_name',
      'cta_label',
      'cta_url',
      'image',
    ]);
  });
  it('rejects negative or empty fee and end before start', () => {
    expect(
      validateAdForm({ ...validAd, monthly_fee_ars: '-1' }).monthly_fee_ars
    ).toBeDefined();
    expect(
      validateAdForm({ ...validAd, monthly_fee_ars: '' }).monthly_fee_ars
    ).toBeDefined();
    expect(
      validateAdForm({ ...validAd, ends_on: '2026-09-30' }).ends_on
    ).toBeDefined();
  });
  it('limits body to 280 chars and rejects non-image files', () => {
    expect(
      validateAdForm({ ...validAd, body: 'x'.repeat(281) }).body
    ).toBeDefined();
    const pdf = new File(['x'], 'a.pdf', { type: 'application/pdf' });
    expect(validateAdForm({ ...validAd, image: pdf }).image).toBeDefined();
  });
});

describe('validatePublishForm', () => {
  it('event needs place and date', () => {
    const e = validatePublishForm({
      kind: 'event',
      body: 'Asado',
      event_location: '',
      event_starts_at: '',
      pin: false,
    });
    expect(Object.keys(e).sort()).toEqual([
      'event_location',
      'event_starts_at',
    ]);
  });
  it('announcement needs body', () => {
    expect(
      validatePublishForm({
        kind: 'announcement',
        body: ' ',
        event_location: '',
        event_starts_at: '',
        pin: false,
      }).body
    ).toBeDefined();
  });
});

describe('groupAds', () => {
  it('splits by status', () => {
    const g = groupAds([
      ad({ id: '1', status: 'active' }),
      ad({ id: '2', status: 'upcoming' }),
      ad({ id: '3', status: 'expired' }),
      ad({ id: '4', status: 'archived' }),
    ]);
    expect(g.active.map((a) => a.id)).toEqual(['1']);
    expect(g.upcoming.map((a) => a.id)).toEqual(['2']);
    expect(g.ended.map((a) => a.id)).toEqual(['3', '4']);
  });
});

describe('buildAdReport', () => {
  it('produces WhatsApp-ready text with the numbers', () => {
    const txt = buildAdReport(
      ad({
        brand_name: 'Proteína X',
        starts_on: '2026-10-01',
        ends_on: '2026-10-31',
      }),
      {
        views: 1200,
        clicks: 36,
        reach: 85,
        daily: [],
      }
    );
    expect(txt).toContain('Proteína X');
    expect(txt).toContain('1.200');
    expect(txt).toContain('36');
    expect(txt).toContain('85');
    expect(txt).toContain('3,0%'); // CTR = 36 / 1200
  });
});
