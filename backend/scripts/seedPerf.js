import 'dotenv/config';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import mongoose from 'mongoose';

import { connectDB } from '../config/db.js';
import Invoice from '../models/Invoice.js';
import Payment from '../models/Payment.js';
import Plan from '../models/Plan.js';
import Product from '../models/Product.js';
import Subscription from '../models/Subscription.js';
import User from '../models/User.js';
import { runBilling } from '../services/billingService.js';
import { startOfDayIST } from '../utils/dates.js';

const SUBSCRIPTION_COUNT = 5000;
const INVOICES_PER_SUBSCRIPTION = 3;
const PERF_DATE = startOfDayIST('2026-10-31');
const databaseName = process.env.PERF_DATABASE_NAME || 'subscription_management_perf';

const useDatabase = () => {
  const originalUri = process.env.MONGODB_URI;
  if (!originalUri) throw new Error('MONGODB_URI is required to seed the performance database');
  const queryStart = originalUri.indexOf('?');
  const base = queryStart === -1 ? originalUri : originalUri.slice(0, queryStart);
  const query = queryStart === -1 ? '' : originalUri.slice(queryStart);
  const lastSlash = base.lastIndexOf('/');
  process.env.MONGODB_URI = `${base.slice(0, lastSlash + 1)}${databaseName}${query}`;
};

const chunked = async (Model, documents, size = 1000) => {
  for (let index = 0; index < documents.length; index += size) {
    await Model.insertMany(documents.slice(index, index + size), { ordered: false });
  }
};

const measure = async (name, operation) => {
  const started = performance.now();
  const result = await operation();
  const milliseconds = Number((performance.now() - started).toFixed(2));
  assert.ok(milliseconds < 2000, `${name} exceeded the two-second target (${milliseconds} ms)`);
  return { name, milliseconds, result };
};

const seedUsers = async () => {
  const passwordHash = await User.hashPassword(process.env.DEMO_PASSWORD || 'Demo_User_2026!');
  const admin = await User.create({
    name: 'Performance Admin',
    email: 'performance-admin@brightloop.local',
    passwordHash,
    role: 'admin',
  });
  const customers = await User.insertMany(Array.from({ length: 50 }, (_, index) => ({
    name: `Performance Customer ${index + 1}`,
    email: `performance-customer-${index + 1}@brightloop.local`,
    passwordHash,
    role: 'customer',
  })));
  return { admin, customers };
};

const seedCatalog = async () => {
  const product = await Product.create({
    name: 'Performance Cloud Product',
    type: 'Software',
    salesPrice: 100000,
    costPrice: 30000,
    isActive: true,
  });
  const plan = await Plan.create({
    name: 'Performance Monthly Plan',
    productId: product._id,
    price: 100000,
    billingPeriod: 'monthly',
    minQuantity: 1,
    startDate: startOfDayIST('2025-01-01'),
    endDate: startOfDayIST('2027-12-31'),
    autoClose: true,
    allowEarlyClose: false,
    allowPause: true,
    allowRenew: true,
    isActive: true,
  });
  return { product, plan };
};

const seedSubscriptions = async ({ customers, plan, product }) => {
  const documents = Array.from({ length: SUBSCRIPTION_COUNT }, (_, index) => {
    const customer = customers[index % customers.length];
    const active = index % 5 !== 0;
    return {
      number: `PERF-SUB-${String(index + 1).padStart(6, '0')}`,
      customerId: customer._id,
      planId: plan._id,
      status: active ? 'Active' : 'Closed',
      startDate: startOfDayIST('2026-01-01'),
      expiryDate: startOfDayIST('2027-12-31'),
      paymentTerms: 'net15',
      lines: [{
        productId: product._id,
        quantity: 1,
        description: product.name,
        unitPrice: plan.price,
        taxId: null,
        taxAmount: 0,
        taxRatePercent: 0,
        amount: plan.price,
      }],
      periodsBilled: INVOICES_PER_SUBSCRIPTION,
      nextBillingDate: startOfDayIST('2027-01-01'),
      isPaused: false,
    };
  });
  return chunked(Subscription, documents).then(() => Subscription.find({ number: /^PERF-SUB-/ }).select('_id number customerId').lean());
};

const seedInvoices = async ({ subscriptions, admin, product }) => {
  const documents = [];
  const payments = [];
  for (let index = 0; index < subscriptions.length; index += 1) {
    const subscription = subscriptions[index];
    for (let period = 0; period < INVOICES_PER_SUBSCRIPTION; period += 1) {
      const number = `PERF-INV-${String(index * INVOICES_PER_SUBSCRIPTION + period + 1).padStart(6, '0')}`;
      const status = period === 0 ? 'Confirmed' : period === 1 ? 'Paid' : 'Draft';
      const total = 100000;
      const amountPaid = status === 'Paid' ? total : 0;
      documents.push({
        number,
        subscriptionId: subscription._id,
        customerId: subscription.customerId,
        billingPeriodKey: `2026-0${period + 1}-01`,
        periodStart: startOfDayIST(`2026-0${period + 1}-01`),
        periodEnd: startOfDayIST(`2026-0${period + 1}-28`),
        issueDate: startOfDayIST(`2026-0${period + 1}-01`),
        dueDate: startOfDayIST(period === 0 ? '2026-02-01' : '2026-12-01'),
        status,
        lines: [{
          productId: product._id,
          description: product.name,
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
        appliedDiscountIds: [],
      });
      if (status === 'Paid') {
        payments.push({
          invoiceId: null,
          customerId: subscription.customerId,
          recordedBy: admin._id,
          method: 'upi',
          amount: total,
          paymentDate: startOfDayIST('2026-02-10'),
          note: `Performance payment ${number}`,
        });
      }
    }
  }
  await chunked(Invoice, documents);
  if (payments.length > 0) {
    const paidInvoices = await Invoice.find({ status: 'Paid' }).select('_id number').lean();
    const byNumber = new Map(paidInvoices.map((invoice) => [invoice.number, invoice._id]));
    await chunked(Payment, payments.map((payment) => ({
      ...payment,
      invoiceId: byNumber.get(payment.note.replace('Performance payment ', '')),
    })));
  }
  return { invoices: documents.length, payments: payments.length };
};

const explainSummary = (explain) => {
  const queryPlanner = explain?.queryPlanner || explain?.stages?.[0]?.$cursor?.queryPlanner;
  const executionStats = explain?.executionStats || explain?.stages?.[0]?.$cursor?.executionStats;
  const findIndex = (stage) => {
    if (!stage) return null;
    if (stage.indexName) return stage.indexName;
    return findIndex(stage.inputStage) || stage.inputStages?.map(findIndex).find(Boolean) || null;
  };
  const winningPlan = queryPlanner?.winningPlan;
  return {
    winningStage: winningPlan?.stage || 'unknown',
    indexName: findIndex(winningPlan),
    examined: executionStats?.totalDocsExamined || 0,
    returned: executionStats?.nReturned || 0,
  };
};

const optionalHttpMeasurements = async () => {
  const baseUrl = process.env.PERF_BASE_URL;
  const token = process.env.PERF_ADMIN_TOKEN;
  if (!baseUrl || !token) return [];
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const requests = [
    ['HTTP subscriptions list', `${baseUrl}/api/subscriptions?limit=50`, { headers }],
    ['HTTP report summary', `${baseUrl}/api/reports/summary`, { headers }],
    ['HTTP billing run', `${baseUrl}/api/billing/run`, { method: 'POST', headers, body: '{}' }],
  ];
  const timings = [];
  for (const [name, url, options] of requests) {
    const started = performance.now();
    const response = await fetch(url, options);
    const milliseconds = Number((performance.now() - started).toFixed(2));
    assert.ok(response.ok, `${name} returned HTTP ${response.status}`);
    assert.ok(milliseconds < 2000, `${name} exceeded the two-second target (${milliseconds} ms)`);
    timings.push({ name, milliseconds, status: response.status });
  }
  return timings;
};

async function run() {
  useDatabase();
  await connectDB();
  await Promise.all([
    Invoice.deleteMany({}),
    Payment.deleteMany({}),
    Subscription.deleteMany({}),
    Plan.deleteMany({}),
    Product.deleteMany({}),
    User.deleteMany({}),
  ]);
  await Promise.all([User, Product, Plan, Subscription, Invoice, Payment].map((Model) => Model.syncIndexes()));

  const users = await seedUsers();
  const catalog = await seedCatalog();
  const subscriptions = await seedSubscriptions({ ...users, ...catalog });
  const invoiceSummary = await seedInvoices({ subscriptions, admin: users.admin, product: catalog.product });

  const list = await measure('subscriptions list', () => Subscription.find({ status: 'Active' }).sort({ createdAt: -1 }).limit(50).lean());
  const report = await measure('invoice report aggregation', () => Invoice.aggregate([
    { $match: { status: { $in: ['Draft', 'Confirmed', 'Paid'] } } },
    { $group: { _id: '$status', count: { $sum: 1 }, total: { $sum: '$total' } } },
  ]));
  const billing = await measure('billing run', () => runBilling({ now: PERF_DATE }));
  const listExplain = explainSummary(await Subscription.find({ status: 'Active' }).sort({ createdAt: -1 }).limit(50).explain('executionStats'));
  const invoiceExplain = explainSummary(await Invoice.find({ status: 'Confirmed', dueDate: { $lt: PERF_DATE } }).sort({ dueDate: 1 }).limit(50).explain('executionStats'));
  const paymentExplain = explainSummary(await Payment.find({ method: 'upi', paymentDate: { $gte: startOfDayIST('2026-01-01') } }).sort({ paymentDate: -1 }).limit(50).explain('executionStats'));
  const http = await optionalHttpMeasurements();

  console.log(JSON.stringify({
    databaseName,
    subscriptions: subscriptions.length,
    invoices: invoiceSummary.invoices,
    payments: invoiceSummary.payments,
    measurementsMs: [list, report, billing].map(({ name, milliseconds }) => ({ name, milliseconds })),
    httpMeasurementsMs: http,
    explain: { subscriptions: listExplain, invoices: invoiceExplain, payments: paymentExplain },
    billingSummary: billing.result,
  }, null, 2));
}

run()
  .catch((error) => {
    console.error('Performance seed failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
