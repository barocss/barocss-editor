import { createHash } from 'node:crypto';
import pg from 'pg';
import { createSchemaServer } from '../../schema-server/dist/server.js';
import { SchemaRegistryStore } from '../../office-service/dist/schema-registry-store.js';
import { MembershipStore } from '../../office-service/dist/membership-store.js';
import { DocumentStore } from '../../office-service/dist/document-store.js';
import { createOidcVerifier } from '../dist/oidc.js';
import { readAuthConfig } from '../dist/auth-config.js';
import { native2FixtureScope } from './native2-auth-ui-corpus.mjs';

// A separate genuine SchemaServer process. Only the protected supervisor uses IPC.
const capabilities = ['note.field.text.v1', 'note.field.choice.v1', 'note.field.boolean.v1', 'note.field.number.v1'];
let app, pool, closing = false, closePromise, hold, held, lastRelease;
const release = (reason = 'manual') => { hold = undefined; held?.release(reason); };
function close() {
  if (!closePromise) closePromise = (async () => {
    closing = true;
    release('shutdown');
    try { if (app) await app.close(); }
    finally { if (pool) await pool.end(); }
  })();
  return closePromise;
}
const stop = () => { void close().then(() => process.exit(0)); };
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
process.on('disconnect', stop);
process.on('message', async message => {
  if (message.action) {
    try {
      if (!app || closing) throw new Error('schema_fixture_not_running');
      if (message.action === 'hold') {
        if (hold || held || !['snapshot', 'bundle'].includes(message.part) ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(message.documentId)) {
          throw new Error('invalid_schema_fixture_hold');
        }
        lastRelease = undefined;
        hold = { documentId: message.documentId, part: message.part };
      } else if (message.action === 'release') release();
      else if (message.action !== 'status') throw new Error('invalid_schema_fixture_command');
      process.send?.({ requestId: message.requestId, result: { schemaPid: process.pid, armed: !!hold,
        held: held ? { documentId: held.documentId, part: held.part, responseHash: held.responseHash } : null,
        lastRelease: lastRelease ?? null } });
    } catch { process.send?.({ requestId: message.requestId, error: 'schema_fixture_command_failed' }); }
    return;
  }
  try {
    if (app || pool || closing || message.tenantId !== native2FixtureScope.tenantId ||
      message.workspaceId !== native2FixtureScope.workspaceId || !Number.isInteger(message.port) ||
      message.port < 1024 || message.port > 65535) throw new Error('invalid_schema_fixture_configuration');
    pool = new pg.Pool({ ...message.database, max: 3, connectionTimeoutMillis: 2000 });
    pool.on('error', () => {});
    const auth = readAuthConfig({ OFFICE_OIDC_ISSUER: message.issuer,
      OFFICE_OIDC_JWKS_URL: `${message.issuer}/protocol/openid-connect/certs`,
      OFFICE_OIDC_AUDIENCE: message.audience, OFFICE_API_DATABASE_URL: 'postgresql://synthetic/unused' });
    if (!auth) throw new Error('schema_fixture_auth_missing');
    const scope = { tenantId: message.tenantId, workspaceId: message.workspaceId,
      readRoles: ['owner', 'viewer'], capabilities };
    const policy = [{ ...scope, registerRoles: [] }];
    app = createSchemaServer({ verifier: createOidcVerifier(auth), memberships: new MembershipStore(pool),
      registry: new SchemaRegistryStore(pool, policy), policy,
      documents: new DocumentStore(pool, { noteSchemaPolicy: [{ ...scope, preserveRoles: [], adoptRoles: [] }] }) });
    app.addHook('onSend', async (request, reply, payload) => {
      const suffix = hold?.part === 'bundle' ? '/schema-bundle' : '';
      const path = hold && `/v1/tenants/${message.tenantId}/note-native2/documents/${hold.documentId}${suffix}`;
      if (!hold || request.method !== 'GET' || request.url !== path || reply.statusCode !== 200) return payload;
      if (typeof payload !== 'string' && !Buffer.isBuffer(payload)) throw new Error('unexpected_schema_fixture_payload');
      const selected = hold;
      hold = undefined;
      await new Promise(resolve => {
        const timer = setTimeout(() => finish('timeout'), 45000);
        function finish(reason) { clearTimeout(timer);
          lastRelease = { ...selected, responseHash: held.responseHash, reason };
          held = undefined; resolve(); }
        held = { ...selected, responseHash: createHash('sha256').update(payload).digest('hex'), release: finish };
      });
      return payload;
    });
    await app.listen({ host: '127.0.0.1', port: message.port });
    process.send?.({ ready: true });
  } catch {
    process.send?.({ ready: false });
    await close();
    process.exit(1);
  }
});
