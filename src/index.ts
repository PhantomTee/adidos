import 'dotenv/config';
import { createServer } from './server';
import { logger } from './utils/logger';

const PORT = parseInt(process.env.PORT ?? '3000', 10);

const app = createServer();

app.listen(PORT, () => {
  logger.info(`ProxyPay Merchant running on port ${PORT}`);
  logger.info(`Payment mode: ${process.env.PAYMENT_EXECUTION_MODE ?? 'circle'}`);
  logger.info(`Webhook: POST /webhook`);
  logger.info(`Health: GET /health`);
});

process.on('unhandledRejection', (err) => {
  logger.error('Unhandled rejection', { error: String(err) });
});
