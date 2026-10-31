import mongoose from 'mongoose';

import Invoice from '../models/Invoice.js';
import Payment from '../models/Payment.js';
import Subscription from '../models/Subscription.js';
import User from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { addPeriod, startOfDayIST } from '../utils/dates.js';
import { pageMeta, parsePagination } from '../utils/query.js';

const PAYMENT_METHODS = ['cash', 'bank_transfer', 'card', 'upi', 'cheque'];

const buildDateFilter = (query, fieldName) => {
  if (query.from === undefined && query.to === undefined) return {};

  const filter = {};
  if (query.from !== undefined) {
    const from = new Date(query.from);
    if (Number.isNaN(from.getTime())) throw new AppError('Invalid from date', 400);
    filter.$gte = startOfDayIST(from);
  }
  if (query.to !== undefined) {
    const to = new Date(query.to);
    if (Number.isNaN(to.getTime())) throw new AppError('Invalid to date', 400);
    filter.$lt = addPeriod(startOfDayIST(to), 'daily');
  }

  return { [fieldName]: filter };
};

const buildPaymentMatch = (query) => {
  const match = buildDateFilter(query, 'paymentDate');

  if (query.method !== undefined) {
    if (!PAYMENT_METHODS.includes(query.method)) {
      throw new AppError('Invalid payment method filter', 400);
    }
    match.method = query.method;
  }

  if (query.customerId !== undefined) {
    if (!mongoose.isValidObjectId(query.customerId)) {
      throw new AppError('Invalid customer ID', 400);
    }
    match.customerId = new mongoose.Types.ObjectId(query.customerId);
  }

  return match;
};

const toStatusCounts = (rows) =>
  rows.map((row) => ({ status: row._id, count: row.count }));

// GET /api/reports/summary
export const getSummary = asyncHandler(async (req, res) => {
  const today = startOfDayIST();
  const paymentMatch = buildPaymentMatch(req.query);
  const outstandingExpression = {
    $subtract: ['$total', { $ifNull: ['$amountPaid', 0] }],
  };

  const [
    activeSubscriptions,
    totalCustomers,
    subscriptionsByStatus,
    invoicesByStatus,
    revenueCollected,
    outstanding,
    overdue,
  ] = await Promise.all([
    Subscription.aggregate([
      { $match: { status: 'Active' } },
      { $count: 'count' },
    ]),
    User.aggregate([
      { $match: { role: 'customer' } },
      { $count: 'count' },
    ]),
    Subscription.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    Invoice.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    Payment.aggregate([
      { $match: paymentMatch },
      { $group: { _id: null, amount: { $sum: '$amount' } } },
    ]),
    Invoice.aggregate([
      {
        $match: {
          status: { $in: ['Draft', 'Confirmed'] },
          $expr: { $gt: [outstandingExpression, 0] },
        },
      },
      {
        $group: {
          _id: null,
          amount: { $sum: outstandingExpression },
        },
      },
    ]),
    Invoice.aggregate([
      {
        $match: {
          status: 'Confirmed',
          dueDate: { $lt: today },
          $expr: { $gt: [outstandingExpression, 0] },
        },
      },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          amount: { $sum: outstandingExpression },
        },
      },
    ]),
  ]);

  res.json({
    success: true,
    data: {
      activeSubscriptions: activeSubscriptions[0]?.count ?? 0,
      totalCustomers: totalCustomers[0]?.count ?? 0,
      subscriptionsByStatus: toStatusCounts(subscriptionsByStatus),
      invoicesByStatus: toStatusCounts(invoicesByStatus),
      revenueCollected: revenueCollected[0]?.amount ?? 0,
      outstandingAmount: outstanding[0]?.amount ?? 0,
      overdueCount: overdue[0]?.count ?? 0,
      overdueAmount: overdue[0]?.amount ?? 0,
    },
  });
});

// GET /api/reports/revenue
export const getRevenue = asyncHandler(async (req, res) => {
  const rows = await Payment.aggregate([
    { $match: buildPaymentMatch(req.query) },
    {
      $group: {
        _id: {
          year: { $year: { date: '$paymentDate', timezone: 'Asia/Kolkata' } },
          month: { $month: { date: '$paymentDate', timezone: 'Asia/Kolkata' } },
        },
        amount: { $sum: '$amount' },
        paymentCount: { $sum: 1 },
      },
    },
    { $sort: { '_id.year': 1, '_id.month': 1 } },
    {
      $project: {
        _id: 0,
        year: '$_id.year',
        month: '$_id.month',
        amount: 1,
        paymentCount: 1,
      },
    },
  ]);

  res.json({ success: true, data: rows });
});

// GET /api/reports/overdue
export const getOverdue = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const today = startOfDayIST();
  const match = {
    status: 'Confirmed',
    dueDate: { $lt: today },
    $expr: {
      $gt: [
        { $subtract: ['$total', { $ifNull: ['$amountPaid', 0] }] },
        0,
      ],
    },
    ...buildDateFilter(req.query, 'issueDate'),
  };

  if (req.query.customerId !== undefined) {
    if (!mongoose.isValidObjectId(req.query.customerId)) {
      throw new AppError('Invalid customer ID', 400);
    }
    match.customerId = new mongoose.Types.ObjectId(req.query.customerId);
  }

  const pipeline = [
    { $match: match },
    {
      $addFields: {
        outstanding: {
          $subtract: ['$total', { $ifNull: ['$amountPaid', 0] }],
        },
        daysOverdue: {
          $floor: {
            $divide: [
              { $subtract: [today, '$dueDate'] },
              24 * 60 * 60 * 1000,
            ],
          },
        },
      },
    },
    { $sort: { dueDate: 1, _id: 1 } },
    {
      $facet: {
        items: [
          { $skip: skip },
          { $limit: limit },
          {
            $lookup: {
              from: 'users',
              localField: 'customerId',
              foreignField: '_id',
              as: 'customer',
            },
          },
          { $unwind: { path: '$customer', preserveNullAndEmptyArrays: true } },
          {
            $lookup: {
              from: 'subscriptions',
              localField: 'subscriptionId',
              foreignField: '_id',
              as: 'subscription',
            },
          },
          { $unwind: { path: '$subscription', preserveNullAndEmptyArrays: true } },
          {
            $project: {
              _id: 1,
              number: 1,
              customerId: 1,
              subscriptionId: 1,
              issueDate: 1,
              dueDate: 1,
              total: 1,
              amountPaid: 1,
              outstanding: 1,
              daysOverdue: 1,
              customer: { _id: '$customer._id', name: '$customer.name', email: '$customer.email' },
              subscription: { _id: '$subscription._id', number: '$subscription.number' },
            },
          },
        ],
        total: [{ $count: 'count' }],
      },
    },
  ];
  const [result] = await Invoice.aggregate(pipeline);
  const total = result.total[0]?.count ?? 0;

  res.json({
    success: true,
    items: result.items,
    meta: pageMeta(page, limit, total),
  });
});
