import mongoose from 'mongoose';

import Invoice from '../models/Invoice.js';
import Payment from '../models/Payment.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { addPeriod, startOfDayIST } from '../utils/dates.js';
import { pageMeta, parsePagination } from '../utils/query.js';

const PAYMENT_METHODS = ['cash', 'bank_transfer', 'card', 'upi', 'cheque'];

const validateId = (id, fieldName) => {
  if (!mongoose.isValidObjectId(id)) {
    throw new AppError(`Invalid ${fieldName}`, 400);
  }
};

const populatePayment = (query) =>
  query
    .populate('invoiceId', 'number status total amountPaid dueDate')
    .populate('customerId', 'name email phone company')
    .populate('recordedBy', 'name email role');

const validatePaymentInput = ({ invoiceId, method, amount, paymentDate, note }) => {
  validateId(invoiceId, 'invoice ID');

  if (!PAYMENT_METHODS.includes(method)) {
    throw new AppError('Invalid payment method', 400);
  }

  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new AppError('Payment amount must be a positive integer in paise', 400);
  }

  const parsedDate = new Date(paymentDate ?? new Date());
  if (Number.isNaN(parsedDate.getTime())) {
    throw new AppError('Payment date must be valid', 400);
  }

  if (note !== undefined && typeof note !== 'string') {
    throw new AppError('Payment note must be text', 400);
  }

  return parsedDate;
};

// POST /api/payments
export const createPayment = asyncHandler(async (req, res) => {
  const { invoiceId, method, amount, paymentDate, note } = req.body ?? {};
  const parsedPaymentDate = validatePaymentInput({
    invoiceId,
    method,
    amount,
    paymentDate,
    note,
  });
  const session = await mongoose.startSession();
  let paymentId;

  try {
    await session.withTransaction(async () => {
      const invoice = await Invoice.findById(invoiceId).session(session);

      if (!invoice) throw new AppError('Invoice not found', 404);
      if (invoice.status !== 'Confirmed') {
        throw new AppError('Payments can only be recorded for Confirmed invoices', 400);
      }

      const amountPaid = invoice.amountPaid || 0;
      const outstanding = invoice.total - amountPaid;
      if (amount > outstanding) {
        throw new AppError('Payment exceeds the invoice outstanding balance', 400);
      }

      const nextAmountPaid = amountPaid + amount;
      const nextStatus = nextAmountPaid === invoice.total ? 'Paid' : 'Confirmed';
      const payment = new Payment({
        invoiceId: invoice._id,
        customerId: invoice.customerId,
        recordedBy: req.user._id,
        method,
        amount,
        paymentDate: parsedPaymentDate,
        note,
      });
      await payment.save({ session });

      const updated = await Invoice.updateOne(
        {
          _id: invoice._id,
          status: 'Confirmed',
          amountPaid,
        },
        {
          $inc: { amountPaid: amount },
          $set: { status: nextStatus },
        },
        { session }
      );

      if (updated.modifiedCount !== 1) {
        throw new AppError('Invoice changed while the payment was recorded; please retry', 409);
      }

      paymentId = payment._id;
    });
  } finally {
    await session.endSession();
  }

  const payment = await populatePayment(
    Payment.findById(paymentId).select('-__v')
  ).lean();

  res.status(201).json({
    success: true,
    message: 'Payment recorded successfully',
    data: payment,
  });
});

const buildPaymentFilter = (req) => {
  const filter = {};

  if (req.user.role === 'customer') {
    filter.customerId = req.user._id;
  } else if (req.query.customerId !== undefined) {
    validateId(req.query.customerId, 'customer ID');
    filter.customerId = req.query.customerId;
  }

  if (req.query.invoiceId !== undefined) {
    validateId(req.query.invoiceId, 'invoice ID');
    filter.invoiceId = req.query.invoiceId;
  }

  if (req.query.method !== undefined) {
    if (!PAYMENT_METHODS.includes(req.query.method)) {
      throw new AppError('Invalid payment method filter', 400);
    }
    filter.method = req.query.method;
  }

  if (req.query.from !== undefined || req.query.to !== undefined) {
    filter.paymentDate = {};
    if (req.query.from !== undefined) {
      const from = new Date(req.query.from);
      if (Number.isNaN(from.getTime())) throw new AppError('Invalid from date', 400);
      filter.paymentDate.$gte = startOfDayIST(from);
    }
    if (req.query.to !== undefined) {
      const to = new Date(req.query.to);
      if (Number.isNaN(to.getTime())) throw new AppError('Invalid to date', 400);
      filter.paymentDate.$lt = addPeriod(startOfDayIST(to), 'daily');
    }
  }

  return filter;
};

// GET /api/payments
export const getPayments = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const filter = buildPaymentFilter(req);
  const query = populatePayment(
    Payment.find(filter)
      .select('-__v')
      .sort({ paymentDate: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean()
  );
  const [items, total] = await Promise.all([
    query,
    Payment.countDocuments(filter),
  ]);

  res.json({
    success: true,
    items,
    meta: pageMeta(page, limit, total),
  });
});

// GET /api/payments/:id
export const getPayment = asyncHandler(async (req, res) => {
  validateId(req.params.id, 'payment ID');
  const filter = { _id: req.params.id };
  if (req.user.role === 'customer') filter.customerId = req.user._id;

  const payment = await populatePayment(
    Payment.findOne(filter).select('-__v')
  ).lean();

  if (!payment) throw new AppError('Payment not found', 404);

  res.json({ success: true, data: payment });
});
