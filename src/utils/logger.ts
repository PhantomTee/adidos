export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

function log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  const ts = new Date().toISOString();
  const parts = [`[${ts}] [${level.toUpperCase()}] ${message}`];
  if (meta && Object.keys(meta).length > 0) {
    // Redact sensitive fields before logging
    const safe = redact(meta);
    parts.push(JSON.stringify(safe));
  }
  const line = parts.join(' ');
  if (level === 'error') {
    console.error(line);
  } else {
    console.log(line);
  }
}

function redact(obj: Record<string, unknown>): Record<string, unknown> {
  const SENSITIVE = new Set([
    'privateKey', 'private_key', 'entitySecret', 'entity_secret',
    'apiKey', 'api_key', 'authToken', 'auth_token', 'password',
    'CIRCLE_API_KEY', 'CIRCLE_ENTITY_SECRET', 'SERVER_WALLET_PRIVATE_KEY',
  ]);
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    result[k] = SENSITIVE.has(k) ? '[REDACTED]' : v;
  }
  return result;
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => log('debug', msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => log('info', msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => log('warn', msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => log('error', msg, meta),
};
