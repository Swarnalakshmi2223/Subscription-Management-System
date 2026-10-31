
import mongoose from 'mongoose';
import Tax from '../models/Tax.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { parsePagination, pageMeta } from '../utils/query.js';

const escapeRegex = (value) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const validateTaxName = (name) => {
  if (typeof name !== 'string' || !name.trim()) {
    throw new AppError('Tax name is required', 400);
  }
};

const validateRate = (ratePercent) => {
  if (
    typeof ratePercent !== 'number' ||
    !Number.isFinite(ratePercent) ||
    ratePercent < 0 ||
    ratePercent > 100
  ) {
    throw new AppError('Tax percentage must be a number between 0 and 100', 400);
  }
};

// GET /api/taxes
// Admin and Staff
export const getTaxes = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const [items, total] = await Promise.all([
    Tax.find().select('-__v').sort({ name: 1 }).skip(skip).limit(limit).lean(),
    Tax.countDocuments(),
  ]);

  res.status(200).json({
    success: true,
    items,
    meta: pageMeta(page, limit, total),
  });
});

// GET /api/taxes/:id
// Admin and Staff
export const getTax = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    throw new AppError('Invalid tax ID', 400);
  }

  const tax = await Tax.findById(id).select('-__v').lean();

  if (!tax) {
    throw new AppError('Tax not found', 404);
  }

  res.status(200).json({
    success: true,
    data: tax,
  });
});

// POST /api/taxes
// Admin only
export const createTax = asyncHandler(async (req, res) => {
  const { name, ratePercent } = req.body;

  validateTaxName(name);
  validateRate(ratePercent);

  const cleanName = name.trim();

  const existingTax = await Tax.findOne({
    name: { $regex: `^${escapeRegex(cleanName)}$`, $options: 'i' },
  });

  if (existingTax) {
    throw new AppError('A tax with this name already exists', 409);
  }

  const tax = await Tax.create({
    name: cleanName,
    ratePercent,
  });

  res.status(201).json({
    success: true,
    message: 'Tax created successfully',
    data: tax,
  });
});

// PUT /api/taxes/:id
// Admin only
export const updateTax = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, ratePercent } = req.body;

  if (!mongoose.isValidObjectId(id)) {
    throw new AppError('Invalid tax ID', 400);
  }

  if (name === undefined && ratePercent === undefined) {
    throw new AppError('Provide a tax name or percentage to update', 400);
  }

  const tax = await Tax.findById(id);

  if (!tax) {
    throw new AppError('Tax not found', 404);
  }

  if (name !== undefined) {
    validateTaxName(name);

    const cleanName = name.trim();

    const duplicate = await Tax.findOne({
      _id: { $ne: tax._id },
      name: { $regex: `^${escapeRegex(cleanName)}$`, $options: 'i' },
    });

    if (duplicate) {
      throw new AppError('A tax with this name already exists', 409);
    }

    tax.name = cleanName;
  }

  if (ratePercent !== undefined) {
    validateRate(ratePercent);
    tax.ratePercent = ratePercent;
  }

  await tax.save();

  res.status(200).json({
    success: true,
    message: 'Tax updated successfully',
    data: tax,
  });
});

// PATCH /api/taxes/:id/active
// Admin only
export const toggleTaxStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { isActive } = req.body;

  if (!mongoose.isValidObjectId(id)) {
    throw new AppError('Invalid tax ID', 400);
  }

  if (typeof isActive !== 'boolean') {
    throw new AppError('isActive must be true or false', 400);
  }

  const tax = await Tax.findById(id);

  if (!tax) {
    throw new AppError('Tax not found', 404);
  }

  tax.isActive = isActive;
  await tax.save();

  res.status(200).json({
    success: true,
    message: `Tax ${isActive ? 'activated' : 'deactivated'} successfully`,
    data: tax,
  });
});
