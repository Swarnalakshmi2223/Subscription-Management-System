
import mongoose from 'mongoose';
import QuotationTemplate from '../models/QuotationTemplate.js';
import Plan from '../models/Plan.js';
import Product from '../models/Product.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { parsePagination, pageMeta, escapeRegex } from '../utils/query.js';

const validateName = (name) => {
  if (typeof name !== 'string' || !name.trim()) {
    throw new AppError('Template name is required', 400);
  }
};

const validateValidity = (validityDays) => {
  if (
    typeof validityDays !== 'number' ||
    !Number.isSafeInteger(validityDays) ||
    validityDays < 1
  ) {
    throw new AppError('Validity days must be a positive whole number', 400);
  }
};

const validatePlan = async (planId) => {
  if (!mongoose.isValidObjectId(planId)) {
    throw new AppError('Invalid plan ID', 400);
  }

  const plan = await Plan.findById(planId);

  if (!plan) {
    throw new AppError('Subscription plan not found', 404);
  }

  if (!plan.isActive) {
    throw new AppError('Cannot use an inactive subscription plan', 400);
  }

  return plan;
};

const validateLines = async (lines, plan) => {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new AppError(
      'A quotation template must contain at least one product line',
      400
    );
  }

  for (const line of lines) {
    if (!line || !mongoose.isValidObjectId(line.productId)) {
      throw new AppError('Each line must contain a valid product ID', 400);
    }

    if (
      typeof line.quantity !== 'number' ||
      !Number.isSafeInteger(line.quantity) ||
      line.quantity < 1
    ) {
      throw new AppError('Product quantity must be a positive whole number', 400);
    }

    const product = await Product.findById(line.productId);

    if (!product) {
      throw new AppError('A selected product was not found', 404);
    }

    if (!product.isActive) {
      throw new AppError(
        `Product "${product.name}" is inactive`,
        400
      );
    }

    if (line.variant !== undefined && line.variant !== null) {
      const { attribute, value } = line.variant;

      if (
        typeof attribute !== 'string' ||
        !attribute.trim() ||
        typeof value !== 'string' ||
        !value.trim()
      ) {
        throw new AppError(
          'A selected variant must contain an attribute and value',
          400
        );
      }

      const variantExists = product.variants.some(
        (item) =>
          item.attribute.toLowerCase() === attribute.trim().toLowerCase() &&
          item.value.toLowerCase() === value.trim().toLowerCase()
      );

      if (!variantExists) {
        throw new AppError(
          `Variant "${attribute}: ${value}" does not belong to product "${product.name}"`,
          400
        );
      }
    }

    if (
      String(product._id) === String(plan.productId) &&
      line.quantity < plan.minQuantity
    ) {
      throw new AppError(
        `Quantity for the plan product must be at least ${plan.minQuantity}`,
        400
      );
    }
  }
};

const populateTemplate = (query) =>
  query
    .populate('planId', 'name price billingPeriod minQuantity isActive')
    .populate('lines.productId', 'name type salesPrice variants isActive');

// GET /api/quotation-templates
// Admin and Staff
export const getTemplates = asyncHandler(async (req, res) => {
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

  const query = populateTemplate(
    QuotationTemplate.find(filter)
      .select('-__v')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean()
  );
  const [items, total] = await Promise.all([
    query,
    QuotationTemplate.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    items,
    meta: pageMeta(page, limit, total),
  });
});

// GET /api/quotation-templates/:id
// Admin and Staff
export const getTemplate = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    throw new AppError('Invalid quotation template ID', 400);
  }

  const template = await populateTemplate(
    QuotationTemplate.findById(id)
  );

  if (!template) {
    throw new AppError('Quotation template not found', 404);
  }

  res.status(200).json({
    success: true,
    data: template,
  });
});

// POST /api/quotation-templates
// Admin only
export const createTemplate = asyncHandler(async (req, res) => {
  const {
    name,
    validityDays,
    planId,
    lines,
  } = req.body;

  validateName(name);
  validateValidity(validityDays);

  const plan = await validatePlan(planId);
  await validateLines(lines, plan);

  const template = await QuotationTemplate.create({
    name: name.trim(),
    validityDays,
    planId,
    lines,
  });

  await populateTemplate(
    QuotationTemplate.findById(template._id)
  );

  const result = await populateTemplate(
    QuotationTemplate.findById(template._id)
  );

  res.status(201).json({
    success: true,
    message: 'Quotation template created successfully',
    data: result,
  });
});

// PUT /api/quotation-templates/:id
// Admin only
export const updateTemplate = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    throw new AppError('Invalid quotation template ID', 400);
  }

  const template = await QuotationTemplate.findById(id);

  if (!template) {
    throw new AppError('Quotation template not found', 404);
  }

  const allowedFields = ['name', 'validityDays', 'planId', 'lines'];
  const updates = Object.keys(req.body);

  if (
    updates.length === 0 ||
    updates.some((field) => !allowedFields.includes(field))
  ) {
    throw new AppError('Provide valid template details to update', 400);
  }

  const nextName = req.body.name ?? template.name;
  const nextValidity = req.body.validityDays ?? template.validityDays;
  const nextPlanId = req.body.planId ?? template.planId;
  const nextLines = req.body.lines ?? template.lines;

  validateName(nextName);
  validateValidity(nextValidity);

  const plan = await validatePlan(nextPlanId);
  await validateLines(nextLines, plan);

  template.name = nextName.trim();
  template.validityDays = nextValidity;
  template.planId = nextPlanId;
  template.lines = nextLines;

  await template.save();

  const result = await populateTemplate(
    QuotationTemplate.findById(template._id)
  );

  res.status(200).json({
    success: true,
    message: 'Quotation template updated successfully',
    data: result,
  });
});

// PATCH /api/quotation-templates/:id/active
// Admin only
export const toggleTemplateStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { isActive } = req.body;

  if (!mongoose.isValidObjectId(id)) {
    throw new AppError('Invalid quotation template ID', 400);
  }

  if (typeof isActive !== 'boolean') {
    throw new AppError('isActive must be true or false', 400);
  }

  const template = await QuotationTemplate.findById(id);

  if (!template) {
    throw new AppError('Quotation template not found', 404);
  }

  template.isActive = isActive;
  await template.save();

  res.status(200).json({
    success: true,
    message: `Quotation template ${isActive ? 'activated' : 'deactivated'} successfully`,
    data: template,
  });
});
