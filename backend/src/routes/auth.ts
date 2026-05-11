import { Router, type Request, type Response } from 'express';
import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  loginLimiter, signupLimiter, forgotPasswordLimiter, resendVerifyLimiter,
  skipInTests,
} from '../middleware/rate-limit.js';
import {
  signupPayload, loginPayload, refreshPayload, logoutPayload,
  forgotPasswordPayload, resetPasswordPayload,
} from '../domain/schemas.js';
import {
  signup, login, refresh, logout,
  verifyEmail, resendVerification,
  forgotPassword, resetPassword,
  LoginError, RefreshError, VerifyError, ResetError,
} from '../services/auth.service.js';
import {
  resetPasswordPage, resetPasswordSuccessPage,
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
      if (e.reason === 'email_not_verified') {
        return res.status(403).json({ error: 'blocked', reason: 'email_not_verified' });
      }
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
  } catch {
    return res.status(503).json({ error: 'email_send_failed' });
  }
  return res.status(200).json({ message: 'if email exists, link sent' });
});

router.post('/reset-password', async (req: Request, res: Response) => {
  const parsed = resetPasswordPayload.safeParse(req.body);
  const wantsHtml = req.header('accept')?.includes('text/html') ||
    req.header('content-type')?.includes('urlencoded');

  if (!parsed.success) {
    if (wantsHtml) {
      const token = typeof req.body?.token === 'string' ? req.body.token : '';
      return res.status(400).type('html').send(resetPasswordPage(token, 'Password debe tener al menos 8 caracteres'));
    }
    return res.status(400).json({ error: 'invalid_payload' });
  }
  try {
    await resetPassword(parsed.data.token, parsed.data.newPassword);
    if (wantsHtml) return res.status(200).type('html').send(resetPasswordSuccessPage());
    return res.status(200).json({ message: 'password updated' });
  } catch (e) {
    if (e instanceof ResetError) {
      if (wantsHtml) return res.status(400).type('html').send(resetPasswordPage(parsed.data.token, `Token ${e.reason}`));
      return res.status(400).json({ error: `token_${e.reason}` });
    }
    throw e;
  }
});

export default router;
