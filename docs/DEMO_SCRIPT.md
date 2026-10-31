# Brightloop 5–6 Minute Demo Script

Use the seeded demo data for the open-access walkthrough. The demo password is
the value of `DEMO_PASSWORD` used by [seedDemo.js](../backend/scripts/seedDemo.js).
For a fresh local seed, the example value is `Demo_User_2026!`.

## 0:00–0:40 — Sign in and orient

Sign in as `admin@demo.brightloop.local`. Show the finance dashboard cards for
active subscriptions, collected revenue, outstanding invoices, and overdue
invoices. Briefly point out the role-aware navigation.

## 0:40–1:40 — Configure the catalog

Open Taxes and show GST 5%, 12%, and 18%. Open Products and show the Cloud
Suite product with the Odoo variant and its ₹560 extra price. Show the four
plans and their different daily, weekly, monthly, and yearly rules. Finish by
opening a quotation template and an active fixed or percentage discount.

## 1:40–2:40 — Build and activate a quotation

Sign in as `staff@demo.brightloop.local`. Create a subscription from a
quotation template, select a customer, choose payment terms, and show the
server-calculated line preview. Send the quotation, confirm it, and activate
it. Point out the lifecycle timeline and the plan-controlled action buttons.

## 2:40–3:40 — Run billing and send an invoice

Use the admin account and select **Run billing now** from the billing action.
Open the generated draft invoice, confirm it, send it, and use Print to show
the print-friendly invoice view. Mention that invoices are snapshots and the
unique subscription-period key prevents duplicate billing.

## 3:40–4:30 — Record a payment

Record a partial UPI or bank-transfer payment, show the outstanding balance,
then record the remaining amount and show the transition to Paid. Open the
payments list and the invoice history.

## 4:30–5:30 — Customer portal

Sign in as `customer1@demo.brightloop.local`. Show the customer dashboard,
own subscriptions, invoices, payments, and profile. Open an invoice and print
it. Emphasize that customer queries are ownership-scoped on the server.

## 5:30–6:00 — Close with reporting

Return to the finance dashboard, filter the date range and payment method,
show the monthly revenue chart and overdue table, then mention the seeded
5,000-subscription performance result documented in [PERFORMANCE.md](./PERFORMANCE.md).
