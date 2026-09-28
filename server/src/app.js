import cors from 'cors';
import express from 'express';
import mongoose from 'mongoose';

import { env } from './env.js';
import routes from '../routes/index.js';
import { errorHandler, notFoundHandler } from '../middlewares/index.js';

const app = express();

app.set('trust proxy', 1);

app.use(
  cors({
    origin: env.CLIENT_URL.split(',').map((url) => url.trim()),
    credentials: true,
  }),
);

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/api', routes);

app.use(notFoundHandler);
app.use(errorHandler);

export { app, mongoose };
export default app;
