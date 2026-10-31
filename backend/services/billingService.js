import Discount from '../models/Discount.js';
import Subscription from '../models/Subscription.js';
import { addPeriod, startOfDayIST } from '../utils/dates.js';
import {
  advanceAlreadyBilledPeriod,
  generateInvoiceForSubscription,
} from './invoiceService.js';

const DEFAULT_BATCH_SIZE = 100;

const isNoBillablePeriod = (error) =>
  error?.message === 'Subscription has no billable periods remaining';

const getNextPeriodStart = (subscription) =>
  addPeriod(
    subscription.startDate,
    subscription.planId.billingPeriod,
    Number.isSafeInteger(subscription.periodsBilled)
      ? subscription.periodsBilled
      : 0
  );

const closeIfExpired = async ({ subscriptionId, today }) => {
  const subscription = await Subscription.findById(subscriptionId)
    .populate('planId', 'billingPeriod autoClose')
    .lean();

  if (!subscription || subscription.status !== 'Active' || !subscription.planId) {
    return false;
  }

  const nextPeriodStart = getNextPeriodStart(subscription);
  const hasNoBillablePeriods = nextPeriodStart > subscription.expiryDate;
  const hasExpired = today >= startOfDayIST(subscription.expiryDate);

  if (!subscription.planId.autoClose || (!hasNoBillablePeriods && !hasExpired)) {
    return false;
  }

  const result = await Subscription.updateOne(
    { _id: subscription._id, status: 'Active' },
    { $set: { status: 'Closed', isPaused: false } }
  );

  return result.modifiedCount === 1;
};

const processSubscription = async ({
  subscriptionId,
  today,
  discounts,
  summary,
}) => {
  while (true) {
    const subscription = await Subscription.findById(subscriptionId)
      .populate('planId', 'billingPeriod autoClose')
      .lean();

    if (!subscription || subscription.status !== 'Active' || subscription.isPaused) {
      break;
    }

    const nextPeriodStart = getNextPeriodStart(subscription);
    if (nextPeriodStart > today || nextPeriodStart > subscription.expiryDate) {
      break;
    }

    try {
      await generateInvoiceForSubscription({
        subscriptionId,
        now: today,
        discounts,
      });
      summary.created += 1;
    } catch (error) {
      if (error.code === 'DUPLICATE_BILLING_PERIOD') {
        const advanced = await advanceAlreadyBilledPeriod({
          subscriptionId,
          now: today,
        });

        if (advanced) {
          summary.skipped += 1;
          continue;
        }
      }

      if (isNoBillablePeriod(error)) break;
      throw error;
    }
  }

  if (await closeIfExpired({ subscriptionId, today })) {
    summary.closed += 1;
  }

};

/**
 * Run recurring billing for all due active subscriptions. Work is read in
 * cursor-sized batches, while each invoice is created through the same
 * transaction used by POST /api/invoices/generate.
 */
export const runBilling = async ({
  now = new Date(),
  batchSize = DEFAULT_BATCH_SIZE,
} = {}) => {
  const today = startOfDayIST(now);
  const discounts = await Discount.find({
    isActive: true,
    appliesTo: { $in: ['products', 'subscriptions'] },
  }).lean();
  const summary = { created: 0, skipped: 0, closed: 0, failed: [] };
  let lastId = null;

  while (true) {
    const filter = {
      status: 'Active',
      isPaused: false,
      nextBillingDate: { $lte: today },
    };

    if (lastId) filter._id = { $gt: lastId };

    const subscriptions = await Subscription.find(filter)
      .select('_id number')
      .sort({ _id: 1 })
      .limit(batchSize)
      .lean();

    if (subscriptions.length === 0) break;

    for (const subscription of subscriptions) {
      try {
        await processSubscription({
          subscriptionId: subscription._id,
          today,
          discounts,
          summary,
        });
      } catch (error) {
        summary.failed.push({
          subscriptionNumber: subscription.number,
          reason: error.message,
        });
      }
    }

    lastId = subscriptions[subscriptions.length - 1]._id;
  }

  let lastExpiredId = null;
  while (true) {
    const expiredFilter = {
      status: 'Active',
      expiryDate: { $lte: today },
    };

    if (lastExpiredId) expiredFilter._id = { $gt: lastExpiredId };

    const expiredSubscriptions = await Subscription.find(expiredFilter)
      .select('_id number')
      .sort({ _id: 1 })
      .limit(batchSize)
      .lean();

    if (expiredSubscriptions.length === 0) break;

    for (const subscription of expiredSubscriptions) {
      try {
        if (await closeIfExpired({ subscriptionId: subscription._id, today })) {
          summary.closed += 1;
        }
      } catch (error) {
        summary.failed.push({
          subscriptionNumber: subscription.number,
          reason: error.message,
        });
      }
    }

    lastExpiredId = expiredSubscriptions[expiredSubscriptions.length - 1]._id;
  }

  return summary;
};
