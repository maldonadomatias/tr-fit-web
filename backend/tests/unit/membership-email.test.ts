import { membershipExpiringTemplate, membershipExpiredTemplate } from '../../src/services/email-templates.js';

describe('membership email templates', () => {
  it('expiring template names the date and days left', () => {
    const html = membershipExpiringTemplate({ name: 'Mati', paidUntil: '2026-06-30', daysLeft: 5 });
    expect(html).toContain('Mati');
    expect(html).toContain('2026-06-30');
    expect(html).toMatch(/5/);
  });

  it('expired template prompts renewal', () => {
    const html = membershipExpiredTemplate({ name: 'Mati' });
    expect(html).toContain('Mati');
    expect(html.toLowerCase()).toContain('renov');
  });
});
