import { Router } from 'express';

import authRoutes from './authRoutes.js';
import leadRoutes from './leadRoutes.js';
import teamRoutes from './teamRoutes.js';
import { analytics } from '../controllers/leadController.js';
import { verifyToken } from '../middlewares/auth.js';

const router = Router();

router.get('/health', (req, res) => {
  res.json({ success: true, status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

router.use('/auth', authRoutes);
router.use('/leads', leadRoutes);
router.use('/team', teamRoutes);

/* Spec-documented alias: GET /api/analytics */
router.get('/analytics', verifyToken, analytics);

export default router;
