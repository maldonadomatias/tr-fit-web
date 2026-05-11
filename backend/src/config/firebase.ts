import admin from 'firebase-admin';
import { env } from './env.js';

let app: admin.app.App | null = null;

export function getFirebaseApp(): admin.app.App {
  if (app) return app;
  if (admin.apps.length > 0) {
    app = admin.apps[0]!;
    return app;
  }
  const sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON) as admin.ServiceAccount;
  app = admin.initializeApp({ credential: admin.credential.cert(sa) });
  return app;
}
