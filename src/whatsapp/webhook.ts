import { Router, Request, Response } from 'express';
import { routeMessage } from './messageRouter';
import { sendMessages } from './client';
import { normalizePhone } from '../utils/validation';
import { logger } from '../utils/logger';

export const webhookRouter = Router();

webhookRouter.post('/', async (req: Request, res: Response) => {
  // Twilio sends URL-encoded form data
  const from: string = req.body?.From ?? '';
  const body: string = req.body?.Body ?? '';

  if (!from || !body) {
    res.status(400).send('Missing From or Body');
    return;
  }

  const phone = normalizePhone(from);
  logger.info('Inbound WhatsApp message', { phone: phone.slice(-4), bodyLength: body.length });

  // Respond to Twilio immediately so it doesn't retry (< 15s window)
  res.status(200).set('Content-Type', 'text/xml').send('<Response></Response>');

  // Process asynchronously
  setImmediate(async () => {
    try {
      const { reply, extra } = await routeMessage(from, body);

      // Send primary reply back to sender
      await sendMessages([{ to: phone, body: reply }, ...extra]);
    } catch (err) {
      logger.error('Webhook handler error', { phone: phone.slice(-4), error: String(err) });
    }
  });
});
