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

// Helper to disable rate limiting in tests by default.
// Tests can opt in via RATE_LIMIT_TEST=on.
export function skipInTests(handler: RequestHandler): RequestHandler {
  return (req, res, next) => {
    if (process.env.NODE_ENV === 'test' && process.env.RATE_LIMIT_TEST !== 'on') {
      return next();
    }
    return handler(req, res, next);
  };
}
