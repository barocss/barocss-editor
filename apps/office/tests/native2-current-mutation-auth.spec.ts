import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test, type JSHandle, type Page, type TestInfo } from '@playwright/test';
import { NATIVE_NOTE_FIXTURES } from '../../note/src/native2-scenario-fixtures';
import type { createAuthenticatedNative2Mutation, Native2MutationAttempt, Native2MutationInput,
  Native2Validation, Native2VerifiedReceipt } from '../src/native2-authenticated-mutation';
import type { Native2OriginalUpdate } from '../src/native2-authenticated-receipt-recovery';
import { privateControl, type RealStatus } from './helpers/real-recovery-control';

// Actual private Office session, HTTP APIs and dedicated PostgreSQL. No fabricated response.
// Source/compiled module URLs are bound by Integration to the same AuthApp auth-client chunk.
const origin = process.env.OFFICE_AUTH_ORIGIN ?? 'http://127.0.0.1:5191';
const mutationUrl = new URL(process.env.OFFICE_AUTH_NATIVE2_MUTATION_MODULE_URL ?? '/src/native2-authenticated-mutation.ts', origin).href;
const recoveryUrl = new URL(process.env.OFFICE_AUTH_NATIVE2_RECOVERY_MODULE_URL ?? '/src/native2-authenticated-receipt-recovery.ts', origin).href;
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const files = { A1: NATIVE_NOTE_FIXTURES.SOURCE_A, A2: NATIVE_NOTE_FIXTURES.TARGET_A2, B: NATIVE_NOTE_FIXTURES.SOURCE_B };
const raw = Object.fromEntries(Object.entries(files).map(([key, value]) => [key, JSON.stringify(value, null, 2) + '\n'])) as Record<keyof typeof files, string>;
const expectedHashes = { A1: '50ff9dc77c5fbbeaafeaad597e6ca1622e2f31177bfb71305580eb8a38e9a7f3',
  A2: '3b5aa2461855d017458c4345d98e03c3a66ef69782b1d70ccabf557ef1870300',
  B: '6253f30d80007a297910a88a8377d04388a14f007dffc5dea02ec3cf33b31f90' };
interface Status extends RealStatus {
  schemaPid: number | null; schemaPort: number; fixtureMode: 'mutation';
  schemaPolicy: { readRoles: string[]; preserveRoles: string[]; adoptRoles: string[]; registerRoles: string[] };
  native2: { sourceS: string; targetA: string; targetB: string; corpusEncoding: string };
}
interface State extends Status {
  heads: Array<{ documentId: string; pageId: string; fileVersion: number; revision: number; snapshotHash: string; snapshotText: string }>;
  audit: Record<string, { rows: number; hash: string }>;
  ledger: Record<string, string[]>;
}
interface Held {
  documentId: string; part: 'validation' | 'update'; responseHash: string;
  completion: { method: string; path: string; status: number; bodyHash: string; bodyHashEncoding: string;
    result: unknown; reached: boolean; timing: string };
}
interface HoldStatus { schemaPid: number; armed: boolean; held: Held | null; lastRelease: (Held & { reason: string }) | null }
type Factory = ReturnType<typeof createAuthenticatedNative2Mutation>;
type Context = Awaited<ReturnType<Factory['open']>>;
type Result = { ok: true; value: Native2VerifiedReceipt | Native2Validation } | { ok: false; code: string; status: number | null };
interface Probe { factory: Factory; context: Context; attempt?: Native2MutationAttempt; input?: Native2MutationInput;
  laterDraft?: string; pending?: Promise<Result> }
const state = () => privateControl<State>({ action: 'native2-state' });
const host = (page: Page) => page.locator('[data-server-note-workspace]');
const source = (page: Page) => host(page).locator('.nw-document [data-note-editor]').first();
const head = (value: State, documentId: string) => {
  const found = value.heads.find(one => one.documentId === documentId);
  if (!found) throw new Error('Declared real fixture head required');
  return found;
};

function network(page: Page) {
  const records: Array<{ method: string; path: string; body?: string }> = [];
  let bearer = '', tokenLifetime = 0;
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (!path.startsWith('/api/')) return;
    if (request.headers().authorization) bearer = request.headers().authorization;
    records.push({ method: request.method(), path, ...(request.postData() ? { body: request.postData()! } : {}) });
  });
  page.on('response', response => { if (new URL(response.url()).pathname.endsWith('/protocol/openid-connect/token') && response.ok())
    void response.json().then((value: { expires_in?: number }) => { if (typeof value.expires_in === 'number') tokenLifetime = value.expires_in * 1000; }); });
  return { records, bearer: () => bearer, tokenLifetime: () => tokenLifetime, updates: () => records.filter(one => one.method === 'PUT' && one.path.includes('/note-native2/')) };
}
async function login(page: Page, alias: 'alpha-editor' | 'beta-viewer', status: Status) {
  await page.goto(`${origin}/products/note/?tenant=${status.tenantId}&workspace=${status.workspaceId}&document=${status.native2.sourceS}&product=note`);
  await expect.poll(async () => await host(page).isVisible() || await page.getByRole('button', { name: '일반 사용자로 들어가기', exact: true }).isVisible()).toBe(true);
  if (!(await host(page).isVisible())) {
    await page.getByRole('button', { name: '일반 사용자로 들어가기', exact: true }).click();
    await expect.poll(async () => await host(page).isVisible() || await page.locator('#username').isVisible()).toBe(true);
    if (await page.locator('#username').isVisible()) {
      const fixture = JSON.parse(readFileSync(process.env.OFFICE_AUTH_REAL_FILE!, 'utf8')) as { users: Record<string, { username?: string; password: string }> };
      await page.locator('#username').fill(fixture.users[alias]!.username ?? alias);
      await page.locator('#password').fill(fixture.users[alias]!.password);
      await page.locator('#kc-login').click();
    }
  }
  await expect(host(page)).toBeVisible(); await expect(source(page)).toBeVisible();
  await expect(host(page).locator('[data-save-status]')).toHaveText('서버 저장 확인됨');
}
async function identity(page: Page, records: ReturnType<typeof network>, alias: 'alpha-editor' | 'beta-viewer', status: Status) {
  const response = await page.request.get(`${origin}/api/v1/me`, { headers: { Authorization: records.bearer() } });
  expect(response.status()).toBe(200);
  const value = await response.json() as { issuer: string; subject: string; currentUserId: string; tenants: Array<{ tenantId: string; role: string }> };
  const fixture = JSON.parse(readFileSync(process.env.OFFICE_AUTH_REAL_FILE!, 'utf8')) as { issuer: string; users: Record<string, { id: string }> };
  expect(value.issuer).toBe(fixture.issuer); expect(value.subject).toBe(fixture.users[alias]!.id);
  expect(value.currentUserId).toMatch(/^[a-f0-9-]{36}$/);
  expect(value.tenants.find(one => one.tenantId === status.tenantId)?.role).toBe(alias === 'alpha-editor' ? 'owner' : 'viewer');
  return value;
}
async function probe(page: Page, status: Status, documentId: string): Promise<JSHandle<Probe>> {
  return page.evaluateHandle(async ({ url, scope }) => {
    const module = await import(url) as typeof import('../src/native2-authenticated-mutation');
    const factory = module.createAuthenticatedNative2Mutation();
    const context = await factory.open(scope);
    return { factory, context };
  }, { url: mutationUrl, scope: { tenantId: status.tenantId, workspaceId: status.workspaceId, documentId } });
}
async function prepare(one: JSHandle<Probe>, input: Native2MutationInput) {
  return one.evaluate(async (actual, value) => { actual.input = value; actual.attempt = await actual.context.prepare(value); return actual.attempt; }, input);
}
async function call(one: JSHandle<Probe>, method: 'validateSource' | 'validate' | 'update' | 'recover'): Promise<Result> {
  return one.evaluate(async (actual, kind) => {
    try {
      const value = kind === 'validateSource' ? await actual.context.validateSource() : kind === 'validate' ? await actual.context.validate(actual.attempt!)
        : kind === 'update' ? await actual.context.update(actual.attempt!) : await actual.context.recover(actual.attempt!);
      return { ok: true as const, value };
    } catch (error) {
      const value = error as { code?: string; kind?: string; status?: number };
      return { ok: false as const, code: value.code ?? value.kind ?? 'unknown_error', status: value.status ?? null };
    }
  }, method);
}
function fixedOracle(status: Status, sourceHead: State['heads'][number], sourceRaw: string, input: Native2MutationInput) {
  const selected = (JSON.parse(sourceRaw) as typeof files.A1).schemaBundle.selected;
  const prior = hash(JSON.stringify(['wonffice.note.snapshot-pins.cas.v1', status.tenantId, status.workspaceId,
    sourceHead.documentId, 'pinned', selected.map(one => [one.schemaId, one.version, one.digest])]));
  const expected = { ...input, expectedRevision: sourceHead.revision, expectedSnapshotHash: hash(sourceRaw),
    expectedPriorPinDigest: prior, candidateSnapshotHash: hash(input.snapshotText),
    requestHash: hash(JSON.stringify(['note-native2-snapshot-v1', status.tenantId, status.workspaceId, sourceHead.documentId,
      input.schemaAction, sourceHead.revision, hash(sourceRaw), prior, input.snapshotText])) };
  const body = { schemaAction: input.schemaAction, expectedRevision: sourceHead.revision, expectedSnapshotHash: hash(sourceRaw),
    expectedPriorPinDigest: prior, snapshotText: input.snapshotText, idempotencyKey: input.idempotencyKey };
  return { expected, body, bodyHash: hash(JSON.stringify(body)) };
}
function receiptValue(status: Status, sourceHead: State['heads'][number], expected: ReturnType<typeof fixedOracle>, creator: string) {
  return { operation: 'update', idempotencyKey: expected.expected.idempotencyKey, requestHash: expected.expected.requestHash,
    snapshotText: expected.expected.snapshotText, selectedPinsChanged: expected.expected.schemaAction === 'adopt',
    document: { documentId: sourceHead.documentId, tenantId: status.tenantId, workspaceId: status.workspaceId, product: 'note',
      title: 'Native2 full A', creatorUserId: creator, metadataRevision: 1, mode: 'snapshot', pageId: files.A1.document.attributes.pageId,
      documentKey: `wonffice-${status.tenantId}-${sourceHead.documentId}`, fileFormat: 'barocss-note', fileVersion: 2,
      revision: sourceHead.revision + 1, snapshotHash: expected.expected.candidateSnapshotHash } };
}
function receipt(value: unknown, status: Status, sourceHead: State['heads'][number], expected: ReturnType<typeof fixedOracle>, creator: string) {
  expect(value).toEqual(receiptValue(status, sourceHead, expected, creator));
}
async function arm(documentId: string, part: Held['part']) {
  const value = await privateControl<HoldStatus>({ action: 'native2-hold', documentId, part });
  expect(value.armed).toBe(true); expect(value.held).toBeNull();
}
async function reached(documentId: string, part: Held['part']) {
  let value: HoldStatus | undefined;
  await expect.poll(async () => { value = await privateControl<HoldStatus>({ action: 'native2-held' }); return value.held?.documentId; }, { timeout: 12_000 }).toBe(documentId);
  const held = value!.held!; expect(held.part).toBe(part); expect(held.completion.reached).toBe(true);
  expect(held.completion.status).toBe(200); expect(held.completion.method).toBe(part === 'update' ? 'PUT' : 'POST');
  expect(held.responseHash).toMatch(/^[a-f0-9]{64}$/);
  expect(held.completion.timing).toBe(part === 'update' ? 'after actual service completion and durable commit' : 'after actual service completion');
  return held;
}
async function release(held: Held) {
  const value = await privateControl<HoldStatus>({ action: 'native2-release' });
  expect(value.held).toBeNull(); expect(value.lastRelease).toEqual({ ...held, reason: 'manual' });
}
async function invariantExceptA(before: State, after: State, status: Status, expectedRaw: string, expectedRevision: number) {
  expect(head(after, status.native2.sourceS)).toEqual(head(before, status.native2.sourceS));
  expect(head(after, status.native2.targetB)).toEqual(head(before, status.native2.targetB));
  const rows = (value: State, table: string) => value.ledger[table]!.map(text => JSON.parse(text) as Record<string, unknown>);
  for (const [table, key] of [['documents', 'id'], ['document_snapshots', 'document_id']] as const) {
    const oldRows = rows(before, table), newRows = rows(after, table);
    expect(newRows.filter(one => one[key] !== status.native2.targetA)).toEqual(oldRows.filter(one => one[key] !== status.native2.targetA));
    const old = oldRows.find(one => one[key] === status.native2.targetA), now = newRows.find(one => one[key] === status.native2.targetA);
    if (!old || !now || typeof now.updated_at !== 'string' || typeof old.updated_at !== 'string') throw new Error('Actual complete target ledger/timestamp required');
    expect(Date.parse(now.updated_at)).toBeGreaterThanOrEqual(Date.parse(old.updated_at));
    expect(now).toEqual(table === 'documents' ? { ...old, updated_at: now.updated_at } :
      { ...old, snapshot_text: expectedRaw, snapshot_hash: hash(expectedRaw), file_version: 2, revision: expectedRevision, updated_at: now.updated_at });
  }
  for (const row of before.ledger.document_receipts!) expect(after.ledger.document_receipts).toContain(row);
  const added = rows(after, 'document_receipts').filter(one => !before.ledger.document_receipts!.some(text => JSON.stringify(JSON.parse(text)) === JSON.stringify(one)));
  expect(added).toHaveLength(1); expect(added[0]!.document_id).toBe(status.native2.targetA); expect(added[0]!.operation).toBe('update');
  expect(added[0]!.result_snapshot_text).toBe(expectedRaw); expect(added[0]!.tenant_id).toBe(status.tenantId);
  for (const table of Object.keys(before.audit)) if (!['documents', 'document_snapshots', 'document_receipts'].includes(table)) {
    expect(after.audit[table]).toEqual(before.audit[table]); expect(after.ledger[table]).toEqual(before.ledger[table]);
  }
}
function laterRaw(value: string, suffix: string) {
  const file = JSON.parse(value) as typeof files.A2;
  const first = file.document.content[0]!.content[0]!;
  if (!('text' in first) || typeof first.text !== 'string') throw new Error('Declared first text node required');
  first.text += suffix;
  return JSON.stringify(file, null, 2) + '\n';
}

test.use({ actionTimeout: 15_000, navigationTimeout: 30_000 });
test.beforeAll(async () => {
  if (!process.env.OFFICE_AUTH_REAL_FILE || !process.env.OFFICE_AUTH_CONTROL_FILE || process.env.OFFICE_AUTH_NATIVE2_MUTATION_FIXTURE !== 'true' || process.env.OFFICE_LOCAL_AGENT_ENABLED !== 'false')
    throw new Error('Integration protected actual mutation fixture and explicitly disabled model are required.');
  for (const url of [origin, mutationUrl, recoveryUrl]) if (new URL(url).origin !== new URL(origin).origin || new URL(url).hostname !== '127.0.0.1') throw new Error('Exact same-origin private module binding required');
  for (const key of ['A1', 'A2', 'B'] as const) expect(hash(raw[key])).toBe(expectedHashes[key]);
  expect(files.A1.schemaBundle.selected).toEqual(files.B.schemaBundle.selected);
  expect(files.A1.schemaBundle.selected[0]!.version).toBe(1); expect(files.A2.schemaBundle.selected[0]!.version).toBe(2);
  const value = await privateControl<Status>({ action: 'status' });
  expect(value.fixtureMode).toBe('mutation'); expect(value.apiRunning && value.databaseRunning).toBe(true);
  expect(value.schemaPolicy).toEqual({ readRoles: ['owner', 'editor', 'viewer'], preserveRoles: ['owner', 'editor'], adoptRoles: ['owner', 'editor'], registerRoles: [] });
});

test('current Office native2 validation, one-winner adoption and fixed lost-ACK recovery preserve exact full sources', async ({ page, browser }, info: TestInfo) => {
  test.setTimeout(180_000);
  const status = await privateControl<Status>({ action: 'status' }), records = network(page), phases: Array<Record<string, unknown>> = [];
  const checkpoint = async (name: string, evidence: unknown) => {
    await info.attach(name, { body: JSON.stringify(evidence), contentType: 'application/json' });
  };
  await page.clock.install();
  const probes: JSHandle<Probe>[] = [];
  let betaContext: Awaited<ReturnType<typeof browser.newContext>> | undefined;
  try {
    await login(page, 'alpha-editor', status); const alpha = await identity(page, records, 'alpha-editor', status);
    const initial = await state(); expect(head(initial, status.native2.targetA).snapshotText).toBe(raw.A1); expect(head(initial, status.native2.targetB).snapshotText).toBe(raw.B);
    await checkpoint('initial-current-authority-full-state', { status, alpha, initial, expectedHashes });
    const originalElement = await source(page).elementHandle(); if (!originalElement) throw new Error('Real mounted source required');
    const originalDOM = await source(page).evaluate(el => el.outerHTML);
    const a = await probe(page, status, status.native2.targetA), b = await probe(page, status, status.native2.targetB); probes.push(a, b);
    const observedSources: Record<string, unknown> = {};
    for (const [one, key] of [[a, 'A1'], [b, 'B']] as const) {
      const observed = await one.evaluate(actual => actual.context.source); observedSources[key] = observed;
      const expectedFile = { fileVersion: 2, document: files[key].document, schemaBundle: files[key].schemaBundle,
        ...('savedAt' in files[key] ? { savedAt: files[key].savedAt } : {}) };
      expect(observed.snapshotText).toBe(raw[key]); expect(observed.file).toEqual(expectedFile);
      expect(observed.document.snapshotHash).toBe(expectedHashes[key]); expect(observed.document.creatorUserId).toBe(alpha.currentUserId);
    }
    const input = { snapshotText: raw.A2, schemaAction: 'adopt' as const, idempotencyKey: '503-adopt-A-original' };
    const fixed = fixedOracle(status, head(initial, status.native2.targetA), raw.A1, input);
    expect(await prepare(a, input)).toEqual(fixed.expected);
    const beforeValidation = await state();
    await checkpoint('original-full-sources-fixed-validation-input', { observedSources, input, fixed, beforeValidation });
    const validatedSource = await call(a, 'validateSource'), validatedCandidate = await call(a, 'validate');
    expect(validatedSource.ok).toBe(true); expect(validatedCandidate.ok).toBe(true);
    if (!validatedSource.ok || !validatedCandidate.ok) throw new Error('Actual source and candidate validation required');
    const validationBase = { status: 'structurally_valid', documentId: status.native2.targetA, documentRevision: 1,
      snapshotHash: expectedHashes.A1, priorPinDigest: fixed.expected.expectedPriorPinDigest };
    const sourceChecks = ['current_authority', 'current_source', 'native2_file', 'registered_bundle', 'source_preconditions'];
    expect(validatedSource.value).toEqual({ ...validationBase, kind: 'document', checks: sourceChecks });
    expect(validatedCandidate.value).toEqual({ ...validationBase, kind: 'candidate', candidateSnapshotHash: expectedHashes.A2,
      action: 'adopt', checks: [...sourceChecks, 'candidate_file', 'candidate_registered_bundle', 'candidate_action_policy', 'pin_transition'] });
    const afterValidation = await state();
    await checkpoint('actual-source-candidate-validation-no-effects', { validatedSource, validatedCandidate, beforeValidation, afterValidation });
    expect(afterValidation).toEqual(beforeValidation);
    const cloned = await a.evaluate(async actual => { try { await actual.context.update(JSON.parse(JSON.stringify(actual.attempt))); return 'unexpected'; }
      catch (error) { return (error as { code: string }).code; } }); expect(cloned).toBe('foreign_attempt');
    const reused = await a.evaluate(async actual => { try { await actual.context.prepare({ ...actual.input!, snapshotText: actual.input!.snapshotText + ' ' }); return 'unexpected'; }
      catch (error) { return (error as { code: string }).code; } }); expect(reused).toBe('key_reuse'); expect(await state()).toEqual(beforeValidation);
    phases.push({ phase: 'actual complete sources, advisory validation, private attempt brand and fixed-key refusal', qualification: 'No native/ordinary writer or structurally_valid→saved inference' });

    betaContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); const beta = await betaContext.newPage(), betaRecords = network(beta);
    await login(beta, 'beta-viewer', status); const betaIdentity = await identity(beta, betaRecords, 'beta-viewer', status);
    expect(betaIdentity.subject).not.toBe(alpha.subject); expect(betaIdentity.currentUserId).not.toBe(alpha.currentUserId);
    expect(betaIdentity.tenants.find(one => one.tenantId === status.betaTenantId)?.role).toBe('owner');
    const viewer = await probe(beta, status, status.native2.targetA); probes.push(viewer); await prepare(viewer, { ...input, idempotencyKey: '503-viewer-denied' });
    const viewerBefore = await state(); const denial = await call(viewer, 'update'); expect(denial.ok).toBe(false); if (denial.ok) throw new Error('Viewer must refuse'); expect(denial.status).toBe(403);
    const viewerAfter = await state();
    await checkpoint('actual-viewer-denial-no-effects', { betaIdentity, denial, viewerBefore, viewerAfter });
    expect(viewerAfter).toEqual(viewerBefore);
    await privateControl({ action: 'beta-active', active: false });
    const foreignMe = await beta.request.get(`${origin}/api/v1/me`, { headers: { Authorization: betaRecords.bearer() } }); expect(foreignMe.status()).toBe(200);
    const foreignIdentity = await foreignMe.json() as typeof betaIdentity;
    expect(foreignIdentity.subject).toBe(betaIdentity.subject); expect(foreignIdentity.currentUserId).toBe(betaIdentity.currentUserId);
    expect(foreignIdentity.tenants.some(one => one.tenantId === status.tenantId)).toBe(false); expect(foreignIdentity.tenants.find(one => one.tenantId === status.betaTenantId)?.role).toBe('owner');
    const foreignBefore = await state(); const revoked = await call(viewer, 'update'); expect(revoked.ok).toBe(false); if (revoked.ok) throw new Error('Foreign-only actor must refuse'); expect(revoked.status).toBe(403);
    const foreignAfter = await state();
    await checkpoint('actual-foreign-only-denial-no-effects', { foreignIdentity, revoked, foreignBefore, foreignAfter });
    expect(foreignAfter).toEqual(foreignBefore);
    await privateControl({ action: 'beta-active', active: true });
    phases.push({ phase: 'genuine viewer write denial and separately observed foreign-only membership', qualification: 'Same actual Beta subject/token; target revocation is explicit setup before fresh baseline; not viewer relabelled foreign or unseen ABA' });
    await betaContext.close(); betaContext = undefined;

    const raceBefore = await state(); expect(raceBefore.heads).toEqual(initial.heads);
    const second = await probe(page, status, status.native2.targetA); probes.push(second);
    const alternative = laterRaw(raw.A2, ' / competing declared candidate');
    const competitorInput = { snapshotText: alternative, schemaAction: 'adopt' as const, idempotencyKey: '503-adopt-A-competitor' };
    const competitor = fixedOracle(status, head(initial, status.native2.targetA), raw.A1, competitorInput);
    expect(await prepare(second, competitorInput)).toEqual(competitor.expected);
    await checkpoint('declared-cas-two-fixed-requests-before-dispatch', { raceBefore, fixed, competitor });
    const race = await page.evaluate(async ({ first, next }) => {
      const settle = async (one: Probe): Promise<Result> => { try { return { ok: true, value: await one.context.update(one.attempt!) }; }
        catch (error) { const e = error as { code?: string; status?: number }; return { ok: false, code: e.code ?? 'unknown_error', status: e.status ?? null }; } };
      return Promise.all([settle(first), settle(next)]);
    }, { first: a, next: second });
    expect(race.filter(one => one.ok)).toHaveLength(1); const winner = race[0]!.ok ? 0 : 1, winnerRaw = winner === 0 ? raw.A2 : alternative;
    const winning = winner === 0 ? fixed : competitor; receipt(race[winner]!.ok ? race[winner]!.value : null, status, head(initial, status.native2.targetA), winning, alpha.currentUserId);
    const loser = race[1 - winner]!; expect(loser.ok).toBe(false); if (loser.ok) throw new Error('Exactly one CAS winner'); expect(loser.status).toBe(409); expect(loser.code).toMatch(/^[a-z][a-z0-9_]+$/);
    const adopted = await state();
    await checkpoint('actual-one-winner-adoption-full-state', { race, winner, winning, raceBefore, adopted }); expect(head(adopted, status.native2.targetA).revision).toBe(2); expect(head(adopted, status.native2.targetA).snapshotText).toBe(winnerRaw); await invariantExceptA(raceBefore, adopted, status, winnerRaw, 2);
    expect(adopted.audit.document_receipts!.rows - raceBefore.audit.document_receipts!.rows).toBe(1);
    phases.push({ phase: 'actual same-source two-request CAS, one winner with selected schema pin v1→v2', winner, qualification: 'Native file version stays2; full B and registry remain unchanged; both candidates independently declared before dispatch' });
    const staleBefore = await state(), stale = await call(a, 'validateSource'); expect(stale.ok).toBe(false);
    if (stale.ok) throw new Error('Observed old revision must refuse source validation'); expect(stale.status).toBe(409); expect(await state()).toEqual(staleBefore);

    const current = await probe(page, status, status.native2.targetA); probes.push(current);
    const fixedRaw = laterRaw(winnerRaw, ' / fixed lost ACK'), laterDraft = laterRaw(winnerRaw, ' / later separate caller draft');
    const lostInput = { snapshotText: fixedRaw, schemaAction: 'preserve' as const, idempotencyKey: '503-fixed-lost-ack' };
    const lost = fixedOracle(status, head(adopted, status.native2.targetA), winnerRaw, lostInput);
    const prepared = await current.evaluate(async (actual, data) => { actual.input = data.original; const preparing = actual.context.prepare(actual.input);
      actual.input.snapshotText = data.later; actual.laterDraft = data.later; actual.attempt = await preparing; return actual.attempt; }, { original: lostInput, later: laterDraft });
    expect(prepared).toEqual(lost.expected);
    await checkpoint('fixed-lost-ack-attempt-later-caller-data-before-dispatch', { adopted, lost, prepared, laterDraft });
    const endpoint = `${origin}/api/v1/tenants/${status.tenantId}/note-native2/documents/${status.native2.targetA}/snapshot`;
    let droppedHash = '';
    await page.route(endpoint, async route => { const response = await route.fetch({ maxRetries: 0 }); expect(response.status()).toBe(200);
      const bytes = await response.body(); droppedHash = hash(bytes); await route.abort('failed'); });
    let held: Held | undefined;
    try {
      await arm(status.native2.targetA, 'update');
      await current.evaluate(actual => { actual.pending = actual.context.update(actual.attempt!).then(value => ({ ok: true, value }), error => ({ ok: false, code: error.code ?? error.kind ?? 'unknown_error', status: error.status ?? null })); });
      held = await reached(status.native2.targetA, 'update');
      await checkpoint('actual-held-durable-update-response', { held, lost });
      expect(held.completion.bodyHash).toBe(lost.bodyHash);
      expect(held.completion.path).toBe(`/v1/tenants/${status.tenantId}/note-native2/documents/${status.native2.targetA}/snapshot`);
      const expectedCompleted = receiptValue(status, head(adopted, status.native2.targetA), lost, alpha.currentUserId);
      expect(held.completion.result).toEqual({ operation: expectedCompleted.operation, idempotencyKey: expectedCompleted.idempotencyKey,
        requestHash: expectedCompleted.requestHash, document: expectedCompleted.document, snapshotText: expectedCompleted.snapshotText });
      const committed = await state();
      await checkpoint('actual-lost-ack-committed-full-state-before-delivery', { adopted, committed, lost, held, laterDraft }); expect(head(committed, status.native2.targetA).revision).toBe(3); expect(head(committed, status.native2.targetA).snapshotText).toBe(fixedRaw);
      expect(committed.audit.document_receipts!.rows - adopted.audit.document_receipts!.rows).toBe(1); await invariantExceptA(adopted, committed, status, fixedRaw, 3);
      expect(await current.evaluate(actual => actual.laterDraft)).toBe(laterDraft); expect(await current.evaluate(actual => actual.attempt)).toEqual(lost.expected);
      await release(held); const lostReply = await current.evaluate(actual => actual.pending!);
      await checkpoint('actual-first-response-loss-result', { lostReply, held, droppedHash, committed });
      expect(lostReply.ok).toBe(false); expect(droppedHash).toBe(held.responseHash);
      // Loss interception belongs only to the first real ACK; identical retry must receive its actual response.
      await page.unroute(endpoint);
      const stopped = await privateControl<Status>({ action: 'schema-stop' });
      await checkpoint('actual-schema-stop-retained-last-pid', { committed, stopped });
      expect(stopped.schemaPid).toBe(committed.schemaPid);
      if (typeof stopped.schemaPid !== 'number' || stopped.schemaPid <= 0) throw new Error('Previously observed owned Schema PID required');
      let stoppedProcessError: string | undefined;
      try { process.kill(stopped.schemaPid, 0); } catch (error) { stoppedProcessError = (error as NodeJS.ErrnoException).code; }
      await checkpoint('actual-stopped-schema-process-absence', { schemaPid: stopped.schemaPid, stoppedProcessError });
      expect(stoppedProcessError).toBe('ESRCH');
      const restarted = await privateControl<Status>({ action: 'schema-start' });
      await checkpoint('actual-new-schema-pid-same-private-database', { stopped, restarted });
      expect(restarted.schemaPid).not.toBe(committed.schemaPid);
      if (typeof restarted.schemaPid !== 'number' || restarted.schemaPid <= 0) throw new Error('Actual restarted Schema PID required');
      expect(() => process.kill(restarted.schemaPid!, 0)).not.toThrow();
      expect(restarted.databaseIdentity).toBe(committed.databaseIdentity); expect(restarted.databaseGeneration).toBe(committed.databaseGeneration);
      const recovered = await call(current, 'recover');
      await checkpoint('actual-current-context-recovered-receipt', { recovered, lost, afterRecovery: await state() });
      expect(recovered.ok).toBe(true); if (!recovered.ok) throw new Error('Original current-context receipt recovery required'); receipt(recovered.value, status, head(adopted, status.native2.targetA), lost, alpha.currentUserId);
      const retry = await call(current, 'update');
      await checkpoint('actual-fixed-key-identical-retry-receipt', { retry, lost, committed, afterRetry: await state() });
      expect(retry.ok).toBe(true); if (!retry.ok) throw new Error('Same fixed key/body retry required'); receipt(retry.value, status, head(adopted, status.native2.targetA), lost, alpha.currentUserId);
      expect((await state()).heads).toEqual(committed.heads); expect((await state()).audit).toEqual(committed.audit); expect((await state()).ledger).toEqual(committed.ledger);
      expect(await current.evaluate(actual => actual.laterDraft)).toBe(laterDraft); expect(await current.evaluate(actual => actual.attempt)).toEqual(lost.expected);
      await info.attach('fixed-request-later-draft-real-commit', { body: JSON.stringify({ lost, laterDraft, held, droppedHash,
        qualification: 'Real PUT committed; actual unchanged response deliberately dropped. Schema process restarted on same PG, original branded current context recover and explicit same-key retry produced one effect; caller draft is protocol data, not 504 textarea/native input proof.' }), contentType: 'application/json' });
    } finally { await privateControl({ action: 'native2-release' }); await page.unroute(endpoint); }
    phases.push({ phase: 'actual committed response loss, sameDB schema restart, exact GET receipt and fixed-key retry', qualification: 'No automatic retry/receipt lookup/rebase or entered-request rollback guarantee' });
    expect(await source(page).evaluate((el, original) => el === original, originalElement)).toBe(true); expect(await source(page).evaluate(el => el.outerHTML)).toBe(originalDOM);
    await originalElement.dispose();

    const late = await probe(page, status, status.native2.targetA); probes.push(late); const lateBefore = await state();
    await arm(status.native2.targetA, 'validation');
    await late.evaluate(actual => { actual.pending = actual.context.validateSource().then(value => ({ ok: true, value }), error => ({ ok: false, code: error.code ?? error.kind ?? 'unknown_error', status: error.status ?? null })); });
    const validationHeld = await reached(status.native2.targetA, 'validation');
    await checkpoint('actual-held-validation-before-ui-logout', { validationHeld, lateBefore });
    // Delay only the real provider navigation request, so the actual UI clearSession retirement can be observed
    // before the old JavaScript context is destroyed. Continue that same request afterward; no fake response.
    const providerLogout = (url: URL) => url.origin === new URL(alpha.issuer).origin && url.pathname.endsWith('/protocol/openid-connect/logout');
    let navigationReached = false, continueNavigation!: () => void;
    const navigationGate = new Promise<void>(resolve => { continueNavigation = resolve; });
    await page.route(providerLogout, async route => { navigationReached = true; await navigationGate; await route.continue(); });
    try {
      await page.getByRole('button', { name: '로그아웃', exact: true }).click({ noWaitAfter: true });
      await expect.poll(() => navigationReached, { timeout: 12_000 }).toBe(true);
      expect(await late.evaluate(actual => actual.factory.isCurrent())).toBe(false);
      await release(validationHeld);
      const retired = await late.evaluate(actual => actual.pending!); expect(retired.ok).toBe(false);
      if (retired.ok) throw new Error('Actual logout must cancel the old private generation'); expect(retired.code).toBe('cancelled');
      const afterLogout = await state();
      await checkpoint('actual-ui-logout-retirement-no-effects', { retired, validationHeld, lateBefore, afterLogout, navigationReached });
      expect(afterLogout.heads).toEqual(lateBefore.heads); expect(afterLogout.audit).toEqual(lateBefore.audit); expect(afterLogout.ledger).toEqual(lateBefore.ledger);
      continueNavigation();
      await expect.poll(() => { const url = new URL(page.url()); return url.origin === new URL(origin).origin && url.pathname === '/'; }, { timeout: 30_000 }).toBe(true);
    } finally { continueNavigation(); await page.unroute(providerLogout); }
    phases.push({ phase: 'actual logout before late successful validation response, terminal generation refusal', qualification: 'Actual UI clearSession observed while provider navigation was deliberately held before request continuation; same real provider navigation completed afterward. Not context-destruction-as-cancellation, 403 auto-retirement or unseen ABA proof.' });

    await login(page, 'alpha-editor', status); await identity(page, records, 'alpha-editor', status);
    const original: Native2OriginalUpdate = { tenantId: status.tenantId, workspaceId: status.workspaceId, documentId: status.native2.targetA,
      expectedRevision: lost.expected.expectedRevision, expectedSnapshotHash: lost.expected.expectedSnapshotHash, expectedPriorPinDigest: lost.expected.expectedPriorPinDigest,
      snapshotText: lost.expected.snapshotText, schemaAction: lost.expected.schemaAction, idempotencyKey: lost.expected.idempotencyKey };
    const historyBefore = await state(), writes = records.updates().length;
    const historical = await page.evaluate(async ({ url, data }) => { const module = await import(url) as typeof import('../src/native2-authenticated-receipt-recovery');
      const factory = module.createAuthenticatedNative2ReceiptRecovery(); try { const result = await factory.recover(data); return { kind: result.kind, original: result.original, receipt: result.receipt, current: result.isCurrent() }; }
      finally { factory.retire(); } }, { url: recoveryUrl, data: original });
    await checkpoint('actual-fresh-login-historical-get-only', { original, historical, historyBefore, historyAfter: await state(), writesBefore: writes, writesAfter: records.updates().length });
    expect(historical.kind).toBe('historical_acknowledgment'); expect(historical.original).toEqual(original); expect(historical.current).toBe(true);
    const expectedHistorical = receiptValue(status, head(adopted, status.native2.targetA), lost, alpha.currentUserId);
    expect(historical.receipt).toEqual({ operation: expectedHistorical.operation, idempotencyKey: expectedHistorical.idempotencyKey,
      requestHash: expectedHistorical.requestHash, snapshotText: expectedHistorical.snapshotText, document: expectedHistorical.document });
    expect(records.updates()).toHaveLength(writes); expect(await state()).toEqual(historyBefore);
    phases.push({ phase: 'fresh genuine login GET-only original historical acknowledgment', qualification: 'Separate506 foundation, not restored write attempt/ordinary UI writer/current latest head or whole506/507 acceptance' });
    const expiring = await probe(page, status, status.native2.targetA); probes.push(expiring);
    const expiryBefore = await state(), expiryWrites = records.updates().length;
    expect(await expiring.evaluate(actual => actual.factory.isCurrent())).toBe(true); expect(records.tokenLifetime()).toBeGreaterThan(0);
    await page.clock.fastForward(records.tokenLifetime() + 1000);
    expect(await expiring.evaluate(actual => actual.factory.isCurrent())).toBe(false);
    const expiryDenied = await call(expiring, 'validateSource'); expect(expiryDenied.ok).toBe(false);
    await checkpoint('actual-captured-token-client-clock-deadline', { expiryDenied, tokenLifetime: records.tokenLifetime(), expiryBefore, expiryAfter: await state(), writesBefore: expiryWrites, writesAfter: records.updates().length });
    expect(records.updates()).toHaveLength(expiryWrites); expect(await state()).toEqual(expiryBefore);
    phases.push({ phase: 'captured actual token local deadline retires the private factory', qualification: 'Controlled browser clock against actual captured token lifetime; not elapsed real IdP/server expiry' });
    await info.attach('current-mutation-phases', { body: JSON.stringify({ phases, sourceHashes: expectedHashes,
      requests: records.records.map(one => ({ method: one.method, path: one.path, ...(one.body ? { bodyHash: hash(one.body) } : {}) })),
      qualification: 'Actual current OIDC/private HTTP/PG and real SDK in same AuthApp auth-client session. Signed synthetic roles/setup and delivery timing are labelled. Malformed/forged reply/proxy variants retain exact controlled source tests, not fabricated genuine replies. Whole504 native/UI/497/495eight/Goal/release acceptance is separate.' }), contentType: 'application/json' });
  } finally {
    await checkpoint('completed-phase-progress-even-on-later-failure', { phases, sourceHashes: expectedHashes,
      requests: records.records.map(one => ({ method: one.method, path: one.path, ...(one.body ? { bodyHash: hash(one.body) } : {}) })),
      qualification: 'Retained per-phase actual evidence, including before/after full states. A later failure does not establish whole acceptance; no credentials or authorization header attached.' });
    await privateControl({ action: 'native2-release' }); await privateControl({ action: 'beta-active', active: true }); await privateControl({ action: 'schema-start' });
    for (const one of probes) { try { await one.evaluate(actual => actual.factory.retire()); } catch { /* Closed actual context */ } await one.dispose(); }
    await betaContext?.close();
  }
});
