import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test, type JSHandle, type Page, type TestInfo } from '@playwright/test';
import { NATIVE_NOTE_FIXTURES } from '../../note/src/native2-scenario-fixtures';
import type { createAuthenticatedNative2Mutation, Native2MutationAttempt, Native2MutationInput,
  Native2Validation, Native2VerifiedReceipt } from '../src/native2-authenticated-mutation';
import type { createAuthenticatedNative2ReceiptRecovery, Native2HistoricalAcknowledgment, Native2OriginalUpdate } from '../src/native2-authenticated-receipt-recovery';
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
async function identity(page: Page, records: ReturnType<typeof network>, alias: 'alpha-editor' | 'beta-viewer', status: Status, role: 'owner' | 'editor' | 'viewer' | null = alias === 'alpha-editor' ? 'owner' : 'viewer') {
  const response = await page.request.get(`${origin}/api/v1/me`, { headers: { Authorization: records.bearer() } });
  expect(response.status()).toBe(200);
  const value = await response.json() as { issuer: string; subject: string; currentUserId: string; tenants: Array<{ tenantId: string; role: string }> };
  const fixture = JSON.parse(readFileSync(process.env.OFFICE_AUTH_REAL_FILE!, 'utf8')) as { issuer: string; users: Record<string, { id: string }> };
  expect(value.issuer).toBe(fixture.issuer); expect(value.subject).toBe(fixture.users[alias]!.id);
  expect(value.currentUserId).toMatch(/^[a-f0-9-]{36}$/);
  expect(value.tenants.find(one => one.tenantId === status.tenantId)?.role).toBe(role ?? undefined);
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

type RecoveryFactory = ReturnType<typeof createAuthenticatedNative2ReceiptRecovery>;
interface RecoveryProbe { factory: RecoveryFactory; result?: Native2HistoricalAcknowledgment; pending?: Promise<HistoryResult> }
type HistoryResult = { ok: true; value: { kind: string; original: Native2OriginalUpdate; receipt: unknown; current: boolean; keys: string[] } }
  | { ok: false; code: string; status: number | null };
async function recoveryProbe(page: Page): Promise<JSHandle<RecoveryProbe>> {
  return page.evaluateHandle(async url => {
    const module = await import(url) as typeof import('../src/native2-authenticated-receipt-recovery');
    return { factory: module.createAuthenticatedNative2ReceiptRecovery() };
  }, recoveryUrl);
}
async function recover(one: JSHandle<RecoveryProbe>, original: unknown): Promise<HistoryResult> {
  return one.evaluate(async (actual, data) => {
    try {
      actual.result = await actual.factory.recover(data);
      const result = actual.result;
      return { ok: true as const, value: { kind: result.kind, original: result.original, receipt: result.receipt,
        current: result.isCurrent(), keys: Object.keys(result).sort() } };
    } catch (error) {
      const value = error as { code?: string; kind?: string; status?: number };
      return { ok: false as const, code: value.code ?? value.kind ?? 'unknown_error', status: value.status ?? null };
    }
  }, original);
}
function originalRecord(status: Status, fixed: ReturnType<typeof fixedOracle>): Native2OriginalUpdate {
  const value = fixed.expected;
  return { tenantId: status.tenantId, workspaceId: status.workspaceId, documentId: status.native2.targetA,
    expectedRevision: value.expectedRevision, expectedSnapshotHash: value.expectedSnapshotHash, expectedPriorPinDigest: value.expectedPriorPinDigest,
    snapshotText: value.snapshotText, schemaAction: value.schemaAction, idempotencyKey: value.idempotencyKey };
}
function historical(result: HistoryResult, original: Native2OriginalUpdate, expected: ReturnType<typeof receiptValue>) {
  expect(result.ok).toBe(true); if (!result.ok) throw new Error('Exact current historical acknowledgment required');
  expect(result.value).toEqual({ kind: 'historical_acknowledgment', original,
    receipt: { operation: expected.operation, idempotencyKey: expected.idempotencyKey, requestHash: expected.requestHash,
      document: expected.document, snapshotText: expected.snapshotText }, current: true,
    keys: ['isCurrent', 'kind', 'original', 'receipt', 'retire', 'subscribeRetirement'] });
}
function noEffects(before: State, after: State) {
  expect(after.heads).toEqual(before.heads); expect(after.audit).toEqual(before.audit); expect(after.ledger).toEqual(before.ledger);
}
function receiptRequest(status: Status, original: Native2OriginalUpdate) {
  return { method: 'GET', path: `/api/v1/tenants/${status.tenantId}/note-native2/receipts/update/${original.idempotencyKey}` };
}
function nativeRequests(records: ReturnType<typeof network>, offset: number) {
  return records.records.slice(offset).filter(one => one.path.includes('/note-native2/'));
}

// Independent canonical JSON oracle for the fixed fixture definitions; no service parser/output is used.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return '{' + Object.keys(record).sort().map(key => JSON.stringify(key) + ':' + canonical(record[key])).join(',') + '}';
  }
  const text = JSON.stringify(value); if (text === undefined) throw new Error('Declared canonical JSON value required');
  return text;
}
interface DefinitionOracle { scope: { tenantId: string; workspaceId: string }; schemaId: string; version: number;
  parent: { schemaId: string; version: number; digest: string } | null;
  dependencies: Array<{ schemaId: string; version: number; digest: string }> }
function registeredClosure(status: Status, initial: State, creator: string) {
  const expectedVersions: Array<Record<string, unknown>> = [], expectedDependencies: Array<Record<string, unknown>> = [];
  for (const entry of files.A2.schemaBundle.definitions) {
    const definition = JSON.parse(entry.definitionText) as DefinitionOracle;
    expect(definition.scope).toEqual({ tenantId: status.tenantId, workspaceId: status.workspaceId });
    expect({ schemaId: definition.schemaId, version: definition.version }).toEqual({ schemaId: entry.reference.schemaId, version: entry.reference.version });
    expectedVersions.push({ tenant_id: status.tenantId, workspace_id: status.workspaceId, schema_id: entry.reference.schemaId,
      version: entry.reference.version, digest: entry.reference.digest, definition_text: entry.definitionText,
      canonical_text: canonical(JSON.parse(entry.definitionText)), actor_identity_id: creator });
    const edges = [...(definition.parent ? [{ kind: 'parent', reference: definition.parent }] : []),
      ...definition.dependencies.map(reference => ({ kind: 'dependency', reference }))];
    for (const [ordinal, edge] of edges.entries()) expectedDependencies.push({ tenant_id: status.tenantId, workspace_id: status.workspaceId,
      schema_id: entry.reference.schemaId, version: entry.reference.version, ordinal, kind: edge.kind,
      dependency_id: edge.reference.schemaId, dependency_version: edge.reference.version, dependency_digest: edge.reference.digest });
  }
  const actualVersions = initial.ledger.schema_versions!.map(text => {
    const row = JSON.parse(text) as Record<string, unknown>; expect(Object.keys(row).sort()).toEqual([...Object.keys(expectedVersions[0]!), 'created_at'].sort());
    const { created_at: createdAt, ...fixed } = row;
    expect(typeof createdAt).toBe('string'); expect(Date.parse(String(createdAt))).not.toBeNaN(); return fixed;
  });
  const order = (a: Record<string, unknown>, b: Record<string, unknown>) => String(a.schema_id).localeCompare(String(b.schema_id)) || Number(a.version) - Number(b.version) || Number(a.ordinal ?? 0) - Number(b.ordinal ?? 0);
  expect(expectedVersions).toHaveLength(4); expect(actualVersions.sort(order)).toEqual(expectedVersions.sort(order));
  expect(initial.ledger.schema_dependencies!.map(text => JSON.parse(text) as Record<string, unknown>).sort(order)).toEqual(expectedDependencies.sort(order));
  // Every admitted A1/B definition must be byte-identical to a declared member of that complete closure.
  for (const file of [files.A1, files.B]) for (const entry of file.schemaBundle.definitions)
    expect(files.A2.schemaBundle.definitions.find(full => full.reference.schemaId === entry.reference.schemaId && full.reference.version === entry.reference.version)).toEqual(entry);
  return { expectedVersions, expectedDependencies };
}

test('new current Office login recovers only original own receipts through reload, viewer and revoked authority', async ({ page, browser }, info: TestInfo) => {
  test.setTimeout(180_000);
  const status = await privateControl<Status>({ action: 'status' }), records = network(page);
  const checkpoint = async (name: string, evidence: unknown) => info.attach(name, { body: JSON.stringify(evidence), contentType: 'application/json' });
  const mutations: JSHandle<Probe>[] = [], histories: JSHandle<RecoveryProbe>[] = [];
  const betaContext = await browser.newContext({ baseURL: origin, viewport: { width: 1440, height: 1000 } });
  const betaPage = await betaContext.newPage(), betaRecords = network(betaPage);
  const phases: string[] = [];
  const endpoint = `${origin}/api/v1/tenants/${status.tenantId}/note-native2/documents/${status.native2.targetA}/snapshot`;
  try {
    await page.clock.install(); await login(page, 'alpha-editor', status);
    const alpha = await identity(page, records, 'alpha-editor', status), initial = await state();
    const expectedHeads = { A1: { documentId: status.native2.targetA, pageId: files.A1.document.attributes.pageId,
      fileVersion: 2, revision: 1, snapshotHash: expectedHashes.A1, snapshotText: raw.A1 },
    B: { documentId: status.native2.targetB, pageId: files.B.document.attributes.pageId,
      fileVersion: 2, revision: 1, snapshotHash: expectedHashes.B, snapshotText: raw.B } };
    expect(head(initial, status.native2.targetA)).toEqual(expectedHeads.A1); expect(head(initial, status.native2.targetB)).toEqual(expectedHeads.B);
    const expectedRegistry = registeredClosure(status, initial, alpha.currentUserId);
    const alphaInput = { snapshotText: raw.A2, schemaAction: 'adopt' as const, idempotencyKey: '506-alpha-original-lost-ack' };
    const alphaFixed = fixedOracle(status, head(initial, status.native2.targetA), raw.A1, alphaInput);
    const original = originalRecord(status, alphaFixed), laterDraft = laterRaw(raw.A2, ' / separate506 later caller draft');
    const originalBytes = JSON.stringify(original), laterBytes = laterDraft;
    const live = await probe(page, status, status.native2.targetA), fullB = await probe(page, status, status.native2.targetB); mutations.push(live, fullB);
    const observedSources: Record<string, unknown> = {}, expectedSources: Record<string, unknown> = {};
    for (const [one, key, title] of [[live, 'A1', 'Native2 full A'], [fullB, 'B', 'Native2 full B']] as const) {
      const observed = await one.evaluate(actual => actual.context.source), documentId = key === 'A1' ? status.native2.targetA : status.native2.targetB;
      const expected = { snapshotText: raw[key], file: { fileVersion: 2, document: files[key].document, schemaBundle: files[key].schemaBundle,
        ...('savedAt' in files[key] ? { savedAt: files[key].savedAt } : {}) },
      document: { documentId, tenantId: status.tenantId, workspaceId: status.workspaceId, product: 'note', title,
        creatorUserId: alpha.currentUserId, metadataRevision: 1, mode: 'snapshot', pageId: files[key].document.attributes.pageId,
        documentKey: `wonffice-${status.tenantId}-${documentId}`, fileFormat: 'barocss-note', fileVersion: 2, revision: 1, snapshotHash: expectedHashes[key] } };
      expect(observed.snapshotText).toBe(expected.snapshotText); expect(observed.file).toEqual(expected.file); expect(observed.document).toEqual(expected.document);
      observedSources[key] = observed; expectedSources[key] = expected;
    }
    noEffects(initial, await state());
    await checkpoint('fresh-initial-whole-independent-heads-files-registered-closure', { initial, expectedHeads, observedSources, expectedSources, expectedRegistry,
      qualification: 'Fresh actual state must match predeclared corpus/full metadata/parsed native file/all four registry version texts and full parent/dependency closure. No prior503actualDB baseline or service reply becomes the oracle.' });
    expect(await prepare(live, alphaInput)).toEqual(alphaFixed.expected);
    const validation = await call(live, 'validate'); expect(validation.ok).toBe(true); noEffects(initial, await state());
    const alphaExpected = receiptValue(status, head(initial, status.native2.targetA), alphaFixed, alpha.currentUserId);
    await checkpoint('independent-original-nine-full-input-current-alpha', { status, alpha, initial, alphaFixed, original, laterDraft, expectedRawHashes: expectedHashes });
    let droppedHash = '';
    await page.route(endpoint, async route => {
      const response = await route.fetch({ maxRetries: 0 }); expect(response.status()).toBe(200);
      droppedHash = hash(await response.body()); await route.abort('failed');
    });
    await arm(status.native2.targetA, 'update');
    await live.evaluate(actual => { actual.pending = actual.context.update(actual.attempt!).then(value => ({ ok: true, value }), error => ({ ok: false, code: error.code ?? error.kind ?? 'unknown_error', status: error.status ?? null })); });
    const held = await reached(status.native2.targetA, 'update'), committed = await state();
    expect(held.completion.bodyHash).toBe(alphaFixed.bodyHash);
    expect(held.completion.result).toEqual({ operation: alphaExpected.operation, idempotencyKey: alphaExpected.idempotencyKey,
      requestHash: alphaExpected.requestHash, document: alphaExpected.document, snapshotText: alphaExpected.snapshotText });
    await invariantExceptA(initial, committed, status, raw.A2, 2);
    expect(committed.audit.document_receipts!.rows - initial.audit.document_receipts!.rows).toBe(1);
    await checkpoint('real-alpha-durable-one-effect-before-response-loss', { initial, committed, held, alphaFixed, original, laterDraft });
    await release(held); const lost = await live.evaluate(actual => actual.pending!);
    expect(lost.ok).toBe(false); expect(droppedHash).toBe(held.responseHash);
    await page.unroute(endpoint); await checkpoint('real-alpha-ack-loss', { lost, held, droppedHash });
    const stopped = await privateControl<Status>({ action: 'schema-stop' }); expect(stopped.schemaPid).toBe(committed.schemaPid);
    if (typeof stopped.schemaPid !== 'number' || stopped.schemaPid <= 0) throw new Error('Owned prior Schema PID required');
    let stoppedProcessError: string | undefined;
    try { process.kill(stopped.schemaPid, 0); } catch (error) { stoppedProcessError = (error as NodeJS.ErrnoException).code; }
    expect(stoppedProcessError).toBe('ESRCH');
    const restarted = await privateControl<Status>({ action: 'schema-start' });
    expect(restarted.schemaPid).not.toBe(stopped.schemaPid); expect(restarted.databaseIdentity).toBe(committed.databaseIdentity); expect(restarted.databaseGeneration).toBe(committed.databaseGeneration);
    if (typeof restarted.schemaPid !== 'number' || restarted.schemaPid <= 0) throw new Error('New live Schema PID required');
    expect(() => process.kill(restarted.schemaPid!, 0)).not.toThrow();
    await checkpoint('actual-schema-stop-esrch-new-pid-same-database', { stopped, stoppedProcessError, restarted });
    // A literal reload loses the original browser-private writer. The retained data is not authority.
    await page.reload(); await login(page, 'alpha-editor', status);
    const reloadedAlpha = await identity(page, records, 'alpha-editor', status); expect(reloadedAlpha).toEqual(alpha);
    const loader = await recoveryProbe(page); histories.push(loader);
    const beforeGet = await state(), queryStart = records.records.length, alphaHistory = await recover(loader, JSON.parse(originalBytes));
    historical(alphaHistory, original, alphaExpected); noEffects(beforeGet, await state());
    expect(nativeRequests(records, queryStart)).toEqual([receiptRequest(status, original)]);
    expect(JSON.stringify(original)).toBe(originalBytes); expect(laterDraft).toBe(laterBytes);
    await checkpoint('literal-reload-new-current-alpha-get-only-original-receipt', { reloadedAlpha, original, originalBytes, laterDraft,
      alphaHistory, beforeGet, afterGet: await state(), requests: nativeRequests(records, queryStart) });
    phases.push('Actual committed Alpha ACK loss, same PG restart, literal reload and new-current GET-only original acknowledgment');
    // Query input is data only. Local refusal is measured separately from an actual service refusal.
    for (const [name, value, code] of [
      ['extra caller role', { ...original, role: 'owner' }, 'invalid_original'],
      ['foreign declared workspace', { ...original, workspaceId: status.betaWorkspaceId }, 'foreign_candidate'],
      ['unsupported raw', { ...original, snapshotText: '{"format":"barocss-note","version":1}' }, 'invalid_candidate'],
    ] as const) {
      const before = await state(), offset = records.records.length, refusal = await recover(loader, value);
      expect(refusal).toEqual({ ok: false, code, status: null }); expect(nativeRequests(records, offset)).toEqual([]); noEffects(before, await state());
      await checkpoint(`local-original-refusal-${name.replaceAll(' ', '-')}`, { original, input: value, refusal, before, after: await state(), requests: nativeRequests(records, offset) });
    }
    const missing = { ...original, idempotencyKey: '506-real-no-receipt' }, absentBefore = await state(), absentOffset = records.records.length;
    const notFound = await recover(loader, missing); expect(notFound).toEqual({ ok: false, code: 'not_found', status: 404 });
    noEffects(absentBefore, await state()); expect(nativeRequests(records, absentOffset)).toEqual([receiptRequest(status, missing)]);
    await checkpoint('actual-missing-receipt-named404-no-effects', { missing, notFound, absentBefore, after: await state(), requests: nativeRequests(records, absentOffset) });
    await login(betaPage, 'beta-viewer', status); const betaViewer = await identity(betaPage, betaRecords, 'beta-viewer', status);
    expect(betaViewer.subject).not.toBe(alpha.subject);
    const betaLoader = await recoveryProbe(betaPage); histories.push(betaLoader);
    const otherBefore = await state(), otherOffset = betaRecords.records.length, otherActor = await recover(betaLoader, original);
    // Exact service SQL scopes receipt lookup to the current actor. Other actors see not_found.
    expect(otherActor).toEqual({ ok: false, code: 'not_found', status: 404 }); noEffects(otherBefore, await state());
    expect(nativeRequests(betaRecords, otherOffset)).toEqual([receiptRequest(status, original)]);
    await checkpoint('actual-other-actor-viewer-original404-no-effects', { betaViewer, original, otherActor, otherBefore, after: await state(), requests: nativeRequests(betaRecords, otherOffset) });
    await privateControl({ action: 'beta-role', role: 'editor' });
    const betaEditor = await identity(betaPage, betaRecords, 'beta-viewer', status, 'editor'); expect(betaEditor.subject).toBe(betaViewer.subject);
    const betaBefore = await state(), betaRaw = laterRaw(raw.A2, ' / distinct506 Beta own preserve');
    const betaInput = { snapshotText: betaRaw, schemaAction: 'preserve' as const, idempotencyKey: '506-beta-distinct-own-operation' };
    const betaFixed = fixedOracle(status, head(betaBefore, status.native2.targetA), raw.A2, betaInput), betaOriginal = originalRecord(status, betaFixed);
    const betaLive = await probe(betaPage, status, status.native2.targetA); mutations.push(betaLive);
    expect(await prepare(betaLive, betaInput)).toEqual(betaFixed.expected); expect((await call(betaLive, 'validate')).ok).toBe(true);
    noEffects(betaBefore, await state()); const betaUpdate = await call(betaLive, 'update'); expect(betaUpdate.ok).toBe(true);
    if (!betaUpdate.ok) throw new Error('Explicit current Beta editor distinct update required');
    receipt(betaUpdate.value, status, head(betaBefore, status.native2.targetA), betaFixed, alpha.currentUserId);
    const betaCommitted = await state(); await invariantExceptA(betaBefore, betaCommitted, status, betaRaw, 3);
    expect(betaCommitted.audit.document_receipts!.rows - betaBefore.audit.document_receipts!.rows).toBe(1);
    await checkpoint('actual-explicit-beta-editor-distinct-owned-receipt', { betaEditor, betaBefore, betaCommitted, betaOriginal, betaFixed, betaUpdate });
    await privateControl({ action: 'beta-role', role: 'viewer' });
    const currentViewer = await identity(betaPage, betaRecords, 'beta-viewer', status), ownBefore = await state(), ownOffset = betaRecords.records.length;
    const ownHistorical = await recover(betaLoader, betaOriginal);
    historical(ownHistorical, betaOriginal, receiptValue(status, head(betaBefore, status.native2.targetA), betaFixed, alpha.currentUserId));
    noEffects(ownBefore, await state()); expect(nativeRequests(betaRecords, ownOffset)).toEqual([receiptRequest(status, betaOriginal)]);
    await checkpoint('actual-current-viewer-own-historical-read-only', { currentViewer, betaOriginal, ownHistorical, ownBefore, after: await state(), requests: nativeRequests(betaRecords, ownOffset) });
    await privateControl({ action: 'beta-active', active: false });
    const foreign = await identity(betaPage, betaRecords, 'beta-viewer', status, null);
    expect(foreign.subject).toBe(betaViewer.subject); expect(foreign.tenants.find(one => one.tenantId === status.betaTenantId)?.role).toBe('owner');
    const revokedBefore = await state(), revokedOffset = betaRecords.records.length, revokedOwn = await recover(betaLoader, betaOriginal);
    expect(revokedOwn.ok).toBe(false); if (revokedOwn.ok) throw new Error('Revoked current target membership must refuse its own receipt');
    expect(revokedOwn.status).toBe(403); expect(revokedOwn.code).toMatch(/^[a-z][a-z0-9_]+$/);
    noEffects(revokedBefore, await state()); expect(nativeRequests(betaRecords, revokedOffset)).toEqual([receiptRequest(status, betaOriginal)]);
    await checkpoint('actual-revoked-target-foreign-only-own-receipt403', { foreign, betaOriginal, revokedOwn, revokedBefore, after: await state(), requests: nativeRequests(betaRecords, revokedOffset) });
    await privateControl({ action: 'beta-active', active: true });
    phases.push('Other actor404; separate explicit Beta-owned update; own viewer historical read; explicit target revocation before fresh foreign-only403/no-effects baseline');
    const olderBefore = await state(), olderOffset = records.records.length, older = await recover(loader, original);
    historical(older, original, alphaExpected); expect(head(olderBefore, status.native2.targetA).revision).toBe(3);
    expect(alphaExpected.document.revision).toBe(2); noEffects(olderBefore, await state());
    expect(nativeRequests(records, olderOffset)).toEqual([receiptRequest(status, original)]);
    await checkpoint('alpha-original-older-receipt-never-newer-current-head', { original, older, currentFullState: olderBefore, after: await state(), laterDraft, requests: nativeRequests(records, olderOffset) });
    // The actual token lifetime is advanced only in the client clock; not elapsed IdP time.
    await expect.poll(() => records.tokenLifetime()).toBeGreaterThan(0);
    const expiryLoader = await recoveryProbe(page); histories.push(expiryLoader);
    const expiryBefore = await state(), expiryOffset = records.records.length, tokenLifetime = records.tokenLifetime();
    await page.clock.fastForward(tokenLifetime + 1000);
    expect(await expiryLoader.evaluate(actual => actual.factory.isCurrent())).toBe(false);
    const expired = await recover(expiryLoader, original); expect(expired).toEqual({ ok: false, code: 'cancelled', status: null });
    expect(nativeRequests(records, expiryOffset)).toEqual([]); noEffects(expiryBefore, await state());
    expect(JSON.stringify(original)).toBe(originalBytes); expect(laterDraft).toBe(laterBytes);
    await checkpoint('captured-token-controlled-client-deadline-get-refusal', { expired, tokenLifetime, expiryBefore, after: await state(), original, laterDraft, requests: nativeRequests(records, expiryOffset) });
    phases.push('Original Alpha receipt stays older after distinct Beta update; captured token client deadline refuses without GET or effects');
    await checkpoint('completed-receipt-only-phases', { phases, original, laterDraft, sourceHashes: expectedHashes,
      qualification: 'Two explicit independent actual operations/keys, each one effect. GET-only recovery never writes. Caller retained data is not504 journal/textarea/native UI. Actual late/logout, same-token replacement and forged reply variants retain exact source-controlled evidence unless separately observed.' });
  } finally {
    await privateControl({ action: 'native2-release' }); await privateControl({ action: 'schema-start' });
    await privateControl({ action: 'beta-active', active: true }); await privateControl({ action: 'beta-role', role: 'viewer' });
    if (!page.isClosed()) await page.unroute(endpoint);
    for (const one of histories) { await one.evaluate(actual => actual.factory.retire()); await one.dispose(); }
    // Reload invalidates its old browser handle; dispose locally instead of evaluating that old generation.
    for (const one of mutations) await one.dispose();
    await betaContext.close(); await checkpoint('completed-receipt-only-progress-even-on-failure', { phases, sourceHashes: expectedHashes });
  }
});
