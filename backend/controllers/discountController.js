import mongoose from 'mongoose';
import Discount from '../models/Discount.js';
import Product from '../models/Product.js';
import Subscription from '../models/Subscription.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const validateId = (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError('Invalid discount ID', 400);
  }
};

const validateDiscountData = async (data) => {
  const {
    type,
    value,
    minPurchase = 0,
    minQuantity = 1,
    startDate,
    endDate,
    usageLimit,
    appliesTo,
    productIds = [],
    subscriptionIds = [],
  } = data;

  if (type !== 'fixed' && type !== 'percentage') {
    throw new AppError('Discount type must be fixed or percentage', 400);
  }

  if (!Number.isFinite(value) || value <= 0) {
    throw new AppError('Discount value must be greater than zero', 400);
  }

  // FIX: a fixed discount is money, so it must be a whole number of paise.
  if (type === 'fixed' && !Number.isSafeInteger(value)) {
    throw new AppError('A fixed discount must be a whole number of paise', 400);
  }

  if (type === 'percentage' && value > 100) {
    throw new AppError('Percentage discount cannot exceed 100', 400);
  }

  if (!Number.isSafeInteger(minPurchase) || minPurchase < 0) {
    throw new AppError(
      'Minimum purchase must be a non-negative integer in paise',
      400
    );
  }

  if (!Number.isSafeInteger(minQuantity) || minQuantity < 1) {
    throw new AppError('Minimum quantity must be a positive integer', 400);
  }

  if (
    usageLimit !== undefined &&
    usageLimit !== null &&
    (!Number.isSafeInteger(usageLimit) || usageLimit < 1)
  ) {
    throw new AppError('Usage limit must be a positive integer', 400);
  }

  if (!['products', 'subscriptions'].includes(appliesTo)) {
    throw new AppError(
      'Discount must apply to products or subscriptions',
      400
    );
  }

  if (!Array.isArray(productIds) || !Array.isArray(subscriptionIds)) {
    throw new AppError('Target IDs must be arrays', 400);
  }

  if (appliesTo === 'products' && subscriptionIds.length > 0) {
    throw new AppError(
      'Product discounts cannot contain subscription IDs',
      400
    );
  }

  if (appliesTo === 'subscriptions' && productIds.length > 0) {
    throw new AppError(
      'Subscription discounts cannot contain product IDs',
      400
    );
  }

  if (productIds.some((id) => !mongoose.Types.ObjectId.isValid(id))) {
    throw new AppError('One or more product IDs are invalid', 400);
  }

  if (
    subscriptionIds.some((id) => !mongoose.Types.ObjectId.isValid(id))
  ) {
    throw new AppError('One or more subscription IDs are invalid', 400);
  }

  const parsedStart = new Date(startDate);
  const parsedEnd = new Date(endDate);

  if (
    !startDate ||
    !endDate ||
    Number.isNaN(parsedStart.getTime()) ||
    Number.isNaN(parsedEnd.getTime())
  ) {
    throw new AppError('Valid start and end dates are required', 400);
  }

  if (parsedEnd < parsedStart) {
    throw new AppError('End date must be on or after start date', 400);
  }

  if (appliesTo === 'products' && productIds.length > 0) {
    const products = await Product.find({
      _id: { $in: productIds },
    }).select('_id');

    if (products.length !== new Set(productIds.map(String)).size) {
      throw new AppError('One or more selected products do not exist', 404);
    }
  }

  if (appliesTo === 'subscriptions' && subscriptionIds.length > 0) {
    const subscriptions = await Subscription.find({
      _id: { $in: subscriptionIds },
    }).select('_id');

    if (
      subscriptions.length !== new Set(subscriptionIds.map(String)).size
    ) {
      throw new AppError(
        'One or more selected subscriptions do not exist',
        404
      );
    }
  }
};

// GET /api/discounts
export const getDiscounts = asyncHandler(async (req, res) => {
  const {
    type,
    appliesTo,
    isActive,
  } = req.query;

  const filter = {};

  if (type) {
    if (!['fixed', 'percentage'].includes(type)) {
      throw new AppError('Invalid discount type filter', 400);
    }

    filter.type = type;
  }

  if (appliesTo) {
    if (!['products', 'subscriptions'].includes(appliesTo)) {
      throw new AppError('Invalid appliesTo filter', 400);
    }

    filter.appliesTo = appliesTo;
  }

  if (isActive !== undefined) {
    if (!['true', 'false'].includes(isActive)) {
      throw new AppError('isActive must be true or false', 400);
    }

    filter.isActive = isActive === 'true';
  }

  const discounts = await Discount.find(filter)
    .populate('productIds', 'name type')
    .populate('subscriptionIds', 'number status')
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    count: discounts.length,
    data: discounts,
  });
});

// GET /api/discounts/:id
export const getDiscount = asyncHandler(async (req, res) => {
  validateId(req.params.id);

  const discount = await Discount.findById(req.params.id)
    .populate('productIds', 'name type')
    .populate('subscriptionIds', 'number status');

  if (!discount) {
    throw new AppError('Discount not found', 404);
  }

  res.status(200).json({
    success: true,
    data: discount,
  });
});

// POST /api/discounts
export const createDiscount = asyncHandler(async (req, res) => {
  const {
    name,
    type,
    value,
    minPurchase = 0,
    minQuantity = 1,
    startDate,
    endDate,
    usageLimit = null,
    appliesTo,
    productIds = [],
    subscriptionIds = [],
    isActive = true,
  } = req.body ?? {};

  if (typeof name !== 'string' || !name.trim()) {
    throw new AppError('Discount name is required', 400);
  }

  if (typeof isActive !== 'boolean') {
    throw new AppError('isActive must be true or false', 400);
  }

  await validateDiscountData({
    type,
    value,
    minPurchase,
    minQuantity,
    startDate,
    endDate,
    usageLimit,
    appliesTo,
    productIds,
    subscriptionIds,
  });

  const discount = await Discount.create({
    name: name.trim(),
    type,
    value,
    minPurchase,
    minQuantity,
    startDate,
    endDate,
    usageLimit,
    appliesTo,
    productIds,
    subscriptionIds,
    isActive,
  });

  res.status(201).json({
    success: true,
    message: 'Discount created successfully',
    data: discount,
  });
});

// PUT /api/discounts/:id
export const updateDiscount = asyncHandler(async (req, res) => {
  validateId(req.params.id);

  const discount = await Discount.findById(req.params.id);

  if (!discount) {
    throw new AppError('Discount not found', 404);
  }

  const allowedFields = [
    'name',
    'type',
    'value',
    'minPurchase',
    'minQuantity',
    'startDate',
    'endDate',
    'usageLimit',
    'appliesTo',
    'productIds',
    'subscriptionIds',
    'isActive',
  ];

  const body = req.body ?? {};
  const updatedData = {};

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updatedData[field] = body[field];
    }
  }

  if (Object.keys(updatedData).length === 0) {
    throw new AppError('Provide discount details to update', 400);
  }

  if (updatedData.name !== undefined &&
      (typeof updatedData.name !== 'string' || !updatedData.name.trim())) {
    throw new AppError('Discount name cannot be empty', 400);
  }

  if (typeof updatedData.name === 'string') {
    updatedData.name = updatedData.name.trim();
  }

  if (
    updatedData.isActive !== undefined &&
    typeof updatedData.isActive !== 'boolean'
  ) {
    throw new AppError('isActive must be true or false', 400);
  }

  const finalData = {
    name: discount.name,
    type: discount.type,
    value: discount.value,
    minPurchase: discount.minPurchase,
    minQuantity: discount.minQuantity,
    startDate: discount.startDate,
    endDate: discount.endDate,
    usageLimit: discount.usageLimit,
    appliesTo: discount.appliesTo,
    productIds: discount.productIds.map(String),
    subscriptionIds: discount.subscriptionIds.map(String),
    ...updatedData,
  };

  await validateDiscountData(finalData);

  Object.assign(discount, updatedData);

  await discount.save();

  res.status(200).json({
    success: true,
    message: 'Discount updated successfully',
    data: discount,
  });
});

// PATCH /api/discounts/:id/active
export const toggleDiscountStatus = asyncHandler(async (req, res) => {
  validateId(req.params.id);

  const { isActive } = req.body ?? {};

  if (typeof isActive !== 'boolean') {
    throw new AppError('isActive must be true or false', 400);
  }

  // FIX: returnDocument replaces the deprecated "new: true" option.
  const discount = await Discount.findByIdAndUpdate(
    req.params.id,
    { isActive },
    { returnDocument: 'after', runValidators: true }
  );

  if (!discount) {
    throw new AppError('Discount not found', 404);
  }

  res.status(200).json({
    success: true,
    message: `Discount ${isActive ? 'activated' : 'deactivated'} successfully`,
    data: discount,
  });
});