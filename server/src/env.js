import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  CLIENT_URL: z.string().default('http://localhost:5173'),

  /* Local / single-host connection string. */
  MONGO_URI: z.string().min(1, 'MONGO_URI is required'),

  /* MongoDB Atlas. When MONGODB_URI is present it wins and the pieces below
     are used to complete it (credentials + database name). */
  MONGODB_URI: z.string().optional(),
  MONGODB_USERNAME: z.string().optional(),
  MONGODB_PASSWORD: z.string().optional(),
  MONGODB_DB: z.string().default('webdev-crm'),

  JWT_SECRET: z.string().min(8, 'JWT_SECRET must be at least 8 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),

  ADMIN_NAME: z.string().default('Admin'),
  ADMIN_EMAIL: z.string().email(),
  ADMIN_PASSWORD: z.string().min(8, 'ADMIN_PASSWORD must be at least 8 characters'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  console.error(`\n[env] Invalid environment configuration:\n${issues}\n\nCopy server/.env.example to server/.env and fill it in.\n`);
  process.exit(1);
}

const config = parsed.data;

/** dotenv strips quotes, but a value exported from a shell may still carry them. */
const unquote = (value = '') => value.trim().replace(/^['"]|['"]$/g, '');

/**
 * Assembles the effective Atlas connection string.
 *
 * `MONGODB_URI=mongodb+srv://cluster0.xxxxx.mongodb.net`
 *   + MONGODB_USERNAME / MONGODB_PASSWORD -> credentials are injected
 *   + MONGODB_DB                          -> database name is appended
 *   + retryWrites=true&w=majority        -> added when no query string is present
 *
 * A MONGODB_URI that already carries credentials and a database is left alone.
 */
export function buildAtlasUri({ uri, username, password, dbName }) {
  const base = unquote(uri).replace(/\/+$/, '');
  const hasScheme = /^mongodb(\+srv)?:\/\//.test(base);
  if (!hasScheme) return null;

  const [head, ...rest] = base.split('://');
  const scheme = head;
  let credentials = '';
  let hostAndPath = rest.join('://');

  const atIndex = hostAndPath.indexOf('@');
  if (atIndex !== -1) {
    credentials = `${hostAndPath.slice(0, atIndex)}@`;
    hostAndPath = hostAndPath.slice(atIndex + 1);
  }

  if (!credentials) {
    const user = unquote(username);
    const pass = unquote(password);
    if (!user || !pass) return null;
    credentials = `${encodeURIComponent(user)}:${encodeURIComponent(pass)}@`;
  }

  const [host, ...pathParts] = hostAndPath.split('/');
  const [pathDatabase, existingQuery] = pathParts.join('/').split('?');
  const database = pathDatabase || dbName;
  const query = existingQuery || 'retryWrites=true&w=majority';

  return `${scheme}://${credentials}${host}/${database}${query ? `?${query}` : ''}`;
}

/** Resolves the connection string and records which source won, for logging. */
function resolveMongoUri(cfg) {
  if (cfg.NODE_ENV === 'test') {
    return { uri: cfg.MONGO_URI, source: 'MONGO_URI (test)' };
  }

  if (cfg.MONGODB_URI) {
    const atlas = buildAtlasUri({
      uri: cfg.MONGODB_URI,
      username: cfg.MONGODB_USERNAME,
      password: cfg.MONGODB_PASSWORD,
      dbName: cfg.MONGODB_DB,
    });
    if (atlas) return { uri: atlas, source: 'MONGODB_URI (Atlas)' };
    return { uri: cfg.MONGO_URI, source: 'MONGO_URI (Atlas URI was incomplete)' };
  }

  return { uri: cfg.MONGO_URI, source: 'MONGO_URI' };
}

const resolved = resolveMongoUri(config);

if (config.NODE_ENV === 'production' && config.JWT_SECRET === 'change_me_to_a_long_random_string') {
  console.error('[env] Refusing to boot in production with the example JWT_SECRET.');
  process.exit(1);
}

if (!resolved.uri.includes('mongodb+srv://') && !/:\/\/[^@]*@/.test(resolved.uri)) {
  console.warn(`[env] Connecting with a local/unauthenticated MongoDB string via ${resolved.source}.`);
}

export const env = { ...config, MONGO_URI: resolved.uri, MONGO_SOURCE: resolved.source };
