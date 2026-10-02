import { ProjectStore } from '../../office-service/dist/project-store.js';
import pg from 'pg';
import { MembershipStore } from '../../office-service/dist/membership-store.js';
import { DocumentStore } from '../../office-service/dist/document-store.js';
import { PlatformOperatorStore } from '../../office-service/dist/platform-operator-store.js';
import { CompanyMemberStore } from '../../office-service/dist/company-member-store.js';
import { createApiServer } from '../dist/server.js';
import { createOidcVerifier } from '../dist/oidc.js';
import { readAuthConfig } from '../dist/auth-config.js';

// Only the private local-test supervisor provides this child's configuration.
let app;
let pool;
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  try { if (app) await app.close(); }
  finally { if (pool) await pool.end(); }
}
const stop = () => { void close().then(() => process.exit(0)); };
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
process.on('disconnect', stop);
process.once('message', async ({ database, issuer, audience, port }) => {
  try {
    pool = new pg.Pool({ ...database, max: 3, connectionTimeoutMillis: 2000 });
    // A deliberate DB outage terminates idle connections. New requests still reach
    // the real service and its 503 handling instead of crashing the test child.
    pool.on('error', () => {});
    const auth = readAuthConfig({ OFFICE_OIDC_ISSUER: issuer,
      OFFICE_OIDC_JWKS_URL: `${issuer}/protocol/openid-connect/certs`,
      OFFICE_OIDC_AUDIENCE: audience, OFFICE_API_DATABASE_URL: 'postgresql://synthetic/unused' });
    if (!auth) throw new Error('synthetic_auth_config_missing');
    app = createApiServer({ verifier: createOidcVerifier(auth),
      memberships: new MembershipStore(pool), workspaces: new MembershipStore(pool),
      documents: new DocumentStore(pool), operators: new PlatformOperatorStore(pool),
      companyMembers: new CompanyMemberStore(pool), projects: new ProjectStore(pool) });
    await app.listen({ host: '127.0.0.1', port });
    process.send?.({ ready: true });
  } catch {
    process.send?.({ ready: false });
    await close();
    process.exit(1);
  }
});
