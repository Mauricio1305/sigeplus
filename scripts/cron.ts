
import dotenv from 'dotenv';

dotenv.config();

/**
 * Script to be triggered by a server cron job (e.g., via GitHub Actions, 
 * Google Cloud Scheduler, or local crontab).
 * 
 * This script calls the internal API endpoint to process notifications.
 */
async function triggerCron() {
  const serverUrl = process.env.APP_URL || 'http://localhost:3000';
  const cronSecret = process.env.CRON_SECRET || 'dev-secret';
  const endpoint = `${serverUrl}/api/admin/cron/process-notifications`;

  console.log(`[${new Date().toISOString()}] Triggering notification cron at ${endpoint}...`);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-cron-auth': cronSecret
      }
    });

    if (response.ok) {
      const data = await response.json() as any;
      console.log(`[${new Date().toISOString()}] Cron triggered successfully:`, data);
    } else {
      const errorText = await response.text();
      console.error(`[${new Date().toISOString()}] Cron trigger failed with status ${response.status}: ${errorText}`);
      process.exit(1);
    }
  } catch (err: any) {
    console.error(`[${new Date().toISOString()}] Network error triggering cron:`, err.message);
    process.exit(1);
  }
}

triggerCron();
