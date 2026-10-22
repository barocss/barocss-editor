import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { requireRuntime, root } from './paths.mjs';
import { browserBoundary } from './sheet-preview.mjs';

const repository = resolve(root, '../..');
const preview = resolve(root, 'preview/sheet');
const port = 55268;
const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;

function readPublicConfig(path) {
  const value = JSON.parse(readFileSync(resolve(path), 'utf8'));
  const keys = ['issuer', 'clientId', 'tenantId', 'workspaceId', 'documentId'];
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).length !== keys.length || !keys.every(key => typeof value[key] === 'string')) {
    throw new Error('Expected the five-field public account configuration. Private configuration is refused.');
  }
  const issuer = new URL(value.issuer);
  if (issuer.username || issuer.password || issuer.search || issuer.hash ||
      (issuer.protocol !== 'https:' && !(issuer.protocol === 'http:' && issuer.hostname === '127.0.0.1')) ||
      !/^[A-Za-z0-9._-]{1,255}$/.test(value.clientId) ||
      !['tenantId', 'workspaceId', 'documentId'].every(key => uuid.test(value[key]))) {
    throw new Error('Invalid public account configuration.');
  }
  return value;
}

async function main(args) {
  requireRuntime();
  if (args.length === 1 && args[0] === '--help') {
    console.log('node scripts/sheet-account.mjs --source-head <commit> --public-config <five-field JSON> [--check]');
    console.log('Account Sheet UI on 127.0.0.1:55268; separate account relay on 55267. No IdP, DB or accounts are created.');
    return;
  }
  let expected, publicPath;
  let check = false;
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--source-head' && expected === undefined) expected = args[++index];
    else if (args[index] === '--public-config' && publicPath === undefined) publicPath = args[++index];
    else if (args[index] === '--check' && !check) check = true;
    else throw new Error('Unknown or repeated account UI option.');
  }
  if (!/^[a-f0-9]{40}$/.test(expected ?? '') || !publicPath) throw new Error('Exact source and public configuration are required.');
  const config = readPublicConfig(publicPath);
  const git = argv => execFileSync('git', argv, { cwd: repository, encoding: 'utf8' }).trim();
  if (git(['rev-parse', 'HEAD']) !== expected || git(['status', '--porcelain'])) throw new Error('Account UI requires its exact clean source checkout.');
  const authModule = resolve(repository, 'apps/office/src/auth-client.ts');
  for (const file of ['index.html', 'main.ts', 'account-mode.ts', 'account-binding.ts', 'account-login.ts']) {
    if (!existsSync(resolve(preview, file))) throw new Error(`Account preview entry is not ready: ${file}. No server started.`);
  }
  if (!existsSync(authModule)) throw new Error('Original Office authentication source is missing.');
  const fromRepository = createRequire(resolve(repository, 'package.json'));
  const fromExperiment = createRequire(resolve(root, 'package.json'));
  const vitePackage = fromRepository.resolve('vite/package.json');
  const versions = { vite: JSON.parse(readFileSync(vitePackage, 'utf8')).version,
    ws: fromExperiment('ws/package.json').version, yjs: fromExperiment('yjs/package.json').version };
  if (versions.vite !== '5.4.21' || versions.ws !== '8.22.0' || versions.yjs !== '13.6.29') throw new Error('Frozen account UI dependencies differ.');
  const url = new URL(`http://127.0.0.1:${port}/`);
  url.search = new URLSearchParams({ tenant: config.tenantId, workspace: config.workspaceId, document: config.documentId }).toString();
  const binding = { owner: 'Execute Integration #522', mode: 'account', sourceHead: expected,
    sourceTree: git(['rev-parse', 'HEAD^{tree}']), sourceRoot: repository, pid: process.pid,
    node: process.versions.node, ...versions, url: url.href, relay: 'http://127.0.0.1:55267',
    issuer: config.issuer, clientId: config.clientId, authorization: 'actual-local-OIDC-required' };
  if (check) { console.log(JSON.stringify({ status: 'Source and entry checks passed; no server started', ...binding })); return; }
  const { createServer } = await import(pathToFileURL(resolve(dirname(vitePackage), 'dist/node/index.js')).href);
  const rejectServerPackage = id => {
    const clean = id.split('?')[0].replaceAll('\\', '/');
    if (clean === 'ws' || clean.startsWith('ws/') || clean.includes('/node_modules/ws/')) throw new Error('Use the native browser WebSocket API.');
  };
  const server = await createServer({
    configFile: false, root: preview, publicDir: false, envPrefix: [],
    define: { 'import.meta.env.VITE_OFFICE_OIDC_ISSUER': JSON.stringify(config.issuer),
      'import.meta.env.VITE_OFFICE_OIDC_CLIENT_ID': JSON.stringify(config.clientId) },
    cacheDir: resolve(root, '.cache/sheet-account'),
    plugins: [browserBoundary(), { name: 'account-browser-server-package-boundary', enforce: 'pre',
      resolveId(id) { rejectServerPackage(id); return null; }, load(id) { rejectServerPackage(id); return null; } },
    { name: 'sheet-account-mode', transformIndexHtml() { return [
      { tag: 'meta', attrs: { name: 'sheet-collaboration-mode', content: 'account' }, injectTo: 'head-prepend' },
      { tag: 'meta', attrs: { name: 'sheet-account-auth-module', content: '/@fs' + authModule }, injectTo: 'head-prepend' },
    ]; } }],
    optimizeDeps: { entries: [resolve(preview, 'index.html'), authModule] },
    server: { host: '127.0.0.1', port, strictPort: true,
      fs: { strict: true, allow: [repository, realpathSync(resolve(root, 'node_modules')),
        dirname(realpathSync(resolve(repository, 'node_modules/.pnpm'))), dirname(vitePackage)] },
      proxy: { '/api/v1': { target: 'http://127.0.0.1:55267', changeOrigin: true },
        '/api/sheet-relay/v1': { target: 'http://127.0.0.1:55267', changeOrigin: true, ws: true } },
    }, logLevel: 'warn',
  });
  let closing;
  const close = () => closing ??= server.close();
  const stop = () => { void close().catch(() => { process.exitCode = 1; }); };
  try {
    await server.listen(); process.once('SIGINT', stop); process.once('SIGTERM', stop);
    console.log(JSON.stringify({ status: 'Account Sheet preview listening', ...binding }));
  } catch (error) { await close(); throw error; }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => { console.error(error); process.exitCode = 1; });
}
