import cron from 'node-cron';

import { runBilling } from '../services/billingService.js';

let scheduledTask;

export const startBillingJob = () => {
  if (scheduledTask) return scheduledTask;

  scheduledTask = cron.schedule(
    '5 0 * * *',
    async () => {
      try {
        const summary = await runBilling();
        console.log(
          `[billing] created=${summary.created} skipped=${summary.skipped} closed=${summary.closed} failed=${summary.failed.length}`
        );
      } catch (error) {
        console.error(`[billing] failed: ${error.message}`);
      }
    },
    { timezone: 'Asia/Kolkata' }
  );

  console.log('Billing job scheduled daily at 00:05 Asia/Kolkata');
  return scheduledTask;
};

export const stopBillingJob = () => {
  scheduledTask?.stop();
  scheduledTask = undefined;
};
