# WebDev CRM — lead manager for a web development agency

MERN app for cold outreach. An admin imports Claude lead-list PDFs, fixes the parsed rows, assigns them to
team members, and tracks every call through a fixed set of statuses. Members only ever see their own leads.

```
webdev-crm/
├── server/   Express + Mongoose API (JWT auth, PDF parser, analytics)
└── client/   Vite + React SPA (Tailwind, shadcn-style Radix primitives, Iconsax)
```

## Requirements

- Node.js 18+ (tested on 20/22)
- npm 9+
- A MongoDB database: either a **MongoDB Atlas** cluster (recommended) or a local `mongod` on port 27017

## 1. Server

```powershell
cd server
npm install
Copy-Item .env.example .env      # Windows PowerShell
# macOS/Linux: cp .env.example .env
npm run dev
```

`npm run dev` watches the source and listens on `http://localhost:5000`. Verify it:

```powershell
Invoke-RestMethod http://localhost:5000/api/health
```

On first boot the server seeds the single admin account from `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `server/.env`
and logs `[seed] admin created for …`. On later boots it logs `[seed] admin present: …` and leaves the existing
account alone. Change that password before sharing the app.

### Database: MongoDB Atlas

Atlas is the default target. In `server/.env` set the four values below — the server assembles the final
connection string itself, URL-encoding the password so special characters are safe:

```ini
MONGODB_URI=mongodb+srv://cluster0.xxxxx.mongodb.net
MONGODB_USERNAME=your_atlas_username
MONGODB_PASSWORD=your_atlas_password
MONGODB_DB=webdev-crm
```

It resolves to `mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/webdev-crm?retryWrites=true&w=majority`.
A `MONGODB_URI` that already contains credentials, a database name, or a query string is left untouched, so you
can also paste a full Atlas connection string there.

In Atlas you only need to:

1. Create a **Database Access** user (any username/password) and copy them into `.env`.
2. Add your current IP (or `0.0.0.0/0` for anywhere) to **Network Access** — otherwise the boot will time out
   with `Server selection timed out after 15000 ms`.
3. Keep the default database name or set `MONGODB_DB` to your own.

If `MONGODB_URI` is absent the server falls back to `MONGO_URI` (a plain `mongodb://…` string for a local
`mongod`). The test suite always uses `MONGO_URI` so it never touches your real database.

### Server environment

| Variable | Purpose |
| --- | --- |
| `PORT` | API port (default `5000`) |
| `NODE_ENV` | `development` (default), `test`, or `production` |
| `MONGODB_URI` | Atlas cluster host (`mongodb+srv://…`), optional |
| `MONGODB_USERNAME` / `MONGODB_PASSWORD` | Atlas credentials injected into `MONGODB_URI`, optional |
| `MONGODB_DB` | Database name, default `webdev-crm` |
| `MONGO_URI` | Fallback connection string used when `MONGODB_URI` is absent |
| `JWT_SECRET` | Signing secret for access tokens (min. 8 chars) |
| `JWT_EXPIRES_IN` | Token lifetime (default `7d`) |
| `ADMIN_NAME` | Seeded admin display name |
| `ADMIN_EMAIL` | Seeded admin email |
| `ADMIN_PASSWORD` | Seeded admin password (min. 8 chars) |
| `CLIENT_URL` | Comma-separated list of allowed CORS origins |

The server refuses to start in `production` while `JWT_SECRET` still holds the example value. On boot it logs
which variable supplied the connection string and redacts the password from that log line.

## 2. Client

In a second terminal:

```powershell
cd client
npm install
Copy-Item .env.example .env.local   # defaults are already correct for local dev
npm run dev
```

Open `http://localhost:5173`. Vite proxies every `/api` call to `http://localhost:5000`, so there is no CORS
setup to do in development. Sign in with the seeded admin credentials.

## Tests and builds

```powershell
cd server
npm test          # 60 tests: env resolution, PDF parser, PDF ingestion, lead PDF export, full API integration (in-memory MongoDB)
```

```powershell
cd client
npm run lint      # ESLint 9 flat config
npm run build     # production bundle into client/dist
npm run preview   # serve the production bundle locally
```

The test suite uses `mongodb-memory-server`, so it needs no local MongoDB, but the first run downloads a
MongoDB binary and can take a few minutes.

## How the PDF flow works

1. Admin drops a Claude-generated lead-list PDF into **Upload Claude PDF**.
2. The server reads the buffer in memory, extracts the table and returns rows with `isDuplicate` flags.
   Nothing is written to MongoDB at this step.
3. Every cell is editable in the preview. Duplicates are pre-unticked and can be re-selected.
4. **Import** posts the ticked rows to `/api/leads/bulk-save` and reports created, updated, skipped, and
   duplicate counts.

Supported layouts (covered by tests): `Howrah_Gym_Leads.pdf`, `web_dev_leads_indore_mangaluru.pdf`, and
`web_dev_leads.pdf`, including wrapped cells, PIN-bearing addresses, and merged rows.

### Assigning a PDF straight to a team member

Each member has a profile page at `/team/:id`, reached by clicking their row on **Team**. The profile shows their
pipeline and their leads, and carries an **Assign Leads** button:

1. Drop in a Claude lead-list PDF. The same parser reads it and the preview is a read-only list showing what will
   happen to each row.
2. Rows that are **new** to the CRM are created; rows whose phone number is **already stored** are handed over to
   this member instead of being duplicated.
3. Handover follows the same funnel rule as bulk assign: a `New` lead is promoted to `Assigned`, anything further
   along keeps its status and existing data.

Because matches are made on phone number, re-uploading the same PDF is safe — it tops the member's list up
(`0 created, N reassigned`) instead of creating duplicates.

## Salesman money trail

Each lead carries the advance given to the salesman and how much he has actually been given. The leads table
shows all four figures as their own columns, and the detail sheet lets an admin edit them.

- `advanceAmount` — what the agency advanced for this lead.
- `amountPaidToSalesman` — what has been handed over so far.
- `amountRemaining` — `advance - paid`, clamped at 0. **Derived, never stored**, so it can never drift.
- `isPaid` — `true` only when an advance exists and nothing is outstanding. A lead with no advance shows `—`
  rather than "paid", because there is nothing to settle.

`PATCH /api/leads/:id/payment` is admin-only, and rejects an `amountPaidToSalesman` larger than the
`advanceAmount` (400 with `details[].message`). Members can still see the figures on their own leads.

Both fields are free-text inputs, so an admin can type the amount the way they would say it — `25000`,
`25,000` or `₹25,000` all save as `25000` (`parseAmountInput` in `client/src/lib/format.js`). Anything that
is not a plain number is refused before the request is sent, and paying more than the advance shows an inline
error instead of a toast.

## Downloading a lead as PDF

Every row in the leads table has a download button, and the detail sheet has a **Download PDF** button. Both
call `GET /api/leads/:id/pdf`, which returns an `application/pdf` attachment containing the customer details,
pipeline state, the full money trail, and the complete remark history with a "Page X of Y" footer.

pdfkit cannot know the page count before laying the document out, so the document is rendered twice: once to
count the pages, then again with the real total for the footers. Because the token lives in localStorage
rather than a cookie, the client fetches the PDF with axios and saves it via an object URL — `window.open`
would be sent without an `Authorization` header.

## Roles

- **admin** — sees every lead, uploads PDFs, bulk-assigns, records payments, adds/removes members, deletes leads.
- **member** — sees only leads assigned to them, updates status and remarks on those leads, and downloads their
  own lead PDFs.

## API summary

All routes except `/api/health` and `/api/auth/login` need `Authorization: Bearer <token>`. Everything under
`/api/team` is admin-only.

| Method | Route | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/api/health` | public | Liveness check |
| POST | `/api/auth/login` | public | Sign in |
| GET | `/api/auth/me` | any | Current user |
| POST | `/api/auth/seed-admin` | public | Idempotently re-seed the admin account |
| GET | `/api/leads` | any | Filtered, paginated list (members are scoped to themselves) |
| GET | `/api/leads/:id` | any | Single lead with its remark timeline |
| POST | `/api/leads/parse-pdf` | admin | Parse a PDF into editable rows (nothing saved) |
| POST | `/api/leads/bulk-save` | admin | Persist the reviewed rows |
| POST | `/api/leads/assign-pdf` | admin | Upload a PDF and put every lead in it on one member's book |
| PATCH | `/api/leads/bulk-assign` | admin | Assign or unassign many leads |
| PATCH | `/api/leads/:id/status` | owner/admin | Change status, optionally with a remark |
| POST | `/api/leads/:id/remarks` | owner/admin | Append a remark |
| PATCH | `/api/leads/:id/payment` | admin | Set the advance and the amount paid to the salesman |
| GET | `/api/leads/:id/pdf` | owner/admin | Download the lead as a PDF attachment |
| DELETE | `/api/leads/:id` | admin | Delete a lead |
| GET | `/api/analytics` (or `/api/leads/analytics`) | any | Stats scoped to the caller's role |
| GET | `/api/team` | admin | Roster (admin + members) with per-member lead counts, status breakdown and headline pipeline counts |
| POST | `/api/team` | admin | Add a member |
| PATCH | `/api/team/:id/toggle` | admin | Deactivate / reactivate a member (leads are kept) |
| PATCH | `/api/team/:id/password` | admin | Reset a member's password |

## Lead statuses

`New`, `Assigned`, `Contacted`, `Called - No Answer`, `Interested`, `Free Demo Sent`, `Follow-Up`,
`Converted`, `Not Interested`, `Invalid Number`.

Both files must stay in sync when you change this list: `server/constants.js` and `client/src/lib/constants.js`.

## Deployment notes

- Serve `client/dist` from any static host and set `VITE_API_URL` to the public API origin before building.
- The API is stateless, so run as many instances as you like behind a load balancer.
- `POST /api/auth/login` is rate limited to 20 attempts per 15 minutes per IP (disabled under `NODE_ENV=test`).
- Put the API behind TLS and keep `JWT_SECRET` out of source control.
