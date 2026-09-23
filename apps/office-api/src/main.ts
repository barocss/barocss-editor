import { readConfig } from './config.js';
import { readAuthConfig } from './auth-config.js';
import { createOidcVerifier } from './oidc.js';
import { createApiServer } from './server.js';
import { MembershipStore } from '@barocss/office-service/membership-store';
import { PlatformOperatorStore } from '@barocss/office-service/platform-operator-store';
import { DocumentStore } from '@barocss/office-service/document-store';
import pg from 'pg';

async function main(): Promise<void> {
  const config = readConfig(process.env);
  const authConfig = readAuthConfig(process.env);
  const pool = authConfig ? new pg.Pool({ connectionString: authConfig.databaseUrl,
    max: 10, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000 }) : null;
  const app = createApiServer(authConfig && pool ? {
    verifier: createOidcVerifier(authConfig),
    memberships: new MembershipStore(pool),
    operators: new PlatformOperatorStore(pool),
    documents: new DocumentStore(pool),
  } : undefined);
  if (pool) app.addHook('onClose', async () => { await pool.end(); });
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    const deadline = setTimeout(() => {
      app.server.closeAllConnections();
      console.error(JSON.stringify({ event: 'api_shutdown_timeout' }));
      process.exit(1);
    }, config.shutdownTimeoutMs);
    try {
      await app.close();
      console.log(JSON.stringify({ event: 'api_stopped' }));
    } catch {
      console.error(JSON.stringify({ event: 'api_stop_failed' }));
      process.exitCode = 1;
    } finally {
      clearTimeout(deadline);
    }
  };
  process.on('SIGTERM', () => { void stop(); });
  process.on('SIGINT', () => { void stop(); });
  await app.listen({ port: config.port, host: config.host });
  console.log(JSON.stringify({ event: 'api_listening', port: config.port }));
}

main().catch(() => {
  console.error(JSON.stringify({ event: 'api_start_failed' }));
  process.exitCode = 1;
});
