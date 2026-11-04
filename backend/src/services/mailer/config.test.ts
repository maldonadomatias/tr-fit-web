import { describe, expect, it } from '@jest/globals';
import { loadClientConfig, loadMailBrand } from './config.js';

describe('loadClientConfig', () => {
  it('reads MAILER_URL without a trailing slash and MAILER_API_KEY', () => {
    expect(
      loadClientConfig({
        MAILER_URL: 'http://mailer:3000/',
        MAILER_API_KEY: 'mk_x',
      })
    ).toEqual({ url: 'http://mailer:3000', apiKey: 'mk_x' });
  });

  it('throws naming both variables when they are missing or empty', () => {
    expect(() => loadClientConfig({ MAILER_URL: '' })).toThrow(
      'Invalid mail config: MAILER_URL, MAILER_API_KEY'
    );
  });

  it('throws naming MAILER_URL when it is not http or https', () => {
    expect(() =>
      loadClientConfig({ MAILER_URL: 'ftp://mailer', MAILER_API_KEY: 'k' })
    ).toThrow('Invalid mail config: MAILER_URL');
  });

  it('never echoes the api key in the error', () => {
    expect(() =>
      loadClientConfig({ MAILER_URL: 'nope', MAILER_API_KEY: 'mk_secret' })
    ).toThrow(
      expect.objectContaining({
        message: expect.not.stringContaining('mk_secret'),
      })
    );
  });
});

describe('loadMailBrand', () => {
  it('requires MAIL_BRAND_NAME and defaults the color', () => {
    expect(loadMailBrand({ MAIL_BRAND_NAME: 'TR Fit' })).toEqual({
      name: 'TR Fit',
      color: '#111111',
    });
  });

  it('throws naming MAIL_BRAND_NAME when it is missing', () => {
    expect(() => loadMailBrand({})).toThrow(
      /Invalid mail config:[\s\S]*MAIL_BRAND_NAME/
    );
  });

  it('reads the logo and color', () => {
    expect(
      loadMailBrand({
        MAIL_BRAND_NAME: 'Atriax',
        MAIL_LOGO_URL: 'https://atriax.test/logo.png',
        MAIL_BRAND_COLOR: '#0A7CFF',
      })
    ).toEqual({
      name: 'Atriax',
      logoUrl: 'https://atriax.test/logo.png',
      color: '#0A7CFF',
    });
  });

  it('throws naming MAIL_LOGO_URL when it is not https', () => {
    expect(() =>
      loadMailBrand({
        MAIL_BRAND_NAME: 'A',
        MAIL_LOGO_URL: 'http://x.test/l.png',
      })
    ).toThrow(/Invalid mail config:[\s\S]*MAIL_LOGO_URL/);
  });

  it('throws naming MAIL_BRAND_COLOR when it is not a #RRGGBB hex color', () => {
    expect(() =>
      loadMailBrand({ MAIL_BRAND_NAME: 'A', MAIL_BRAND_COLOR: 'red;x:y' })
    ).toThrow(/Invalid mail config:[\s\S]*MAIL_BRAND_COLOR/);
  });

  it('treats empty optional values as missing', () => {
    expect(
      loadMailBrand({
        MAIL_BRAND_NAME: 'App',
        MAIL_LOGO_URL: '',
        MAIL_BRAND_COLOR: '',
      })
    ).toEqual({ name: 'App', color: '#111111' });
  });
});
