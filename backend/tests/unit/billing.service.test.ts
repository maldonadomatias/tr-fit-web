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

  it('returns empty for empty input', () => {
    expect(buildBillingUpdate({})).toEqual({ sets: [], vals: [] });
  });
});
