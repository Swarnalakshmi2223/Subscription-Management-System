import 'dotenv/config';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

import { connectDB } from '../config/db.js';
import { getInvoices } from '../controllers/invoiceController.js';
import {
  createPayment,
  getPayment,
  getPayments,
} from '../controllers/paymentController.js';
import Invoice from '../models/Invoice.js';
import Payment from '../models/Payment.js';
import Product from '../models/Product.js';
import User from '../models/User.js';

const testDatabaseName = 'subscription_step5_test';
const marker = `step5-payment-${Date.now()}`;
const originalUri = process.env.MONGODB_URI;
const productId = new mongoose.Types.ObjectId();

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

const makeInvoice = async ({ customerId, number, status = 'Confirmed', total = 1000 }) =>
  Invoice.create({
    number,
    subscriptionId: new mongoose.Types.ObjectId(),
    customerId,
    billingPeriodKey: number,
    periodStart: new Date('2026-01-01T00:00:00+05:30'),
    periodEnd: new Date('2026-01-31T23:59:59+05:30'),
    issueDate: new Date('2026-01-01T00:00:00+05:30'),
    dueDate: new Date('2026-01-31T23:59:59+05:30'),
    status,
    lines: [{
      productId,
      description: 'Step 5 payment test line',
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
    amountPaid: 0,
  });

const paymentRequest = (invoiceId, userId, amount, method = 'upi') =>
  invoke(createPayment, {
    user: { _id: userId, role: 'admin' },
    body: {
      invoiceId: String(invoiceId),
      method,
      amount,
      paymentDate: '2026-01-15T00:00:00+05:30',
      note: 'Step 5 test payment',
    },
  });

useTestDatabase();
await connectDB();

try {
  await Promise.all([Invoice.deleteMany({}), Payment.deleteMany({}), User.deleteMany({})]);
  await Product.findOneAndUpdate(
    { _id: productId },
    {
      name: `${marker} product`,
      type: 'Software',
      salesPrice: 10000,
      costPrice: 1000,
      isActive: true,
    },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  );

  const [admin, customerA, customerB] = await User.create([
    {
      name: `${marker} admin`,
      email: `admin-${marker}@example.com`,
      passwordHash: await User.hashPassword('Step5_Test_Password!'),
      role: 'admin',
    },
    {
      name: `${marker} customer A`,
      email: `customer-a-${marker}@example.com`,
      passwordHash: await User.hashPassword('Step5_Test_Password!'),
      role: 'customer',
    },
    {
      name: `${marker} customer B`,
      email: `customer-b-${marker}@example.com`,
      passwordHash: await User.hashPassword('Step5_Test_Password!'),
      role: 'customer',
    },
  ]);

  const invoiceA = await makeInvoice({ customerId: customerA._id, number: `${marker}-a` });
  const partial = await paymentRequest(invoiceA._id, admin._id, 400);
  assert.equal(partial.status, 201);
  assert.equal(partial.body.data.amount, 400);
  let updatedInvoice = await Invoice.findById(invoiceA._id).lean();
  assert.equal(updatedInvoice.amountPaid, 400);
  assert.equal(updatedInvoice.status, 'Confirmed');

  const outstandingInvoices = await invoke(getInvoices, {
    user: { _id: admin._id, role: 'admin' },
    query: { page: '1', limit: '10', status: 'Confirmed', payment: 'outstanding' },
  });
  assert.equal(outstandingInvoices.status, 200);
  assert.equal(outstandingInvoices.body.items[0].outstanding, 600);

  const paymentList = await invoke(getPayments, {
    user: { _id: admin._id, role: 'admin' },
    query: { page: '1', limit: '10', invoiceId: String(invoiceA._id), method: 'upi', from: '2026-01-15', to: '2026-01-15' },
  });
  assert.equal(paymentList.status, 200);
  assert.equal(paymentList.body.meta.total, 1);
  assert.equal(paymentList.body.items[0].amount, 400);

  const settled = await paymentRequest(invoiceA._id, admin._id, 600, 'card');
  assert.equal(settled.status, 201);
  updatedInvoice = await Invoice.findById(invoiceA._id).lean();
  assert.equal(updatedInvoice.amountPaid, 1000);
  assert.equal(updatedInvoice.status, 'Paid');
  const paidInvoices = await invoke(getInvoices, {
    user: { _id: admin._id, role: 'admin' },
    query: { page: '1', limit: '10', payment: 'paid' },
  });
  assert.equal(paidInvoices.status, 200);
  assert.ok(paidInvoices.body.items.some((item) => String(item._id) === String(invoiceA._id)));

  const overpaymentInvoice = await makeInvoice({ customerId: customerA._id, number: `${marker}-over`, total: 100 });
  await expectRejected(paymentRequest(overpaymentInvoice._id, admin._id, 101), 400, /exceeds/i);

  const draftInvoice = await makeInvoice({ customerId: customerA._id, number: `${marker}-draft`, status: 'Draft' });
  await expectRejected(paymentRequest(draftInvoice._id, admin._id, 10), 400, /Confirmed/i);
  const cancelledInvoice = await makeInvoice({ customerId: customerA._id, number: `${marker}-cancelled`, status: 'Cancelled' });
  await expectRejected(paymentRequest(cancelledInvoice._id, admin._id, 10), 400, /Confirmed/i);

  const concurrentInvoice = await makeInvoice({ customerId: customerA._id, number: `${marker}-concurrent`, total: 500 });
  const concurrent = await Promise.allSettled([
    paymentRequest(concurrentInvoice._id, admin._id, 400),
    paymentRequest(concurrentInvoice._id, admin._id, 400),
  ]);
  assert.equal(concurrent.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(concurrent.filter((result) => result.status === 'rejected').length, 1);
  updatedInvoice = await Invoice.findById(concurrentInvoice._id).lean();
  assert.equal(updatedInvoice.amountPaid, 400, 'concurrent payments must not overpay');
  assert.equal(await Payment.countDocuments({ invoiceId: concurrentInvoice._id }), 1);

  const invoiceB = await makeInvoice({ customerId: customerB._id, number: `${marker}-b`, total: 300 });
  const paymentB = await paymentRequest(invoiceB._id, admin._id, 100, 'cash');
  assert.equal(paymentB.status, 201);
  const ownPayment = await invoke(getPayment, {
    user: { _id: customerA._id, role: 'customer' },
    params: { id: partial.body.data._id },
  });
  assert.equal(ownPayment.status, 200);
  await expectRejected(
    invoke(getPayment, {
      user: { _id: customerA._id, role: 'customer' },
      params: { id: paymentB.body.data._id },
    }),
    404,
    /Payment not found/
  );
  const customerPayments = await invoke(getPayments, {
    user: { _id: customerA._id, role: 'customer' },
    query: { page: '1', limit: '100' },
  });
  assert.equal(customerPayments.status, 200);
  assert.ok(customerPayments.body.items.every((item) => String(item.customerId._id) === String(customerA._id)));

  console.log('All payment tests passed!');
} finally {
  await Invoice.deleteMany({});
  await Payment.deleteMany({});
  await Product.deleteMany({ _id: productId });
  await User.deleteMany({});
  await mongoose.disconnect();
  process.env.MONGODB_URI = originalUri;
}
