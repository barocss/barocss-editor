import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';
import { McpBundleReadError, readExactDocumentBundle } from './mcp-bundle-reader.js';
import { registerSchema } from './mcp-register.js';

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);

function createServer() {
  const server = new McpServer({ name: 'wonffice-schema-server', version: '0.0.0' });
  server.registerTool('get_schema_bundle', {
    description: 'Read the exact complete schema bundle and raw Note snapshot for a document authorized by Wonffice.',
    inputSchema: z.strictObject({ tenantId: uuid, documentId: uuid }),
  }, async ({ tenantId, documentId }, context) => {
    try {
      const result = await readExactDocumentBundle({ baseUrl: process.env.SCHEMA_SERVER_MCP_BASE_URL ?? '',
        bearerToken: process.env.SCHEMA_SERVER_MCP_BEARER_TOKEN }, tenantId, documentId, context.mcpReq.signal);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    } catch (error) {
      const reason = error instanceof McpBundleReadError ? error.reason : 'schema_service_unavailable';
      return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify({ status: reason }) }] };
    }
  });
  server.registerTool('register_schema', {
    description: 'Register one preauthorized declarative Note schema through the current Schema Server authority.',
    inputSchema: z.strictObject({ tenantId: uuid, workspaceId: uuid, schemaId: uuid,
      version: z.number().int().min(1).max(2147483647), definitionText: z.string(),
      idempotencyKey: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/) }),
  }, async (input, context) => {
    try {
      const result = await registerSchema({ baseUrl: process.env.SCHEMA_SERVER_MCP_BASE_URL ?? '',
        bearerToken: process.env.SCHEMA_SERVER_MCP_BEARER_TOKEN }, input, context.mcpReq.signal);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    } catch (error) {
      const reason = error instanceof McpBundleReadError ? error.reason : 'schema_service_unavailable';
      return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify({ status: reason }) }] };
    }
  });
  return server;
}

// stdout belongs to the MCP stdio transport. Never write credentials or diagnostics there.
void serveStdio(createServer);
