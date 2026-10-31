
import mongoose from 'mongoose';
import Plan from '../models/Plan.js';
import Product from '../models/Product.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { parsePagination, pageMeta, escapeRegex } from '../utils/query.js';

const billingPeriods = ['daily', 'weekly', 'monthly', 'yearly'];

const validateName = (name) => {
  if (typeof name !== 'string' || !name.trim()) {
    throw new AppError('Plan name is required', 400);
  }
};

const validatePrice = (price) => {
  if (
    typeof price !== 'number' ||
    !Number.isSafeInteger(price) ||
    price < 0
  ) {
    throw new AppError(
      'Plan price must be a non-negative integer in paise',
      400
    );
  }
};

const validateBillingPeriod = (period) => {
  if (!billingPeriods.includes(period)) {
    throw new AppError(
      'Billing period must be daily, weekly, monthly, or yearly',
      400
    );
  }
};

const validateQuantity = (quantity) => {
  if (
    typeof quantity !== 'number' ||
    !Number.isSafeInteger(quantity) ||
    quantity < 1
  ) {
    throw new AppError(
      'Minimum quantity must be a positive whole number',
      400
    );
  }
};

const validateDate = (date, fieldName) => {
  if (!date || Number.isNaN(new Date(date).getTime())) {
    throw new AppError(`${fieldName} must be a valid date`, 400);
  }
};

const validateBoolean = (value, fieldName) => {
  if (typeof value !== 'boolean') {
    throw new AppError(`${fieldName} must be true or false`, 400);
  }
};

const validateProduct = async (productId) => {
  if (!mongoose.isValidObjectId(productId)) {
    throw new AppError('Invalid product ID', 400);
  }

  const product = await Product.findById(productId);

  if (!product) {
    throw new AppError('Product not found', 404);
  }

  if (!product.isActive) {
    throw new AppError('Cannot assign an inactive product to a plan', 400);
  }

  return product;
};

const validatePlanDates = (startDate, endDate) => {
  const start = new Date(startDate);
  const end = new Date(endDate);

  if (end < start) {
    throw new AppError(
      'Plan end date must be on or after start date',
      400
    );
  }
};

// GET /api/plans
// Admin and Staff
export const getPlans = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const filter = {};

  if (typeof req.query.search === 'string' && req.query.search.trim()) {
    filter.name = new RegExp(escapeRegex(req.query.search.trim()), 'i');
  }

  if (req.query.active !== undefined) {
    if (!['true', 'false'].includes(req.query.active)) {
      throw new AppError('active must be true or false', 400);
    }
    filter.isActive = req.query.active === 'true';
  }

  if (req.query.billingPeriod !== undefined) {
    if (!billingPeriods.includes(req.query.billingPeriod)) {
      throw new AppError('Invalid billing period filter', 400);
    }
    filter.billingPeriod = req.query.billingPeriod;
  }

  const query = Plan.find(filter)
    .select('-__v')
    .populate('productId', 'name type salesPrice isActive')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();
  const [items, total] = await Promise.all([
    query,
    Plan.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    items,
    meta: pageMeta(page, limit, total),
  });
});

// GET /api/plans/:id
// Admin and Staff
export const getPlan = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    throw new AppError('Invalid plan ID', 400);
  }

  const plan = await Plan.findById(id).populate(
    'productId',
    'name type salesPrice isActive'
  );

  if (!plan) {
    throw new AppError('Plan not found', 404);
  }

  res.status(200).json({
    success: true,
    data: plan,
  });
});

// POST /api/plans
// Admin only
export const createPlan = asyncHandler(async (req, res) => {
  const {
    name,
    productId,
    price,
    billingPeriod,
    minQuantity,
    startDate,
    endDate,
    autoClose,
    allowEarlyClose,
    allowPause,
    allowRenew,
  } = req.body;

  validateName(name);
  validatePrice(price);
  validateBillingPeriod(billingPeriod);

  if (minQuantity !== undefined) {
    validateQuantity(minQuantity);
  }

  validateDate(startDate, 'Start date');
  validateDate(endDate, 'End date');
  validatePlanDates(startDate, endDate);

  const booleanFields = {
    autoClose,
    allowEarlyClose,
    allowPause,
    allowRenew,
  };

  for (const [field, value] of Object.entries(booleanFields)) {
    if (value !== undefined) {
      validateBoolean(value, field);
    }
  }

  await validateProduct(productId);

  const plan = await Plan.create({
    name: name.trim(),
    productId,
    price,
    billingPeriod,
    minQuantity: minQuantity ?? 1,
    startDate,
    endDate,
    autoClose: autoClose ?? true,
    allowEarlyClose: allowEarlyClose ?? false,
    allowPause: allowPause ?? false,
    allowRenew: allowRenew ?? true,
  });

  await plan.populate('productId', 'name type salesPrice isActive');

  res.status(201).json({
    success: true,
    message: 'Subscription plan created successfully',
    data: plan,
  });
});

// PUT /api/plans/:id
// Admin only
export const updatePlan = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    throw new AppError('Invalid plan ID', 400);
  }

  const plan = await Plan.findById(id);

  if (!plan) {
    throw new AppError('Plan not found', 404);
  }

  const allowedFields = [
    'name',
    'productId',
    'price',
    'billingPeriod',
    'minQuantity',
    'startDate',
    'endDate',
    'autoClose',
    'allowEarlyClose',
    'allowPause',
    'allowRenew',
  ];

  const updates = Object.keys(req.body);

  if (
    updates.length === 0 ||
    updates.some((field) => !allowedFields.includes(field))
  ) {
    throw new AppError('Provide valid plan details to update', 400);
  }

  if (req.body.name !== undefined) {
    validateName(req.body.name);
    plan.name = req.body.name.trim();
  }

  if (req.body.productId !== undefined) {
    await validateProduct(req.body.productId);
    plan.productId = req.body.productId;
  }

  if (req.body.price !== undefined) {
    validatePrice(req.body.price);
    plan.price = req.body.price;
  }

  if (req.body.billingPeriod !== undefined) {
    validateBillingPeriod(req.body.billingPeriod);
    plan.billingPeriod = req.body.billingPeriod;
  }

  if (req.body.minQuantity !== undefined) {
    validateQuantity(req.body.minQuantity);
    plan.minQuantity = req.body.minQuantity;
  }

  if (req.body.startDate !== undefined) {
    validateDate(req.body.startDate, 'Start date');
    plan.startDate = req.body.startDate;
  }

  if (req.body.endDate !== undefined) {
    validateDate(req.body.endDate, 'End date');
    plan.endDate = req.body.endDate;
  }

  const booleanFields = [
    'autoClose',
    'allowEarlyClose',
    'allowPause',
    'allowRenew',
  ];

  for (const field of booleanFields) {
    if (req.body[field] !== undefined) {
      validateBoolean(req.body[field], field);
      plan[field] = req.body[field];
    }
  }

  validatePlanDates(plan.startDate, plan.endDate);

  await plan.save();
  await plan.populate('productId', 'name type salesPrice isActive');

  res.status(200).json({
    success: true,
    message: 'Subscription plan updated successfully',
    data: plan,
  });
});

// PATCH /api/plans/:id/active
// Admin only
export const togglePlanStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { isActive } = req.body;

  if (!mongoose.isValidObjectId(id)) {
    throw new AppError('Invalid plan ID', 400);
  }

  if (typeof isActive !== 'boolean') {
    throw new AppError('isActive must be true or false', 400);
  }

  const plan = await Plan.findById(id);

  if (!plan) {
    throw new AppError('Plan not found', 404);
  }

  plan.isActive = isActive;
  await plan.save();

  res.status(200).json({
    success: true,
    message: `Plan ${isActive ? 'activated' : 'deactivated'} successfully`,
    data: plan,
  });
});
