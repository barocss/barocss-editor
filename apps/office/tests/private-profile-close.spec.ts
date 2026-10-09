import { spawnSync } from 'node:child_process';
import { chmodSync, lstatSync, mkdtempSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { expect, test, type BrowserContext, type Page, type Request } from '@playwright/test';
import { launchPrivateProfile, stopPrivateProfile } from './helpers/real-recovery-control';

// Integration supplies this private root and runs the real browser cases serially.
const evidenceRoot = process.env.OFFICE_PRIVATE_PROFILE_CLOSE_EVIDENCE_ROOT;
test.skip(!evidenceRoot, 'An explicit private profile close evidence root is required.');

type Scenario = 'blank-default' | 'populated-local-html';
type PidState = {
  pid: number;
  state: 'present' | 'absent' | 'unconfirmed';
  uid: number | null;
  startedAt: string | null;
  ownedByRunner: boolean | null;
};
type Event = { at: string; kind: string; page?: number; request?: number; resourceType?: string; status?: number; dialogType?: string; dialogAction?: string };
type Snapshot = { at: string; pageCount: number | null; browserConnected: boolean | null; process: PidState };
type Report = {
  scenario: Scenario;
  status: 'incomplete' | 'passed' | 'failed';
  startedAt: string;
  defaultPageCount: number | null;
  beforeClose: Snapshot | null;
  afterClose: Snapshot | null;
  preparationErrorCode?: string;
  close: { startedAt: string | null; settledAt: string | null; outcome: 'not-started' | 'resolved' | 'rejected'; errorCode?: string };
  events: Event[];
  eventOverflowCount: number;
};

function now(): string { return new Date().toISOString(); }

function pidState(pid: number): PidState {
  // Observe the exact launcher PID. No process signal is sent by this spec.
  const result = spawnSync('ps', ['-o', 'uid=', '-o', 'lstart=', '-p', String(pid)],
    { encoding: 'utf8', timeout: 5000 });
  const output = result.stdout?.trim() ?? '';
  if (!result.error && result.status === 1 && output === '') {
    return { pid, state: 'absent', uid: null, startedAt: null, ownedByRunner: null };
  }
  const match = result.status === 0 && !result.error ? output.match(/^(\d+)\s+(.+)$/) : null;
  if (!match) return { pid, state: 'unconfirmed', uid: null, startedAt: null, ownedByRunner: null };
  const uid = Number(match[1]);
  return { pid, state: 'present', uid, startedAt: match[2], ownedByRunner: uid === process.getuid?.() };
}

function snapshot(context: BrowserContext, pid: number): Snapshot {
  let pageCount: number | null = null, browserConnected: boolean | null = null;
  try { pageCount = context.pages().length; } catch { /* The context may already be closed. */ }
  try { browserConnected = context.browser()?.isConnected() ?? null; } catch { /* The browser may have disconnected. */ }
  return { at: now(), pageCount, browserConnected, process: pidState(pid) };
}

function errorCode(error: unknown): string {
  if (error instanceof Error && /^(private_browser_close_timeout|private_browser_process_still_running|private_browser_process_unconfirmed)$/.test(error.message)) {
    return error.message;
  }
  return 'unexpected_error';
}

function observe(context: BrowserContext, report: Report, checkpoint: () => void): void {
  const seenPages = new WeakSet<Page>(), requests = new WeakMap<Request, number>();
  let nextPage = 0, nextRequest = 0;
  const record = (event: Omit<Event, 'at'>) => {
    if (report.events.length < 200) report.events.push({ at: now(), ...event });
    else report.eventOverflowCount++;
    checkpoint();
  };
  const requestNumber = (request: Request) => {
    let number = requests.get(request);
    if (number === undefined) { number = ++nextRequest; requests.set(request, number); }
    return number;
  };
  const attachPage = (page: Page) => {
    if (seenPages.has(page)) return;
    seenPages.add(page);
    const number = ++nextPage;
    record({ kind: 'page-observed', page: number });
    page.on('close', () => record({ kind: 'page-close', page: number }));
    page.on('dialog', dialog => {
      const beforeUnload = dialog.type() === 'beforeunload';
      record({ kind: 'dialog', page: number, dialogType: dialog.type(),
        dialogAction: beforeUnload ? 'default-accept-beforeunload' : 'default-dismiss' });
      // Match Playwright 1.58's no-listener default. Any dialog still fails this controlled diagnostic.
      const settle = beforeUnload ? dialog.accept() : dialog.dismiss();
      void settle.catch(() => record({ kind: 'dialog-default-action-rejected', page: number }));
    });
  };
  context.pages().forEach(attachPage);
  context.on('page', attachPage);
  context.on('close', () => record({ kind: 'context-close' }));
  const browser = context.browser();
  if (browser) browser.on('disconnected', () => record({ kind: 'browser-disconnected' }));
  else record({ kind: 'browser-handle-unavailable' });
  context.on('request', request => record({ kind: 'request', request: requestNumber(request), resourceType: request.resourceType() }));
  context.on('response', response => record({ kind: 'response', request: requestNumber(response.request()), status: response.status() }));
  context.on('requestfinished', request => record({ kind: 'request-finished', request: requestNumber(request) }));
  context.on('requestfailed', request => record({ kind: 'request-failed', request: requestNumber(request) }));
}

async function populateLocalHtml(context: BrowserContext): Promise<void> {
  const page = await context.newPage();
  await page.route('http://127.0.0.1:51999/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/close-probe.svg') {
      return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1" />' });
    }
    if (path === '/close-probe') {
      return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Local close probe</title><main><h1>Local close probe</h1><p>Owned browser lifecycle.</p><img src="/close-probe.svg" alt="local pixel"></main>' });
    }
    return route.abort();
  });
  await page.goto('http://127.0.0.1:51999/close-probe');
  await expect(page.getByRole('heading', { name: 'Local close probe' })).toBeVisible();
  await page.waitForLoadState('load');
}

async function runScenario(scenario: Scenario): Promise<void> {
  // This outer budget only allows the helper's existing launch/close limits to settle.
  test.setTimeout(90_000);
  if (!evidenceRoot || !isAbsolute(evidenceRoot)) throw new Error('private_close_evidence_root_required');
  const root = lstatSync(evidenceRoot);
  if (!root.isDirectory() || root.uid !== process.getuid?.() || (root.mode & 0o022) !== 0) {
    throw new Error('private_close_evidence_root_unsafe');
  }
  const directory = mkdtempSync(join(evidenceRoot, 'private-profile-close-0700-'));
  chmodSync(directory, 0o700);
  const runDirectory = lstatSync(directory);
  if (!runDirectory.isDirectory() || runDirectory.uid !== process.getuid?.() || (runDirectory.mode & 0o777) !== 0o700) {
    throw new Error('private_close_run_directory_unsafe');
  }
  const reportPath = join(directory, 'result.json');
  const report: Report = {
    scenario, status: 'incomplete', startedAt: now(), defaultPageCount: null,
    beforeClose: null, afterClose: null,
    close: { startedAt: null, settledAt: null, outcome: 'not-started' }, events: [], eventOverflowCount: 0,
  };
  const checkpoint = () => writeFileSync(reportPath, JSON.stringify(report, null, 2), { mode: 0o600 });
  checkpoint();

  // Preserve the original stop rejection. Never delete a profile after an uncertain close.
  let profile: Awaited<ReturnType<typeof launchPrivateProfile>>;
  try { profile = await launchPrivateProfile(join(directory, 'profile')); }
  catch (error) {
    report.status = 'failed';
    report.close.errorCode = errorCode(error);
    checkpoint();
    throw error;
  }
  const { context, pid } = profile;
  let preparationError: unknown;
  try {
    observe(context, report, checkpoint);
    report.defaultPageCount = context.pages().length;
    checkpoint();
    if (scenario === 'populated-local-html') {
      await populateLocalHtml(context);
      if (!report.events.some(event => event.kind === 'request') ||
        !report.events.some(event => event.kind === 'request-finished')) {
        throw new Error('local_request_lifecycle_unconfirmed');
      }
    }
    report.beforeClose = snapshot(context, pid);
    checkpoint();
    if (report.beforeClose.process.state !== 'present' || report.beforeClose.process.ownedByRunner !== true) {
      throw new Error('private_browser_process_unconfirmed');
    }
  } catch (error) {
    preparationError = error;
    report.preparationErrorCode = errorCode(error);
    checkpoint();
  }

  report.close.startedAt = now();
  checkpoint();
  let closeError: unknown;
  try { await stopPrivateProfile(context, pid); report.close.outcome = 'resolved'; }
  catch (error) { closeError = error; report.close.outcome = 'rejected'; report.close.errorCode = errorCode(error); }
  report.close.settledAt = now();
  report.afterClose = snapshot(context, pid);
  const contextClosed = report.events.some(event => event.kind === 'context-close');
  const unexpectedDialog = report.events.some(event => event.kind === 'dialog');
  report.status = preparationError || closeError || report.afterClose.process.state !== 'absent' || !contextClosed ||
    unexpectedDialog || report.eventOverflowCount > 0 ? 'failed' : 'passed';
  checkpoint();
  if (closeError) throw closeError;
  if (preparationError) throw preparationError;
  if (report.afterClose.process.state !== 'absent') throw new Error('private_browser_process_unconfirmed');
  if (!contextClosed) throw new Error('private_browser_context_close_unconfirmed');
  if (unexpectedDialog) throw new Error('private_close_unexpected_dialog');
  if (report.eventOverflowCount > 0) throw new Error('private_close_event_coverage_overflow');
}

test('private profile close: blank default page', async () => runScenario('blank-default'));
test('private profile close: populated local HTML page', async () => runScenario('populated-local-html'));
