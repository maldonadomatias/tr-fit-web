import {
  communityRevisionDate,
  evaluateCommunityRevision,
  interleaveAds,
  computeFee,
} from '../../src/services/platform-fee.math.js';

describe('communityRevisionDate', () => {
  it('adds 6 months', () => {
    expect(communityRevisionDate('2026-10-01')).toBe('2027-04-01');
    expect(communityRevisionDate('2026-10-15')).toBe('2027-04-15');
  });
});

describe('evaluateCommunityRevision', () => {
  const base = { threshold: 50000, fee: 30000, fallbackFee: 40000 };
  it('average exactly at threshold keeps the fee', () => {
    const r = evaluateCommunityRevision({
      ...base,
      monthlyAdRevenues: [50000, 50000, 50000, 50000, 50000, 50000],
    });
    expect(r).toEqual({ average: 50000, newFee: 30000, downgraded: false });
  });
  it('zero ads downgrades to fallback', () => {
    const r = evaluateCommunityRevision({ ...base, monthlyAdRevenues: [] });
    expect(r).toEqual({ average: 0, newFee: 40000, downgraded: true });
  });
  it('one high month compensates', () => {
    const r = evaluateCommunityRevision({
      ...base,
      monthlyAdRevenues: [300000, 0, 0, 0, 0, 0],
    });
    expect(r.average).toBe(50000);
    expect(r.downgraded).toBe(false);
  });
  it('divides by 6 even with fewer rows and ignores rows beyond 6', () => {
    expect(
      evaluateCommunityRevision({ ...base, monthlyAdRevenues: [60000] }).average
    ).toBe(10000);
    expect(
      evaluateCommunityRevision({
        ...base,
        monthlyAdRevenues: [0, 0, 0, 0, 0, 0, 999999],
      }).average
    ).toBe(0);
  });
});

describe('interleaveAds', () => {
  const posts = (from: number, n: number) =>
    Array.from({ length: n }, (_, i) => `p${from + i}`);
  it('inserts an ad after every 8 posts', () => {
    const out = interleaveAds(posts(1, 20), ['A', 'B'], 0);
    expect(out.indexOf('A')).toBe(8);
    expect(out.indexOf('B')).toBe(17);
    expect(out).toHaveLength(22);
  });
  it('continues the count and rotation across pages', () => {
    // page 2 starts after 20 posts: next slot is after global post 24 -> 3rd slot -> ads[2 % 2] = 'A'
    const out = interleaveAds(posts(21, 20), ['A', 'B'], 20);
    expect(out[4]).toBe('A');
    expect(out[13]).toBe('B');
  });
  it('no ads -> posts unchanged', () => {
    expect(interleaveAds(posts(1, 9), [], 0)).toEqual(posts(1, 9));
  });
});

describe('computeFee with community', () => {
  it('adds community fee and ad share to the total', () => {
    const f = computeFee({
      baseFeeArs: 100000,
      activeAthletes: 0,
      grossRevenueArs: 0,
      revenueSharePct: 4,
      communityFeeArs: 30000,
      adRevenueArs: 100000,
      adSharePct: 15,
    });
    expect(f).toMatchObject({
      communityFeeArs: 30000,
      adRevenueArs: 100000,
      adShareArs: 15000,
      totalArs: 145000,
    });
  });
  it('testflight halves only the base', () => {
    const f = computeFee({
      baseFeeArs: 100000,
      activeAthletes: 0,
      grossRevenueArs: 0,
      revenueSharePct: 4,
      testflight: true,
      communityFeeArs: 30000,
      adRevenueArs: 0,
      adSharePct: 15,
    });
    expect(f.totalArs).toBe(80000);
  });
  it('defaults community fields to 0', () => {
    const f = computeFee({
      baseFeeArs: 100,
      activeAthletes: 0,
      grossRevenueArs: 0,
      revenueSharePct: 4,
    });
    expect(f).toMatchObject({
      communityFeeArs: 0,
      adRevenueArs: 0,
      adShareArs: 0,
      totalArs: 100,
    });
  });
});
