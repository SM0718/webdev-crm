import { Router } from 'express';

import { login, me, seedAdmin } from '../controllers/authController.js';
import { verifyToken } from '../middlewares/auth.js';
import { loginLimiter } from '../middlewares/rateLimit.js';
import { validate } from '../middlewares/validate.js';
import { loginSchema } from '../validators/schemas.js';

const router = Router();

router.post('/login', loginLimiter, validate(loginSchema), login);
router.get('/me', verifyToken, me);

/**
 * Idempotent re-run of the boot-time admin seed (already called on startup).
 * It can only ever create the SAME account described by ADMIN_* in `.env`,
 * so exposing it adds no privilege.
 */
router.post('/seed-admin', seedAdmin);

export default router;
