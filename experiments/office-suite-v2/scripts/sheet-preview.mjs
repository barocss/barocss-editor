import { existsSync, readFileSync } from 'node:fs';
import { builtinModules, createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { requireRuntime, root } from './paths.mjs';

const repository = resolve(root, '../..');
const preview = resolve(root, 'preview/sheet');
const port = 55263;
const builtins = new Set(builtinModules.map(name => name.replace(/^node:/, '')));

export function browserBoundary() {
  const reject = id => {
    const clean = id.split('?')[0].replaceAll('\\', '/');
    if (clean.startsWith('node:') || builtins.has(clean) || /(?:^|\/)durable-store(?:\.[cm]?[jt]s)?$/.test(clean)) {
      throw new Error(`Sheet preview cannot load a Node storage/runtime module: ${id}`);
    }
  };
  return {
    name: 'sheet-preview-browser-boundary',
    enforce: 'pre',
    resolveId(id) { reject(id); return null; },
    load(id) { reject(id); return null; },
  };
}

async function main(args) {
  requireRuntime();
  if (args.length === 1 && args[0] === '--help') {
    console.log('node scripts/sheet-preview.mjs --source-head <40-character commit> [--check]');
    console.log('Serves preview/sheet/index.html on http://127.0.0.1:55263/. Session-only; no durable storage.');
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
  if (git(['status', '--porcelain'])) throw new Error('Sheet preview requires a clean source checkout.');
  for (const file of ['index.html', 'main.ts']) {
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
    owner: 'Execute Integration #522', issue: 533,
    sourceHead: head, sourceTree: git(['rev-parse', 'HEAD^{tree}']), sourceRoot: repository,
    entry: resolve(preview, 'index.html'), pid: process.pid,
    node: process.versions.node, vite: viteVersion, yjs: yjsVersion,
    sessionOnly: true, durableOrSynced: false,
  };
  if (check) {
    console.log(JSON.stringify({ status: 'Source and entry checks passed; no server started', ...binding }));
    return;
  }

  const { createServer } = await import(pathToFileURL(resolve(dirname(vitePackage), 'dist/node/index.js')).href);
  const server = await createServer({
    configFile: false, root: preview, publicDir: false,
    cacheDir: resolve(root, '.cache/sheet-preview'),
    plugins: [browserBoundary()],
    optimizeDeps: { entries: [resolve(preview, 'index.html')] },
    server: { host: '127.0.0.1', port, strictPort: true, fs: { strict: true, allow: [root, dirname(vitePackage)] } },
    logLevel: 'warn',
  });
  let closing;
  const close = () => closing ??= server.close();
  const stop = () => { void close().catch(error => { console.error(error); process.exitCode = 1; }); };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    await server.listen();
    console.log(JSON.stringify({ status: 'Sheet preview listening', url: `http://127.0.0.1:${port}/`, ...binding }));
  } catch (error) {
    await close();
    throw error;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => { console.error(error); process.exitCode = 1; });
}
