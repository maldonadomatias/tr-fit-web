import type { Request, Response, NextFunction } from 'express';
import type { PlanInterest } from '../domain/types.js';
import { getUserTier, hasTier } from '../services/tier.service.js';

export function requireTier(min: PlanInterest) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const tier = await getUserTier(req.user!.id);
    if (!tier) return res.status(403).json({ error: 'no_plan' });
    if (!hasTier(tier, min)) {
      return res.status(403).json({
        error: 'tier_insufficient', required: min, actual: tier,
      });
    }
    next();
  };
}
