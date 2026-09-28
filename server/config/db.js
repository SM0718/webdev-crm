import mongoose from 'mongoose';

import { env } from '../src/env.js';

/** Never log the password part of a connection string. */
const redact = (uri) => uri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@');

export async function connectDatabase(uri = env.MONGO_URI) {
  mongoose.set('strictQuery', true);

  const isAtlas = uri.startsWith('mongodb+srv://');

  const connection = await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 15000,
    ...(isAtlas
      ? {
          retryWrites: true,
          w: 'majority',
          maxPoolSize: 10,
        }
      : {}),
  });

  const { host, name } = connection.connection;
  console.log(
    `[db] connected to ${isAtlas ? 'MongoDB Atlas' : 'MongoDB'} cluster ${host}/${name} (via ${env.MONGO_SOURCE})`,
  );
  console.log(`[db] connection string: ${redact(uri)}`);

  mongoose.connection.on('error', (error) => {
    console.error('[db] connection error:', error.message);
  });
  mongoose.connection.on('disconnected', () => {
    console.warn('[db] disconnected');
  });
  mongoose.connection.on('reconnected', () => {
    console.log('[db] reconnected');
  });

  return connection;
}

export async function disconnectDatabase() {
  await mongoose.connection.close();
}
