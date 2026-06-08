import OpenAI from 'openai';
import { ParsedIntent } from '../types';
import { SYSTEM_PROMPT } from './systemPrompt';
import { IntentSchema } from './schemas';
import { logger } from '../utils/logger';

let _openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (_openai) return _openai;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set');
  _openai = new OpenAI({ apiKey });
  return _openai;
}

export async function parseIntent(message: string): Promise<ParsedIntent> {
  // Fast-path: handle obvious single-word responses without calling OpenAI
  const lower = message.trim().toLowerCase();
  const fastPath = getFastPathIntent(lower);
  if (fastPath) return fastPath;

  try {
    const openai = getOpenAI();
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      max_tokens: 300,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: message },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(raw);
    const validated = IntentSchema.safeParse(parsed);

    if (!validated.success) {
      logger.warn('Intent validation failed', { raw, errors: validated.error.errors });
      return { intent: 'UNKNOWN', confidence: 0 };
    }

    logger.debug('Intent parsed', { message: message.slice(0, 50), intent: validated.data.intent });
    return validated.data as ParsedIntent;
  } catch (err) {
    logger.error('Intent parsing failed', { error: String(err) });
    return { intent: 'UNKNOWN', confidence: 0 };
  }
}

function getFastPathIntent(lower: string): ParsedIntent | null {
  if (lower === 'yes' || lower === 'y') return { intent: 'CONFIRM_PAYMENT', confidence: 1 };
  if (lower === 'no' || lower === 'n') return { intent: 'CANCEL_PENDING', confidence: 1 };
  if (lower === 'pay') return { intent: 'PAY_INVOICE', confidence: 1 };
  if (lower === 'start' || lower === 'hi' || lower === 'hello') return { intent: 'START', confidence: 1 };
  if (lower === 'help') return { intent: 'HELP', confidence: 1 };
  if (lower === 'balance') return { intent: 'CHECK_BALANCE', confidence: 1 };
  if (lower === 'cancel') return { intent: 'CANCEL_PENDING', confidence: 1 };
  return null;
}
