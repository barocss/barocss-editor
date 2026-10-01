import { execFile } from 'node:child_process';
import { lstatSync, mkdirSync, readFileSync } from 'node:fs';
import { connect } from 'node:net';
import { dirname, isAbsolute, resolve } from 'node:path';
import { promisify } from 'node:util';
import { chromium, type BrowserContext } from '@playwright/test';

export interface RealStatus {
  databaseGeneration: string;
  databaseRunning: boolean;
  databaseIdentity: string;
  postgresPid: number | null;
  supervisorPid: number;
  apiPid: number | null;
  apiRunning: boolean;
  tenantId: string;
  workspaceId: string;
  betaTenantId: string;
  betaWorkspaceId: string;
}

export interface Inspection<Product extends 'note' | 'word' | 'slides' = 'note'> extends RealStatus {
  documentCount: number;
  receiptCount: number;
  document: {
    documentId: string;
    pageId: Product extends 'note' ? string : null;
    title: string;
    product: string;
    tenantId: string;
    workspaceId: string;
    metadataRevision: number;
    mode: 'snapshot' | 'initializing' | 'collaborative';
    revision: number;
    snapshotHash: string;
    snapshotText: string;
    canonicalTree: unknown;
    canonicalTreeHash: string;
  } | null;
  receipt: {
    operation: 'create' | 'update' | 'metadata';
    idempotencyKey: string;
    requestHash: string;
    documentId: string;
    document: { revision: number; pageId: Product extends 'note' ? string : null; snapshotHash: string; [key: string]: unknown };
    snapshotText: string | null;
  } | null;
}

function privateSocket(): string {
  const path = process.env.OFFICE_AUTH_CONTROL_FILE;
  if (!path || !isAbsolute(path)) throw new Error('private_control_unavailable');
  try {
    const file = lstatSync(path), parent = lstatSync(dirname(path));
    if (!file.isFile() || file.uid !== process.getuid?.() || (file.mode & 0o777) !== 0o600 ||
      !parent.isDirectory() || parent.uid !== process.getuid?.() || (parent.mode & 0o777) !== 0o700) {
      throw new Error('unsafe');
    }
    const descriptor = JSON.parse(readFileSync(path, 'utf8')) as { socketPath?: unknown };
    if (typeof descriptor.socketPath !== 'string' || !isAbsolute(descriptor.socketPath)) throw new Error('unsafe');
    const socket = lstatSync(descriptor.socketPath), directory = lstatSync(dirname(descriptor.socketPath));
    if (!socket.isSocket() || socket.uid !== process.getuid?.() || (socket.mode & 0o777) !== 0o600 ||
      !directory.isDirectory() || directory.uid !== process.getuid?.() || (directory.mode & 0o777) !== 0o700) {
      throw new Error('unsafe');
    }
    return descriptor.socketPath;
  } catch { throw new Error('private_control_unavailable'); }
}

/** Responses can contain source bytes. Keep them in assertions, never test logs. */
export async function privateControl<T>(command: Record<string, unknown>): Promise<T> {
  const socketPath = privateSocket();
  return new Promise<T>((resolveResult, reject) => {
    const socket = connect(socketPath);
    socket.setEncoding('utf8');
    let response = '';
    let settled = false;
    const fail = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      socket.destroy();
      reject(new Error('private_control_failed'));
    };
    const timeout = setTimeout(fail, 15000);
    socket.once('error', fail);
    socket.once('close', () => { if (!settled) fail(); });
    socket.once('end', () => { if (!settled) fail(); });
    socket.once('connect', () => {
      try { socket.write(JSON.stringify(command) + '\n'); }
      catch { fail(); }
    });
    socket.on('data', chunk => {
      response += chunk.toString('utf8');
      if (response.length > 4 * 1024 * 1024) { fail(); return; }
      if (!response.includes('\n') || settled) return;
      try {
        const reply = JSON.parse(response) as { ok?: boolean; result?: T };
        if (reply.ok !== true || !Object.hasOwn(reply, 'result')) { fail(); return; }
        settled = true;
        clearTimeout(timeout);
        socket.destroy();
        resolveResult(reply.result as T);
      } catch { fail(); }
    });
  });
}

function exists(pid: number): boolean {
  try { process.kill(pid, 0); return true; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false;
    throw new Error('private_browser_process_unconfirmed');
  }
}

async function profilePid(context: BrowserContext, profilePath: string): Promise<number> {
  const browser = context.browser();
  if (browser) {
    try {
      const session = await browser.newBrowserCDPSession();
      try {
        const info = await session.send('SystemInfo.getProcessInfo');
        const browsers = info.processInfo.filter(entry => entry.type === 'browser');
        if (browsers.length === 1 && Number.isSafeInteger(browsers[0].id) && browsers[0].id > 0 &&
          browsers[0].id !== process.pid && exists(browsers[0].id)) return browsers[0].id;
      } finally { await session.detach(); }
    } catch { /* Persistent contexts can omit a browser-level CDP session. */ }
  }
  const { stdout } = await promisify(execFile)('ps', ['-axo', 'pid=,command='], { timeout: 5000, maxBuffer: 4 * 1024 * 1024 });
  const argument = `--user-data-dir=${profilePath}`;
  const matches = stdout.split('\n').flatMap(line => {
    const parsed = line.trim().match(/^(\d+)\s+(.+)$/);
    if (!parsed || !/chrom(e|ium)/i.test(parsed[2]) || /--type=/.test(parsed[2])) return [];
    const offset = parsed[2].indexOf(argument);
    if (offset < 0 || (offset > 0 && !/\s/.test(parsed[2][offset - 1])) ||
      !/^(?:\s|$)/.test(parsed[2].slice(offset + argument.length))) return [];
    return [Number(parsed[1])];
  });
  if (matches.length !== 1 || !Number.isSafeInteger(matches[0]) || matches[0] <= 0 ||
    matches[0] === process.pid || !exists(matches[0])) throw new Error('private_browser_process_unconfirmed');
  return matches[0];
}

async function bounded<T>(promise: Promise<T>, milliseconds: number, message: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => {
      timeout = setTimeout(() => reject(new Error(message)), milliseconds);
    })]);
  } finally { clearTimeout(timeout); }
}

export async function launchPrivateProfile(profilePath: string): Promise<{ context: BrowserContext; pid: number }> {
  if (!isAbsolute(profilePath)) throw new Error('private_browser_profile_required');
  const path = resolve(profilePath);
  mkdirSync(path, { recursive: true, mode: 0o700 });
  const directory = lstatSync(path);
  if (!directory.isDirectory() || directory.uid !== process.getuid?.() || (directory.mode & 0o777) !== 0o700) {
    throw new Error('private_browser_profile_required');
  }
  const context = await chromium.launchPersistentContext(path, {
    headless: true, viewport: { width: 1440, height: 1000 },
    permissions: ['clipboard-read', 'clipboard-write'], timeout: 15000,
  });
  context.setDefaultTimeout(15_000);
  context.setDefaultNavigationTimeout(30_000);
  try { return { context, pid: await bounded(profilePid(context, path), 10000, 'private_browser_process_unconfirmed') }; }
  catch {
    await bounded(context.close(), 15000, 'private_browser_close_timeout');
    throw new Error('private_browser_process_unconfirmed');
  }
}

export async function stopPrivateProfile(context: BrowserContext, pid: number): Promise<void> {
  if (!Number.isSafeInteger(pid) || pid <= 0 || pid === process.pid) throw new Error('private_browser_process_unconfirmed');
  await bounded(context.close(), 15000, 'private_browser_close_timeout');
  const deadline = Date.now() + 10000;
  while (exists(pid)) {
    if (Date.now() >= deadline) throw new Error('private_browser_process_still_running');
    await new Promise(resolveWait => setTimeout(resolveWait, 100));
  }
}
