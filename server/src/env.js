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

  /* Only read when the database has no admin yet. Once the account exists the
     seed is skipped, so leaving these blank on a later deploy is harmless. */
  ADMIN_NAME: z.string().default('Admin'),
  ADMIN_USERNAME: z
    .string()
    .min(3, 'ADMIN_USERNAME must be at least 3 characters')
    .max(30, 'ADMIN_USERNAME cannot exceed 30 characters')
    .regex(/^[a-z0-9][a-z0-9._-]*$/i, 'ADMIN_USERNAME may use letters, numbers, dot, underscore and hyphen')
    .optional(),
  ADMIN_PASSWORD: z
    .string()
    .min(8, 'ADMIN_PASSWORD must be at least 8 characters')
    .optional(),
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

/**
 * Normalises the comma-separated CLIENT_URL allow-list.
 *
 * The browser sends `Origin: https://app.example.com` - scheme and host only,
 * never a trailing slash or a path. Matching is exact, so a value pasted with
 * a trailing slash silently never matches and every browser request fails with
 * a CORS error the page reports only as "Network Error". Strip it here instead.
 */
function resolveAllowedOrigins(value) {
  return [
    ...new Set(
      String(value ?? '')
        .split(',')
        .map((url) => url.trim().replace(/\/+$/, ''))
        .filter(Boolean),
    ),
  ];
}

const resolved = resolveMongoUri(config);
const allowedOrigins = resolveAllowedOrigins(config.CLIENT_URL);

if (config.NODE_ENV === 'production' && config.JWT_SECRET === 'change_me_to_a_long_random_string') {
  console.error('[env] Refusing to boot in production with the example JWT_SECRET.');
  process.exit(1);
}

if (config.NODE_ENV === 'production') {
  const isLocal = (origin) => /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin);

  if (allowedOrigins.length === 0) {
    console.error(
      '[env] CLIENT_URL is empty in production, so every browser request will be blocked by CORS.\n' +
        '      Set it to the deployed frontend origin, e.g. https://your-app.netlify.app',
    );
    process.exit(1);
  }

  if (allowedOrigins.every(isLocal)) {
    console.error(
      `[env] CLIENT_URL only allows local origins (${allowedOrigins.join(', ')}) while running in\n` +
        '      production, so the deployed frontend will be blocked by CORS. Add its real origin.\n' +
        '      (It looks like CLIENT_URL is unset and the http://localhost:5173 default is in use.)',
    );
    process.exit(1);
  }
}

if (!resolved.uri.includes('mongodb+srv://') && !/:\/\/[^@]*@/.test(resolved.uri)) {
  console.warn(`[env] Connecting with a local/unauthenticated MongoDB string via ${resolved.source}.`);
}

export const env = {
  ...config,
  MONGO_URI: resolved.uri,
  MONGO_SOURCE: resolved.source,
  CLIENT_URLS: allowedOrigins,
};
