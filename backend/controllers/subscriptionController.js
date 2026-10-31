import mongoose from 'mongoose';

import Subscription from '../models/Subscription.js';
import Counter from '../models/Counter.js';
import User from '../models/User.js';
import Plan from '../models/Plan.js';
import QuotationTemplate from '../models/QuotationTemplate.js';

import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { addPeriod, startOfDayIST } from '../utils/dates.js';
import { parsePagination, pageMeta, escapeRegex } from '../utils/query.js';

import { buildSubscriptionLines } from '../services/pricingService.js';

const PAYMENT_TERMS = ['immediate', 'net15', 'net30'];

// Generate sequential subscription numbers.
const generateSubscriptionNumber = async () => {
  // FIX: returnDocument replaces the deprecated "new: true" option.
  const counter = await Counter.findOneAndUpdate(
    { key: 'subscription' },
    { $inc: { seq: 1 } },
    { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true }
  );

  return `SUB-${String(counter.seq).padStart(6, '0')}`;
};

// Validate MongoDB IDs.
const validateId = (id, fieldName) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError(`Invalid ${fieldName}`, 400);
  }
};

// Populate subscription response.
const populateSubscription = (query) =>
  query
    .populate('customerId', 'name email phone company')
    .populate('planId', 'name price billingPeriod minQuantity')
    .populate('templateId', 'name validityDays')
    .populate('lines.productId', 'name type')
    .populate('lines.taxId', 'name ratePercent');

// GET /api/subscriptions
export const getSubscriptions = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const filter = {};

  if (req.user.role === 'customer') {
    filter.customerId = req.user._id;
  } else if (req.query.customerId !== undefined) {
    validateId(req.query.customerId, 'customer ID');
    filter.customerId = req.query.customerId;
  }

  if (req.query.planId !== undefined) {
    validateId(req.query.planId, 'plan ID');
    filter.planId = req.query.planId;
  }

  if (req.query.status !== undefined) {
    if (!['Draft', 'Quotation', 'Confirmed', 'Active', 'Closed'].includes(req.query.status)) {
      throw new AppError('Invalid subscription status filter', 400);
    }
    filter.status = req.query.status;
  }

  if (req.query.paused !== undefined) {
    if (!['true', 'false'].includes(req.query.paused)) {
      throw new AppError('paused must be true or false', 400);
    }
    filter.isPaused = req.query.paused === 'true';
  }

  if (req.query.from !== undefined || req.query.to !== undefined) {
    filter.startDate = {};
    if (req.query.from !== undefined) {
      const from = new Date(req.query.from);
      if (Number.isNaN(from.getTime())) throw new AppError('Invalid from date', 400);
      filter.startDate.$gte = startOfDayIST(from);
    }
    if (req.query.to !== undefined) {
      const to = new Date(req.query.to);
      if (Number.isNaN(to.getTime())) throw new AppError('Invalid to date', 400);
      filter.startDate.$lt = addPeriod(startOfDayIST(to), 'daily');
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

  const query = populateSubscription(
    Subscription.find(filter)
      .select('-__v')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean()
  );
  const [items, total] = await Promise.all([
    query,
    Subscription.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    items,
    meta: pageMeta(page, limit, total),
  });
});

// GET /api/subscriptions/:id
export const getSubscription = asyncHandler(async (req, res) => {
  validateId(req.params.id, 'subscription ID');

  const filter = { _id: req.params.id };
  if (req.user.role === 'customer') filter.customerId = req.user._id;

  const subscription = await populateSubscription(
    Subscription.findOne(filter)
  );

  if (!subscription) {
    throw new AppError('Subscription not found', 404);
  }

  res.status(200).json({
    success: true,
    data: subscription,
  });
});

// POST /api/subscriptions
export const createSubscription = asyncHandler(async (req, res) => {
  const {
    customerId,
    planId,
    templateId,
    startDate,
    expiryDate,
    paymentTerms = 'immediate',
    lines,
  } = req.body ?? {};

  validateId(customerId, 'customer ID');
  validateId(planId, 'plan ID');

  if (!startDate || !expiryDate) {
    throw new AppError('Start date and expiry date are required', 400);
  }

  if (!PAYMENT_TERMS.includes(paymentTerms)) {
    throw new AppError('Invalid payment terms', 400);
  }

  const start = new Date(startDate);
  const expiry = new Date(expiryDate);

  if (Number.isNaN(start.getTime()) || Number.isNaN(expiry.getTime())) {
    throw new AppError('Invalid subscription dates', 400);
  }

  if (expiry <= start) {
    throw new AppError('Expiry date must be after start date', 400);
  }

  const customer = await User.findById(customerId);

  if (!customer || customer.role !== 'customer' || !customer.isActive) {
    throw new AppError('An active customer account is required', 400);
  }

  const plan = await Plan.findById(planId);

  if (!plan || !plan.isActive) {
    throw new AppError('Active subscription plan not found', 404);
  }

  // FIX: compare calendar days in India time, so the result is the same
  // on your PC and on the Render server.
  const selectedStart = startOfDayIST(start);

  if (selectedStart < startOfDayIST(plan.startDate)) {
    throw new AppError('Subscription starts before the plan availability date', 400);
  }

  if (selectedStart > startOfDayIST(plan.endDate)) {
    throw new AppError('Subscription starts after the plan availability date', 400);
  }

  let sourceLines = lines;
  let selectedTemplateId = null;

  if (templateId !== undefined && templateId !== null) {
    validateId(templateId, 'quotation template ID');
    if (Array.isArray(lines)) {
      throw new AppError('Provide either templateId or lines, not both', 400);
    }

    const template = await QuotationTemplate.findById(templateId);

    if (!template || !template.isActive) {
      throw new AppError('Active quotation template not found', 404);
    }

    if (String(template.planId) !== String(plan._id)) {
      throw new AppError(
        'The quotation template does not belong to the selected plan',
        400
      );
    }

    sourceLines = template.lines;
    selectedTemplateId = template._id;
  } else if (!Array.isArray(lines) || lines.length === 0) {
    throw new AppError('Provide either templateId or at least one line', 400);
  }

  const pricedLines = await buildSubscriptionLines({ lines: sourceLines }, plan);
  const number = await generateSubscriptionNumber();

  const subscription = await Subscription.create({
    number,
    customerId,
    planId,
    templateId: selectedTemplateId,
    status: 'Draft',
    startDate: start,
    expiryDate: expiry,
    paymentTerms,
    lines: pricedLines,
    quotationValidUntil: null,
    nextBillingDate: null,
    periodsBilled: 0,
    isPaused: false,
  });

  const result = await populateSubscription(
    Subscription.findById(subscription._id)
  );

  res.status(201).json({
    success: true,
    message: 'Subscription created successfully',
    data: result,
  });
});

// PUT /api/subscriptions/:id
// Only Draft subscriptions can be edited.
export const updateSubscription = asyncHandler(async (req, res) => {
  validateId(req.params.id, 'subscription ID');

  const body = req.body ?? {};
  const allowedFields = ['startDate', 'expiryDate', 'paymentTerms'];

  const unknownFields = Object.keys(body).filter(
    (field) => !allowedFields.includes(field)
  );

  if (unknownFields.length > 0) {
    throw new AppError(
      `Fields cannot be updated: ${unknownFields.join(', ')}`,
      400
    );
  }

  const subscription = await Subscription.findById(req.params.id);

  if (!subscription) {
    throw new AppError('Subscription not found', 404);
  }

  if (subscription.status !== 'Draft') {
    throw new AppError('Only Draft subscriptions can be updated', 400);
  }

  const start = new Date(body.startDate ?? subscription.startDate);
  const expiry = new Date(body.expiryDate ?? subscription.expiryDate);

  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(expiry.getTime()) ||
    expiry <= start
  ) {
    throw new AppError('Please provide valid subscription dates', 400);
  }

  if (body.paymentTerms !== undefined) {
    if (!PAYMENT_TERMS.includes(body.paymentTerms)) {
      throw new AppError('Invalid payment terms', 400);
    }

    subscription.paymentTerms = body.paymentTerms;
  }

  subscription.startDate = start;
  subscription.expiryDate = expiry;

  await subscription.save();

  const result = await populateSubscription(
    Subscription.findById(subscription._id)
  );

  res.status(200).json({
    success: true,
    message: 'Draft subscription updated successfully',
    data: result,
  });
});

// PATCH /api/subscriptions/:id/send-quotation
export const sendQuotation = asyncHandler(async (req, res) => {
  validateId(req.params.id, 'subscription ID');

  const subscription = await Subscription.findById(req.params.id)
    .populate('templateId');

  if (!subscription) {
    throw new AppError('Subscription not found', 404);
  }

  if (subscription.status !== 'Draft') {
    throw new AppError('Only Draft subscriptions can be sent as quotations', 400);
  }

  const validityDays = subscription.templateId?.validityDays || 30;

  // FIX: valid until the very end of the last day, in India time.
  // addPeriod gives midnight at the start of (today + validityDays + 1).
  const validUntil = new Date(
    addPeriod(new Date(), 'daily', validityDays + 1).getTime() - 1
  );

  subscription.status = 'Quotation';
  subscription.quotationValidUntil = validUntil;

  await subscription.save();

  const result = await populateSubscription(
    Subscription.findById(subscription._id)
  );

  res.status(200).json({
    success: true,
    message: 'Quotation sent successfully',
    data: result,
  });
});

// PATCH /api/subscriptions/:id/confirm
export const confirmSubscription = asyncHandler(async (req, res) => {
  validateId(req.params.id, 'subscription ID');

  const subscription = await Subscription.findById(req.params.id);

  if (!subscription) {
    throw new AppError('Subscription not found', 404);
  }

  if (subscription.status !== 'Quotation') {
    throw new AppError('Only Quotation subscriptions can be confirmed', 400);
  }

  if (
    subscription.quotationValidUntil &&
    new Date() > subscription.quotationValidUntil
  ) {
    throw new AppError('Quotation has expired', 400);
  }

  subscription.status = 'Confirmed';

  await subscription.save();

  const result = await populateSubscription(
    Subscription.findById(subscription._id)
  );

  res.status(200).json({
    success: true,
    message: 'Subscription confirmed successfully',
    data: result,
  });
});

// PATCH /api/subscriptions/:id/activate
export const activateSubscription = asyncHandler(async (req, res) => {
  validateId(req.params.id, 'subscription ID');

  const subscription = await Subscription.findById(req.params.id);

  if (!subscription) {
    throw new AppError('Subscription not found', 404);
  }

  if (subscription.status !== 'Confirmed') {
    throw new AppError('Only Confirmed subscriptions can be activated', 400);
  }

  // FIX: calendar-day comparison in India time.
  if (startOfDayIST() < startOfDayIST(subscription.startDate)) {
    throw new AppError('Subscription cannot be activated before its start date', 400);
  }

  subscription.status = 'Active';
  subscription.periodsBilled = 0;
  // Billing compares against midnight (IST), so store midnight (IST).
  subscription.nextBillingDate = startOfDayIST(subscription.startDate);

  await subscription.save();

  const result = await populateSubscription(
    Subscription.findById(subscription._id)
  );

  res.status(200).json({
    success: true,
    message: 'Subscription activated successfully',
    data: result,
  });
});

// PATCH /api/subscriptions/:id/pause
export const pauseSubscription = asyncHandler(async (req, res) => {
  validateId(req.params.id, 'subscription ID');

  const subscription = await Subscription.findById(req.params.id)
    .populate('planId');

  if (!subscription) {
    throw new AppError('Subscription not found', 404);
  }

  if (subscription.status !== 'Active') {
    throw new AppError('Only Active subscriptions can be paused', 400);
  }

  if (!subscription.planId.allowPause) {
    throw new AppError('Pausing is not allowed for this plan', 400);
  }

  if (subscription.isPaused) {
    throw new AppError('Subscription is already paused', 400);
  }

  subscription.isPaused = true;
  await subscription.save();

  res.status(200).json({
    success: true,
    message: 'Subscription paused successfully',
    data: subscription,
  });
});

// PATCH /api/subscriptions/:id/resume
export const resumeSubscription = asyncHandler(async (req, res) => {
  validateId(req.params.id, 'subscription ID');

  const subscription = await Subscription.findById(req.params.id)
    .populate('planId');

  if (!subscription) {
    throw new AppError('Subscription not found', 404);
  }

  if (subscription.status !== 'Active' || !subscription.isPaused) {
    throw new AppError('Only paused Active subscriptions can be resumed', 400);
  }

  // Billing periods that fell inside the pause are not billed. Recompute from
  // the original start date so month-end periods never drift.
  const today = startOfDayIST();
  let periodsBilled = Number.isSafeInteger(subscription.periodsBilled)
    ? subscription.periodsBilled
    : 0;
  let next = addPeriod(
    subscription.startDate,
    subscription.planId.billingPeriod,
    periodsBilled
  );

  while (next && next < today && next <= subscription.expiryDate) {
    periodsBilled += 1;
    next = addPeriod(
      subscription.startDate,
      subscription.planId.billingPeriod,
      periodsBilled
    );
  }

  subscription.periodsBilled = periodsBilled;
  subscription.nextBillingDate = next;
  subscription.isPaused = false;
  await subscription.save();

  res.status(200).json({
    success: true,
    message: 'Subscription resumed successfully',
    data: subscription,
  });
});

// PATCH /api/subscriptions/:id/close
export const closeSubscription = asyncHandler(async (req, res) => {
  validateId(req.params.id, 'subscription ID');

  const subscription = await Subscription.findById(req.params.id)
    .populate('planId');

  if (!subscription) {
    throw new AppError('Subscription not found', 404);
  }

  if (subscription.status !== 'Active') {
    throw new AppError('Only Active subscriptions can be closed', 400);
  }

  // FIX: calendar-day comparison in India time.
  const hasExpired = startOfDayIST() >= startOfDayIST(subscription.expiryDate);

  if (!hasExpired && !subscription.planId.allowEarlyClose) {
    throw new AppError('Early closure is not allowed for this plan', 400);
  }

  subscription.status = 'Closed';
  subscription.isPaused = false;

  await subscription.save();

  res.status(200).json({
    success: true,
    message: 'Subscription closed successfully',
    data: subscription,
  });
});

// PATCH /api/subscriptions/:id/renew
export const renewSubscription = asyncHandler(async (req, res) => {
  validateId(req.params.id, 'subscription ID');

  const subscription = await Subscription.findById(req.params.id)
    .populate('planId');

  if (!subscription) {
    throw new AppError('Subscription not found', 404);
  }

  if (!['Active', 'Closed'].includes(subscription.status)) {
    throw new AppError('Only Active or Closed subscriptions can be renewed', 400);
  }

  if (!subscription.planId.allowRenew) {
    throw new AppError('Renewal is not allowed for this plan', 400);
  }

  const oldExpiryDate = new Date(subscription.expiryDate);

  // FIX: addPeriod never overflows (31 Jan + 1 month = 28 Feb).
  const newExpiryDate = addPeriod(
    oldExpiryDate,
    subscription.planId.billingPeriod
  );

  subscription.expiryDate = newExpiryDate;

  if (subscription.status === 'Closed') {
    subscription.status = 'Active';
    subscription.isPaused = false;
    subscription.nextBillingDate = addPeriod(
      subscription.startDate,
      subscription.planId.billingPeriod,
      subscription.periodsBilled
    );
  }

  await subscription.save();

  res.status(200).json({
    success: true,
    message: 'Subscription renewed successfully',
    data: subscription,
  });
});
