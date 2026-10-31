# SRS Implementation Addendum

This addendum records the implementation details that differ from or extend
the binary SRS export in this directory.

## Endpoint and response updates

- All list endpoints return `{ success, items, meta }` with server-side
  pagination.
- Billing is available at `POST /api/billing/run` for admins as a manual demo
  fallback, in addition to the scheduled daily job.
- Invoices use `Draft`, `Confirmed`, `Paid`, and `Cancelled`; overdue is a
  derived flag and is never persisted as a status.
- Customers can read only their own subscriptions, invoices, and payments;
  an inaccessible record returns 404.

## Number and money rules

- Subscription and invoice numbers are generated atomically as
  `SUB-000001` and `INV-000001`.
- All money is integer paise. The frontend converts rupees only at the input
  and display boundaries.
- Tax is exclusive and calculated per line after discounts.

## Lifecycle and pause rules

- Subscription statuses are exactly `Draft`, `Quotation`, `Confirmed`,
  `Active`, and `Closed`.
- Pause is represented by `isPaused`, not a status. Periods that fall inside a
  pause are skipped when the subscription resumes.
- Renewal is permitted only when the plan's `allowRenew` flag is true.

## Deployment addendum

- The backend is configured for Render through the root [render.yaml](../render.yaml)
  Blueprint and exposes `/api/health` as its health check.
- The frontend is configured for Vercel deep links through
  [frontend/vercel.json](../frontend/vercel.json).
- SMTP is preferred. In production, a configured Resend-compatible HTTPS
  provider is used when SMTP is unavailable or fails.
