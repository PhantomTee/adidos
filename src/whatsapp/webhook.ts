import { Router, Request, Response } from 'express';
import twilio from 'twilio';
import { routeMessage } from './messageRouter';
import { sendMessages } from './client';
import { normalizePhone } from '../utils/validation';
import { logger } from '../utils/logger';

export const webhookRouter = Router();

// Validate Twilio request signature to reject forged webhook calls
function validateTwilioSignature(req: Request, res: Response): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    logger.warn('TWILIO_AUTH_TOKEN not set — skipping signature validation');
    return true; // Allow in dev; log the gap
  }

  const publicBaseUrl = process.env.PUBLIC_BASE_URL;
  if (!publicBaseUrl) {
    logger.warn('PUBLIC_BASE_URL not set — skipping signature validation');
    return true;
  }

  const url = `${publicBaseUrl}/webhook`;
  const signature = req.headers['x-twilio-signature'] as string ?? '';
  const params = req.body as Record<string, string>;

  const valid = twilio.validateRequest(authToken, signature, url, params);
  if (!valid) {
    logger.warn('Twilio signature validation failed', { url });
  }
  return valid;
}

// Simple in-memory dedup for Twilio message IDs (prevents double-processing on retry)
const processedMessageIds = new Set<string>();
const MESSAGE_ID_TTL_MS = 5 * 60 * 1000; // 5 minutes

function isDuplicate(messageSid: string): boolean {
  if (processedMessageIds.has(messageSid)) return true;
  processedMessageIds.add(messageSid);
  setTimeout(() => processedMessageIds.delete(messageSid), MESSAGE_ID_TTL_MS);
  return false;
}

webhookRouter.post('/', async (req: Request, res: Response) => {
  const from: string = req.body?.From ?? '';
  const body: string = req.body?.Body ?? '';
  const messageSid: string = req.body?.MessageSid ?? '';

  if (!from || !body) {
    res.status(400).send('Missing From or Body');
    return;
  }

  // Reject forged requests
  if (!validateTwilioSignature(req, res)) {
    res.status(403).send('Forbidden');
    return;
  }

  // Deduplicate Twilio retries
  if (messageSid && isDuplicate(messageSid)) {
    logger.info('Duplicate Twilio message ignored', { messageSid });
    res.status(200).set('Content-Type', 'text/xml').send('<Response></Response>');
    return;
  }

  const phone = normalizePhone(from);
  logger.info('Inbound WhatsApp message', { phone: phone.slice(-4), bodyLength: body.length });

  // Respond to Twilio immediately (must be < 15s)
  res.status(200).set('Content-Type', 'text/xml').send('<Response></Response>');

  // Process asynchronously
  setImmediate(async () => {
    try {
      const { reply, extra } = await routeMessage(from, body);
      await sendMessages([{ to: phone, body: reply }, ...extra]);
    } catch (err) {
      logger.error('Webhook handler error', { phone: phone.slice(-4), error: String(err) });
    }
  });
});
