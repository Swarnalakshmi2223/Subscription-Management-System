# Performance Test Report

Run date: 2026-10-31 (IST)

## Dataset

`npm run seed:perf` loads the separate MongoDB database named
`subscription_management_perf`. The seed is intentionally isolated from the
application database and contains:

- 5,000 subscriptions
- 15,000 invoices (three per subscription)
- 5,000 payments

The seed clears only that explicitly named performance database before loading
fixtures. It runs `syncIndexes()` for the performance collections and prints
MongoDB `explain('executionStats')` summaries for representative paginated
queries.

## Measured timings

All timings were below the two-second acceptance target.

| Probe | Direct query/service | HTTP endpoint |
| --- | ---: | ---: |
| Subscriptions list, 50 rows | 100.19 ms | 628.03 ms |
| Report summary/aggregation | 77.45 ms | 383.01 ms |
| Billing run | 183.58 ms | 232.50 ms |

The HTTP probe ran a second backend process against the performance database,
using the admin role. The billing fixture has no due subscriptions, so the
run verifies the indexed scan and duplicate-safe no-op path without creating
another 15,000 invoices.

## Explain-plan checks

Each representative 50-row query returned 50 documents and examined 50
documents:

- active subscriptions sorted for the list page: `LIMIT` over the compound list
  index, 50 examined
- confirmed overdue invoices: `LIMIT` over the status/due-date index, 50
  examined
- UPI payments filtered by date: `LIMIT` over the method/date index, 50
  examined

The supporting indexes include the subscription status/pause/next-billing
index, subscription status/created-at list index, invoice status/due-date
index, invoice issue-date list index, customer/date indexes, and payment
method/date and date/created-at indexes.
