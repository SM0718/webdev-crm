import { Router } from 'express';

import {
  addRemark,
  analytics,
  assignLeadsFromPdf,
  bulkAssign,
  bulkSave,
  deleteLead,
  downloadLeadPdf,
  getLead,
  listLeads,
  parsePdf,
  updatePayment,
  updateStatus,
} from '../controllers/leadController.js';
import { requireAdmin, verifyToken } from '../middlewares/auth.js';
import { asyncHandler } from '../middlewares/error.js';
import { upload } from '../middlewares/upload.js';
import { validate } from '../middlewares/validate.js';
import {
  addRemarkSchema,
  assignPdfSchema,
  bulkAssignSchema,
  bulkSaveSchema,
  idParamSchema,
  listLeadsQuerySchema,
  updatePaymentSchema,
  updateStatusSchema,
} from '../validators/schemas.js';

const router = Router();

router.use(verifyToken);

/* ---- Two step PDF ingestion (admin only) ------------------------------- */
router.post('/parse-pdf', requireAdmin, upload.single('file'), parsePdf);
router.post('/bulk-save', requireAdmin, validate(bulkSaveSchema), bulkSave);

/* ---- Hand a whole PDF to one member (admin only) ----------------------- */
// `upload` runs first so the text field it appends is present for `validate`.
router.post(
  '/assign-pdf',
  requireAdmin,
  upload.single('file'),
  validate(assignPdfSchema),
  assignLeadsFromPdf,
);

/* ---- Bulk assignment (admin only) -------------------------------------- */
router.patch('/bulk-assign', requireAdmin, validate(bulkAssignSchema), bulkAssign);

/* ---- Listing / analytics ----------------------------------------------- */
router.get('/', validate(listLeadsQuerySchema, 'query'), listLeads);
router.get('/analytics', analytics);

/* ---- Single lead ------------------------------------------------------- */
router.patch('/:id/status', validate(idParamSchema, 'params'), validate(updateStatusSchema), updateStatus);
router.post('/:id/remarks', validate(idParamSchema, 'params'), validate(addRemarkSchema), addRemark);
// Money is admin bookkeeping, so only admins can move it.
router.patch(
  '/:id/payment',
  requireAdmin,
  validate(idParamSchema, 'params'),
  validate(updatePaymentSchema),
  updatePayment,
);
router.get('/:id/pdf', validate(idParamSchema, 'params'), asyncHandler(downloadLeadPdf));
router.get('/:id', validate(idParamSchema, 'params'), getLead);
router.delete('/:id', requireAdmin, validate(idParamSchema, 'params'), asyncHandler(deleteLead));

export default router;
