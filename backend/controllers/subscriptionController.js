
import mongoose from 'mongoose';

import Subscription from '../models/Subscription.js';
import Counter from '../models/Counter.js';
import User from '../models/User.js';
import Plan from '../models/Plan.js';
import Product from '../models/Product.js';
import Tax from '../models/Tax.js';
import QuotationTemplate from '../models/QuotationTemplate.js';

import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// Generate sequential subscription numbers.
const generateSubscriptionNumber = async () => {
  const counter = await Counter.findOneAndUpdate(
    { key: 'subscription' },
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  return `SUB-${String(counter.seq).padStart(6, '0')}`;
};

// Validate MongoDB IDs.
const validateId = (id, fieldName) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError(`Invalid ${fieldName}`, 400);
  }
};

// Add a billing period to a date.
const addBillingPeriod = (date, period) => {
  const result = new Date(date);

  switch (period) {
    case 'daily':
      result.setDate(result.getDate() + 1);
      break;
    case 'weekly':
      result.setDate(result.getDate() + 7);
      break;
    case 'monthly':
      result.setMonth(result.getMonth() + 1);
      break;
    case 'yearly':
      result.setFullYear(result.getFullYear() + 1);
      break;
    default:
      throw new AppError('Invalid billing period', 400);
  }

  return result;
};

// Build subscription lines using backend product and tax prices.
const buildSubscriptionLines = async (template, plan) => {
  const result = [];

  for (const line of template.lines) {
    const product = await Product.findById(line.productId);

    if (!product || !product.isActive) {
      throw new AppError(
        'One of the template products is unavailable',
        400
      );
    }

    let unitPrice = product._id.equals(plan.productId)
      ? plan.price
      : product.salesPrice;

    // Validate the selected variant and add its extra price.
    if (line.variant?.attribute || line.variant?.value) {
      if (!line.variant.attribute || !line.variant.value) {
        throw new AppError('Both variant attribute and value are required', 400);
      }

      const selectedVariant = product.variants.find(
        (variant) =>
          variant.attribute.toLowerCase() ===
            line.variant.attribute.toLowerCase() &&
          variant.value.toLowerCase() ===
            line.variant.value.toLowerCase()
      );

      if (!selectedVariant) {
        throw new AppError(
          `Selected variant is not available for ${product.name}`,
          400
        );
      }

      unitPrice += selectedVariant.extraPrice;
    }

    if (product._id.equals(plan.productId) &&
        line.quantity < plan.minQuantity) {
      throw new AppError(
        `Quantity for the plan product must be at least ${plan.minQuantity}`,
        400
      );
    }

    const subtotal = unitPrice * line.quantity;

    if (!Number.isSafeInteger(subtotal)) {
      throw new AppError('Subscription line price is too large', 400);
    }

    let taxAmount = 0;
    let taxId = product.taxId || null;

    if (taxId) {
      const tax = await Tax.findById(taxId);

      if (tax && tax.isActive) {
        taxAmount = Math.round(
          (subtotal * tax.ratePercent) / 100
        );
      } else {
        taxId = null;
      }
    }

    result.push({
      productId: product._id,
      variant: line.variant || {},
      quantity: line.quantity,
      unitPrice,
      taxId,
      taxAmount,
      amount: subtotal + taxAmount,
    });
  }

  return result;
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
  const subscriptions = await populateSubscription(
    Subscription.find().sort({ createdAt: -1 })
  );

  res.status(200).json({
    success: true,
    count: subscriptions.length,
    data: subscriptions,
  });
});

// GET /api/subscriptions/:id
export const getSubscription = asyncHandler(async (req, res) => {
  validateId(req.params.id, 'subscription ID');

  const subscription = await populateSubscription(
    Subscription.findById(req.params.id)
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
  } = req.body;

  validateId(customerId, 'customer ID');
  validateId(planId, 'plan ID');
  validateId(templateId, 'quotation template ID');

  if (!startDate || !expiryDate) {
    throw new AppError('Start date and expiry date are required', 400);
  }

  if (!['immediate', 'net15', 'net30'].includes(paymentTerms)) {
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

  // The subscription start date must be within plan availability dates.
  const planStart = new Date(plan.startDate);
  planStart.setHours(0, 0, 0, 0);

  const selectedStart = new Date(start);
  selectedStart.setHours(0, 0, 0, 0);

  if (selectedStart < planStart) {
    throw new AppError('Subscription starts before the plan availability date', 400);
  }

  if (plan.endDate) {
    const planEnd = new Date(plan.endDate);
    planEnd.setHours(23, 59, 59, 999);

    if (selectedStart > planEnd) {
      throw new AppError('Subscription starts after the plan availability date', 400);
    }
  }

  const template = await QuotationTemplate.findById(templateId);

  if (!template || !template.isActive) {
    throw new AppError('Active quotation template not found', 404);
  }

  if (!template.planId.equals(plan._id)) {
    throw new AppError(
      'The quotation template does not belong to the selected plan',
      400
    );
  }

  const lines = await buildSubscriptionLines(template, plan);
  const number = await generateSubscriptionNumber();

  const subscription = await Subscription.create({
    number,
    customerId,
    planId,
    templateId,
    status: 'Draft',
    startDate: start,
    expiryDate: expiry,
    paymentTerms,
    lines,
    discountIds: [],
    quotationValidUntil: null,
    nextBillingDate: null,
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

  const allowedFields = [
    'startDate',
    'expiryDate',
    'paymentTerms',
  ];

  const unknownFields = Object.keys(req.body).filter(
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

  const start = new Date(req.body.startDate ?? subscription.startDate);
  const expiry = new Date(req.body.expiryDate ?? subscription.expiryDate);

  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(expiry.getTime()) ||
    expiry <= start
  ) {
    throw new AppError('Please provide valid subscription dates', 400);
  }

  if (req.body.paymentTerms !== undefined) {
    if (!['immediate', 'net15', 'net30'].includes(req.body.paymentTerms)) {
      throw new AppError('Invalid payment terms', 400);
    }

    subscription.paymentTerms = req.body.paymentTerms;
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
  const validUntil = new Date();

  validUntil.setDate(validUntil.getDate() + validityDays);
  validUntil.setHours(23, 59, 59, 999);

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

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const start = new Date(subscription.startDate);
  start.setHours(0, 0, 0, 0);

  if (today < start) {
    throw new AppError('Subscription cannot be activated before its start date', 400);
  }

  subscription.status = 'Active';
  subscription.nextBillingDate = subscription.startDate;

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

  const subscription = await Subscription.findById(req.params.id);

  if (!subscription) {
    throw new AppError('Subscription not found', 404);
  }

  if (subscription.status !== 'Active' || !subscription.isPaused) {
    throw new AppError('Only paused Active subscriptions can be resumed', 400);
  }

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

  const today = new Date();
  const hasExpired = today >= subscription.expiryDate;

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
  const newExpiryDate = addBillingPeriod(
    oldExpiryDate,
    subscription.planId.billingPeriod
  );

  subscription.expiryDate = newExpiryDate;

  if (subscription.status === 'Closed') {
    subscription.status = 'Active';
    subscription.isPaused = false;
    subscription.nextBillingDate = oldExpiryDate;
  }

  await subscription.save();

  res.status(200).json({
    success: true,
    message: 'Subscription renewed successfully',
    data: subscription,
  });
});
