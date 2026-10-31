import mongoose from 'mongoose';
import Product from '../models/Product.js';
import Tax from '../models/Tax.js';
import { AppError } from '../utils/AppError.js';

/**
 * Calculates subscription line prices using backend database values.
 *
 * All money values are stored in paise. Products and taxes are loaded in
 * batches so a subscription with many lines does not make one query per line.
 */
export const buildSubscriptionLines = async ({ lines }, plan) => {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new AppError('At least one subscription line is required', 400);
  }

  const productIds = [];
  for (const line of lines) {
    if (!line || !mongoose.isValidObjectId(line.productId)) {
      throw new AppError('Each subscription line needs a valid product ID', 400);
    }

    if (!Number.isSafeInteger(line.quantity) || line.quantity < 1) {
      throw new AppError('Quantity must be a positive whole number', 400);
    }

    productIds.push(line.productId);
  }

  const products = await Product.find({ _id: { $in: productIds } }).lean();
  const productMap = new Map(products.map((product) => [String(product._id), product]));
  const taxIds = products.map((product) => product.taxId).filter(Boolean);
  const taxes = taxIds.length
    ? await Tax.find({ _id: { $in: taxIds } }).lean()
    : [];
  const taxMap = new Map(taxes.map((tax) => [String(tax._id), tax]));

  const result = [];

  for (const line of lines) {
    const product = productMap.get(String(line.productId));

    if (!product || !product.isActive) {
      throw new AppError(
        'One of the subscription products is unavailable',
        400
      );
    }

    const isPlanProduct = String(product._id) === String(plan.productId);
    let unitPrice = isPlanProduct ? plan.price : product.salesPrice;
    let variant = {};

    const hasVariant =
      line.variant?.attribute !== undefined || line.variant?.value !== undefined;

    if (hasVariant) {
      const attribute = line.variant?.attribute?.trim();
      const value = line.variant?.value?.trim();

      if (!attribute || !value) {
        throw new AppError(
          'Both variant attribute and value are required',
          400
        );
      }

      const selectedVariant = product.variants.find(
        (item) =>
          item.attribute.toLowerCase() === attribute.toLowerCase() &&
          item.value.toLowerCase() === value.toLowerCase()
      );

      if (!selectedVariant) {
        throw new AppError(
          `Selected variant is not available for ${product.name}`,
          400
        );
      }

      unitPrice += selectedVariant.extraPrice;
      variant = { attribute, value };
    }

    if (isPlanProduct && line.quantity < plan.minQuantity) {
      throw new AppError(
        `Quantity for the plan product must be at least ${plan.minQuantity}`,
        400
      );
    }

    if (
      !Number.isSafeInteger(unitPrice) ||
      !Number.isSafeInteger(line.quantity) ||
      !Number.isSafeInteger(unitPrice * line.quantity)
    ) {
      throw new AppError('Invalid or excessively large price or quantity', 400);
    }

    const subtotal = unitPrice * line.quantity;
    const taxId = product.taxId || null;
    const tax = taxId ? taxMap.get(String(taxId)) : null;

    if (taxId && (!tax || !tax.isActive)) {
      throw new AppError(
        `The tax assigned to ${product.name} is unavailable`,
        400
      );
    }

    const taxRatePercent = tax?.ratePercent ?? 0;
    const taxAmount = Math.round((subtotal * taxRatePercent) / 100);
    const amount = subtotal + taxAmount;

    if (!Number.isSafeInteger(amount) || !Number.isSafeInteger(taxAmount)) {
      throw new AppError('Calculated amount is too large', 400);
    }

    const description = variant.attribute
      ? `${product.name} (${variant.attribute}: ${variant.value})`
      : product.name;

    result.push({
      productId: product._id,
      description,
      variant,
      quantity: line.quantity,
      unitPrice,
      taxId,
      taxRatePercent,
      taxAmount,
      amount,
    });
  }

  return result;
};
