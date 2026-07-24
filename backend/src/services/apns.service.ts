import http2 from 'node:http2';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import logger from '../utils/logger.js';

/** The `aps` end-push body. `content-state` MUST match the widget's
 *  Codable ContentState (`{name, props}`) or iOS silently drops it. */
export function buildEndPayload(contentState: object, dismissalAtSec: number) {
  const nowSec = Math.floor(Date.now() / 1000);
  return {
    aps: {
      timestamp: nowSec,
      event: 'end',
      'dismissal-date': dismissalAtSec,
      'content-state': contentState,
    },
  };
}

let cached: { token: string; iat: number } | null = null;

/** ES256 JWT for APNs provider auth. Apple allows reuse up to 60 min; refresh
 *  at 50. Signing key is the .p8 contents (PEM) from env. */
export function apnsAuthToken(nowSec: number = Math.floor(Date.now() / 1000)): string {
  if (cached && nowSec - cached.iat < 3000) return cached.token;
  const key = env.APNS_KEY_P8.replace(/\\n/g, '\n');
  const token = jwt.sign({ iss: env.APNS_TEAM_ID, iat: nowSec }, key, {
    algorithm: 'ES256',
    header: { alg: 'ES256', kid: env.APNS_KEY_ID },
  });
  cached = { token, iat: nowSec };
  return token;
}

export type ApnsStatus = 'sent' | 'token_invalid' | 'failed';

export async function sendLiveActivityEnd(
  apnsToken: string,
  contentState: object,
  dismissalAtSec: number,
): Promise<ApnsStatus> {
  if (!env.APNS_KEY_P8 || !env.APNS_KEY_ID) {
    logger.warn('APNs not configured; skipping Live Activity end push');
    return 'failed';
  }
  const body = JSON.stringify(buildEndPayload(contentState, dismissalAtSec));
  return await new Promise<ApnsStatus>((resolve) => {
    const client = http2.connect(`https://${env.APNS_HOST}`);
    client.on('error', () => { client.close(); resolve('failed'); });
    try {
      client.setTimeout(10000, () => { client.close(); resolve('failed'); });
      const req = client.request({
        ':method': 'POST',
        ':path': `/3/device/${apnsToken}`,
        authorization: `bearer ${apnsAuthToken()}`,
        'apns-topic': `${env.APNS_BUNDLE_ID}.push-type.liveactivity`,
        'apns-push-type': 'liveactivity',
        'apns-priority': '10',
        'content-type': 'application/json',
      });
      let status = 0;
      req.on('response', (h) => { status = Number(h[':status']) || 0; });
      req.on('end', () => {
        client.close();
        if (status === 200) resolve('sent');
        else if (status === 410 || status === 400) resolve('token_invalid');
        else resolve('failed');
      });
      req.on('error', () => { client.close(); resolve('failed'); });
      req.write(body);
      req.end();
    } catch {
      client.close();
      resolve('failed');
    }
  });
}
