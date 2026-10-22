import { readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { requireRuntime, root } from './paths.mjs';
import { installAccountSourceImports } from './account-source-imports.mjs';
import { createKeycloakAccountGates } from './account-keycloak-gates.mjs';
import { createRelayOperatorControl } from './sheet-relay.mjs';

const repository = resolve(root, '../..');
const port = 55267;
const allowedOrigins = ['http://127.0.0.1:55268', 'http://127.0.0.1:55267'];
const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;

async function main(args) {
  requireRuntime();
  if (args.length === 1 && args[0] === '--help') {
    console.log('node --experimental-transform-types scripts/sheet-account-relay.mjs --source-head <commit> --private-config <0600 JSON> (--create | --resume <owned-directory>) [--operator-stdin] [--check]');
    return;
  }
  let expected, privatePath, directory;
  let create = false, check = false, operator = false;
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--source-head' && expected === undefined) expected = args[++index];
    else if (args[index] === '--private-config' && privatePath === undefined) privatePath = args[++index];
    else if (args[index] === '--resume' && directory === undefined) directory = args[++index];
    else if (args[index] === '--create' && !create) create = true;
    else if (args[index] === '--check' && !check) check = true;
    else if (args[index] === '--operator-stdin' && !operator) operator = true;
    else throw new Error('Unknown or repeated account relay option.');
  }
  if (!/^[a-f0-9]{40}$/.test(expected ?? '') || !privatePath || create === (directory !== undefined) ||
      (directory !== undefined && !directory.trim())) throw new Error('Exact source, private config and one startup mode are required.');
  const git = argv => execFileSync('git', argv, { cwd: repository, encoding: 'utf8' }).trim();
  if (git(['rev-parse', 'HEAD']) !== expected || git(['status', '--porcelain'])) throw new Error('Account relay requires its exact clean source checkout.');
  const stat = statSync(resolve(privatePath));
  if (!stat.isFile() || (stat.mode & 0o077) || stat.uid !== process.getuid()) throw new Error('Unsafe private account relay configuration.');
  const config = JSON.parse(readFileSync(resolve(privatePath), 'utf8'));
  if (config.postgres?.port !== 55271 || config.postgres.database !== 'wonffice_sheet_auth' ||
      typeof config.postgres.appPassword !== 'string' || !config.postgres.appPassword ||
      typeof config.issuer !== 'string' || typeof config.audience !== 'string' ||
      !['tenantId', 'workspaceId', 'documentId', 'workbookId', 'generation'].every(key => uuid.test(config[key])) ||
      !uuid.test(config.accounts?.[0]?.userId)) throw new Error('Invalid owned account relay configuration.');
  const fromExperiment = createRequire(resolve(root, 'package.json'));
  const versions = Object.fromEntries(['yjs', 'ws'].map(name => [name, JSON.parse(readFileSync(fromExperiment.resolve(`${name}/package.json`), 'utf8')).version]));
  if (versions.yjs !== '13.6.29' || versions.ws !== '8.22.0') throw new Error('Frozen relay dependencies differ.');
  const binding = { owner: 'Execute Integration #522', sourceHead: expected,
    sourceTree: git(['rev-parse', 'HEAD^{tree}']), sourceRoot: repository, pid: process.pid, node: process.versions.node,
    url: `http://127.0.0.1:${port}`, issuer: config.issuer, databasePort: 55271, applicationRole: 'wonffice_app',
    controlled: false, operatorControl: operator ? 'receipt-only-private-stdin' : 'off', startup: create ? 'create' : 'resume', versions };
  if (check) { console.log(JSON.stringify({ status: 'Source and configuration checks passed; no server, store or DB connection started', ...binding })); return; }
  const hooks = installAccountSourceImports();
  const source = relative => pathToFileURL(resolve(repository, relative)).href;
  const { createOidcVerifier } = await import(source('apps/office-api/src/oidc.ts'));
  const { MembershipStore } = await import(source('apps/office-service/src/membership-store.ts'));
  const { SheetAccessStore } = await import(source('apps/office-service/src/sheet-access-store.ts'));
  const { createWorkbookContext } = await import(source('experiments/office-suite-v2/src/workbook.ts'));
  const { AccountAuthority, AccountSheetRelay, startSheetRelay } = await import(source('experiments/office-suite-v2/relay/sheet/index.ts'));
  const fromService = createRequire(resolve(repository, 'apps/office-service/package.json'));
  const { Pool } = fromService('pg');
  const pool = new Pool({ host: '127.0.0.1', port: 55271, user: 'wonffice_app', password: config.postgres.appPassword,
    database: config.postgres.database, max: 4, connectionTimeoutMillis: 5000 });
  let account, listener, controls, closing;
  const close = () => closing ??= (async () => {
    controls?.close();
    try { if (listener) await listener.close(); }
    finally { try { if (account) await account.close(); } finally { await pool.end(); hooks.deregister(); } }
  })();
  try {
    const verifier = createOidcVerifier({ issuer: config.issuer, audience: config.audience,
      jwksUrl: new URL(`${config.issuer}/protocol/openid-connect/certs`), algorithms: ['RS256'], databaseUrl: '' });
    const gates = createKeycloakAccountGates({ issuer: config.issuer,
      clientId: config.introspectionClientId, clientSecret: config.introspectionClientSecret });
    const authority = new AccountAuthority({ verifier, ...gates });
    const scope = { tenantId: config.tenantId, workspaceId: config.workspaceId, documentId: config.documentId };
    const context = createWorkbookContext({ documentId: config.documentId, workbookId: config.workbookId, generation: config.generation });
    const accessStore = new SheetAccessStore(new MembershipStore(pool));
    const options = { scope, context, authority, accessStore, allowedOrigins };
    account = create ? await AccountSheetRelay.create({ ...options, bootstrapActorId: config.accounts[0].userId }) :
      await AccountSheetRelay.resume(resolve(directory), options);
    if (operator) controls = createRelayOperatorControl(account, { controlledAuthority: false });
    listener = await startSheetRelay({ mode: 'account', account, port, allowedOrigins,
      ...(controls ? { holdAppendAck: controls.holdAppendAck } : {}) });
    const stop = () => { void close().catch(() => { process.exitCode = 1; }); };
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
    console.log(JSON.stringify({ status: 'Account Sheet relay listening', ...binding, storage: account.binding() }));
  } catch (error) { await close(); throw error; }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(() => { console.error('Account relay startup failed; private configuration omitted.'); process.exitCode = 1; });
}
