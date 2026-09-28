import cors from 'cors';
import express from 'express';
import mongoose from 'mongoose';

import { env } from './env.js';
import routes from '../routes/index.js';
import { errorHandler, notFoundHandler } from '../middlewares/index.js';

const app = express();

app.set('trust proxy', 1);

/* Exact-match list, so a stale CLIENT_URL silently blocks a deployed site
   and the browser only reports a generic CORS failure. Log it at boot. */
const allowedOrigins = env.CLIENT_URL.split(',').map((url) => url.trim()).filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  }),
);

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/api', routes);

app.use(notFoundHandler);
app.use(errorHandler);

// Browsers hide CORS rejections behind "Network Error", so make the real
// allow-list visible in the deploy logs.
if (env.NODE_ENV === 'production') {
  console.log(`[cors] allowed origins: ${allowedOrigins.join(', ') || '(none - every browser request will fail)'}`);
}

export { app, mongoose };
export default app;
