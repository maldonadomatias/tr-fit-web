import dotenv from 'dotenv';
import app from './app.js';
import logger from './utils/logger.js';
import { startProgressionCron } from './workers/progression-cron.js';
import { startNotificationCron } from './workers/notification-cron.js';
import { startMembershipCron } from './workers/membership-cron.js';
import { startPlatformFeeCron } from './workers/platform-fee-cron.js';
import { startRegenWorker } from './workers/regen-worker.js';
import { startLiveActivityWorker } from './workers/live-activity-worker.js';

dotenv.config();

// Express 4 does not forward errors thrown in async route handlers to the
// error middleware; any unwrapped rejection would otherwise kill the process
// (Node's default) and crash-loop the service. Log and keep serving.
process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Unhandled promise rejection');
});
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception');
  process.exit(1);
});

const PORT = Number(process.env.PORT) || 5001;

// Bind to '::' (IPv6 all-interfaces, dual-stack) so Railway's IPv6-only
// private network can reach this service across containers.
app.listen(PORT, '::', () => {
  logger.info(`Server running on port ${PORT} (IPv6 dual-stack)`);
});

if (process.env.NODE_ENV !== 'test') {
  startProgressionCron();
  startNotificationCron();
  startMembershipCron();
  startPlatformFeeCron();
  startRegenWorker();
  startLiveActivityWorker();
}
