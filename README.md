# Brightloop Subscription Management System

Brightloop is a MERN subscription-business platform for products and variants,
plans, quotation templates, subscriptions, recurring invoices, discounts,
payments, customer self-service, and finance reporting.

## Stack and architecture

- Frontend: React 19, Vite, Material UI, React Router, Axios, Recharts.
- Backend: Node.js 24, Express 5, Mongoose 9, JWT, bcryptjs, Nodemailer,
  node-cron, Helmet, CORS, Morgan, and express-rate-limit.
- Database: MongoDB Atlas replica set for transactional billing and payment
  updates.
- Hosting: Render Static Site for the frontend and Render Web Service for the backend.

The frontend calls the Express API under `/api`. The API stores integer paise,
uses IST calendar helpers for business dates, snapshots prices and taxes into
subscriptions and invoices, and applies ownership filters in database queries.
The daily billing job can be supplemented by the admin **Run billing now**
action at `POST /api/billing/run`.

## Repository structure

```text
backend/
  config/ controllers/ jobs/ middleware/ models/ routes/ services/ utils/
  scripts/ seed/ server.js
frontend/
  src/components/ context/ pages/ services/ utils/ App.jsx
docs/
  Architecture and SRS exports, performance/test reports, SRS addendum, demo script
render.yaml
```

## Environment variables

Copy [backend/.env.example](./backend/.env.example) to `backend/.env` for
local development and keep it untracked. Required production values are
`NODE_ENV=production`, `MONGODB_URI`, a long random `JWT_SECRET`,
`CLIENT_URL` set to the deployed frontend origin, and the SMTP values. If SMTP
is blocked or unavailable, configure `RESEND_API_KEY` and
`RESEND_API_URL` for the HTTPS email fallback.

Set [frontend/.env.example](./frontend/.env.example) `VITE_API_URL` to
`https://YOUR_RENDER_SERVICE.onrender.com/api` in the Render Static Site
environment variables. Keep
`/api` for local development with the Vite proxy.

## Local setup

```powershell
cd backend
npm ci
Copy-Item .env.example .env
# Fill MONGODB_URI, JWT_SECRET, and admin/SMTP values; use
# NODE_ENV=development and CLIENT_URL=http://localhost:5173 locally.
npm run seed:admin
npm run seed:demo
npm run dev
```

In a second terminal:

```powershell
cd frontend
npm ci
npm run dev
```

The API health check is `http://localhost:5000/api/health`; the frontend is
normally `http://localhost:5173`.

## Seed and test commands

- `npm run seed:admin` creates the configured admin account.
- `npm run seed:demo` idempotently creates staff, ten customers, catalog,
  subscriptions in every lifecycle status, invoices, discounts, and payments.
- `npm run seed:perf` loads the separate `PERF_DATABASE_NAME` database with
  5,000 subscriptions and 15,000 invoices, then measures query and billing
  performance.
- `npm test` runs deterministic math tests, MongoDB integration tests, and the
  role matrix. Set `TEST_BASE_URL` and the three `TEST_*_TOKEN` values to run
  the HTTP matrix automatically.
- `npm run build` and `npm run lint` validate the frontend before deployment.

Detailed results are in [docs/TEST_REPORT.md](./docs/TEST_REPORT.md) and
[docs/PERFORMANCE.md](./docs/PERFORMANCE.md).

## Demo accounts

These accounts exist only after `npm run seed:demo` and use the configured
`DEMO_PASSWORD`:

- Admin: `admin@demo.brightloop.local`
- Staff: `staff@demo.brightloop.local`
- Customer: `customer1@demo.brightloop.local`

Never use these credentials in production. The complete timed walkthrough is
in [docs/DEMO_SCRIPT.md](./docs/DEMO_SCRIPT.md).

## Deployment

### Render backend

The root [render.yaml](./render.yaml) defines a Node web service rooted at
`backend`, built with `npm ci`, started with `npm start`, and health-checked at
`/api/health`. Create the service from the Blueprint, add the Atlas connection
string and JWT secret, set `CLIENT_URL` to the deployed frontend origin, and configure
SMTP or the HTTPS email fallback. Atlas Network Access must allow the Render
service; the hackathon setting can use `0.0.0.0/0`.

### Render frontend

Create a Render Static Site rooted at `frontend`, use `npm ci && npm run build`
as the build command, publish `dist`, set `VITE_API_URL` to the Render API URL
plus `/api`, and add a rewrite from `/*` to `/index.html` so deep links
continue to work after refresh.

### Deployed URLs

The current production deployment is:

- Frontend: `https://subscription-management-system-2-4jal.onrender.com`
- Backend: `https://subscription-management-system-uh36.onrender.com`
- API health: `https://subscription-management-system-uh36.onrender.com/api/health`

## SRS notes

The implementation addendum is in [docs/SRS_ADDENDUM.md](./docs/SRS_ADDENDUM.md).
It records the paginated response shape, endpoint additions, integer paise
rules, derived overdue state, pause/resume behavior, renewal guard, and
deployment details.
