import express from 'express';
import { webhookRouter } from './whatsapp/webhook';
import { logger } from './utils/logger';

export function createServer(): express.Application {
  const app = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  // Health check
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'proxypay-merchant',
      time: new Date().toISOString(),
      paymentMode: process.env.PAYMENT_EXECUTION_MODE ?? 'circle',
    });
  });

  // Twilio WhatsApp webhook
  app.use('/webhook', webhookRouter);

  // 404 handler
  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // Error handler
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error('Unhandled server error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
