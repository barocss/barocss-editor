import pg from 'pg';
import { MembershipStore } from '@barocss/office-service/membership-store';
import { SchemaRegistryStore } from '@barocss/office-service/schema-registry-store';
import { createOidcVerifier } from '@barocss/office-api/oidc';
import { readSchemaServerConfig } from './config.js';
import { createSchemaServer } from './server.js';
async function main() {
  const config = readSchemaServerConfig(process.env);
  const pool = new pg.Pool({ connectionString: config.auth.databaseUrl, max: 10,
    connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000, statement_timeout: 15000 });
  pool.on('error', () => { console.error(JSON.stringify({ event: 'schema_database_unavailable' })); });
  const app = createSchemaServer({ verifier: createOidcVerifier(config.auth), memberships: new MembershipStore(pool),
    registry: new SchemaRegistryStore(pool, config.policy), policy: config.policy });
  app.addHook('onClose', async () => { await pool.end(); });
  let stopping = false;
  const stop = async () => {
    if (stopping) return; stopping = true;
    const deadline = setTimeout(() => { app.server.closeAllConnections(); process.exit(1); }, config.shutdownTimeoutMs);
    try { await app.close(); console.log(JSON.stringify({ event: 'schema_server_stopped' })); }
    catch { process.exitCode = 1; } finally { clearTimeout(deadline); }
  };
  process.on('SIGTERM', () => { void stop(); }); process.on('SIGINT', () => { void stop(); });
  await app.listen({ host: config.host, port: config.port });
  console.log(JSON.stringify({ event: 'schema_server_listening', port: config.port }));
}
main().catch(() => { console.error(JSON.stringify({ event: 'schema_server_start_failed' })); process.exitCode = 1; });
