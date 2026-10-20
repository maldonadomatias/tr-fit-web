import { buildBillingUpdate } from '../../src/services/billing.service.js';

describe('buildBillingUpdate', () => {
  it('only includes provided whitelisted fields', () => {
    const { sets, vals } = buildBillingUpdate({ alias: 'x', amount: 5000 });
    expect(sets).toEqual(['alias = $1', 'amount = $2']);
    expect(vals).toEqual(['x', 5000]);
  });

  it('ignores unknown keys', () => {
    const { sets } = buildBillingUpdate({ hacker: 1 } as never);
    expect(sets).toEqual([]);
  });

  it('includes the vacation maintenance price', () => {
    const { sets, vals } = buildBillingUpdate({ vacation_fee_ars: 10000 });
    expect(sets).toEqual(['vacation_fee_ars = $1']);
    expect(vals).toEqual([10000]);
  });

  it('includes promo prices, including a cleared one', () => {
    const { sets, vals } = buildBillingUpdate({
      quarterly_promo_ars: 60000,
      annual_promo_ars: null,
    });
    expect(sets).toEqual(['quarterly_promo_ars = $1', 'annual_promo_ars = $2']);
    expect(vals).toEqual([60000, null]);
  });

  it('returns empty for empty input', () => {
    expect(buildBillingUpdate({})).toEqual({ sets: [], vals: [] });
  });
});
