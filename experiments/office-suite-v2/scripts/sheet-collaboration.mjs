import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { requireRuntime, root } from './paths.mjs';
import { browserBoundary } from './sheet-preview.mjs';

const repository = resolve(root, '../..');
const preview = resolve(root, 'preview/sheet');
const port = 55264;

async function main(args) {
  requireRuntime();
  if (args.length === 1 && args[0] === '--help') {
    console.log('node scripts/sheet-collaboration.mjs --source-head <40-character commit> --mode <peer|durable> [--check]');
    console.log('Serves the native Sheet preview on http://127.0.0.1:55264/. Peer receipts are temporary. Durable mode requires the separately started controlled relay on 55265.');
    return;
  }
  let expected;
  let mode;
  let check = false;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--source-head' && expected === undefined) expected = args[++index];
    else if (arg === '--mode' && mode === undefined) mode = args[++index];
    else if (arg === '--check' && !check) check = true;
    else throw new Error(`Unknown or repeated option: ${arg}`);
  }
  if (!/^[a-f0-9]{40}$/.test(expected ?? '')) throw new Error('An exact --source-head commit is required.');
  if (mode !== 'peer' && mode !== 'durable') throw new Error('Choose an explicit --mode peer or --mode durable.');
  const git = argv => execFileSync('git', argv, { cwd: repository, encoding: 'utf8' }).trim();
  const head = git(['rev-parse', 'HEAD']);
  if (head !== expected) throw new Error(`Source HEAD differs: expected ${expected}; received ${head}.`);
  if (git(['status', '--porcelain'])) throw new Error('Sheet collaboration requires a clean source checkout.');
  const transportEntries = mode === 'peer' ? ['peer-session.ts'] : ['durable-session.ts', 'outbox.ts'];
  for (const file of ['index.html', 'main.ts', ...transportEntries]) {
    if (!existsSync(resolve(preview, file))) throw new Error(`Sheet preview entry is not ready: ${file}. No server started.`);
  }

  const fromRepository = createRequire(resolve(repository, 'package.json'));
  const fromExperiment = createRequire(resolve(root, 'package.json'));
  const vitePackage = fromRepository.resolve('vite/package.json');
  const yjsPackage = fromExperiment.resolve('yjs/package.json');
  const viteVersion = JSON.parse(readFileSync(vitePackage, 'utf8')).version;
  const yjsVersion = JSON.parse(readFileSync(yjsPackage, 'utf8')).version;
  if (viteVersion !== '5.4.21' || yjsVersion !== '13.6.29') {
    throw new Error(`Frozen dependencies differ: Vite ${viteVersion}; Yjs ${yjsVersion}. Do not install a replacement.`);
  }
  const binding = {
    owner: 'Execute Integration #522', issue: 533, mode,
    sourceHead: head, sourceTree: git(['rev-parse', 'HEAD^{tree}']), sourceRoot: repository,
    entry: resolve(preview, 'index.html'), pid: process.pid,
    node: process.versions.node, vite: viteVersion, yjs: yjsVersion,
    storage: mode === 'peer' ? 'session-only' : 'controlled-relay', peerReceiptIsDurable: false,
    relay: mode === 'durable' ? 'http://127.0.0.1:55265' : null,
  };
  if (check) {
    console.log(JSON.stringify({ status: 'Source and entry checks passed; no server started', ...binding }));
    return;
  }

  const { createServer } = await import(pathToFileURL(resolve(dirname(vitePackage), 'dist/node/index.js')).href);
  const server = await createServer({
    configFile: false, root: preview, publicDir: false,
    cacheDir: resolve(root, '.cache/sheet-collaboration'),
    plugins: [browserBoundary(), {
      name: 'sheet-collaboration-mode',
      transformIndexHtml() {
        return [{ tag: 'meta', attrs: { name: 'sheet-collaboration-mode', content: mode }, injectTo: 'head-prepend' }];
      },
    }],
    optimizeDeps: { entries: [resolve(preview, 'index.html')] },
    server: {
      host: '127.0.0.1', port, strictPort: true,
      fs: { strict: true, allow: [root, dirname(vitePackage)] },
      proxy: mode === 'durable' ? {
        '/api/sheet-relay/v1': { target: 'http://127.0.0.1:55265', changeOrigin: true },
      } : undefined,
    },
    logLevel: 'warn',
  });
  let closing;
  const close = () => closing ??= server.close();
  const stop = () => { void close().catch(error => { console.error(error); process.exitCode = 1; }); };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    await server.listen();
    console.log(JSON.stringify({ status: 'Sheet collaboration listening', url: `http://127.0.0.1:${port}/`, ...binding }));
  } catch (error) {
    await close();
    throw error;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => { console.error(error); process.exitCode = 1; });
}
