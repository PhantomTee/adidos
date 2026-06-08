import twilio from 'twilio';
import { OutboundMessage } from '../types';
import { toWhatsAppNumber } from '../utils/validation';
import { logger } from '../utils/logger';

let _twilioClient: twilio.Twilio | null = null;

function getTwilioClient(): twilio.Twilio {
  if (_twilioClient) return _twilioClient;
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) throw new Error('TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN must be set');
  _twilioClient = twilio(sid, token);
  return _twilioClient;
}

function getFrom(): string {
  const num = process.env.TWILIO_WHATSAPP_NUMBER;
  if (!num) throw new Error('TWILIO_WHATSAPP_NUMBER must be set');
  return num.startsWith('whatsapp:') ? num : `whatsapp:${num}`;
}

/** Send a WhatsApp message to a phone number (raw E.164 or whatsapp: prefixed) */
export async function sendWhatsApp(to: string, body: string): Promise<void> {
  try {
    const client = getTwilioClient();
    const toFormatted = toWhatsAppNumber(to);
    await client.messages.create({ from: getFrom(), to: toFormatted, body });
    logger.info('WhatsApp message sent', { to: toFormatted, length: body.length });
  } catch (err) {
    logger.error('Failed to send WhatsApp message', { to, error: String(err) });
    // Don't re-throw — notification failures shouldn't break payment flows
  }
}

/** Send multiple outbound messages */
export async function sendMessages(messages: OutboundMessage[]): Promise<void> {
  await Promise.all(messages.map((m) => sendWhatsApp(m.to, m.body)));
}
