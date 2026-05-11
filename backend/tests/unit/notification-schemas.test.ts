import { pushRegisterPayload, notificationPrefsPayload } from '../../src/domain/schemas.js';

describe('pushRegisterPayload', () => {
  it('accepts valid', () => {
    const r = pushRegisterPayload.safeParse({ token: 'a'.repeat(30), platform: 'android' });
    expect(r.success).toBe(true);
  });
  it('rejects short token', () => {
    expect(pushRegisterPayload.safeParse({ token: 'short', platform: 'ios' }).success).toBe(false);
  });
  it('rejects unknown platform', () => {
    expect(pushRegisterPayload.safeParse({ token: 'a'.repeat(30), platform: 'desktop' }).success).toBe(false);
  });
});

describe('notificationPrefsPayload', () => {
  it('accepts partial update', () => {
    expect(notificationPrefsPayload.safeParse({ session_reminder: false }).success).toBe(true);
  });
  it('accepts empty object', () => {
    expect(notificationPrefsPayload.safeParse({}).success).toBe(true);
  });
  it('rejects unknown key', () => {
    const r = notificationPrefsPayload.safeParse({ session_reminder: true, unknown_key: true });
    expect(r.success).toBe(false);
  });
});
