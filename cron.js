import cron from 'node-cron';
import { repaymentMonitorJob } from './jobs/repaymentMonitor.js';

export function startCrons() {
  // Every night at 1 AM
  cron.schedule('0 1 * * *', async () => {
    try {
      await repaymentMonitorJob();
      console.log('[CRON] Repayment monitor ran');
    } catch (e) {
      console.error('[CRON] Repayment monitor failed', e);
    }
  });
}
