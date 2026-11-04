import { describe, expect, it } from '@jest/globals';
import { loadMailConfig } from './config.js';

const from = 'App <no-reply@example.com>';

const smtpEnv = {
  SMTP_HOST: 'email-smtp.us-east-1.amazonaws.com',
  SMTP_USER: 'U',
  SMTP_PASS: 'P',
  MAIL_FROM: from,
};

describe('loadMailConfig', () => {
  it('returns smtp config with port 587 by default when all SMTP vars are set', () => {
    expect(loadMailConfig(smtpEnv)).toEqual({
      mode: 'smtp',
      host: 'email-smtp.us-east-1.amazonaws.com',
      port: 587,
      user: 'U',
      pass: 'P',
      from,
    });
  });

  it('parses SMTP_PORT as a number', () => {
    expect(loadMailConfig({ ...smtpEnv, SMTP_PORT: '465' })).toEqual({
      mode: 'smtp',
      host: 'email-smtp.us-east-1.amazonaws.com',
      port: 465,
      user: 'U',
      pass: 'P',
      from,
    });
  });

  it('throws naming SMTP_PORT when it is not a number', () => {
    expect(() => loadMailConfig({ ...smtpEnv, SMTP_PORT: 'abc' })).toThrow(
      /Invalid mail config:[\s\S]*SMTP_PORT/
    );
  });

  it('returns log mode outside production when no SMTP vars are set', () => {
    expect(
      loadMailConfig({
        NODE_ENV: 'development',
        MAIL_FROM: from,
      })
    ).toEqual({ mode: 'log', from });
  });

  it('throws naming SMTP_HOST, SMTP_USER and SMTP_PASS in production when SMTP is missing', () => {
    const load = () =>
      loadMailConfig({
        NODE_ENV: 'production',
        MAIL_FROM: from,
      });

    expect(load).toThrow(/Invalid mail config:/);
    expect(load).toThrow(/SMTP_HOST/);
    expect(load).toThrow(/SMTP_USER/);
    expect(load).toThrow(/SMTP_PASS/);
  });

  it('throws naming SMTP_PASS when SMTP config is partial outside production', () => {
    expect(() =>
      loadMailConfig({
        NODE_ENV: 'development',
        SMTP_HOST: smtpEnv.SMTP_HOST,
        SMTP_USER: smtpEnv.SMTP_USER,
        MAIL_FROM: from,
      })
    ).toThrow(/Invalid mail config:[\s\S]*SMTP_PASS/);
  });

  it('throws naming MAIL_FROM when it is missing', () => {
    expect(() =>
      loadMailConfig({
        NODE_ENV: 'development',
      })
    ).toThrow(/Invalid mail config:[\s\S]*MAIL_FROM/);
  });

  it('treats empty strings as missing', () => {
    expect(() =>
      loadMailConfig({
        NODE_ENV: 'production',
        SMTP_HOST: '',
        SMTP_USER: 'U',
        SMTP_PASS: 'P',
        MAIL_FROM: from,
      })
    ).toThrow(/Invalid mail config:[\s\S]*SMTP_HOST/);
  });
});
