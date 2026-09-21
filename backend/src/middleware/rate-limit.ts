import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { Request, Response, RequestHandler } from 'express';

function json429(_req: Request, res: Response): void {
  const retryAfter = res.getHeader('Retry-After');
  res.status(429).json({
    error: 'rate_limited',
    retryAfter:
      typeof retryAfter === 'string' || typeof retryAfter === 'number'
        ? Number(retryAfter)
        : undefined,
  });
}

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: json429,
});

export const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: json429,
});

// Forgot-password: keyed by email (request body), not IP.
// Falls back to ipKeyGenerator() for IPv6 safety when email missing.
export const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request, res: Response) => {
    const email =
      typeof req.body?.email === 'string' ? req.body.email.toLowerCase() : '';
    return email ? `forgot:${email}` : `forgot:${ipKeyGenerator(req.ip ?? '')}`;
  },
  handler: json429,
});

export const resendVerifyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 1,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request, res: Response) => {
    const userId = req.user?.id;
    return userId
      ? `resend-verify:${userId}`
      : `resend-verify:${ipKeyGenerator(req.ip ?? '')}`;
  },
  handler: json429,
});

// Account deletion: keyed by user id — limits password guesses against
// the confirmation step without locking the IP out of login.
export const deleteAccountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request, res: Response) => {
    const userId = req.user?.id;
    return userId
      ? `delete-account:${userId}`
      : `delete-account:${ipKeyGenerator(req.ip ?? '')}`;
  },
  handler: json429,
});

// Helper to disable rate limiting in tests by default.
// Tests can opt in via RATE_LIMIT_TEST=on.
export function skipInTests(handler: RequestHandler): RequestHandler {
  return (req, res, next) => {
    if (
      process.env.NODE_ENV === 'test' &&
      process.env.RATE_LIMIT_TEST !== 'on'
    ) {
      return next();
    }
    return handler(req, res, next);
  };
}

/** Per-user limiter (falls back to IP when unauthenticated). Wrapped with skipInTests. */
export function userKeyedLimiter(
  prefix: string,
  windowMs: number,
  max: number
): RequestHandler {
  return skipInTests(
    rateLimit({
      windowMs,
      max,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req: Request) =>
        req.user?.id
          ? `${prefix}:${req.user.id}`
          : `${prefix}:${ipKeyGenerator(req.ip ?? '')}`,
      handler: json429,
    })
  );
}

export const communityPostLimiter = userKeyedLimiter(
  'community-post',
  60 * 60 * 1000,
  10
);
export const communityCommentLimiter = userKeyedLimiter(
  'community-comment',
  60 * 60 * 1000,
  60
);
export const communityReportLimiter = userKeyedLimiter(
  'community-report',
  24 * 60 * 60 * 1000,
  20
);
export const communityAdEventLimiter = userKeyedLimiter(
  'community-ad-event',
  60 * 60 * 1000,
  300
);
