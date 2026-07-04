import { verifySuccessPage } from '../../src/views/reset-password.html.js';

describe('verifySuccessPage', () => {
  it('renders deep link with the given scheme', () => {
    const html = verifySuccessPage('tr-fit');
    expect(html).toContain('href="tr-fit://login?verified=1"');
  });

  it('does not render the legacy unhyphenated scheme when given the app scheme', () => {
    const html = verifySuccessPage('tr-fit');
    expect(html).not.toContain('trfit://');
  });
});
