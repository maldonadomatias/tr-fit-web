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
export function apnsAuthToken(
  nowSec: number = Math.floor(Date.now() / 1000)
): string {
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

const DEVICE_TOKEN_REASONS = new Set([
  'BadDeviceToken',
  'Unregistered',
  'DeviceTokenNotForTopic',
]);

/** `any400` matches the Live Activity sender (every 400 drops the token).
 *  `device` keeps the token unless Apple says that device token is dead —
 *  a BadTopic must not wipe every iPhone. */
export function classifyApnsStatus(
  status: number,
  reason: string,
  mode: 'any400' | 'device'
): ApnsStatus {
  if (status === 200) return 'sent';
  if (status === 410) return 'token_invalid';
  if (status === 400 && (mode === 'any400' || DEVICE_TOKEN_REASONS.has(reason)))
    return 'token_invalid';
  return 'failed';
}

/** Visible alert. Custom keys sit next to `aps` so the app can read `route`. */
export function buildAlertPayload(
  title: string,
  body: string,
  data: Record<string, string> = {}
) {
  return {
    aps: {
      alert: { title, body },
      sound: 'default',
    },
    ...data,
  };
}

async function postToApns(opts: {
  deviceToken: string;
  topic: string;
  pushType: 'alert' | 'liveactivity';
  body: string;
  expiration?: number;
  classify400: 'any400' | 'device';
}): Promise<ApnsStatus> {
  if (!env.APNS_KEY_P8 || !env.APNS_KEY_ID) {
    logger.warn('APNs not configured; skipping push');
    return 'failed';
  }
  return await new Promise<ApnsStatus>((resolve) => {
    const client = http2.connect(`https://${env.APNS_HOST}`);
    let settled = false;
    const done = (status: ApnsStatus) => {
      if (settled) return;
      settled = true;
      client.close();
      resolve(status);
    };
    client.on('error', (err) => {
      logger.warn({ err }, 'APNs connection error');
      done('failed');
    });
    try {
      client.setTimeout(10000, () => {
        logger.warn('APNs timeout');
        done('failed');
      });
      const headers: Record<string, string> = {
        ':method': 'POST',
        ':path': `/3/device/${opts.deviceToken}`,
        authorization: `bearer ${apnsAuthToken()}`,
        'apns-topic': opts.topic,
        'apns-push-type': opts.pushType,
        'apns-priority': '10',
        'content-type': 'application/json',
      };
      if (opts.expiration !== undefined)
        headers['apns-expiration'] = String(opts.expiration);
      const req = client.request(headers);
      let status = 0;
      let raw = '';
      req.on('response', (h) => {
        status = Number(h[':status']) || 0;
      });
      req.setEncoding('utf8');
      req.on('data', (chunk: string) => {
        raw += chunk;
      });
      req.on('end', () => {
        let reason = '';
        try {
          reason = (JSON.parse(raw) as { reason?: string }).reason ?? '';
        } catch {
          /* success responses have no body */
        }
        if (status !== 200)
          logger.warn(
            { status, reason, pushType: opts.pushType },
            'APNs push failed'
          );
        done(classifyApnsStatus(status, reason, opts.classify400));
      });
      req.on('error', (err) => {
        logger.warn({ err }, 'APNs request error');
        done('failed');
      });
      req.write(opts.body);
      req.end();
    } catch (err) {
      logger.warn({ err }, 'APNs send threw');
      done('failed');
    }
  });
}

export async function sendLiveActivityEnd(
  apnsToken: string,
  contentState: object,
  dismissalAtSec: number
): Promise<ApnsStatus> {
  return postToApns({
    deviceToken: apnsToken,
    topic: `${env.APNS_BUNDLE_ID}.push-type.liveactivity`,
    pushType: 'liveactivity',
    body: JSON.stringify(buildEndPayload(contentState, dismissalAtSec)),
    classify400: 'any400',
  });
}

export async function sendApnsAlert(
  deviceToken: string,
  payload: { title: string; body: string; data?: Record<string, string> }
): Promise<ApnsStatus> {
  const day = 24 * 60 * 60;
  return postToApns({
    deviceToken,
    topic: env.APNS_BUNDLE_ID,
    pushType: 'alert',
    body: JSON.stringify(
      buildAlertPayload(payload.title, payload.body, payload.data)
    ),
    expiration: Math.floor(Date.now() / 1000) + day,
    classify400: 'device',
  });
}
