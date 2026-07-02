import { Router, type Request, type Response } from 'express';
import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import logger from '../utils/logger.js';
import {
  loginLimiter, signupLimiter, forgotPasswordLimiter, resendVerifyLimiter,
  deleteAccountLimiter, skipInTests,
} from '../middleware/rate-limit.js';
import {
  signupPayload, loginPayload, refreshPayload, logoutPayload,
  forgotPasswordPayload, verifyResetCodePayload, resetPasswordPayload,
  deleteAccountPayload,
} from '../domain/schemas.js';
import {
  signup, login, refresh, logout,
  verifyEmail, resendVerification,
  forgotPassword, verifyResetCode, resetPassword, deleteAccount,
  LoginError, RefreshError, VerifyError, ResetError, DeleteAccountError,
} from '../services/auth.service.js';
import {
  verifySuccessPage, verifyErrorPage,
} from '../views/reset-password.html.js';
import { env } from '../config/env.js';

const router = Router();

router.use(express.urlencoded({ extended: false }));

router.post('/signup', skipInTests(signupLimiter), async (req: Request, res: Response) => {
  const parsed = signupPayload.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_payload', issues: parsed.error.issues });
  try {
    const out = await signup(parsed.data.email, parsed.data.password);
    return res.status(201).json({
      userId: out.userId,
      email: out.email,
      verifyRequired: true,
      ...(out.emailSendFailed ? { emailSendFailed: true } : {}),
    });
  } catch (e) {
    if ((e as Error & { code?: string }).code === 'EMAIL_TAKEN') {
      return res.status(409).json({ error: 'email_already_registered' });
    }
    throw e;
  }
});

router.post('/login', skipInTests(loginLimiter), async (req: Request, res: Response) => {
  const parsed = loginPayload.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_payload' });
  try {
    const out = await login(parsed.data.email, parsed.data.password, {
      userAgent: req.header('user-agent') ?? null,
      ipAddress: req.ip ?? null,
    });
    return res.status(200).json(out);
  } catch (e) {
    if (e instanceof LoginError) {
      if (e.reason === 'invalid_credentials') {
        return res.status(401).json({ error: 'invalid_credentials' });
      }
      return res.status(403).json({ error: 'blocked', reason: e.reason });
    }
    throw e;
  }
});

router.post('/refresh', async (req: Request, res: Response) => {
  const parsed = refreshPayload.safeParse(req.body);
  if (!parsed.success) return res.status(401).json({ error: 'invalid' });
  try {
    const out = await refresh(parsed.data.refreshToken, {
      userAgent: req.header('user-agent') ?? null,
      ipAddress: req.ip ?? null,
    });
    return res.status(200).json(out);
  } catch (e) {
    if (e instanceof RefreshError) {
      return res.status(401).json({ error: 'invalid', reason: e.reason });
    }
    throw e;
  }
});

router.post('/logout', async (req: Request, res: Response) => {
  const parsed = logoutPayload.safeParse(req.body);
  if (!parsed.success) return res.status(204).end();
  await logout(parsed.data.refreshToken);
  return res.status(204).end();
});

// Self-service account deletion (App Store Guideline 5.1.1(v)).
// Wrong password returns 403 — not 401, which would trigger the mobile
// client's token-refresh-and-retry path.
router.delete('/account', requireAuth, skipInTests(deleteAccountLimiter), async (req: Request, res: Response) => {
  const parsed = deleteAccountPayload.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_payload' });
  try {
    await deleteAccount(req.user!.id, parsed.data.password);
    return res.status(204).end();
  } catch (e) {
    if (e instanceof DeleteAccountError) {
      const status =
        e.reason === 'invalid_credentials' ? 403 :
        e.reason === 'not_athlete' ? 403 :
        404;
      return res.status(status).json({ error: e.reason });
    }
    throw e;
  }
});

router.get('/verify-email', async (req: Request, res: Response) => {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  if (!token || token.length < 32) {
    return res.status(400).type('html').send(verifyErrorPage('invalid'));
  }
  try {
    await verifyEmail(token);
    return res.status(200).type('html').send(verifySuccessPage(env.APP_DEEP_LINK_SCHEME));
  } catch (e) {
    if (e instanceof VerifyError) {
      return res.status(400).type('html').send(verifyErrorPage(e.reason));
    }
    throw e;
  }
});

router.post('/resend-verification', requireAuth, skipInTests(resendVerifyLimiter), async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const out = await resendVerification(userId);
  return res.status(200).json(out);
});

router.post('/forgot-password', skipInTests(forgotPasswordLimiter), async (req: Request, res: Response) => {
  const parsed = forgotPasswordPayload.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_payload' });
  try {
    await forgotPassword(parsed.data.email, req.ip ?? null);
  } catch (e) {
    logger.error({ err: e }, 'forgot-password failed');
    // Still return 200 — anti-enumeration
  }
  return res.status(200).json({ message: 'if account exists, code sent' });
});

router.post('/verify-reset-code', async (req: Request, res: Response) => {
  const parsed = verifyResetCodePayload.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_payload' });
  try {
    await verifyResetCode(parsed.data.email, parsed.data.code);
    return res.status(200).json({ valid: true });
  } catch (e) {
    if (e instanceof ResetError) {
      const status = e.reason === 'code_expired' ? 410 : 400;
      const body: Record<string, unknown> = { error: e.reason };
      if (e.attemptsLeft != null) body.attemptsLeft = e.attemptsLeft;
      return res.status(status).json(body);
    }
    throw e;
  }
});

router.post('/reset-password', async (req: Request, res: Response) => {
  const parsed = resetPasswordPayload.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_payload' });
  try {
    const result = await resetPassword(parsed.data.email, parsed.data.code, parsed.data.newPassword);
    return res.status(200).json(result);
  } catch (e) {
    if (e instanceof ResetError) {
      const status =
        e.reason === 'code_expired' ? 410 :
        e.reason === 'not_athlete' ? 403 :
        400;
      const body: Record<string, unknown> = { error: e.reason };
      if (e.attemptsLeft != null) body.attemptsLeft = e.attemptsLeft;
      return res.status(status).json(body);
    }
    throw e;
  }
});

export default router;
