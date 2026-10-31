import 'dotenv/config';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

import { connectDB } from '../config/db.js';
import { resumeSubscription } from '../controllers/subscriptionController.js';
import Discount from '../models/Discount.js';
import Invoice from '../models/Invoice.js';
import Plan from '../models/Plan.js';
import Product from '../models/Product.js';
import Subscription from '../models/Subscription.js';
import User from '../models/User.js';
import { runBilling } from '../services/billingService.js';
import { addPeriod, istDateString, startOfDayIST } from '../utils/dates.js';

const testDatabaseName = 'subscription_step4_test';
const marker = `step4-billing-${Date.now()}`;
const password = 'Step4_Billing_Test!';
const originalUri = process.env.MONGODB_URI;

const useTestDatabase = () => {
  const queryStart = originalUri.indexOf('?');
  const base = queryStart === -1 ? originalUri : originalUri.slice(0, queryStart);
  const query = queryStart === -1 ? '' : originalUri.slice(queryStart);
  const lastSlash = base.lastIndexOf('/');
  process.env.MONGODB_URI = `${base.slice(0, lastSlash + 1)}${testDatabaseName}${query}`;
};

const makeLine = (productId, unitPrice = 10000) => ({
  productId,
  quantity: 1,
  description: 'Step 4 billing test product',
  unitPrice,
  taxId: null,
  taxAmount: 0,
  taxRatePercent: 0,
  amount: unitPrice,
});

const makeSubscription = async ({
  customerId,
  planId,
  number,
  startDate,
  expiryDate,
  isPaused = false,
  periodsBilled = 0,
  nextBillingDate = startDate,
}) =>
  Subscription.create({
    number,
    customerId,
    planId,
    status: 'Active',
    startDate,
    expiryDate,
    paymentTerms: 'immediate',
    lines: [makeLine(testProduct._id)],
    periodsBilled,
    nextBillingDate,
    isPaused,
  });

const invokeResume = async (subscriptionId) => {
  let response;
  const res = {
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      response = body;
    },
  };
  await resumeSubscription(
    { params: { id: String(subscriptionId) } },
    res,
    (error) => {
      throw error;
    }
  );
  return { status: res.statusCode, body: response };
};

let testProduct;
const createdUsers = [];
const createdPlans = [];
const createdSubscriptions = [];
const createdDiscounts = [];

useTestDatabase();
await connectDB();

try {
  await Promise.all([
    Invoice.deleteMany({}),
    Subscription.deleteMany({}),
    Discount.deleteMany({}),
    Plan.deleteMany({}),
    Product.deleteMany({}),
    User.deleteMany({}),
  ]);

  testProduct = await Product.create({
    name: `${marker} product`,
    type: 'Software',
    salesPrice: 10000,
    costPrice: 1000,
    isActive: true,
  });

  const planStart = new Date('2026-01-01T00:00:00+05:30');
  const planEnd = new Date('2027-12-31T23:59:59+05:30');
  const monthlyPlan = await Plan.create({
    name: `${marker} monthly`,
    productId: testProduct._id,
    price: 10000,
    billingPeriod: 'monthly',
    minQuantity: 1,
    startDate: planStart,
    endDate: planEnd,
    autoClose: true,
    allowPause: true,
    allowRenew: true,
  });
  const dailyPlan = await Plan.create({
    name: `${marker} daily`,
    productId: testProduct._id,
    price: 10000,
    billingPeriod: 'daily',
    minQuantity: 1,
    startDate: planStart,
    endDate: planEnd,
    autoClose: true,
    allowPause: true,
    allowRenew: true,
  });
  createdPlans.push(monthlyPlan._id, dailyPlan._id);

  const user = await User.create({
    name: `${marker} customer`,
    email: `${marker}@example.com`,
    passwordHash: await User.hashPassword(password),
    role: 'customer',
  });
  createdUsers.push(user._id);

  const monthly = await makeSubscription({
    customerId: user._id,
    planId: monthlyPlan._id,
    number: `${marker}-monthly`,
    startDate: new Date('2026-01-31T00:00:00+05:30'),
    expiryDate: new Date('2026-04-30T23:59:59+05:30'),
  });
  createdSubscriptions.push(monthly._id);

  const march31 = new Date('2026-03-31T00:00:00+05:30');
  const firstRun = await runBilling({ now: march31 });
  const monthlyInvoices = await Invoice.find({ subscriptionId: monthly._id })
    .sort({ periodStart: 1 })
    .lean();
  assert.equal(monthlyInvoices.length, 3, 'monthly catch-up should create three invoices');
  assert.deepEqual(
    monthlyInvoices.map((invoice) => invoice.billingPeriodKey),
    ['2026-01-31', '2026-02-28', '2026-03-31']
  );
  assert.equal(firstRun.failed.length, 0, 'initial billing run should have no failures');

  const secondRun = await runBilling({ now: march31 });
  assert.equal(secondRun.created, 0, 'running billing twice should create no duplicates');
  assert.equal(await Invoice.countDocuments({ subscriptionId: monthly._id }), 3);

  const dailyCatchup = await makeSubscription({
    customerId: user._id,
    planId: dailyPlan._id,
    number: `${marker}-daily-catchup`,
    startDate: new Date('2026-03-01T00:00:00+05:30'),
    expiryDate: new Date('2026-03-10T23:59:59+05:30'),
  });
  createdSubscriptions.push(dailyCatchup._id);
  await runBilling({ now: new Date('2026-03-03T00:00:00+05:30') });
  assert.equal(
    await Invoice.countDocuments({ subscriptionId: dailyCatchup._id }),
    3,
    'three missed daily periods should be caught up'
  );

  const today = startOfDayIST();
  const paused = await makeSubscription({
    customerId: user._id,
    planId: dailyPlan._id,
    number: `${marker}-paused`,
    startDate: addPeriod(today, 'daily', -3),
    expiryDate: addPeriod(today, 'daily', 7),
    isPaused: true,
  });
  createdSubscriptions.push(paused._id);
  await runBilling({ now: today });
  assert.equal(await Invoice.countDocuments({ subscriptionId: paused._id }), 0, 'paused subscriptions must not be billed');
  const resumed = await invokeResume(paused._id);
  assert.equal(resumed.status, 200);
  const resumedSubscription = await Subscription.findById(paused._id).lean();
  assert.equal(resumedSubscription.periodsBilled, 3, 'resume should skip paused periods');
  assert.equal(istDateString(resumedSubscription.nextBillingDate), istDateString(today));
  await runBilling({ now: today });
  assert.equal(await Invoice.countDocuments({ subscriptionId: paused._id }), 1, 'resumed subscription should bill from today');

  const discountCustomer = await User.create({
    name: `${marker} discount customer`,
    email: `discount-${marker}@example.com`,
    passwordHash: await User.hashPassword(password),
    role: 'customer',
  });
  createdUsers.push(discountCustomer._id);
  const discountSubA = await makeSubscription({
    customerId: discountCustomer._id,
    planId: dailyPlan._id,
    number: `${marker}-discount-a`,
    startDate: today,
    expiryDate: addPeriod(today, 'daily', 5),
  });
  const discountSubB = await makeSubscription({
    customerId: discountCustomer._id,
    planId: dailyPlan._id,
    number: `${marker}-discount-b`,
    startDate: today,
    expiryDate: addPeriod(today, 'daily', 5),
  });
  createdSubscriptions.push(discountSubA._id, discountSubB._id);
  const limitedDiscount = await Discount.create({
    name: `${marker} limited discount`,
    type: 'fixed',
    value: 1000,
    minPurchase: 0,
    minQuantity: 1,
    startDate: addPeriod(today, 'daily', -1),
    endDate: addPeriod(today, 'daily', 1),
    usageLimit: 1,
    appliesTo: 'subscriptions',
    subscriptionIds: [discountSubA._id, discountSubB._id],
    isActive: true,
  });
  createdDiscounts.push(limitedDiscount._id);
  await runBilling({ now: today });
  const discountInvoices = await Invoice.find({
    subscriptionId: { $in: [discountSubA._id, discountSubB._id] },
  }).lean();
  assert.equal(discountInvoices.length, 2);
  assert.equal(discountInvoices.filter((invoice) => invoice.discountTotal > 0).length, 1, 'usage-limited discount should apply once');
  assert.equal((await Discount.findById(limitedDiscount._id).lean()).usageCount, 1);

  const expiring = await makeSubscription({
    customerId: user._id,
    planId: dailyPlan._id,
    number: `${marker}-expired`,
    startDate: addPeriod(today, 'daily', -2),
    expiryDate: addPeriod(today, 'daily', -1),
    periodsBilled: 2,
    nextBillingDate: today,
  });
  createdSubscriptions.push(expiring._id);
  const expiryRun = await runBilling({ now: today });
  const closed = await Subscription.findById(expiring._id).lean();
  assert.equal(closed.status, 'Closed', 'expired auto-close subscription should close');
  assert.equal(await Invoice.countDocuments({ subscriptionId: expiring._id }), 0);
  assert.ok(expiryRun.closed >= 1);

  console.log('All billing tests passed!');
} finally {
  await Invoice.deleteMany({ subscriptionId: { $in: createdSubscriptions } });
  await Subscription.deleteMany({ _id: { $in: createdSubscriptions } });
  await Discount.deleteMany({ _id: { $in: createdDiscounts } });
  await User.deleteMany({ _id: { $in: createdUsers } });
  await Plan.deleteMany({ _id: { $in: createdPlans } });
  if (testProduct) await Product.deleteOne({ _id: testProduct._id });
  await mongoose.disconnect();
  process.env.MONGODB_URI = originalUri;
}
