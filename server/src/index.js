import app from './app.js';
import { env } from './env.js';
import { connectDatabase, disconnectDatabase } from '../config/db.js';
import { seedAdminOnBoot } from '../controllers/authController.js';

async function bootstrap() {
  try {
    await connectDatabase();
    await seedAdminOnBoot();

    const server = app.listen(env.PORT, () => {
      console.log(`[api] listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
    });

    const shutdown = async (signal) => {
      console.log(`\n[api] ${signal} received, shutting down...`);
      server.close(async () => {
        await disconnectDatabase();
        process.exit(0);
      });
      setTimeout(() => process.exit(1), 10000).unref();
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('unhandledRejection', (reason) => {
      console.error('[api] unhandled rejection:', reason);
    });
  } catch (error) {
    console.error('[api] failed to start:', error);
    process.exit(1);
  }
}

bootstrap();
