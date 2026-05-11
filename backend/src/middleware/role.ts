import type { Request, Response, NextFunction } from 'express';
import type { AuthUser } from './auth.js';

export function requireRole(...roles: AuthUser['role'][]) {
  return function check(
    req: Request,
    res: Response,
    next: NextFunction
  ): void {
    if (!req.user) {
      res.status(401).json({ error: 'unauthenticated' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'forbidden', required: roles });
      return;
    }
    next();
  };
}
