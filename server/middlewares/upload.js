import multer from 'multer';

import { ApiError } from './error.js';

const MAX_FILE_SIZE_MB = 10;

const ALLOWED_MIME = new Set(['application/pdf', 'application/x-pdf', 'application/octet-stream']);

/**
 * PDF uploads are parsed in memory and never written to disk, so we only need
 * memoryStorage plus a MIME / extension / size guard.
 */
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_MB * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const looksLikePdf =
      ALLOWED_MIME.has(file.mimetype) && (file.originalname.toLowerCase().endsWith('.pdf') || file.mimetype === 'application/pdf');

    if (!looksLikePdf) {
      return cb(ApiError.badRequest('Only PDF files can be uploaded.'));
    }
    return cb(null, true);
  },
});
