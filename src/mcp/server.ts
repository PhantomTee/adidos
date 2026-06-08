import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { mcpTools } from './tools';
import { logger } from '../utils/logger';

export function createMcpServer(): Server {
  const server = new Server(
    { name: 'proxypay-merchant', version: '1.0.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: mcpTools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: {
        type: 'object' as const,
        properties: (t.inputSchema as { shape?: Record<string, unknown> }).shape ?? {},
      },
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const tool = mcpTools.find((t) => t.name === name);

    if (!tool) {
      return {
        content: [{ type: 'text', text: `Unknown tool: ${name}` }],
        isError: true,
      };
    }

    try {
      const parsed = tool.inputSchema.parse(args ?? {});
      const result = await tool.execute(parsed);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      logger.error('MCP tool error', { tool: name, error: String(err) });
      return {
        content: [{ type: 'text', text: String(err) }],
        isError: true,
      };
    }
  });

  return server;
}

export async function startMcpStdio(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info('MCP server running on stdio');
}
