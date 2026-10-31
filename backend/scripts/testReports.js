import 'dotenv/config';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { performance } from 'node:perf_hooks';

import { connectDB } from '../config/db.js';
import {
  getOverdue,
  getRevenue,
  getSummary,
} from '../controllers/reportController.js';
import Invoice from '../models/Invoice.js';
import Payment from '../models/Payment.js';
import Subscription from '../models/Subscription.js';
import User from '../models/User.js';

const testDatabaseName = 'subscription_step6_test';
const marker = `step6-report-${Date.now()}`;
const originalUri = process.env.MONGODB_URI;
const productId = new mongoose.Types.ObjectId();
const planId = new mongoose.Types.ObjectId();

const useTestDatabase = () => {
  const queryStart = originalUri.indexOf('?');
  const base = queryStart === -1 ? originalUri : originalUri.slice(0, queryStart);
  const query = queryStart === -1 ? '' : originalUri.slice(queryStart);
  const lastSlash = base.lastIndexOf('/');
  process.env.MONGODB_URI = `${base.slice(0, lastSlash + 1)}${testDatabaseName}${query}`;
};

const invoke = (handler, req) =>
  new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        resolve({ status: this.statusCode, body });
      },
    };
    handler(req, res, reject);
  });

const makeSubscription = (customerId, number, status) =>
  Subscription.create({
    number,
    customerId,
    planId,
    status,
    startDate: new Date('2026-01-01T00:00:00+05:30'),
    expiryDate: new Date('2027-01-01T00:00:00+05:30'),
    paymentTerms: 'immediate',
    lines: [{
      productId,
      description: 'Step 6 report test line',
      quantity: 1,
      unitPrice: 1000,
      taxId: null,
      taxAmount: 0,
      taxRatePercent: 0,
      amount: 1000,
    }],
  });

const makeInvoice = async ({ customerId, subscriptionId, number, status, total, amountPaid, dueDate }) =>
  Invoice.create({
    number,
    subscriptionId,
    customerId,
    billingPeriodKey: number,
    periodStart: new Date('2026-01-01T00:00:00+05:30'),
    periodEnd: new Date('2026-01-31T23:59:59+05:30'),
    issueDate: new Date('2026-01-01T00:00:00+05:30'),
    dueDate,
    status,
    lines: [{
      productId,
      description: 'Step 6 report test line',
      quantity: 1,
      unitPrice: total,
      discountAmount: 0,
      taxRatePercent: 0,
      taxAmount: 0,
      amount: total,
    }],
    subtotal: total,
    discountTotal: 0,
    taxTotal: 0,
    total,
    amountPaid,
  });

useTestDatabase();
await connectDB();

try {
  await Promise.all([
    Invoice.deleteMany({}),
    Payment.deleteMany({}),
    Subscription.deleteMany({}),
    User.deleteMany({}),
  ]);

  const [admin, customerA, customerB] = await User.create([
    {
      name: `${marker} admin`,
      email: `admin-${marker}@example.com`,
      passwordHash: await User.hashPassword('Step6_Test_Password!'),
      role: 'admin',
    },
    {
      name: `${marker} customer A`,
      email: `customer-a-${marker}@example.com`,
      passwordHash: await User.hashPassword('Step6_Test_Password!'),
      role: 'customer',
    },
    {
      name: `${marker} customer B`,
      email: `customer-b-${marker}@example.com`,
      passwordHash: await User.hashPassword('Step6_Test_Password!'),
      role: 'customer',
    },
  ]);

  const activeSubscription = await makeSubscription(customerA._id, `${marker}-active`, 'Active');
  const closedSubscription = await makeSubscription(customerB._id, `${marker}-closed`, 'Closed');

  const overdueInvoice = await makeInvoice({
    customerId: customerA._id,
    subscriptionId: activeSubscription._id,
    number: `${marker}-overdue`,
    status: 'Confirmed',
    total: 1000,
    amountPaid: 200,
    dueDate: new Date('2026-01-31T23:59:59+05:30'),
  });
  await makeInvoice({
    customerId: customerA._id,
    subscriptionId: activeSubscription._id,
    number: `${marker}-current`,
    status: 'Confirmed',
    total: 500,
    amountPaid: 0,
    dueDate: new Date('2027-01-31T23:59:59+05:30'),
  });
  const paidInvoice = await makeInvoice({
    customerId: customerB._id,
    subscriptionId: closedSubscription._id,
    number: `${marker}-paid`,
    status: 'Paid',
    total: 300,
    amountPaid: 300,
    dueDate: new Date('2026-02-28T23:59:59+05:30'),
  });
  await makeInvoice({
    customerId: customerB._id,
    subscriptionId: closedSubscription._id,
    number: `${marker}-draft`,
    status: 'Draft',
    total: 700,
    amountPaid: 0,
    dueDate: new Date('2027-02-28T23:59:59+05:30'),
  });

  await Payment.create([
    {
      invoiceId: overdueInvoice._id,
      customerId: customerA._id,
      recordedBy: admin._id,
      method: 'bank_transfer',
      amount: 200,
      paymentDate: new Date('2026-01-15T00:00:00+05:30'),
    },
    {
      invoiceId: paidInvoice._id,
      customerId: customerB._id,
      recordedBy: admin._id,
      method: 'card',
      amount: 300,
      paymentDate: new Date('2026-02-15T00:00:00+05:30'),
    },
  ]);

  const adminRequest = (query) => ({
    user: { _id: admin._id, role: 'admin' },
    query,
  });
  const timings = {};
  const timed = async (name, promise) => {
    const start = performance.now();
    const result = await promise;
    timings[name] = performance.now() - start;
    assert.ok(timings[name] < 2000, `${name} should complete under two seconds`);
    return result;
  };

  const summary = await timed('summary', invoke(getSummary, adminRequest({ from: '2026-01-01', to: '2026-01-31' })));
  assert.equal(summary.status, 200);
  assert.equal(summary.body.data.activeSubscriptions, 1);
  assert.equal(summary.body.data.totalCustomers, 2);
  assert.equal(summary.body.data.revenueCollected, 200);
  assert.equal(summary.body.data.outstandingAmount, 2000);
  assert.equal(summary.body.data.overdueCount, 1);
  assert.equal(summary.body.data.overdueAmount, 800);
  assert.deepEqual(summary.body.data.invoicesByStatus, [
    { status: 'Confirmed', count: 2 },
    { status: 'Draft', count: 1 },
    { status: 'Paid', count: 1 },
  ]);

  const revenue = await timed('revenue', invoke(getRevenue, adminRequest({ method: 'bank_transfer', customerId: String(customerA._id), from: '2026-01-01', to: '2026-01-31' })));
  assert.equal(revenue.status, 200);
  assert.deepEqual(revenue.body.data, [{ year: 2026, month: 1, amount: 200, paymentCount: 1 }]);

  const overdue = await timed('overdue', invoke(getOverdue, adminRequest({ page: '1', limit: '10', from: '2026-01-01', to: '2026-01-31' })));
  assert.equal(overdue.status, 200);
  assert.equal(overdue.body.meta.total, 1);
  assert.equal(overdue.body.items[0].outstanding, 800);
  assert.ok(overdue.body.items[0].daysOverdue > 0);

  console.log(JSON.stringify({
    summary: summary.body.data,
    revenue: revenue.body.data,
    overdue: { meta: overdue.body.meta, item: overdue.body.items[0] },
    timingsMs: timings,
  }, null, 2));
  console.log('All report tests passed!');
} finally {
  await Invoice.deleteMany({});
  await Payment.deleteMany({});
  await Subscription.deleteMany({});
  await User.deleteMany({});
  await mongoose.disconnect();
  process.env.MONGODB_URI = originalUri;
}
