# Brightloop Subscription Management System

## Live application

Open the deployed application here:

**[Brightloop Subscription Management System](https://subscription-management-system-2-4jal.onrender.com)**

Production services:

- Frontend: [subscription-management-system-2-4jal.onrender.com](https://subscription-management-system-2-4jal.onrender.com)
- Backend: [subscription-management-system-uh36.onrender.com](https://subscription-management-system-uh36.onrender.com)
- API health check: [backend health endpoint](https://subscription-management-system-uh36.onrender.com/api/health)

## What the application does

Brightloop is a subscription-business management platform built for teams
that sell recurring products and services. It brings the complete subscription
lifecycle into one system:

- Configure products, variants, taxes, recurring plans, quotation templates,
  and discounts.
- Create customer quotations and convert approved quotations into active
  subscriptions.
- Generate recurring invoices from active subscriptions.
- Track invoice status, outstanding balances, overdue invoices, and payments.
- Give customers a focused self-service portal for their own subscriptions,
  invoices, payments, and profile.
- Give administrators and staff operational dashboards and finance reports.

The frontend is a React single-page application. The backend is an Express API
with MongoDB persistence, JWT authentication, role-based authorization,
scheduled billing, email notifications, and transactional payment updates.

## Application flow

The normal business flow is:

```text
User registration/login
        |
        v
Admin configures catalog, plans, taxes, templates, and discounts
        |
        v
Staff selects a customer and creates a quotation/subscription
        |
        v
Server calculates prices, discounts, taxes, and totals
        |
        v
Quotation is sent and confirmed
        |
        v
Subscription is activated with a price and tax snapshot
        |
        v
Daily job or admin "Run billing now" action creates an invoice
        |
        v
Invoice is confirmed and sent to the customer
        |
        v
Staff records payments until the invoice becomes Paid
        |
        v
Dashboards and reports show revenue, balances, overdue invoices, and history
```

### 1. Sign in and access control

Users can register as customers, sign in, request a password reset, and update
their profile. Every protected API request uses a JWT bearer token. The UI
shows only the navigation and actions allowed for the current role, while the
API enforces the same permissions on the server.

### 2. Configure the catalog

Administrators configure the commercial building blocks before selling:

1. Create products and optional variants.
2. Create tax rates such as GST 5%, 12%, or 18%.
3. Create recurring plans with daily, weekly, monthly, or yearly billing
   periods.
4. Create quotation templates that bundle a plan with products and quantities.
5. Create fixed or percentage discounts, with date, amount, quantity, usage,
   product, or subscription constraints.

Product and plan prices are stored and calculated in integer paise to avoid
floating-point money errors. Tax and discount values are validated by the
backend before a record is saved.

### 3. Create and activate a subscription

Administrators or staff select a customer, choose a quotation template or
plan, and review the server-calculated line preview. The system calculates:

```text
line amount -> subtotal -> eligible discount -> taxable amount -> tax -> total
```

After the quotation is sent and confirmed, the subscription can be activated.
When activated, the subscription stores a snapshot of the selected prices,
taxes, and discounts. Future catalog edits therefore do not silently change
an existing customer contract.

Subscriptions support lifecycle states and operational actions such as pause,
resume, renewal, and cancellation. The server validates every transition.

### 4. Run recurring billing

The scheduled billing job checks active subscriptions according to their plan
period and creates the next invoice when it is due. Administrators can also
use **Run billing now** from the dashboard, which calls:

```text
POST /api/billing/run
```

Billing is protected against duplicate invoice creation with a unique
subscription-period key. Invoice periods, prices, taxes, discounts, and
subscription references are retained as billing snapshots.

### 5. Manage invoices

Invoices move through a controlled lifecycle:

```text
Draft -> Confirmed -> Sent -> Paid
  |          |
  +--------> Cancelled
```

Users can search and filter invoices, inspect billing periods and balances,
view overdue status, open invoice details, print an invoice, and review its
payment history. An invoice is considered overdue from its due date when it
still has an outstanding balance.

### 6. Record and reconcile payments

Staff can record UPI, bank transfer, card, cash, or other supported payment
methods against a confirmed invoice. The backend validates that a payment is
positive and does not exceed the outstanding balance. It updates the invoice
amount paid and status atomically, so partial payments and final settlement
remain consistent.

### 7. Customer self-service

Customers see only their own records. The customer portal provides:

- Dashboard summary of subscriptions, invoices, payments, and balances.
- Active and historical subscriptions.
- Invoice details, printable invoices, due dates, and payment history.
- Profile management.

Ownership filtering is enforced in database queries, not only in the frontend.

### 8. Finance reporting

Administrators and staff can review dashboard totals, revenue trends, payment
method filters, outstanding balances, and overdue invoices. Reports use the
same billing and payment records as the operational screens.

## Roles and permissions

| Capability | Admin | Staff | Customer |
|---|:---:|:---:|:---:|
| View dashboard and reports | Yes | Yes | Personal summary |
| Manage products, variants, plans, taxes, templates, discounts | Yes | View/use | No |
| Manage staff accounts | Yes | No | No |
| Manage customer accounts | Yes | Yes | Own profile |
| Create and manage subscriptions | Yes | Yes | View own |
| Run billing manually | Yes | No | No |
| Manage invoices | Yes | Yes | View own |
| Record payments | Yes | Yes | No |
| View payment history | Yes | Yes | Own history |

Authorization is enforced by the backend routes and controllers for every
protected operation.

## Main modules

### Authentication and users

Registration, login, logout, current-user lookup, profile updates, password
reset flow, staff management, customer management, JWT authentication, and
role-based access control.

### Catalog and pricing

Products, variants, plans, taxes, quotation templates, discounts, billing
periods, active/inactive configuration, and server-side price calculation.

### Subscription management

Quotation preview, customer assignment, activation, pause/resume, renewal,
cancellation, lifecycle status, plan rules, price snapshots, and ownership
scoping.

### Billing and invoices

Scheduled recurring billing, manual billing execution, invoice numbering,
invoice periods, due dates, invoice status transitions, overdue detection,
email sending, printable invoice details, and duplicate-billing protection.

### Payments and finance

Payment recording, partial payments, payment-method history, outstanding
balance reconciliation, revenue reporting, and dashboard summaries.

## Technology and architecture

- **Frontend:** React 19, Vite, Material UI, React Router, Axios, and Recharts.
- **Backend:** Node.js 24, Express 5, Mongoose 9, JWT, bcryptjs, Nodemailer,
  node-cron, Helmet, CORS, Morgan, and express-rate-limit.
- **Database:** MongoDB Atlas replica set for subscription, billing, and payment
  data.
- **Hosting:** Render Static Site for the frontend and Render Web Service for
  the backend.
- **API base path:** `/api`.
- **Time and money rules:** business dates use IST helpers and monetary values
  are stored as integer paise.

The backend mounts the main API areas at:

```text
/api/auth
/api/users
/api/taxes
/api/products
/api/plans
/api/quotation-templates
/api/subscriptions
/api/discounts
/api/invoices
/api/billing
/api/payments
/api/reports
```

## Repository structure

```text
backend/
  config/                 Database and application configuration
  controllers/            Request handlers and business operations
  jobs/                   Scheduled recurring billing job
  middleware/             Authentication, authorization, and error handling
  models/                 Mongoose schemas and indexes
  routes/                 Express API route definitions
  seed/                   Admin seed script
  scripts/                Demo, performance, and test scripts
  services/               Email and supporting services
  utils/                  Calculation, date, and response helpers
  server.js               Express application entry point
frontend/
  src/components/         Shared layout, tables, dialogs, and UI components
  src/context/            Authentication and application state
  src/pages/              Auth, dashboard, catalog, billing, and profile pages
  src/services/           Axios API client
  src/utils/              Formatting and frontend helpers
  App.jsx                 Route and protected-route configuration
docs/                     Architecture, SRS, performance, and test reports
render.yaml               Render backend Blueprint configuration
```

## Run locally

### Prerequisites

- Node.js 24 or a compatible current LTS release.
- MongoDB Atlas or a local MongoDB replica set.
- Git.

### Backend

```powershell
cd backend
npm ci
Copy-Item .env.example .env
# Set MONGODB_URI, JWT_SECRET, and the local mail values.
# Use NODE_ENV=development and CLIENT_URL=http://localhost:5173.
npm run seed:admin
npm run seed:demo
npm run dev
```

The backend runs on `http://localhost:5000` by default.

### Frontend

In another terminal:

```powershell
cd frontend
npm ci
npm run dev
```

The frontend runs on `http://localhost:5173` and uses the Vite proxy for the
local `/api` path.

## Environment variables

Copy [backend/.env.example](./backend/.env.example) to `backend/.env` for
local development. Never commit `.env` files or production secrets.

Required backend production variables:

| Variable | Purpose |
|---|---|
| `NODE_ENV` | Set to `production` on Render. |
| `PORT` | Render supplies this automatically; do not hard-code it. |
| `MONGODB_URI` | MongoDB Atlas connection string. |
| `JWT_SECRET` | Long random secret for signing tokens. |
| `JWT_EXPIRES_IN` | Token lifetime, for example `7d`. |
| `CLIENT_URL` | Exact deployed frontend origin for CORS. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | SMTP email delivery settings. |
| `MAIL_FROM` | Sender name and address. |
| `RESEND_API_KEY`, `RESEND_API_URL` | Optional HTTPS email fallback. |

Frontend build variable:

```text
VITE_API_URL=https://subscription-management-system-uh36.onrender.com/api
```

For local development, use `VITE_API_URL=/api`. Vite variables are embedded
at build time, so update the Render Static Site environment variable and
redeploy after changing the production API URL.

## Seed and test commands

Run backend commands from `backend`:

```powershell
npm run seed:admin       # Create or update the configured admin account
npm run seed:demo        # Create repeatable demo users and business records
npm run seed:perf        # Load the separate performance database
npm test                 # Run the complete backend test suite
npm run test:billing     # Run billing tests
npm run test:payments    # Run payment tests
npm run test:reports     # Run report tests
npm run test:ownership   # Run ownership and access-scope tests
```

Run frontend checks from `frontend`:

```powershell
npm run lint
npm run build
```

The demo seed creates admin, staff, and customer users, catalog records,
subscriptions in lifecycle states, invoices, discounts, and payments. Demo
credentials are controlled by `DEMO_PASSWORD` and must never be used in
production.

## Deploy on Render

### Backend web service

Create a Render Web Service from the repository with:

- Branch: `main`
- Root Directory: `backend`
- Build Command: `npm ci`
- Start Command: `npm start`
- Health check path: `/api/health`

Set the backend environment variables listed above. Set `CLIENT_URL` to:

```text
https://subscription-management-system-2-4jal.onrender.com
```

MongoDB Atlas Network Access must allow the Render service to connect. The
repository also contains [render.yaml](./render.yaml) for the backend service.

### Frontend static site

Create a Render Static Site with:

- Branch: `main`
- Root Directory: `frontend`
- Build Command: `npm ci && npm run build`
- Publish Directory: `dist`
- Environment variable:
  `VITE_API_URL=https://subscription-management-system-uh36.onrender.com/api`
- Rewrite: `/*` -> `/index.html`

The rewrite is required because the frontend uses client-side React routes.

## Security and data integrity

- Passwords are hashed before storage.
- JWT authentication and server-side role authorization protect API routes.
- Customers are restricted to their own subscriptions, invoices, payments, and
  profile data.
- Helmet, CORS, request logging, and rate limiting are enabled.
- Catalog prices and taxes are snapshotted into subscriptions and invoices.
- Monetary values use integer paise instead of floating-point arithmetic.
- Invoice creation is idempotent for each subscription billing period.
- Payment updates validate outstanding balances and are performed atomically.
- Production secrets belong only in Render environment variables.

## Supporting documentation

- [SRS addendum](./docs/SRS_ADDENDUM.md) — implementation-specific behavior and
  business rules.
- [Test report](./docs/TEST_REPORT.md) — backend and frontend validation results.
- [Performance report](./docs/PERFORMANCE.md) — seeded workload and timing
  results.
- [Frontend environment example](./frontend/.env.example)
- [Backend environment example](./backend/.env.example)

## License

This project is maintained as the Brightloop Subscription Management System.
