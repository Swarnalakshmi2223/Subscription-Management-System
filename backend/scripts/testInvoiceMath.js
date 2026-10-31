import assert from 'node:assert/strict';

import { computeInvoiceLines } from '../services/invoiceMath.js';

const subscriptionId = '6ae5a56dc5444d9c4a183f35';
const product1 = '6ae59c683997e4469e99ad04';
const product2 = '6ae59c683997e4469e99ad05';
const activeDates = {
  startDate: new Date('2026-11-01T00:00:00+05:30'),
  endDate: new Date('2026-12-31T23:59:59+05:30'),
  isActive: true,
  minPurchase: 0,
  minQuantity: 1,
  usageLimit: null,
  usageCount: 0,
};

const discount = (overrides) => ({
  _id: 'discount-default',
  name: 'Test discount',
  type: 'percentage',
  value: 10,
  appliesTo: 'products',
  productIds: [],
  subscriptionIds: [],
  ...activeDates,
  ...overrides,
});

const now = new Date('2026-11-15T12:00:00Z');

// Percentage and fixed product discounts are both applied from server-side values.
const percentageAndFixed = computeInvoiceLines({
  subscriptionId,
  now,
  lines: [
    { productId: product1, description: 'Product 1', quantity: 1, unitPrice: 1000, taxRatePercent: 0 },
    { productId: product2, description: 'Product 2', quantity: 1, unitPrice: 2000, taxRatePercent: 0 },
  ],
  discounts: [
    discount({ _id: 'percentage', value: 10, productIds: [product1] }),
    discount({ _id: 'fixed', type: 'fixed', value: 200, productIds: [product2] }),
  ],
});
assert.equal(percentageAndFixed.subtotal, 3000);
assert.equal(percentageAndFixed.discountTotal, 300);
assert.equal(percentageAndFixed.total, 2700);

// Tax is calculated after the discount, not on the original subtotal.
const taxAfterDiscount = computeInvoiceLines({
  subscriptionId,
  now,
  lines: [{ productId: product1, description: 'Taxed product', quantity: 1, unitPrice: 1000, taxRatePercent: 18 }],
  discounts: [discount({ _id: 'ten-percent', value: 10, productIds: [product1] })],
});
assert.equal(taxAfterDiscount.lines[0].discountAmount, 100);
assert.equal(taxAfterDiscount.lines[0].taxAmount, 162);
assert.equal(taxAfterDiscount.lines[0].amount, 1062);

// A subscription discount is distributed pro rata, with the remainder on the last line.
const proRata = computeInvoiceLines({
  subscriptionId,
  now,
  lines: [1, 2, 3].map((id) => ({
    productId: `6ae59c683997e4469e99ad0${id}`,
    description: `Product ${id}`,
    quantity: 1,
    unitPrice: 100,
    taxRatePercent: 0,
  })),
  discounts: [discount({ _id: 'rounding', type: 'fixed', value: 100, appliesTo: 'subscriptions' })],
});
assert.deepEqual(proRata.lines.map((line) => line.discountAmount), [33, 33, 34]);
assert.equal(proRata.discountTotal, 100);
assert.equal(proRata.total, 200);

// Discounts never make a line negative.
const largerThanSubtotal = computeInvoiceLines({
  subscriptionId,
  now,
  lines: [{ productId: product1, description: 'Small product', quantity: 1, unitPrice: 50, taxRatePercent: 0 }],
  discounts: [discount({ _id: 'too-large', type: 'fixed', value: 5000, productIds: [product1] })],
});
assert.equal(largerThanSubtotal.discountTotal, 50);
assert.equal(largerThanSubtotal.total, 0);

// An exhausted usage limit makes a discount ineligible.
const exhausted = computeInvoiceLines({
  subscriptionId,
  now,
  lines: [{ productId: product1, description: 'Limited product', quantity: 1, unitPrice: 1000, taxRatePercent: 0 }],
  discounts: [discount({ _id: 'exhausted', usageLimit: 1, usageCount: 1, productIds: [product1] })],
});
assert.equal(exhausted.discountTotal, 0);
assert.deepEqual(exhausted.appliedDiscountIds, []);

// Eligibility follows the IST calendar date at the exact midnight boundary.
const boundaryDiscount = discount({
  _id: 'ist-boundary',
  startDate: new Date('2026-11-02T00:00:00+05:30'),
  endDate: new Date('2026-11-02T23:59:59+05:30'),
  productIds: [product1],
});
const beforeBoundary = computeInvoiceLines({
  subscriptionId,
  now: new Date('2026-11-01T18:29:59.999Z'),
  lines: [{ productId: product1, description: 'Boundary product', quantity: 1, unitPrice: 1000, taxRatePercent: 0 }],
  discounts: [boundaryDiscount],
});
const atBoundary = computeInvoiceLines({
  subscriptionId,
  now: new Date('2026-11-01T18:30:00.000Z'),
  lines: [{ productId: product1, description: 'Boundary product', quantity: 1, unitPrice: 1000, taxRatePercent: 0 }],
  discounts: [boundaryDiscount],
});
assert.equal(beforeBoundary.discountTotal, 0);
assert.equal(atBoundary.discountTotal, 100);

console.log('All Invoice Math tests passed!');
