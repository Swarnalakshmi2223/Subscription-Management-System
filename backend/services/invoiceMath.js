import { calculateDiscounts } from './discountService.js';
import { AppError } from '../utils/AppError.js';

const validateMoney = (value, fieldName) => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new AppError(`${fieldName} must be a non-negative integer in paise`, 400);
  }
};

/**
 * Calculates invoice snapshots from subscription line snapshots.
 * Discounts are applied before exclusive tax, and every money result is
 * rounded to an integer number of paise.
 */
export const computeInvoiceLines = ({
  lines,
  discounts,
  subscriptionId,
  now = new Date(),
}) => {
  const discounted = calculateDiscounts({
    lines,
    discounts,
    subscriptionId,
    now,
  });

  const invoiceLines = discounted.lines.map((line) => {
    const taxRatePercent = line.taxRatePercent ?? 0;

    if (
      typeof taxRatePercent !== 'number' ||
      !Number.isFinite(taxRatePercent) ||
      taxRatePercent < 0 ||
      taxRatePercent > 100
    ) {
      throw new AppError('Tax rate must be between 0 and 100', 400);
    }

    validateMoney(line.discountedSubtotal, 'Discounted subtotal');
    const taxAmount = Math.round(
      (line.discountedSubtotal * taxRatePercent) / 100
    );
    const amount = line.discountedSubtotal + taxAmount;

    validateMoney(taxAmount, 'Tax amount');
    validateMoney(amount, 'Invoice line amount');

    return {
      productId: line.productId,
      description: line.description || String(line.productId),
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      discountAmount: line.discountAmount,
      taxRatePercent,
      taxAmount,
      amount,
    };
  });

  const taxTotal = invoiceLines.reduce((sum, line) => sum + line.taxAmount, 0);
  const total = invoiceLines.reduce((sum, line) => sum + line.amount, 0);

  validateMoney(discounted.subtotal, 'Subtotal');
  validateMoney(discounted.discountTotal, 'Discount total');
  validateMoney(taxTotal, 'Tax total');
  validateMoney(total, 'Invoice total');

  return {
    lines: invoiceLines,
    subtotal: discounted.subtotal,
    discountTotal: discounted.discountTotal,
    taxTotal,
    total,
    appliedDiscountIds: discounted.appliedDiscountIds,
  };
};
