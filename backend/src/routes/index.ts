import { Router } from 'express';
import onboarding from './onboarding.js';
import athlete from './athlete.js';
import coach from './coach.js';
import subscriptions from './subscriptions.js';

const router = Router();
router.use('/onboarding', onboarding);
router.use('/athlete', athlete);
router.use('/coach', coach);
router.use('/subscriptions', subscriptions);
export default router;
