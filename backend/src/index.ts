import dotenv from 'dotenv';
import app from './app.js';
import logger from './utils/logger.js';
import { startProgressionCron } from './workers/progression-cron.js';

dotenv.config();

const PORT = process.env.PORT || 5001;

app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});

if (process.env.NODE_ENV !== 'test') {
  startProgressionCron();
}
