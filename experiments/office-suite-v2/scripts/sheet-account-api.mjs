import { readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { requireRuntime, root } from './paths.mjs';
import { installAccountSourceImports } from './account-source-imports.mjs';
import { createKeycloakAccountGates } from './account-keycloak-gates.mjs';

const repository = resolve(root, '../..');
const port = 55270;

async function main(args) {
  requireRuntime();
  if (args.length === 1 && args[0] === '--help') {
    console.log('node --experimental-transform-types scripts/sheet-account-api.mjs --source-head <commit> --private-config <0600 JSON> [--check]');
    console.log('Original Office identity/membership/workspace HTTP boundary on 127.0.0.1:55270. Uses only the separately owned IdP and PostgreSQL.');
    return;
  }
  let expected, privatePath;
  let check = false;
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--source-head' && expected === undefined) expected = args[++index];
    else if (args[index] === '--private-config' && privatePath === undefined) privatePath = args[++index];
    else if (args[index] === '--check' && !check) check = true;
    else throw new Error('Unknown or repeated account API option.');
  }
  if (!/^[a-f0-9]{40}$/.test(expected ?? '') || !privatePath) throw new Error('Exact source and private configuration are required.');
  const git = argv => execFileSync('git', argv, { cwd: repository, encoding: 'utf8' }).trim();
  if (git(['rev-parse', 'HEAD']) !== expected || git(['status', '--porcelain'])) throw new Error('Account API requires its exact clean source checkout.');
  const stat = statSync(resolve(privatePath));
  if (!stat.isFile() || (stat.mode & 0o077) || stat.uid !== process.getuid()) throw new Error('Unsafe private account API configuration.');
  const config = JSON.parse(readFileSync(resolve(privatePath), 'utf8'));
  if (config.postgres?.port !== 55271 || config.postgres.database !== 'wonffice_sheet_auth' ||
      typeof config.postgres.appPassword !== 'string' || !config.postgres.appPassword ||
      typeof config.issuer !== 'string' || typeof config.audience !== 'string') throw new Error('Invalid owned account API configuration.');
  const binding = { owner: 'Execute Integration #522', sourceHead: expected,
    sourceTree: git(['rev-parse', 'HEAD^{tree}']), sourceRoot: repository, pid: process.pid, node: process.versions.node,
    url: `http://127.0.0.1:${port}`, issuer: config.issuer, databasePort: 55271,
    applicationRole: 'wonffice_app', actualIdentityProviderRequired: true, identitySource: 'original Office API/MembershipStore' };
  if (check) { console.log(JSON.stringify({ status: 'Source and configuration checks passed; no server or DB connection started', ...binding })); return; }
  const hooks = installAccountSourceImports();
  const appSource = relative => pathToFileURL(resolve(repository, relative)).href;
  const { createApiServer } = await import(appSource('apps/office-api/src/server.ts'));
  const { createOidcVerifier, InvalidAccessTokenError } = await import(appSource('apps/office-api/src/oidc.ts'));
  const { MembershipStore } = await import(appSource('apps/office-service/src/membership-store.ts'));
  const fromService = createRequire(resolve(repository, 'apps/office-service/package.json'));
  const { Pool } = fromService('pg');
  const pool = new Pool({ host: '127.0.0.1', port: 55271, user: 'wonffice_app', password: config.postgres.appPassword,
    database: config.postgres.database, max: 4, connectionTimeoutMillis: 5000 });
  const original = createOidcVerifier({ issuer: config.issuer, audience: config.audience,
    jwksUrl: new URL(`${config.issuer}/protocol/openid-connect/certs`), algorithms: ['RS256'], databaseUrl: '' });
  const gates = createKeycloakAccountGates({ issuer: config.issuer,
    clientId: config.introspectionClientId, clientSecret: config.introspectionClientSecret });
  const verifySession = async token => {
    const session = await original.verifySession(token);
    if (!await gates.sessionGate({ ...session, accessToken: token }, new AbortController().signal)) throw new InvalidAccessTokenError();
    return session;
  };
  const verifier = { verifySession, async verify(token) { const { issuer, subject } = await verifySession(token); return { issuer, subject }; } };
  const memberships = new MembershipStore(pool);
  // These are the original server routes and the original PostgreSQL/RLS store.
  // Optional document, Agent, Yorkie, operator and inference dependencies are absent.
  const server = createApiServer({ verifier, memberships, workspaces: memberships });
  let closing;
  const close = () => closing ??= (async () => { try { await server.close(); } finally { await pool.end(); hooks.deregister(); } })();
  const stop = () => { void close().catch(() => { process.exitCode = 1; }); };
  try {
    await server.listen({ host: '127.0.0.1', port });
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
    console.log(JSON.stringify({ status: 'Original Office identity API listening', ...binding }));
  } catch (error) { await close(); throw error; }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(() => { console.error('Account identity API startup failed; private configuration and provider details omitted.'); process.exitCode = 1; });
}
