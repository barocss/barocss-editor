import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { requireRuntime, root } from './paths.mjs';
import { browserBoundary } from './sheet-preview.mjs';

const repository = resolve(root, '../..');
const preview = resolve(root, 'preview/sheet');
const port = 55266;
const relayPath = '/api/sheet-relay/v1';

function serverPackageBoundary() {
  const reject = id => {
    const clean = id.split('?')[0].replaceAll('\\', '/');
    if (clean === 'ws' || clean.startsWith('ws/') || clean.includes('/node_modules/ws/')) {
      throw new Error('The browser must use its native WebSocket API, not the Node ws package.');
    }
  };
  return {
    name: 'sheet-websocket-server-package-boundary', enforce: 'pre',
    resolveId(id) { reject(id); return null; },
    load(id) { reject(id); return null; },
  };
}

async function main(args) {
  requireRuntime();
  if (args.length === 1 && args[0] === '--help') {
    console.log('node scripts/sheet-websocket.mjs --source-head <40-character commit> [--check]');
    console.log('Controlled WebSocket Sheet on http://127.0.0.1:55266/. Requires the separately started relay on 55265.');
    return;
  }
  let expected;
  let check = false;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--source-head' && expected === undefined) expected = args[++index];
    else if (arg === '--check' && !check) check = true;
    else throw new Error(`Unknown or repeated option: ${arg}`);
  }
  if (!/^[a-f0-9]{40}$/.test(expected ?? '')) throw new Error('An exact --source-head commit is required.');
  const git = argv => execFileSync('git', argv, { cwd: repository, encoding: 'utf8' }).trim();
  const head = git(['rev-parse', 'HEAD']);
  if (head !== expected) throw new Error(`Source HEAD differs: expected ${expected}; received ${head}.`);
  if (git(['status', '--porcelain'])) throw new Error('Sheet WebSocket preview requires a clean source checkout.');
  for (const file of ['index.html', 'main.ts', 'websocket-transport.ts', 'outbox.ts']) {
    if (!existsSync(resolve(preview, file))) throw new Error(`WebSocket preview entry is not ready: ${file}. No server started.`);
  }
  const fromRepository = createRequire(resolve(repository, 'package.json'));
  const fromExperiment = createRequire(resolve(root, 'package.json'));
  const vitePackage = fromRepository.resolve('vite/package.json');
  const versions = { vite: JSON.parse(readFileSync(vitePackage, 'utf8')).version };
  for (const name of ['ws', '@types/ws', 'yjs']) versions[name] = fromExperiment(`${name}/package.json`).version;
  if (versions.vite !== '5.4.21' || versions.ws !== '8.22.0' || versions['@types/ws'] !== '8.18.2' || versions.yjs !== '13.6.29') {
    throw new Error('Frozen Vite/WebSocket/types/Yjs versions differ. Do not install a replacement.');
  }
  const binding = {
    owner: 'Execute Integration #522', issue: 533, mode: 'websocket',
    sourceHead: head, sourceTree: git(['rev-parse', 'HEAD^{tree}']), sourceRoot: repository,
    entry: resolve(preview, 'index.html'), pid: process.pid, node: process.versions.node, ...versions,
    expectedDataPath: `${relayPath}/ws`, relay: 'http://127.0.0.1:55265', authorization: 'controlled-local',
  };
  if (check) {
    console.log(JSON.stringify({ status: 'Source and entry checks passed; no server started', ...binding }));
    return;
  }
  const { createServer } = await import(pathToFileURL(resolve(dirname(vitePackage), 'dist/node/index.js')).href);
  const server = await createServer({
    configFile: false, root: preview, publicDir: false,
    cacheDir: resolve(root, '.cache/sheet-websocket'),
    plugins: [browserBoundary(), serverPackageBoundary(), {
      name: 'sheet-websocket-mode',
      transformIndexHtml() {
        return [{ tag: 'meta', attrs: { name: 'sheet-collaboration-mode', content: 'websocket' }, injectTo: 'head-prepend' }];
      },
    }],
    optimizeDeps: { entries: [resolve(preview, 'index.html')] },
    server: {
      host: '127.0.0.1', port, strictPort: true,
      fs: { strict: true, allow: [root, realpathSync(resolve(root, 'node_modules')), dirname(vitePackage)] },
      proxy: { [relayPath]: { target: 'http://127.0.0.1:55265', changeOrigin: true, ws: true } },
    },
    logLevel: 'warn',
  });
  let closing;
  const close = () => closing ??= server.close();
  const stop = () => { void close().catch(error => { console.error(error); process.exitCode = 1; }); };
  try {
    await server.listen();
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    console.log(JSON.stringify({ status: 'Sheet WebSocket preview listening', url: `http://127.0.0.1:${port}/`, ...binding }));
  } catch (error) {
    await close();
    throw error;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => { console.error(error); process.exitCode = 1; });
}
