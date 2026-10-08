import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';
import { McpBundleReadError, readExactDocumentBundle } from './mcp-bundle-reader.js';
import { registerSchema } from './mcp-register.js';
import { validateNative2 } from './mcp-validate.js';

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
const sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const validationFields = { tenantId: uuid, documentId: uuid,
  expectedRevision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  expectedSnapshotHash: sha256, expectedPriorPinDigest: sha256 };

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
  server.registerTool('validate_document', {
    description: 'Check the authorized current Note native2 file and exact revision/pin preconditions without saving.',
    inputSchema: z.strictObject(validationFields),
  }, async (input, context) => {
    try {
      const result = await validateNative2({ baseUrl: process.env.SCHEMA_SERVER_MCP_BASE_URL ?? '',
        bearerToken: process.env.SCHEMA_SERVER_MCP_BEARER_TOKEN },
      { ...input, kind: 'document' }, context.mcpReq.signal);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    } catch (error) {
      const reason = error instanceof McpBundleReadError ? error.reason : 'schema_service_unavailable';
      return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify({ status: reason }) }] };
    }
  });
  server.registerTool('validate_candidate', {
    description: 'Check proposed Note native2 raw bytes and action against current authority; no save or adoption.',
    inputSchema: z.strictObject({ ...validationFields, snapshotText: z.string().max(524288),
      intendedAction: z.enum(['preserve', 'adopt']) }),
  }, async (input, context) => {
    try {
      const result = await validateNative2({ baseUrl: process.env.SCHEMA_SERVER_MCP_BASE_URL ?? '',
        bearerToken: process.env.SCHEMA_SERVER_MCP_BEARER_TOKEN },
      { ...input, kind: 'candidate' }, context.mcpReq.signal);
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
