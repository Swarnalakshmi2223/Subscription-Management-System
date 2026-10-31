import assert from 'node:assert/strict';

import {
  calculateDiscounts,
} from '../services/discountService.js';

const product1 = '6ae59c683997e4469e99ad04';
const product2 = '6ae59c683997e4469e99ad05';
const subscriptionId = '6ae5a56dc5444d9c4a183f35';

const discounts = [
  {
    _id: 'discount-product-1',
    name: '10 Percent Product Discount',
    type: 'percentage',
    value: 10,
    minPurchase: 0,
    minQuantity: 1,
    startDate: new Date('2026-11-01'),
    endDate: new Date('2026-12-31'),
    usageLimit: 100,
    usageCount: 0,
    appliesTo: 'products',
    productIds: [product1],
    isActive: true,
  },
  {
    _id: 'discount-product-2',
    name: 'Fixed Product Discount',
    type: 'fixed',
    value: 10000,
    minPurchase: 0,
    minQuantity: 1,
    startDate: new Date('2026-11-01'),
    endDate: new Date('2026-12-31'),
    usageLimit: 100,
    usageCount: 0,
    appliesTo: 'products',
    productIds: [product2],
    isActive: true,
  },
  {
    _id: 'discount-subscription',
    name: '5 Percent Subscription Discount',
    type: 'percentage',
    value: 5,
    minPurchase: 0,
    minQuantity: 1,
    startDate: new Date('2026-11-01'),
    endDate: new Date('2026-12-31'),
    usageLimit: 100,
    usageCount: 0,
    appliesTo: 'subscriptions',
    subscriptionIds: [],
    isActive: true,
  },
];

const lines = [
  {
    productId: product1,
    quantity: 2,
    unitPrice: 200000,
  },
  {
    productId: product2,
    quantity: 1,
    unitPrice: 200000,
  },
];

const result = calculateDiscounts({
  lines,
  discounts,
  subscriptionId,
  now: new Date('2026-11-15T12:00:00.000Z'),
});

// Verify original subtotal.
assert.equal(result.subtotal, 600000);

// Verify product discounts.
assert.equal(result.productDiscountTotal, 50000);

// Verify subscription discount.
assert.equal(result.subscriptionDiscountTotal, 27500);

// Verify total discount.
assert.equal(result.discountTotal, 77500);

// Verify final discounted subtotal.
assert.equal(result.discountedSubtotal, 522500);

// Verify that discount distribution matches the expected values.
assert.equal(
  result.lines.reduce(
    (sum, line) => sum + line.subscriptionDiscountAmount,
    0
  ),
  27500
);

assert.equal(
  result.lines.reduce(
    (sum, line) => sum + line.discountAmount,
    0
  ),
  77500
);

console.log('All Discount Service tests passed!');
console.log('Original subtotal:', result.subtotal, 'paise');
console.log('Product discount:', result.productDiscountTotal, 'paise');
console.log(
  'Subscription discount:',
  result.subscriptionDiscountTotal,
  'paise'
);
console.log('Total discount:', result.discountTotal, 'paise');
console.log('Final subtotal:', result.discountedSubtotal, 'paise');
console.log('Applied discounts:', result.appliedDiscountIds);