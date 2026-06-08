import express from 'express';
import { webhookRouter } from './whatsapp/webhook';
import { mcpTools } from './mcp/tools';
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

  // MCP tool list endpoint (for discovery by agents)
  app.get('/mcp/tools', (_req, res) => {
    res.json({
      tools: mcpTools.map((t) => ({
        name: t.name,
        description: t.description,
      })),
    });
  });

  // MCP tool call endpoint (HTTP POST for agent integration)
  app.post('/mcp/call', async (req, res) => {
    const { tool, args } = req.body as { tool?: string; args?: unknown };
    if (!tool) {
      res.status(400).json({ error: 'tool name required' });
      return;
    }

    const found = mcpTools.find((t) => t.name === tool);
    if (!found) {
      res.status(404).json({ error: `Tool "${tool}" not found` });
      return;
    }

    try {
      const parsed = found.inputSchema.parse(args ?? {});
      const result = await found.execute(parsed);
      res.json({ result });
    } catch (err) {
      logger.error('MCP HTTP call error', { tool, error: String(err) });
      res.status(500).json({ error: String(err) });
    }
  });

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
