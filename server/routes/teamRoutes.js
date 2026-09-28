import { Router } from 'express';

import { createMember, listTeam, resetMemberPassword, toggleMember } from '../controllers/teamController.js';
import { requireAdmin, verifyToken } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import { createMemberSchema, idParamSchema, resetPasswordSchema } from '../validators/schemas.js';

const router = Router();

router.use(verifyToken, requireAdmin);

router.get('/', listTeam);
router.post('/', validate(createMemberSchema), createMember);
router.patch('/:id/toggle', validate(idParamSchema, 'params'), toggleMember);
router.patch('/:id/password', validate(idParamSchema, 'params'), validate(resetPasswordSchema), resetMemberPassword);

export default router;
