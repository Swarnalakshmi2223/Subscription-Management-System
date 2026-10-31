
import mongoose from 'mongoose';
import Product from '../models/Product.js';
import Tax from '../models/Tax.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const validateName = (name) => {
  if (typeof name !== 'string' || !name.trim()) {
    throw new AppError('Product name is required', 400);
  }
};

const validateType = (type) => {
  if (typeof type !== 'string' || !type.trim()) {
    throw new AppError('Product type is required', 400);
  }
};

const validatePrice = (price, fieldName) => {
  if (
    typeof price !== 'number' ||
    !Number.isSafeInteger(price) ||
    price < 0
  ) {
    throw new AppError(
      `${fieldName} must be a non-negative integer in paise`,
      400
    );
  }
};

const validateVariants = (variants) => {
  if (!Array.isArray(variants)) {
    throw new AppError('Variants must be an array', 400);
  }

  for (const variant of variants) {
    if (
      !variant ||
      typeof variant.attribute !== 'string' ||
      !variant.attribute.trim() ||
      typeof variant.value !== 'string' ||
      !variant.value.trim()
    ) {
      throw new AppError(
        'Each variant must have an attribute and value',
        400
      );
    }

    validatePrice(variant.extraPrice, 'Variant extra price');
  }
};

const validateTax = async (taxId) => {
  if (taxId === null) return;

  if (!mongoose.isValidObjectId(taxId)) {
    throw new AppError('Invalid tax ID', 400);
  }

  const tax = await Tax.findById(taxId);

  if (!tax) {
    throw new AppError('Tax not found', 404);
  }

  if (!tax.isActive) {
    throw new AppError('Cannot assign an inactive tax', 400);
  }
};

// GET /api/products
// Admin and Staff
export const getProducts = asyncHandler(async (req, res) => {
  const products = await Product.find()
    .populate('taxId', 'name ratePercent isActive')
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    count: products.length,
    data: products,
  });
});

// GET /api/products/:id
// Admin and Staff
export const getProduct = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    throw new AppError('Invalid product ID', 400);
  }

  const product = await Product.findById(id).populate(
    'taxId',
    'name ratePercent isActive'
  );

  if (!product) {
    throw new AppError('Product not found', 404);
  }

  res.status(200).json({
    success: true,
    data: product,
  });
});

// POST /api/products
// Admin only
export const createProduct = asyncHandler(async (req, res) => {
  const {
    name,
    type,
    salesPrice,
    costPrice,
    notes,
    taxId,
    variants,
  } = req.body;

  validateName(name);
  validateType(type);
  validatePrice(salesPrice, 'Sales price');
  validatePrice(costPrice, 'Cost price');

  if (notes !== undefined && typeof notes !== 'string') {
    throw new AppError('Notes must be a string', 400);
  }

  if (taxId !== undefined && taxId !== null) {
    await validateTax(taxId);
  }

  if (variants !== undefined) {
    validateVariants(variants);
  }

  const product = await Product.create({
    name: name.trim(),
    type: type.trim(),
    salesPrice,
    costPrice,
    notes,
    taxId: taxId || null,
    variants: variants || [],
  });

  await product.populate('taxId', 'name ratePercent isActive');

  res.status(201).json({
    success: true,
    message: 'Product created successfully',
    data: product,
  });
});

// PUT /api/products/:id
// Admin only
export const updateProduct = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    throw new AppError('Invalid product ID', 400);
  }

  const product = await Product.findById(id);

  if (!product) {
    throw new AppError('Product not found', 404);
  }

  const {
    name,
    type,
    salesPrice,
    costPrice,
    notes,
    taxId,
    variants,
  } = req.body;

  const hasUpdates = [
    name,
    type,
    salesPrice,
    costPrice,
    notes,
    taxId,
    variants,
  ].some((value) => value !== undefined);

  if (!hasUpdates) {
    throw new AppError('Provide product details to update', 400);
  }

  if (name !== undefined) {
    validateName(name);
    product.name = name.trim();
  }

  if (type !== undefined) {
    validateType(type);
    product.type = type.trim();
  }

  if (salesPrice !== undefined) {
    validatePrice(salesPrice, 'Sales price');
    product.salesPrice = salesPrice;
  }

  if (costPrice !== undefined) {
    validatePrice(costPrice, 'Cost price');
    product.costPrice = costPrice;
  }

  if (notes !== undefined) {
    if (typeof notes !== 'string') {
      throw new AppError('Notes must be a string', 400);
    }
    product.notes = notes;
  }

  if (taxId !== undefined) {
    if (taxId !== null) {
      await validateTax(taxId);
    }
    product.taxId = taxId;
  }

  if (variants !== undefined) {
    validateVariants(variants);
    product.variants = variants;
  }

  await product.save();
  await product.populate('taxId', 'name ratePercent isActive');

  res.status(200).json({
    success: true,
    message: 'Product updated successfully',
    data: product,
  });
});

// PATCH /api/products/:id/active
// Admin only
export const toggleProductStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { isActive } = req.body;

  if (!mongoose.isValidObjectId(id)) {
    throw new AppError('Invalid product ID', 400);
  }

  if (typeof isActive !== 'boolean') {
    throw new AppError('isActive must be true or false', 400);
  }

  const product = await Product.findById(id);

  if (!product) {
    throw new AppError('Product not found', 404);
  }

  product.isActive = isActive;
  await product.save();

  res.status(200).json({
    success: true,
    message: `Product ${isActive ? 'activated' : 'deactivated'} successfully`,
    data: product,
  });
});
