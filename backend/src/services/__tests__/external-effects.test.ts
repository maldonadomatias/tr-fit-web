import { jest } from '@jest/globals';

process.env.EXTERNAL_EFFECTS_ENABLED = 'false';

const sendEmail = jest.fn<() => Promise<{ data: { id: string }; error: null }>>();
const saveFile = jest.fn<() => Promise<void>>();
const deleteFile = jest.fn<() => Promise<void>>();

jest.unstable_mockModule('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({ emails: { send: sendEmail } })),
}));
jest.unstable_mockModule('../../config/firebase.js', () => ({
  getFirebaseApp: jest.fn(),
  getStorageBucket: () => ({
    name: 'rehearsal-test-bucket',
    file: () => ({ save: saveFile, delete: deleteFile }),
  }),
}));

const { sendVerifyEmail } = await import('../email.service.js');
const { uploadBufferToStorage, deleteFromStorage } = await import('../storage.service.js');
const { sendPush } = await import('../push.service.js');
const { sendApnsAlert } = await import('../apns.service.js');
const { adjustSkeleton } = await import('../openai.service.js');

test('rehearsal cannot send email, push, or alter external storage', async () => {
  await expect(sendVerifyEmail('qa@invalid.example', 'dummy')).resolves.toBeUndefined();
  expect(sendEmail).not.toHaveBeenCalled();

  await expect(sendPush('dummy', { title: 'QA', body: 'QA' })).resolves.toBe('failed');
  await expect(sendApnsAlert('dummy', { title: 'QA', body: 'QA' })).resolves.toBe('failed');

  await expect(uploadBufferToStorage('qa/test', Buffer.from('QA'), 'text/plain'))
    .rejects.toThrow('external_effects_disabled');
  await deleteFromStorage('qa/test');
  expect(saveFile).not.toHaveBeenCalled();
  expect(deleteFile).not.toHaveBeenCalled();
  await expect(adjustSkeleton(null as never)).rejects.toThrow('external_effects_disabled');
});
