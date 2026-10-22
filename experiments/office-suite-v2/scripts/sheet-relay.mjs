import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { requireRuntime, root } from './paths.mjs';

const repository = resolve(root, '../..');
const entry = resolve(root, 'relay/sheet/index.ts');
const port = 55265;

async function main(args) {
  requireRuntime();
  if (args.length === 1 && args[0] === '--help') {
    console.log('node --experimental-strip-types scripts/sheet-relay.mjs --source-head <40-character commit> (--create | --resume <owned-directory>) [--check]');
    console.log('Controlled loopback SQLite relay on http://127.0.0.1:55265/. Closing retains the owned directory. Resume never creates a replacement document.');
    return;
  }
  let expected;
  let create = false;
  let directory;
  let check = false;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--source-head' && expected === undefined) expected = args[++index];
    else if (arg === '--create' && !create) create = true;
    else if (arg === '--resume' && directory === undefined) directory = args[++index];
    else if (arg === '--check' && !check) check = true;
    else throw new Error(`Unknown or repeated option: ${arg}`);
  }
  if (!/^[a-f0-9]{40}$/.test(expected ?? '')) throw new Error('An exact --source-head commit is required.');
  if (create === (directory !== undefined) || (directory !== undefined && !directory.trim())) {
    throw new Error('Choose exactly one of --create or --resume <owned-directory>.');
  }
  const git = argv => execFileSync('git', argv, { cwd: repository, encoding: 'utf8' }).trim();
  const head = git(['rev-parse', 'HEAD']);
  if (head !== expected) throw new Error(`Source HEAD differs: expected ${expected}; received ${head}.`);
  if (git(['status', '--porcelain'])) throw new Error('Sheet relay requires a clean source checkout.');
  if (!existsSync(entry)) throw new Error('Sheet relay entry is not ready. No service or directory created.');
  const fromExperiment = createRequire(resolve(root, 'package.json'));
  const yjsVersion = JSON.parse(readFileSync(fromExperiment.resolve('yjs/package.json'), 'utf8')).version;
  if (yjsVersion !== '13.6.29') throw new Error(`Frozen Yjs differs: ${yjsVersion}. Do not install a replacement.`);
  const binding = {
    owner: 'Execute Integration #522', issue: 534, startup: create ? 'create' : 'resume',
    sourceHead: head, sourceTree: git(['rev-parse', 'HEAD^{tree}']), sourceRoot: repository,
    node: process.versions.node, yjs: yjsVersion, pid: process.pid, controlled: true,
  };
  if (check) {
    console.log(JSON.stringify({ status: 'Source and entry checks passed; no service or directory created', ...binding }));
    return;
  }

  const { SheetRelayService, startSheetRelay } = await import(pathToFileURL(entry).href);
  const service = create ? SheetRelayService.create() : SheetRelayService.resume(resolve(directory));
  console.log(JSON.stringify({ status: 'Owned Sheet storage opened', storage: service.binding(), ...binding }));
  let listener;
  let closing;
  const close = () => closing ??= (async () => {
    try { if (listener) await listener.close(); }
    finally { service.close(); }
  })();
  const stop = () => { void close().catch(error => { console.error(error); process.exitCode = 1; }); };
  try {
    listener = await startSheetRelay({ service, port, allowedOrigins: ['http://127.0.0.1:55264'] });
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    console.log(JSON.stringify({ status: 'Sheet relay listening', url: listener.url, storage: service.binding(), ...binding }));
  } catch (error) {
    await close();
    throw error;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => { console.error(error); process.exitCode = 1; });
}
