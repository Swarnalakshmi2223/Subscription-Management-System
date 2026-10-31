import mongoose from 'mongoose';

import Counter from '../models/Counter.js';
import Discount from '../models/Discount.js';
import Invoice from '../models/Invoice.js';
import Subscription from '../models/Subscription.js';
import { computeInvoiceLines } from './invoiceMath.js';
import { AppError } from '../utils/AppError.js';
import { addPeriod, istDateString, startOfDayIST } from '../utils/dates.js';

const PAYMENT_TERM_DAYS = {
  immediate: 0,
  net15: 15,
  net30: 30,
};

const createDiscountLimitError = (discountId) => {
  const error = new Error('Discount usage limit reached');
  error.code = 'DISCOUNT_USAGE_LIMIT';
  error.discountId = String(discountId);
  return error;
};

const createBillingConflictError = () => {
  const error = new Error('Subscription changed while the invoice was generated');
  error.code = 'BILLING_CONFLICT';
  return error;
};

const generateInvoiceNumber = async (session) => {
  const counter = await Counter.findOneAndUpdate(
    { key: 'invoice' },
    { $inc: { seq: 1 } },
    {
      session,
      returnDocument: 'after',
      upsert: true,
      setDefaultsOnInsert: true,
    }
  );

  return `INV-${String(counter.seq).padStart(6, '0')}`;
};

export const populateInvoice = (query) =>
  query
    .populate('customerId', 'name email phone company')
    .populate('subscriptionId', 'number status startDate expiryDate')
    .populate('lines.productId', 'name type')
    .populate('appliedDiscountIds', 'name type value');

export const getOutstanding = (invoice) =>
  Math.max(invoice.total - (invoice.amountPaid || 0), 0);

export const isInvoiceOverdue = (invoice, today = startOfDayIST()) =>
  invoice.status === 'Confirmed' &&
  new Date(invoice.dueDate) < today &&
  (invoice.amountPaid || 0) < invoice.total;

const getSubscriptionForBilling = async (subscriptionId, session) => {
  const subscription = await Subscription.findById(subscriptionId)
    .populate('planId')
    .session(session);

  if (!subscription) {
    throw new AppError('Subscription not found', 404);
  }

  if (subscription.status !== 'Active') {
    throw new AppError('Invoices can only be generated for Active subscriptions', 400);
  }

  if (subscription.isPaused) {
    throw new AppError('Invoices cannot be generated for a paused subscription', 400);
  }

  if (!subscription.planId) {
    throw new AppError('Subscription plan not found', 400);
  }

  return subscription;
};

const buildInvoiceContext = (subscription, now) => {
  const today = startOfDayIST(now);
  const periodsBilled = Number.isSafeInteger(subscription.periodsBilled)
    ? subscription.periodsBilled
    : 0;
  const billingPeriod = subscription.planId.billingPeriod;
  const periodStart = addPeriod(
    subscription.startDate,
    billingPeriod,
    periodsBilled
  );
  const nextPeriodStart = addPeriod(
    subscription.startDate,
    billingPeriod,
    periodsBilled + 1
  );

  if (periodStart > today) {
    throw new AppError('The next billing period is not due yet', 400);
  }

  if (periodStart > subscription.expiryDate) {
    throw new AppError('Subscription has no billable periods remaining', 400);
  }

  const paymentTermDays = PAYMENT_TERM_DAYS[subscription.paymentTerms];
  if (paymentTermDays === undefined) {
    throw new AppError('Invalid subscription payment terms', 400);
  }

  return {
    today,
    periodsBilled,
    periodStart,
    periodEnd: new Date(nextPeriodStart.getTime() - 1),
    nextPeriodStart,
    dueDate: addPeriod(today, 'daily', paymentTermDays),
    billingPeriodKey: istDateString(periodStart),
  };
};

const incrementDiscountUsage = async (discountId, session) => {
  const result = await Discount.updateOne(
    {
      _id: discountId,
      $or: [
        { usageLimit: null },
        { $expr: { $lt: ['$usageCount', '$usageLimit'] } },
      ],
    },
    { $inc: { usageCount: 1 } },
    { session }
  );

  if (result.modifiedCount !== 1) {
    throw createDiscountLimitError(discountId);
  }
};

/**
 * Generate the next due invoice for an active subscription. This is the
 * shared generation path for the manual endpoint and the recurring billing
 * job introduced in Step 4.
 */
export const generateInvoiceForSubscription = async ({
  subscriptionId,
  now = new Date(),
}) => {
  if (!mongoose.isValidObjectId(subscriptionId)) {
    throw new AppError('Invalid subscription ID', 400);
  }

  const discounts = await Discount.find({
    isActive: true,
    appliesTo: { $in: ['products', 'subscriptions'] },
  }).lean();
  const excludedDiscountIds = new Set();

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const session = await mongoose.startSession();
    let invoiceId;

    try {
      await session.withTransaction(async () => {
        const subscription = await getSubscriptionForBilling(
          subscriptionId,
          session
        );
        const context = buildInvoiceContext(subscription, now);
        const availableDiscounts = discounts.filter(
          (discount) => !excludedDiscountIds.has(String(discount._id))
        );
        const calculation = computeInvoiceLines({
          lines: subscription.lines.map((line) => line.toObject()),
          discounts: availableDiscounts,
          subscriptionId: subscription._id,
          now,
        });
        const number = await generateInvoiceNumber(session);
        const invoice = new Invoice({
          number,
          subscriptionId: subscription._id,
          customerId: subscription.customerId,
          billingPeriodKey: context.billingPeriodKey,
          periodStart: context.periodStart,
          periodEnd: context.periodEnd,
          issueDate: context.today,
          dueDate: context.dueDate,
          status: 'Draft',
          lines: calculation.lines,
          subtotal: calculation.subtotal,
          discountTotal: calculation.discountTotal,
          taxTotal: calculation.taxTotal,
          total: calculation.total,
          amountPaid: 0,
          appliedDiscountIds: calculation.appliedDiscountIds,
        });

        await invoice.save({ session });

        for (const discountId of calculation.appliedDiscountIds) {
          await incrementDiscountUsage(discountId, session);
        }

        const updated = await Subscription.updateOne(
          { _id: subscription._id, periodsBilled: context.periodsBilled },
          {
            $set: {
              periodsBilled: context.periodsBilled + 1,
              nextBillingDate: context.nextPeriodStart,
            },
          },
          { session }
        );

        if (updated.modifiedCount !== 1) {
          throw createBillingConflictError();
        }

        invoiceId = invoice._id;
      });
    } catch (error) {
      if (error.code === 11000) {
        throw new AppError(
          'An invoice already exists for this subscription billing period',
          409
        );
      }

      if (
        error.code === 'DISCOUNT_USAGE_LIMIT' &&
        attempt === 0 &&
        !excludedDiscountIds.has(error.discountId)
      ) {
        excludedDiscountIds.add(error.discountId);
        continue;
      }

      if (error.code === 'BILLING_CONFLICT') {
        throw new AppError(
          'Subscription changed while the invoice was generated; please retry',
          409
        );
      }

      throw error;
    } finally {
      await session.endSession();
    }

    return populateInvoice(
      Invoice.findById(invoiceId).select('-__v')
    ).lean();
  }

  throw new AppError('Unable to generate invoice', 409);
};
