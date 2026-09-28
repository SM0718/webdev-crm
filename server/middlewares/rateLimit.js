import rateLimit from 'express-rate-limit';

import { env } from '../src/env.js';

const isTest = env.NODE_ENV === 'test';

/**
 * Throttles credential guessing on the login endpoint.
 * Disabled under `NODE_ENV=test` so the integration suite can log in freely.
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isTest ? 0 : 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => isTest,
  message: {
    success: false,
    message: 'Too many sign-in attempts. Wait 15 minutes and try again.',
  },
});

export { loginLimiter };
export default loginLimiter;
