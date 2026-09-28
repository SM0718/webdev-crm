import cors from 'cors';
import express from 'express';
import mongoose from 'mongoose';

import { env } from './env.js';
import routes from '../routes/index.js';
import { errorHandler, notFoundHandler } from '../middlewares/index.js';

const app = express();

app.set('trust proxy', 1);

/* Normalised list (trailing slashes stripped, blanks dropped) built in env.js.
   Matching is exact because credentials are enabled, so `*` is not an option. */
app.use(
  cors({
    origin: env.CLIENT_URLS,
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
console.log(`[cors] allowed origins: ${env.CLIENT_URLS.join(', ') || '(none)'}`);

export { app, mongoose };
export default app;
