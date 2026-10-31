import 'dotenv/config';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

import { connectDB } from '../config/db.js';
import { updateProfile } from '../controllers/authController.js';
import {
  getSubscription,
  getSubscriptions,
} from '../controllers/subscriptionController.js';
import { getInvoice, getInvoices } from '../controllers/invoiceController.js';
import { getPayment, getPayments } from '../controllers/paymentController.js';
import { authorize } from '../middleware/auth.js';
import Invoice from '../models/Invoice.js';
import Payment from '../models/Payment.js';
import Plan from '../models/Plan.js';
import Product from '../models/Product.js';
import Subscription from '../models/Subscription.js';
import User from '../models/User.js';

const testDatabaseName = 'subscription_step7_test';
const marker = `step7-ownership-${Date.now()}`;
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

const expectRejected = async (promise, statusCode, message) => {
  await assert.rejects(promise, (error) => {
    assert.equal(error.statusCode, statusCode);
    if (message) assert.match(error.message, message);
    return true;
  });
};

const makeSubscription = (customerId, number) =>
  Subscription.create({
    number,
    customerId,
    planId,
    status: 'Active',
    startDate: new Date('2026-01-01T00:00:00+05:30'),
    expiryDate: new Date('2027-01-01T00:00:00+05:30'),
    paymentTerms: 'immediate',
    lines: [{
      productId,
      description: 'Step 7 ownership test product',
      quantity: 1,
      unitPrice: 1000,
      taxId: null,
      taxAmount: 0,
      taxRatePercent: 0,
      amount: 1000,
    }],
  });

const makeInvoice = ({ customerId, subscriptionId, number }) =>
  Invoice.create({
    number,
    subscriptionId,
    customerId,
    billingPeriodKey: number,
    periodStart: new Date('2026-01-01T00:00:00+05:30'),
    periodEnd: new Date('2026-01-31T23:59:59+05:30'),
    issueDate: new Date('2026-01-01T00:00:00+05:30'),
    dueDate: new Date('2026-01-31T23:59:59+05:30'),
    status: 'Confirmed',
    lines: [{
      productId,
      description: 'Step 7 ownership test product',
      quantity: 1,
      unitPrice: 1000,
      discountAmount: 0,
      taxRatePercent: 0,
      taxAmount: 0,
      amount: 1000,
    }],
    subtotal: 1000,
    discountTotal: 0,
    taxTotal: 0,
    total: 1000,
    amountPaid: 0,
  });

const makePayment = (invoiceId, customerId, recordedBy) =>
  Payment.create({
    invoiceId,
    customerId,
    recordedBy,
    method: 'upi',
    amount: 100,
    paymentDate: new Date('2026-01-15T00:00:00+05:30'),
    note: 'Step 7 ownership test payment',
  });

const readRequest = (user, query = {}) => ({ user, query });
const detailRequest = (user, id) => ({ user, params: { id } });

useTestDatabase();
await connectDB();

try {
  await Promise.all([
    Invoice.deleteMany({}),
    Payment.deleteMany({}),
    Subscription.deleteMany({}),
    Plan.deleteMany({}),
    Product.deleteMany({}),
    User.deleteMany({}),
  ]);

  await Product.create({
    _id: productId,
    name: `${marker} product`,
    type: 'Software',
    salesPrice: 1000,
    costPrice: 100,
    isActive: true,
  });
  await Plan.create({
    _id: planId,
    name: `${marker} plan`,
    productId,
    price: 1000,
    billingPeriod: 'monthly',
    minQuantity: 1,
    startDate: new Date('2025-01-01T00:00:00+05:30'),
    endDate: new Date('2027-01-01T00:00:00+05:30'),
    isActive: true,
  });

  const [admin, staff, customerA, customerB] = await User.create([
    {
      name: `${marker} admin`,
      email: `admin-${marker}@example.com`,
      passwordHash: await User.hashPassword('Step7_Test_Password!'),
      role: 'admin',
    },
    {
      name: `${marker} staff`,
      email: `staff-${marker}@example.com`,
      passwordHash: await User.hashPassword('Step7_Test_Password!'),
      role: 'staff',
    },
    {
      name: `${marker} customer A`,
      email: `customer-a-${marker}@example.com`,
      passwordHash: await User.hashPassword('Step7_Test_Password!'),
      role: 'customer',
    },
    {
      name: `${marker} customer B`,
      email: `customer-b-${marker}@example.com`,
      passwordHash: await User.hashPassword('Step7_Test_Password!'),
      role: 'customer',
    },
  ]);

  const subscriptionA = await makeSubscription(customerA._id, `${marker}-sub-a`);
  const subscriptionB = await makeSubscription(customerB._id, `${marker}-sub-b`);
  const invoiceA = await makeInvoice({
    customerId: customerA._id,
    subscriptionId: subscriptionA._id,
    number: `${marker}-inv-a`,
  });
  const invoiceB = await makeInvoice({
    customerId: customerB._id,
    subscriptionId: subscriptionB._id,
    number: `${marker}-inv-b`,
  });
  const paymentA = await makePayment(invoiceA._id, customerA._id, admin._id);
  const paymentB = await makePayment(invoiceB._id, customerB._id, admin._id);

  const customerAUser = { _id: customerA._id, role: 'customer' };
  const adminUser = { _id: admin._id, role: 'admin' };
  const staffUser = { _id: staff._id, role: 'staff' };

  for (const [handler, ownId, otherId, label] of [
    [getSubscription, subscriptionA._id, subscriptionB._id, 'subscription'],
    [getInvoice, invoiceA._id, invoiceB._id, 'invoice'],
    [getPayment, paymentA._id, paymentB._id, 'payment'],
  ]) {
    const own = await invoke(handler, detailRequest(customerAUser, ownId));
    assert.equal(own.status, 200, `${label} owner should read own record`);
    await expectRejected(
      invoke(handler, detailRequest(customerAUser, otherId)),
      404,
      new RegExp(`${label} not found`, 'i')
    );
  }

  const customerSubscriptions = await invoke(
    getSubscriptions,
    readRequest(customerAUser, { page: '1', limit: '10' })
  );
  assert.equal(customerSubscriptions.body.meta.total, 1);
  assert.equal(String(customerSubscriptions.body.items[0].customerId._id), String(customerA._id));

  const customerInvoices = await invoke(
    getInvoices,
    readRequest(customerAUser, { page: '1', limit: '10' })
  );
  assert.equal(customerInvoices.body.meta.total, 1);
  assert.equal(String(customerInvoices.body.items[0].customerId._id), String(customerA._id));

  const customerPayments = await invoke(
    getPayments,
    readRequest(customerAUser, { page: '1', limit: '10' })
  );
  assert.equal(customerPayments.body.meta.total, 1);
  assert.equal(String(customerPayments.body.items[0].customerId._id), String(customerA._id));

  for (const [handler, label] of [
    [getSubscriptions, 'subscriptions'],
    [getInvoices, 'invoices'],
    [getPayments, 'payments'],
  ]) {
    for (const user of [adminUser, staffUser]) {
      const response = await invoke(handler, readRequest(user, { page: '1', limit: '10' }));
      assert.equal(response.body.meta.total, 2, `${user.role} should see all ${label}`);
    }
  }

  for (const [handler, ids, label] of [
    [getSubscription, [subscriptionA._id, subscriptionB._id], 'subscription'],
    [getInvoice, [invoiceA._id, invoiceB._id], 'invoice'],
    [getPayment, [paymentA._id, paymentB._id], 'payment'],
  ]) {
    for (const user of [adminUser, staffUser]) {
      for (const id of ids) {
        const response = await invoke(handler, detailRequest(user, id));
        assert.equal(response.status, 200, `${user.role} should read every ${label}`);
      }
    }
  }

  for (const writeRoute of ['create subscription', 'change subscription']) {
    await expectRejected(
      new Promise((resolve, reject) => authorize('admin', 'staff')(
        { user: customerAUser },
        {},
        (error) => (error ? reject(error) : resolve())
      )),
      403,
      /permission/i
    );
    assert.ok(writeRoute);
  }

  const profileResponse = await invoke(updateProfile, {
    user: customerAUser,
    body: {
      name: 'Customer A Updated',
      phone: '9876543210',
      company: 'Brightloop Test Co',
      address: {
        line1: '1 Test Street',
        city: 'Bengaluru',
        state: 'Karnataka',
        zip: '560001',
        country: 'India',
      },
    },
  });
  assert.equal(profileResponse.status, 200);
  assert.equal(profileResponse.body.user.name, 'Customer A Updated');
  assert.equal(profileResponse.body.user.email, customerA.email);
  assert.equal(profileResponse.body.user.role, 'customer');
  assert.equal(profileResponse.body.user.address.city, 'Bengaluru');

  await expectRejected(
    invoke(updateProfile, {
      user: customerAUser,
      body: { email: 'attacker@example.com', role: 'admin', password: 'Changed!' },
    }),
    400,
    /cannot be updated/i
  );
  const unchangedProtectedFields = await User.findById(customerA._id).select('email role').lean();
  assert.equal(unchangedProtectedFields.email, customerA.email);
  assert.equal(unchangedProtectedFields.role, 'customer');

  console.log('Ownership checks passed: own reads, cross-customer 404s, staff/admin visibility, write authorization, and profile field protection.');
} finally {
  await Promise.all([
    Invoice.deleteMany({}),
    Payment.deleteMany({}),
    Subscription.deleteMany({}),
    Plan.deleteMany({}),
    Product.deleteMany({}),
    User.deleteMany({}),
  ]);
  await mongoose.disconnect();
  process.env.MONGODB_URI = originalUri;
}
