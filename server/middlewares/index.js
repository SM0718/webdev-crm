import { ZodError } from 'zod';
import multer from 'multer';

import { env } from '../src/env.js';
import { ApiError } from './error.js';

export { loginLimiter } from './rateLimit.js';

export function notFoundHandler(req, res, next) {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} does not exist.`));
}

// eslint-disable-next-line no-unused-vars -- Express identifies error handlers by arity
export function errorHandler(error, req, res, next) {
  let status = error.status ?? 500;
  let message = error.message ?? 'Something went wrong.';
  let details = error.details;

  if (error instanceof ZodError) {
    status = 400;
    message = 'Some of the submitted values are invalid.';
    details = error.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));
  } else if (error instanceof multer.MulterError) {
    status = 400;
    if (error.code === 'LIMIT_FILE_SIZE') message = 'That PDF is too large. Keep uploads under 10 MB.';
    else message = `Upload failed: ${error.message}`;
  } else if (error?.name === 'ValidationError' && error.errors) {
    // Mongoose schema validation
    status = 400;
    message = 'Some of the submitted values are invalid.';
    details = Object.values(error.errors).map((e) => ({ field: e.path, message: e.message }));
  } else if (error?.name === 'CastError') {
    status = 400;
    message = `"${error.value}" is not a valid id.`;
  } else if (error?.code === 11000) {
    status = 409;
    message = `That ${Object.keys(error.keyPattern ?? { value: 1 })[0]} is already in use.`;
  }

  if (status >= 500) {
    console.error('[error]', error);
    if (env.NODE_ENV === 'production') message = 'Something went wrong on our end.';
  }

  res.status(status).json({ success: false, message, ...(details ? { details } : {}) });
}
