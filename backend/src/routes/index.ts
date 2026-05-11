import { Router } from 'express';
import onboarding from './onboarding.js';
import athlete from './athlete.js';
import coach from './coach.js';
import auth from './auth.js';

const router = Router();
router.use('/auth', auth);
router.use('/onboarding', onboarding);
router.use('/athlete', athlete);
router.use('/coach', coach);
export default router;
