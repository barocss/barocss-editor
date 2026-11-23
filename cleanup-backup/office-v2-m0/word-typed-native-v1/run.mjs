import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import assert from 'node:assert/strict';

const directory = dirname(fileURLToPath(import.meta.url));
const predata = JSON.parse(await readFile(directory + '/predata.json', 'utf8'));
const root = predata.root;
const require = createRequire(root + '/package.json');
const { createServer } = require('vite');
const { chromium } = require('playwright');
assert.equal(process.version, 'v22.22.0');
assert.equal(require('playwright/package.json').version, '1.58.0');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const receipt = { schema: 'm0/word-native-typed-count-v1', startedUTC: new Date().toISOString(),
  predataSHA256: sha(await readFile(directory + '/predata.json')), root, head: git('rev-parse', 'HEAD'),
  tree: git('rev-parse', 'HEAD^{tree}'), status: 'PREPARING', stages: [], moduleResponses: [],
  fontFailures: [], consoleErrors: [], pageErrors: [], nativeCyclesAttempted: 0,
  runtime: { node: process.version, executable: process.execPath, platform: process.platform,
    architecture: process.arch, argv: process.execArgv, pid: process.pid,
    playwright: require('playwright/package.json').version, vite: require('vite/package.json').version } };
let browser, context, server;
const pendingResponses = [];
async function persist(stage, detail) {
  receipt.stages.push({ stage, at: new Date().toISOString(), ...(detail ?? {}) });
  await writeFile(directory + '/receipt.json', JSON.stringify(receipt, null, 2) + '\n');
  console.log(stage);
}
async function verifyBindings() {
  assert.equal(git('rev-parse', 'HEAD'), predata.head);
  for (const row of predata.sourceBindings) assert.equal(sha(await readFile(root + '/' + row.path)), row.sha256, row.path);
  for (const row of predata.probeBindings) assert.equal(sha(await readFile(directory + '/' + row.path)), row.sha256, row.path);
  assert.equal(git('diff', predata.productionBase, 'HEAD', '--', 'apps/word', 'packages'), '');
  assert.equal(git('status', '--porcelain'), '');
}
async function run() {
  await verifyBindings();
  await persist('fixed-source-and-probe-verified');
  server = await createServer({ configFile: directory + '/vite.config.mjs', logLevel: 'warn' });
  await server.listen();
  await persist('owned-vite55261-listening', { producerPID: process.pid });
  browser = await chromium.launch({ headless: true, executablePath: predata.chromiumExecutable });
  receipt.browser = await browser.version();
  context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('pageerror', error => receipt.pageErrors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') receipt.consoleErrors.push(message.text()); });
  page.on('requestfailed', request => { if (/katex.*\/fonts\//i.test(request.url())) receipt.fontFailures.push({ url: request.url(), error: request.failure() }); });
  page.on('response', response => {
    const url = response.url();
    if (/katex.*\/fonts\//i.test(url) && !response.ok()) receipt.fontFailures.push({ url, status: response.status() });
    if (/\.(?:[cm]?[jt]sx?)(?:\?|$)/.test(url)) pendingResponses.push((async () => {
      const row = { url, status: response.status() };
      try { row.sha256 = sha(await response.body()); } catch (error) { row.readFailure = String(error); }
      receipt.moduleResponses.push(row);
    })());
  });
  await page.goto('http://127.0.0.1:55261/?sample', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(async () => {
    await document.fonts.ready;
    return window.editor && window.editorView && window.wordPrintPages && window.wordLayout?.size > 0;
  }, null, { timeout: 20000 });
  receipt.layout = await page.evaluate(async () => {
    let prior = '', same = 0;
    for (let round = 0; round < 300; round++) {
      await new Promise(resolve => requestAnimationFrame(resolve));
      const view = window.editorView;
      const signature = JSON.stringify([...window.wordLayout].map(([id, l]) => [id, l.pages.length, l.totalHeight]));
      const count = document.querySelectorAll('#editor .w-sheet').length;
      const finished = !view._contentRenderPending && !view._isRendering && !view._runningLayoutPasses && view._modelDrivenRenders === 0;
      same = signature === prior && count > 0 && finished ? same + 1 : 0;
      prior = signature;
      if (same >= 3) return { sheets: count, signature, sourceRoots: document.querySelectorAll('.w-document').length };
    }
    throw new Error('Actual normal sample did not settle within300frames');
  });
  await page.locator('#editor .w-paragraph').first().click({ timeout: 5000 });
  await page.waitForFunction(() => window.editor.selection?.type === 'range', null, { timeout: 5000 });
  receipt.environment = await page.evaluate(() => ({
    fonts: [...document.fonts].filter(face => face.family.includes('KaTeX')).map(face => ({ family: face.family, status: face.status })),
    nativeCapability: typeof Element.prototype.computedStyleMap,
    printPagesBefore: document.querySelectorAll('.w-print-pages').length,
    nativeSelectionType: window.editor.selection?.type,
    sampleURL: location.href,
    directBoundaryExpected: 1 + [...document.querySelector('.w-document').children].filter(e => e.matches('.w-surface')).length
  }));
  assert.equal(receipt.environment.nativeCapability, 'function');
  assert.equal(receipt.environment.printPagesBefore, 0);
  assert(receipt.environment.fonts.some(f => f.status === 'loaded'), 'Actual KaTeX loaded');
  assert(receipt.environment.fonts.every(f => f.status !== 'error'));
  await persist('actual-normal-sample-ready-before-only-print-cycle');
  const moduleURL = 'http://127.0.0.1:55261/@fs' + directory + '/probe.mjs';
  receipt.nativeCyclesAttempted++;
  await persist('single-print-cycle-started-no-retry');
  receipt.probe = await page.evaluate(async url => {
    const module = await import(url);
    return await module.runWordPrintCallProbe(window);
  }, moduleURL);
  await persist('single-print-cycle-returned');
  await Promise.allSettled(pendingResponses);
  assert.equal(receipt.probe.eventCounts.beforeprint, 1);
  assert.equal(receipt.probe.eventCounts.afterprint, 1);
  assert.equal(receipt.probe.directBuildCallsByProbe, 0);
  assert.equal(receipt.probe.failure, null);
  assert.equal(receipt.probe.listenerErrors, 0);
  assert.equal(receipt.probe.observation.descriptorRestored, true);
  assert.equal(receipt.probe.observation.observationErrors, 0);
  assert.equal(receipt.probe.observation.nativeThrows, 0);
  for (const [name, result] of Object.entries(receipt.probe.comparisons)) assert.equal(result, true, name);
  assert.equal(receipt.fontFailures.length, 0);
  assert.equal(receipt.pageErrors.length, 0);
  assert.equal(receipt.consoleErrors.length, 0);
  assert(receipt.moduleResponses.some(r => /office-word\/src\/print-pages\.ts/.test(r.url) && r.status === 200), 'Actual pinned print source loaded');
  await verifyBindings();
  receipt.status = 'PASS one native call-work diagnostic; no RSS inference';
}
const timer = setTimeout(() => {
  receipt.deadlineExceeded = true;
  void browser?.close();
  void server?.close();
}, 90000);
try { await run(); }
catch (error) { receipt.status = 'FAIL preserved first attempt'; receipt.failure = { message: String(error), stack: error.stack }; process.exitCode = 1; }
finally {
  clearTimeout(timer);
  try { await context?.close(); await browser?.close(); receipt.browserClosed = true; } catch (error) { receipt.browserCleanupFailure = String(error); }
  try { await server?.close(); receipt.ownedServerClosed = true; } catch (error) { receipt.serverCleanupFailure = String(error); }
  receipt.completedUTC = new Date().toISOString();
  await persist('cleanup-finished');
  console.log(JSON.stringify({ status: receipt.status, nativeCyclesAttempted: receipt.nativeCyclesAttempted, calls: receipt.probe?.observation?.calls, failure: receipt.failure?.message }));
}
