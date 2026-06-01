import dotenv from 'dotenv';
import app from './app.js';
import logger from './utils/logger.js';
import { startProgressionCron } from './workers/progression-cron.js';
import { startNotificationCron } from './workers/notification-cron.js';
import { startMembershipCron } from './workers/membership-cron.js';

dotenv.config();

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
}
