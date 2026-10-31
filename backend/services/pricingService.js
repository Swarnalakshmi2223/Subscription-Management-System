
import Product from '../models/Product.js';
import Tax from '../models/Tax.js';
import { AppError } from '../utils/AppError.js';

/**
 * Calculates subscription line prices using backend database values.
 *
 * All money values are stored in paise.
 */
export const buildSubscriptionLines = async (template, plan) => {
  const result = [];

  for (const line of template.lines) {
    const product = await Product.findById(line.productId);

    if (!product || !product.isActive) {
      throw new AppError(
        'One of the template products is unavailable',
        400
      );
    }

    // The plan's own product uses the plan price.
    // Additional products use their normal sales price.
    const isPlanProduct = product._id.equals(plan.productId);

    let unitPrice = isPlanProduct
      ? plan.price
      : product.salesPrice;

    // Apply the selected variant's extra price.
    const hasVariant =
      line.variant?.attribute || line.variant?.value;

    if (hasVariant) {
      if (!line.variant.attribute || !line.variant.value) {
        throw new AppError(
          'Both variant attribute and value are required',
          400
        );
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

    // Enforce the plan's minimum quantity.
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

    // Tax is exclusive: it is added on top of the subtotal.
    let taxId = product.taxId || null;
    let taxAmount = 0;

    if (taxId) {
      const tax = await Tax.findById(taxId);

      if (!tax || !tax.isActive) {
        throw new AppError(
          `The tax assigned to ${product.name} is unavailable`,
          400
        );
      }

      taxAmount = Math.round(
        (subtotal * tax.ratePercent) / 100
      );
    }

    const amount = subtotal + taxAmount;

    if (!Number.isSafeInteger(amount)) {
      throw new AppError('Calculated amount is too large', 400);
    }

    result.push({
      productId: product._id,
      variant: hasVariant ? line.variant : {},
      quantity: line.quantity,
      unitPrice,
      taxId,
      taxAmount,
      amount,
    });
  }

  return result;
};
