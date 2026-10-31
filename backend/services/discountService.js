import Discount from '../models/Discount.js';
import { AppError } from '../utils/AppError.js';

// Convert an ID or populated reference to a string.
const getId = (value) => {
  return String(value?._id || value);
};

// Compare calendar dates inclusively.
const isWithinDateRange = (discount, now) => {
  const currentDate = now.toISOString().slice(0, 10);
  const startDate = new Date(discount.startDate)
    .toISOString()
    .slice(0, 10);
  const endDate = new Date(discount.endDate)
    .toISOString()
    .slice(0, 10);

  return currentDate >= startDate && currentDate <= endDate;
};

// Check whether a discount has remaining uses.
const hasUsageRemaining = (discount) => {
  return (
    discount.usageLimit === null ||
    discount.usageLimit === undefined ||
    discount.usageCount < discount.usageLimit
  );
};

// Calculate the discount amount in paise.
export const calculateDiscountAmount = (discount, subtotal) => {
  if (!Number.isSafeInteger(subtotal) || subtotal < 0) {
    throw new AppError('Invalid subtotal for discount calculation', 400);
  }

  let amount = 0;

  if (discount.type === 'fixed') {
    amount = Math.min(discount.value, subtotal);
  } else if (discount.type === 'percentage') {
    amount = Math.round((subtotal * discount.value) / 100);
  } else {
    throw new AppError('Invalid discount type', 400);
  }

  return Math.min(amount, subtotal);
};

// Check common discount eligibility conditions.
const isGenerallyEligible = (discount, subtotal, quantity, now) => {
  return (
    discount.isActive === true &&
    isWithinDateRange(discount, now) &&
    hasUsageRemaining(discount) &&
    subtotal >= discount.minPurchase &&
    quantity >= discount.minQuantity
  );
};

// Check whether a product discount targets a product.
const targetsProduct = (discount, productId) => {
  if (!discount.productIds || discount.productIds.length === 0) {
    return true;
  }

  return discount.productIds.some(
    (id) => getId(id) === productId
  );
};

// Check whether a subscription discount targets a subscription.
const targetsSubscription = (discount, subscriptionId) => {
  if (
    !discount.subscriptionIds ||
    discount.subscriptionIds.length === 0
  ) {
    return true;
  }

  return discount.subscriptionIds.some(
    (id) => getId(id) === subscriptionId
  );
};

// Select the eligible discount that gives the largest saving.
const getBestDiscount = (discounts, subtotal, quantity, now, targetCheck) => {
  let bestDiscount = null;
  let bestAmount = 0;

  for (const discount of discounts) {
    if (!isGenerallyEligible(discount, subtotal, quantity, now)) {
      continue;
    }

    if (!targetCheck(discount)) {
      continue;
    }

    const amount = calculateDiscountAmount(discount, subtotal);

    if (amount > bestAmount) {
      bestAmount = amount;
      bestDiscount = discount;
    }
  }

  return {
    discount: bestDiscount,
    amount: bestAmount,
  };
};

// Distribute a subscription-level discount proportionally across lines.
const distributeDiscount = (lines, totalDiscount) => {
  const totalSubtotal = lines.reduce(
    (sum, line) => sum + line.discountedSubtotal,
    0
  );

  if (totalSubtotal === 0 || totalDiscount === 0) {
    return lines.map((line) => ({
      ...line,
      subscriptionDiscountAmount: 0,
    }));
  }

  const shares = lines.map((line) =>
    Math.floor(
      (totalDiscount * line.discountedSubtotal) / totalSubtotal
    )
  );

  let remainder =
    totalDiscount - shares.reduce((sum, share) => sum + share, 0);

  // Give rounding remainder to the last line first.
  for (let i = lines.length - 1; i >= 0 && remainder > 0; i--) {
    const available =
      lines[i].discountedSubtotal - shares[i];

    const extra = Math.min(available, remainder);

    shares[i] += extra;
    remainder -= extra;
  }

  if (remainder > 0) {
    throw new AppError('Unable to distribute subscription discount', 400);
  }

  return lines.map((line, index) => ({
    ...line,
    subscriptionDiscountAmount: shares[index],
  }));
};

// Main reusable calculation function.
export const calculateDiscounts = ({
  lines,
  discounts,
  subscriptionId,
  now = new Date(),
}) => {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new AppError('At least one subscription line is required', 400);
  }

  if (!Array.isArray(discounts)) {
    throw new AppError('Discounts must be provided as an array', 400);
  }

  // Validate and calculate original line subtotals.
  const preparedLines = lines.map((line) => {
    const quantity = line.quantity;
    const unitPrice = line.unitPrice;

    if (
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      !Number.isSafeInteger(unitPrice) ||
      unitPrice < 0
    ) {
      throw new AppError('Invalid subscription line price or quantity', 400);
    }

    const subtotal = unitPrice * quantity;

    if (!Number.isSafeInteger(subtotal)) {
      throw new AppError('Subscription line subtotal is too large', 400);
    }

    return {
      ...line,
      originalSubtotal: subtotal,
    };
  });

  const productDiscounts = discounts.filter(
    (discount) => discount.appliesTo === 'products'
  );

  const subscriptionDiscounts = discounts.filter(
    (discount) => discount.appliesTo === 'subscriptions'
  );

  const appliedDiscountIds = [];

  // Apply at most one product discount to each line.
  const productDiscountedLines = preparedLines.map((line) => {
    const productId = getId(line.productId);

    const best = getBestDiscount(
      productDiscounts,
      line.originalSubtotal,
      line.quantity,
      now,
      (discount) => targetsProduct(discount, productId)
    );

    if (best.discount) {
      appliedDiscountIds.push(getId(best.discount._id));
    }

    return {
      ...line,
      productDiscountId: best.discount?._id || null,
      productDiscountAmount: best.amount,
      discountedSubtotal: line.originalSubtotal - best.amount,
    };
  });

  // Calculate invoice-level eligibility after product discounts.
  const invoiceSubtotal = productDiscountedLines.reduce(
    (sum, line) => sum + line.discountedSubtotal,
    0
  );

  const totalQuantity = productDiscountedLines.reduce(
    (sum, line) => sum + line.quantity,
    0
  );

  const bestSubscriptionDiscount = getBestDiscount(
    subscriptionDiscounts,
    invoiceSubtotal,
    totalQuantity,
    now,
    (discount) =>
      targetsSubscription(discount, getId(subscriptionId))
  );

  if (bestSubscriptionDiscount.discount) {
    appliedDiscountIds.push(
      getId(bestSubscriptionDiscount.discount._id)
    );
  }

  // Spread the subscription discount across lines.
  const distributedLines = distributeDiscount(
    productDiscountedLines,
    bestSubscriptionDiscount.amount
  );

  const finalLines = distributedLines.map((line) => {
    const discountAmount =
      line.productDiscountAmount +
      line.subscriptionDiscountAmount;

    return {
      ...line,
      discountAmount,
      discountedSubtotal: line.originalSubtotal - discountAmount,
    };
  });

  const totalProductDiscount = finalLines.reduce(
    (sum, line) => sum + line.productDiscountAmount,
    0
  );

  const totalSubscriptionDiscount = bestSubscriptionDiscount.amount;

  return {
    lines: finalLines,
    subtotal: preparedLines.reduce(
      (sum, line) => sum + line.originalSubtotal,
      0
    ),
    productDiscountTotal: totalProductDiscount,
    subscriptionDiscountTotal: totalSubscriptionDiscount,
    discountTotal:
      totalProductDiscount + totalSubscriptionDiscount,
    discountedSubtotal: finalLines.reduce(
      (sum, line) => sum + line.discountedSubtotal,
      0
    ),
    appliedDiscountIds: [...new Set(appliedDiscountIds)],
  };
};

// Database-connected function for later invoice integration.
export const calculateDiscountsForSubscription = async ({
  lines,
  subscriptionId,
  now = new Date(),
}) => {
  const discounts = await Discount.find({
    isActive: true,
    appliesTo: { $in: ['products', 'subscriptions'] },
  });

  return calculateDiscounts({
    lines,
    discounts,
    subscriptionId,
    now,
  });
};