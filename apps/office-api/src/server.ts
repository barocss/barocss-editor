import Fastify from 'fastify';

const statusSchema = {
  type: 'object', required: ['status'], additionalProperties: false,
  properties: { status: { type: 'string' } },
} as const;
const healthPaths = new Set(['/health/live', '/health/ready']);

/** HTTP boundary only. Domain services and collaboration providers remain separate. */
export function createApiServer() {
  const app = Fastify({
    logger: false,
    trustProxy: false,
    requestIdHeader: false,
    exposeHeadRoutes: false,
    http: { maxHeaderSize: 8192, headersTimeout: 10000 },
    requestTimeout: 15000,
    keepAliveTimeout: 5000,
    bodyLimit: 1024 * 1024,
    forceCloseConnections: 'idle',
    ajv: { customOptions: { coerceTypes: false, removeAdditional: false, useDefaults: false } },
  });
  app.addHook('onRequest', async (request, reply) => {
    reply.header('cache-control', 'no-store').header('x-content-type-options', 'nosniff');
    if (healthPaths.has(request.url.split('?')[0]) &&
      request.method !== 'GET' && request.method !== 'HEAD') {
      return reply.header('allow', 'GET, HEAD').code(405).send({ status: 'method_not_allowed' });
    }
  });
  app.setNotFoundHandler(async (_request, reply) => reply.code(404).send({ status: 'not_found' }));
  app.setErrorHandler((error, _request, reply) => {
    const statusCode = (error as { statusCode?: number }).statusCode;
    const code = statusCode === 400 || statusCode === 413 || statusCode === 415 ? statusCode : 500;
    const status = code === 400 ? 'invalid_request' : code === 413 ? 'request_too_large'
      : code === 415 ? 'unsupported_media_type' : 'internal_error';
    // Error messages and validation details can contain user data. Never return them.
    void reply.code(code).send({ status });
  });
  for (const path of healthPaths) {
    const live = path === '/health/live';
    const code = live ? 200 : 503;
    app.route({
      method: ['GET', 'HEAD'], url: path,
      schema: { response: { [code]: statusSchema } },
      handler: async (_request, reply) => reply.code(code).send({
        status: live ? 'alive' : 'service_not_configured',
      }),
    });
  }
  return app;
}
