import { asyncHandler } from '../utils/asyncHandler.js';
import { runBilling } from '../services/billingService.js';

// POST /api/billing/run
export const runBillingNow = asyncHandler(async (req, res) => {
  const summary = await runBilling();

  res.json({
    success: true,
    message: 'Billing run completed',
    data: summary,
  });
});
