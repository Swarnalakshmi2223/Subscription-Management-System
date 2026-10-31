# Test Report

Run date: 2026-10-31 (IST)

## Automated test command

`npm test` runs the two deterministic math tests, the four MongoDB integration
tests, and the role-matrix probe. With the configured MongoDB connection, all
of the following passed:

| Test | Result |
| --- | --- |
| `testInvoiceMath.js` | PASS |
| `testDiscountService.js` | PASS |
| `testBilling.js` | PASS |
| `testPayments.js` | PASS |
| `testReports.js` | PASS |
| `testOwnership.js` | PASS |

The regular `npm test` invocation reports the role matrix as skipped when
`TEST_*_TOKEN` variables are absent. The same role-matrix script was then run
against the local API with temporary demo tokens and passed all 60 routes for
all four identities: 240 checks, 0 failures.

## Role matrix

The matrix covered every mounted route, including health, public auth routes,
profile, users, taxes, products, plans, quotation templates, subscriptions,
discounts, invoices, billing, payments, and reports.

- Admin: permitted admin and shared operations; denied none unexpectedly.
- Staff: read-only catalog/discount access and lifecycle, invoice, payment,
  and report access matched Part 2.1.
- Customer: profile and own subscription/invoice/payment reads only; writes
  returned 403 and cross-customer record reads are ownership-scoped.
- Anonymous: public health/auth routes were reachable; protected routes
  returned 401.

## Additional acceptance checks

- `node --check` passed for every JavaScript file under `backend/`.
- `npm run seed:demo` passed twice with identical fixture counts, confirming
  the idempotent upsert path.
- The performance seed measured all required probes under two seconds; see
  [PERFORMANCE.md](./PERFORMANCE.md).
