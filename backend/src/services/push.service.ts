import admin from 'firebase-admin';
import { getFirebaseApp } from '../config/firebase.js';

export type SendStatus = 'sent' | 'token_invalid' | 'failed';

const TOKEN_INVALID_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-argument',
  'messaging/invalid-registration-token',
]);

export async function sendPush(
  token: string,
  payload: { title: string; body: string; data?: Record<string, string> },
): Promise<SendStatus> {
  getFirebaseApp();
  try {
    await admin.messaging().send({
      token,
      notification: { title: payload.title, body: payload.body },
      data: payload.data ?? {},
    });
    return 'sent';
  } catch (e: unknown) {
    const code = (e as { code?: string }).code ?? '';
    if (TOKEN_INVALID_CODES.has(code)) return 'token_invalid';
    return 'failed';
  }
}
