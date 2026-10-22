import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createInterface } from 'node:readline';
import { requireRuntime, root } from './paths.mjs';

const repository = resolve(root, '../..');
const entry = resolve(root, 'relay/sheet/index.ts');
const port = 55265;

/** Trusted local fixture control. This is not an HTTP or browser authority API. */
export function createRelayOperatorControl(service, { controlledAuthority = true } = {}) {
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  const emit = value => console.log(JSON.stringify(value));
  const id = value => typeof value === 'string' && /^[A-Za-z0-9-]{1,128}$/.test(value);
  const credential = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
  const hash = value => createHash('sha256').update(value).digest('hex');
  let armed;
  let held;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    armed = undefined;
    held?.finish(new Error('operator-control-closed'));
    lines.close();
    process.stdin.pause();
  };
  const holdAppendAck = (metadata, signal) => {
    if (closed || !armed || (armed.updateId && armed.updateId !== metadata.receipt.updateId)) return Promise.resolve();
    if (held) return Promise.reject(new Error('operator-hold-already-active'));
    const hold = armed;
    armed = undefined;
    return new Promise((resolveHeld, rejectHeld) => {
      const abort = () => finish(new Error('operator-hold-aborted'));
      const finish = error => {
        if (held?.holdId !== hold.holdId) return;
        held = undefined;
        signal.removeEventListener('abort', abort);
        if (error) rejectHeld(error); else resolveHeld();
      };
      held = { holdId: hold.holdId, finish };
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) { abort(); return; }
      const receipt = metadata.receipt;
      emit({ status: 'ack-held-after-commit', holdId: hold.holdId, requestId: metadata.requestId,
        updateId: receipt.updateId, sha256: receipt.sha256, sequence: receipt.sequence,
        frontierSha256: hash(Buffer.from(receipt.frontierBase64, 'base64')),
        contextSha256: hash(JSON.stringify(receipt.context)), admissionSha256: hash(JSON.stringify(receipt.admission)) });
    });
  };
  let work = Promise.resolve();
  lines.on('line', line => {
    work = work.then(async () => {
      let request;
      try {
        if (closed || Buffer.byteLength(line) > 8192) throw new Error('invalid-operator-request');
        request = JSON.parse(line);
        if (!request || typeof request !== 'object' || Array.isArray(request) || !id(request.id)) throw new Error('invalid-operator-request');
        const allowed = ['id', 'action'];
        if (request.action === 'set-access') allowed.push('credential', 'access');
        else if (request.action === 'revoke') allowed.push('credential');
        else if (request.action === 'hold-ack') allowed.push('updateId');
        else if (request.action === 'release-ack' || request.action === 'drop-ack') allowed.push('holdId');
        else if (request.action !== 'binding') throw new Error('invalid-operator-action');
        if (Object.keys(request).some(key => !allowed.includes(key))) throw new Error('invalid-operator-field');
        if (request.action === 'set-access' || request.action === 'revoke') {
          if (!controlledAuthority) throw new Error('controlled-authority-unavailable');
          if (!credential(request.credential)) throw new Error('invalid-operator-credential');
          if (request.action === 'set-access') {
            if (request.access !== 'read-only' && request.access !== 'read-write') throw new Error('invalid-operator-access');
            await service.setSessionAccess(request.credential, request.access);
          } else await service.revokeSession(request.credential);
        } else if (request.action === 'hold-ack') {
          if (armed || (request.updateId !== undefined && !id(request.updateId))) throw new Error('invalid-operator-hold');
          armed = { holdId: request.id, updateId: request.updateId };
        } else if (request.action === 'release-ack' || request.action === 'drop-ack') {
          if (!id(request.holdId) || held?.holdId !== request.holdId) throw new Error('operator-hold-not-found');
          held.finish(request.action === 'drop-ack' ? new Error('controlled-ack-loss-after-commit') : undefined);
        }
        emit({ status: 'operator-result', operatorId: request.id, action: request.action, result: 'ok',
          ...(request.action === 'binding' ? { storage: service.binding() } : {}) });
      } catch {
        // Never echo input, credentials or JSON parser excerpts.
        emit({ status: 'operator-result', operatorId: id(request?.id) ? request.id : null,
          result: 'rejected', code: 'operator-command-refused' });
      }
    });
  });
  lines.once('close', close);
  return { holdAppendAck, close };
}

async function main(args) {
  requireRuntime();
  if (args.length === 1 && args[0] === '--help') {
    console.log('node --experimental-strip-types scripts/sheet-relay.mjs --source-head <40-character commit> (--create | --resume <owned-directory>) [--operator-stdin] [--check]');
    console.log('Controlled local WebSocket/SQLite relay on http://127.0.0.1:55265/ for UI55266. Closing retains storage. Optional private stdin controls are fixture authority, not production account authentication.');
    return;
  }
  let expected;
  let create = false;
  let directory;
  let check = false;
  let operator = false;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--source-head' && expected === undefined) expected = args[++index];
    else if (arg === '--create' && !create) create = true;
    else if (arg === '--resume' && directory === undefined) directory = args[++index];
    else if (arg === '--check' && !check) check = true;
    else if (arg === '--operator-stdin' && !operator) operator = true;
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
  const wsVersion = JSON.parse(readFileSync(fromExperiment.resolve('ws/package.json'), 'utf8')).version;
  if (yjsVersion !== '13.6.29' || wsVersion !== '8.22.0') throw new Error('Frozen Yjs/WebSocket versions differ. Do not install a replacement.');
  const binding = {
    owner: 'Execute Integration #522', issue: 534, startup: create ? 'create' : 'resume',
    sourceHead: head, sourceTree: git(['rev-parse', 'HEAD^{tree}']), sourceRoot: repository,
    node: process.versions.node, yjs: yjsVersion, ws: wsVersion, pid: process.pid, controlled: true,
    operatorControl: operator ? 'private-stdin' : 'off', authorization: 'controlled-local',
  };
  if (check) {
    console.log(JSON.stringify({ status: 'Source and entry checks passed; no service or directory created', ...binding }));
    return;
  }

  const { SheetRelayService, startSheetRelay } = await import(pathToFileURL(entry).href);
  const service = create ? SheetRelayService.create() : SheetRelayService.resume(resolve(directory));
  console.log(JSON.stringify({ status: 'Owned Sheet storage opened', storage: service.binding(), ...binding }));
  const controls = operator ? createRelayOperatorControl(service) : undefined;
  let listener;
  let closing;
  const close = () => closing ??= (async () => {
    controls?.close();
    try { if (listener) await listener.close(); }
    finally { service.close(); }
  })();
  const stop = () => { void close().catch(error => { console.error(error); process.exitCode = 1; }); };
  try {
    listener = await startSheetRelay({ service, port, allowedOrigins: ['http://127.0.0.1:55266'],
      ...(controls ? { holdAppendAck: controls.holdAppendAck } : {}) });
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
