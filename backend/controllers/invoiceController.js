import mongoose from 'mongoose';

import Discount from '../models/Discount.js';
import Invoice from '../models/Invoice.js';
import User from '../models/User.js';
import { sendMail } from '../services/mailService.js';
import {
  generateInvoiceForSubscription,
  getOutstanding,
  isInvoiceOverdue,
  populateInvoice,
} from '../services/invoiceService.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { addPeriod, startOfDayIST } from '../utils/dates.js';
import { escapeRegex, pageMeta, parsePagination } from '../utils/query.js';

const validateId = (id, fieldName) => {
  if (!mongoose.isValidObjectId(id)) {
    throw new AppError(`Invalid ${fieldName}`, 400);
  }
};

const addDerivedFields = (invoice, today) => ({
  ...invoice,
  outstanding: getOutstanding(invoice),
  isOverdue: isInvoiceOverdue(invoice, today),
});

const buildInvoiceFilter = async (req) => {
  const filter = {};
  const expressions = [];

  if (req.user.role === 'customer') {
    filter.customerId = req.user._id;
  } else if (req.query.customerId !== undefined) {
    validateId(req.query.customerId, 'customer ID');
    filter.customerId = req.query.customerId;
  }

  if (req.query.subscriptionId !== undefined) {
    validateId(req.query.subscriptionId, 'subscription ID');
    filter.subscriptionId = req.query.subscriptionId;
  }

  if (req.query.status !== undefined) {
    if (!['Draft', 'Confirmed', 'Paid', 'Cancelled'].includes(req.query.status)) {
      throw new AppError('Invalid invoice status filter', 400);
    }
    filter.status = req.query.status;
  }

  if (req.query.overdue !== undefined) {
    if (req.query.overdue !== 'true') {
      throw new AppError('overdue must be true when provided', 400);
    }
    const today = startOfDayIST();
    expressions.push(
      { $eq: ['$status', 'Confirmed'] },
      { $lt: ['$dueDate', today] },
      { $lt: ['$amountPaid', '$total'] }
    );
  }

  if (req.query.payment !== undefined) {
    if (!['paid', 'outstanding'].includes(req.query.payment)) {
      throw new AppError('payment must be paid or outstanding', 400);
    }
    expressions.push(
      req.query.payment === 'paid'
        ? { $gte: ['$amountPaid', '$total'] }
        : { $lt: ['$amountPaid', '$total'] }
    );
  }

  if (expressions.length > 0) {
    filter.$expr = { $and: expressions };
  }

  if (req.query.from !== undefined || req.query.to !== undefined) {
    filter.issueDate = {};
    if (req.query.from !== undefined) {
      const from = new Date(req.query.from);
      if (Number.isNaN(from.getTime())) throw new AppError('Invalid from date', 400);
      filter.issueDate.$gte = startOfDayIST(from);
    }
    if (req.query.to !== undefined) {
      const to = new Date(req.query.to);
      if (Number.isNaN(to.getTime())) throw new AppError('Invalid to date', 400);
      filter.issueDate.$lt = addPeriod(startOfDayIST(to), 'daily');
    }
  }

  if (typeof req.query.search === 'string' && req.query.search.trim()) {
    const search = new RegExp(escapeRegex(req.query.search.trim()), 'i');
    const matchingCustomers = await User.find({
      $or: [{ name: search }, { email: search }],
    }).select('_id').lean();
    filter.$or = [
      { number: search },
      ...(matchingCustomers.length
        ? [{ customerId: { $in: matchingCustomers.map((user) => user._id) } }]
        : []),
    ];
  }

  return filter;
};

const getInvoiceResponse = async (filter) => {
  const invoice = await populateInvoice(
    Invoice.findOne(filter).select('-__v')
  ).lean();

  return invoice ? addDerivedFields(invoice, startOfDayIST()) : null;
};

// GET /api/invoices
export const getInvoices = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const filter = await buildInvoiceFilter(req);
  const query = populateInvoice(
    Invoice.find(filter)
      .select('-__v')
      .sort({ issueDate: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean()
  );
  const [invoices, total] = await Promise.all([
    query,
    Invoice.countDocuments(filter),
  ]);
  const today = startOfDayIST();

  res.json({
    success: true,
    items: invoices.map((invoice) => addDerivedFields(invoice, today)),
    meta: pageMeta(page, limit, total),
  });
});

// GET /api/invoices/:id
export const getInvoice = asyncHandler(async (req, res) => {
  validateId(req.params.id, 'invoice ID');
  const filter = { _id: req.params.id };
  if (req.user.role === 'customer') filter.customerId = req.user._id;

  const invoice = await getInvoiceResponse(filter);
  if (!invoice) throw new AppError('Invoice not found', 404);

  res.json({ success: true, data: invoice });
});

// POST /api/invoices/generate
export const generateInvoice = asyncHandler(async (req, res) => {
  const invoice = await generateInvoiceForSubscription({
    subscriptionId: req.body?.subscriptionId,
  });

  res.status(201).json({
    success: true,
    message: 'Invoice generated successfully',
    data: invoice,
  });
});

// PATCH /api/invoices/:id/confirm
export const confirmInvoice = asyncHandler(async (req, res) => {
  validateId(req.params.id, 'invoice ID');

  const invoice = await Invoice.findOneAndUpdate(
    { _id: req.params.id, status: 'Draft' },
    { $set: { status: 'Confirmed' } },
    { returnDocument: 'after', runValidators: true }
  );

  if (!invoice) {
    const existing = await Invoice.findById(req.params.id).select('status');
    if (!existing) throw new AppError('Invoice not found', 404);
    throw new AppError('Only Draft invoices can be confirmed', 400);
  }

  const data = await getInvoiceResponse({ _id: invoice._id });
  res.json({
    success: true,
    message: 'Invoice confirmed successfully',
    data,
  });
});

// PATCH /api/invoices/:id/cancel
export const cancelInvoice = asyncHandler(async (req, res) => {
  validateId(req.params.id, 'invoice ID');
  const session = await mongoose.startSession();
  let cancelled;

  try {
    await session.withTransaction(async () => {
      const invoice = await Invoice.findById(req.params.id).session(session);

      if (!invoice) throw new AppError('Invoice not found', 404);
      if (!['Draft', 'Confirmed'].includes(invoice.status)) {
        throw new AppError('Only Draft or Confirmed invoices can be cancelled', 400);
      }
      if (invoice.amountPaid !== 0) {
        throw new AppError('An invoice with payments cannot be cancelled', 400);
      }

      invoice.status = 'Cancelled';
      await invoice.save({ session });

      if (invoice.appliedDiscountIds.length > 0) {
        await Discount.updateMany(
          {
            _id: { $in: invoice.appliedDiscountIds },
            usageCount: { $gt: 0 },
          },
          { $inc: { usageCount: -1 } },
          { session }
        );
      }

      cancelled = invoice._id;
    });
  } finally {
    await session.endSession();
  }

  const data = await getInvoiceResponse({ _id: cancelled });
  res.json({
    success: true,
    message: 'Invoice cancelled successfully',
    data,
  });
});

// POST /api/invoices/:id/send
export const sendInvoice = asyncHandler(async (req, res) => {
  validateId(req.params.id, 'invoice ID');

  const invoice = await populateInvoice(
    Invoice.findById(req.params.id).select('-__v')
  ).lean();

  if (!invoice) throw new AppError('Invoice not found', 404);
  if (!['Confirmed', 'Paid'].includes(invoice.status)) {
    throw new AppError('Only Confirmed or Paid invoices can be sent', 400);
  }
  if (!invoice.customerId?.email) {
    throw new AppError('Invoice customer does not have an email address', 400);
  }

  const outstanding = getOutstanding(invoice);
  await sendMail({
    to: invoice.customerId.email,
    subject: `Invoice ${invoice.number} from Brightloop Software`,
    text: [
      `Hello ${invoice.customerId.name},`,
      '',
      `Your invoice ${invoice.number} is ready.`,
      `Total: ${invoice.total} paise`,
      `Outstanding: ${outstanding} paise`,
      `Due date: ${invoice.dueDate.toISOString().slice(0, 10)}`,
    ].join('\n'),
    html: `<p>Hello ${invoice.customerId.name},</p><p>Your invoice <strong>${invoice.number}</strong> is ready.</p><p>Outstanding: ${outstanding} paise</p>`,
  });

  const updated = await Invoice.findOneAndUpdate(
    { _id: invoice._id, status: { $in: ['Confirmed', 'Paid'] } },
    { $set: { sentAt: new Date() } },
    { returnDocument: 'after', runValidators: true }
  );
  if (!updated) throw new AppError('Invoice status changed before sending', 409);

  const data = await getInvoiceResponse({ _id: invoice._id });
  res.json({
    success: true,
    message: 'Invoice sent successfully',
    data,
  });
});
