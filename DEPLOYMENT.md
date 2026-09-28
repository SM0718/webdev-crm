# Deploying the API to Render

Written for an AI agent or engineer picking this up cold. The failure modes below are real ones that
already cost hours on this project — read section 1 before touching anything.

## 1. The one thing that causes ~all of these bugs

**Render has no install step.** A deploy is exactly two commands, run in this order:

```
Build command  →  Start command
```

There is no separate "install dependencies" phase and no "Install Command" field in the dashboard or
in the Blueprint spec. The fields the spec actually defines are `buildCommand`, `startCommand`,
`preDeployCommand`, and `dockerCommand`. (`installCommand` is not one of them — inventing it is a trap.)

**The Build Command *is* the install step.** If it does not install packages, nothing installs, and
the Start Command dies with `ERR_MODULE_NOT_FOUND`.

| Symptom | Meaning |
| --- | --- |
| `Cannot find package 'cors'` (or any dep) | The Build Command never installed anything |
| `ELIFECYCLE` in the log | A pnpm command is running |
| `Waiting for file changes before restarting` | The Start Command is using `node --watch` |

A build script that only compiles, lints, or type-checks is **not** sufficient. This repo's
`server/package.json` `build` script is the specific offender that caused a real outage — it ran a
`node --check` syntax sweep, printed `build ok: verified N file(s)`, exited 0, and installed nothing.
**"The build passed" is the failure, not reassurance.** An exit code of 0 tells you nothing about
whether `node_modules` exists.

## 2. Correct settings

Set these on the Render service (Settings → Build & Deploy), or use `render.yaml` at the repo root:

| Field | Value |
| --- | --- |
| Root Directory | `server` |
| Build Command | `pnpm install --frozen-lockfile` |
| Start Command | `pnpm start` |
| Health Check Path | `/api/health` |

npm equivalents: `npm ci` and `npm start`.

`server/pnpm-lock.yaml` is committed. `--frozen-lockfile` will fail if it ever drifts from
`package.json`, which is what you want in CI.

### Rules that are not optional

- **Never use `pnpm run dev` / `npm run dev` as the Start Command.** It maps to `node --watch`, a
  development supervisor. When the app crashes on boot, watch mode *stays alive waiting for file
  changes* rather than exiting — so Render reports "No open ports detected" forever instead of a
  clean failure, and every future boot error is masked. This is a debugging dead end; it was the
  single biggest time sink on this project.
- **Changing the Build Command requires a cache-clearing deploy.** Use
  *Manual Deploy → Clear build cache & deploy*. Render caches `node_modules` between builds; a plain
  "Deploy latest commit" reuses the previous install and your new build command appears to do
  nothing.
- **Never override `PORT` to anything but Render's value.** Render injects `PORT=10000`. `server/src/env.js`
  reads it. The only reason to set it is if you deliberately want a fixed port — Render can usually
  still detect a non-default port, but this is not worth the risk.

## 3. Port binding

Render requires binding to `0.0.0.0`. The server does this explicitly at `server/src/index.js`:

```js
const server = app.listen(env.PORT, '0.0.0.0', () => { ... });
```

**But note the ordering in `server/src/index.js`:** the port opens *last* — after
`connectDatabase()` and `seedAdminOnBoot()`:

```js
await connectDatabase();          // any failure here = no port, ever
await seedAdminOnBoot();
const server = app.listen(env.PORT, '0.0.0.0', ...);
```

So "No open ports detected" almost always means the process died before reaching `listen` — a bad
env var, a failed DB connect, or a missing dependency. It is a *symptom*. Do not start debugging port
binding; read the error above it.

Health check: `/api/health` (defined at `server/routes/index.js`, mounted under `/api` at
`server/src/app.js`). It is deliberately unauthenticated so it can never 401. It proves the process is
up and routing — it does **not** check MongoDB, because the DB connect happens before `listen`.

## 4. Reading the logs (get this right or you will loop forever)

**Build output is NOT on the `Logs` page.** The `Logs` page only ever shows Start Command output —
which is why the missing-install failure looked inexplicable: you were looking at a page that cannot
show you whether the install ran.

Go to the **Deploys** page, click the specific deploy, and read its build log. Confirm you see
dependency resolution (`added N packages` / pnpm linking output) and not a bare "build ok" line.

## 5. Environment variables on Render

Render does **not** set `NODE_ENV` for you. Without it the app runs as `development`, and
`server/middlewares/index.js` leaks raw internal error messages to clients — the masking to
`'Something went wrong on our end.'` only happens under `production`.

Required:

| Variable | Notes |
| --- | --- |
| `NODE_ENV` | `production` — otherwise errors leak and the `JWT_SECRET` guard never fires |
| `MONGODB_URI` | `mongodb+srv://cluster0.xxxxx.mongodb.net` (host only) |
| `MONGODB_USERNAME` / `MONGODB_PASSWORD` | Atlas credentials, injected into the URI |
| `MONGODB_DB` | `webdev-crm` |
| `JWT_SECRET` | Must not equal the example value; `server/src/env.js` refuses to boot otherwise |
| `ADMIN_NAME` / `ADMIN_USERNAME` / `ADMIN_PASSWORD` | Seeded on first boot |
| `CLIENT_URL` | CORS allowlist, comma-separated — see section 6 |

MongoDB Atlas must also allow Render's egress IPs. Confirm with `0.0.0.0/0` while debugging, then
tighten. A blocked connection surfaces as a 15s hang (`serverSelectionTimeoutMS` in
`server/config/db.js`) and then a crash before `listen` — the same "no open ports" symptom.

## 6. CORS is exact-match, and easy to get wrong

`server/src/app.js` builds the allowlist from `CLIENT_URL` by splitting on commas and trimming:

```js
cors({ origin: env.CLIENT_URL.split(',').map((u) => u.trim()), credentials: true })
```

The `cors` library compares origins with **exact string equality**. No trailing-slash tolerance, no
subdomain wildcards. `https://app.example.com` works; `https://app.example.com/` and
`app.example.com` do not. Set the origin only — no path, no `/api`.

`credentials: true` is currently unused (auth is a `Bearer` token from `localStorage`, not a cookie)
but it permanently prevents switching to `origin: '*'`. Leave it unless there's a reason.

## 7. Pointing the frontend at the deployed API

`client/src/lib/api.js` is the only place that points at the backend:

```js
baseURL: import.meta.env.VITE_API_URL ?? '/api'
```

**No code change is required** — set the env var instead.

For a deployed frontend, set at build time:

```
VITE_API_URL=https://<api>.onrender.com/api
```

Vite inlines `import.meta.env.*` **during `vite build`**. Setting it on the host after the build does
nothing, and the bundle silently keeps the `/api` fallback. It must be present in the environment
where the build runs.

For local development against the deployed API, keep `VITE_API_URL=/api` and point the dev-server
proxy at Render instead (`client/vite.config.js`):

```ini
# client/.env  (git-ignored)
VITE_PROXY_TARGET=https://<api>.onrender.com
VITE_API_URL=/api
```

The browser then only ever talks to `localhost:5173`, so CORS never applies in development. **Restart
the Vite dev server after changing this** — `loadEnv` runs once at config load, and HMR will not pick
it up.

## 8. Upgrading from email logins to usernames

Accounts used to sign in with an email address. The `email` field was renamed to `username`, so a database
that still holds `email` values must be converted before (or immediately after) you deploy the new build.
Passwords, roles and ids are untouched, so nobody has to reset anything.

Always preview first — the script defaults to a dry run:

```bash
cd server
npm run migrate-username                 # prints the email -> username plan, changes nothing
npm run migrate-username -- --confirm    # applies it
```

It derives the handle from the local part of the address (`admin@webdevcrm.com` becomes `admin`), drops any
characters the rules disallow, and appends `-2`, `-3` … if two people would land on the same handle. It also
drops the old `email_1` index, which would otherwise reject the second account once the field is gone, and
rebuilds the unique index on `username`.

Order matters: run the migration **before** deploying, or immediately after. In the gap the old build cannot
find the admin, and in the gap after deploying the new build nobody can log in until the migration has run.
The script is idempotent, so re-running it is harmless.

If the admin account is renamed here, set `ADMIN_USERNAME` on Render to match the new handle so the seeded
account and the environment agree.

## 9. Free-plan behaviour

Render's Free plan sleeps the service after ~15 minutes idle. Cold starts take 30–60s here because
the Atlas connect and admin seed both run before `listen`. The first request after idle can exceed
the 30s axios timeout (`client/src/lib/api.js`) and surface as *"The server took too long to
respond"* rather than a network error. Hit `/api/health` first to wake it. This is expected, not a
bug — do not "fix" it.
