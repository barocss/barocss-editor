// @vitest-environment jsdom
import { createHash } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { createNoteNative2Context, openNoteNativeSnapshot, openNoteTree } from '@barocss/office-note';
import type { createAuthenticatedNative2Mutation, Native2MutationAttempt, Native2Validation } from '../../office/src/native2-authenticated-mutation';
import { createExperimentalNative2ReadStage, type Native2StageSource, type Native2ReadonlyStage } from './experimental-native2-authenticated-stage';
import { NATIVE_NOTE_FIXTURES } from './native2-scenario-fixtures';
import { createNative2SchemaAdoptionOperation } from './native2-schema-adoption-operation';
import { createExperimentalNative2AdoptJournal } from './experimental-native2-adopt-pending';
import type { createAuthenticatedNative2ReceiptRecovery } from '../../office/src/native2-authenticated-receipt-recovery';
import type { Native2StageReadFactory } from './experimental-native2-authenticated-stage';

const tenantId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', workspaceId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const documentId = '33333333-3333-4333-8333-333333333333';
const sourceText = JSON.stringify(NATIVE_NOTE_FIXTURES.SOURCE_A), candidateText = JSON.stringify(NATIVE_NOTE_FIXTURES.TARGET_A2, null, 2) + '\n';
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
type Factory = ReturnType<typeof createAuthenticatedNative2Mutation>;
type Context = Awaited<ReturnType<Factory['open']>>;
afterEach(() => vi.restoreAllMocks());
class MemoryStorage implements Storage {
  items = new Map<string, string>(); fail = false;
  get length() { return this.items.size; } clear() { this.items.clear(); } key(i: number) { return [...this.items.keys()][i] ?? null; }
  getItem(key: string) { return this.items.get(key) ?? null; }
  setItem(key: string, value: string) { if (this.fail) throw Error('controlled quota'); this.items.set(key, value); }
  removeItem(key: string) { this.items.delete(key); }
}
function setup() {
  const authority = openNoteTree({ stype: 'note', content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Preserved mounted source S' }] }] });
  const staged = openNoteNativeSnapshot(createNoteNative2Context(sourceText));
  const intrinsic = createNoteNative2Context(sourceText);
  const read: Context['source'] = { document: { documentId, tenantId, workspaceId, product: 'note', title: 'Full A1', creatorUserId: null,
    metadataRevision: 1, mode: 'snapshot', pageId: 'native2-note-A', documentKey: `wonffice-${tenantId}-${documentId}`,
    fileFormat: 'barocss-note', fileVersion: 2, revision: 1, snapshotHash: hash(sourceText) }, snapshotText: sourceText,
    file: { fileVersion: 2, schemaBundle: intrinsic.schemaBundle, document: intrinsic.document, savedAt: intrinsic.savedAt } };
  let current = true; const callbacks = new Set<() => void>(), authorityCallbacks = new Set<() => void>();
  const prior = hash(JSON.stringify(['wonffice.note.snapshot-pins.cas.v1', tenantId, workspaceId, documentId, 'pinned', read.file.schemaBundle.selected.map(r => [r.schemaId, r.version, r.digest])]));
  const prepare = vi.fn(async (input: { snapshotText: string; schemaAction: 'adopt' | 'preserve'; idempotencyKey: string }) => Object.freeze({ ...input,
    expectedRevision: 1, expectedSnapshotHash: hash(sourceText), expectedPriorPinDigest: prior,
    candidateSnapshotHash: hash(input.snapshotText), requestHash: hash(JSON.stringify(['note-native2-snapshot-v1', tenantId, workspaceId, documentId,
      input.schemaAction, 1, hash(sourceText), prior, input.snapshotText])) }));
  const context: Context = { source: read, prepare, isCurrent: () => current, retire: vi.fn(),
    subscribeRetirement: callback => { callbacks.add(callback); return () => { callbacks.delete(callback); }; },
    validateSource: vi.fn(async (): Promise<Native2Validation> => ({ status: 'structurally_valid', kind: 'document', documentId, documentRevision: 1,
      snapshotHash: hash(sourceText), priorPinDigest: prior, checks: ['current_authority', 'current_source'] })),
    validate: vi.fn(async (attempt: Native2MutationAttempt): Promise<Native2Validation> => ({ status: 'structurally_valid', kind: 'candidate', documentId, documentRevision: 1,
      snapshotHash: hash(sourceText), priorPinDigest: prior, candidateSnapshotHash: attempt.candidateSnapshotHash, action: 'adopt', checks: ['candidate_file'] })),
    update: vi.fn(async (): Promise<Awaited<ReturnType<Context['update']>>> => { throw Error('Not configured'); }),
    recover: vi.fn(async () => { throw Error('No recovery effect from preview/validation'); }) };
  const factory: Factory = { open: vi.fn(async () => context), isCurrent: () => current, retire: vi.fn(), subscribeRetirement: context.subscribeRetirement };
  const createMutationLease = vi.fn(async () => factory);
  const source: Native2StageSource = { session: authority, authority, resourceIds: [],
    scope: { issuer: 'controlled-issuer', subject: 'controlled-subject', currentUserId: null, tenantId, workspaceId, documentId },
    sourceSnapshot: () => JSON.stringify(authority.editor.exportDocument()), isCurrent: () => current,
    subscribeAuthority: callback => { authorityCallbacks.add(callback); return () => { authorityCallbacks.delete(callback); }; } };
  const stage: Native2ReadonlyStage = { session: staged, read, isCurrent: () => current, dispose: vi.fn() };
  const storage = new MemoryStorage();
  const journal = createExperimentalNative2AdoptJournal({ scope: { issuer: source.scope.issuer, subject: source.scope.subject, tenantId, workspaceId }, documentId, storage, isWritableCurrent: () => current });
  const receipt = (attempt: Native2MutationAttempt) => ({ operation: 'update' as const, idempotencyKey: attempt.idempotencyKey,
    requestHash: attempt.requestHash, document: { ...read.document, revision: 2, snapshotHash: attempt.candidateSnapshotHash },
    snapshotText: attempt.snapshotText, selectedPinsChanged: true });
  vi.mocked(context.update).mockImplementation(async attempt => {
    expect((await journal.office.read())?.fixed?.requestHash).toBe(attempt.requestHash);
    return receipt(attempt);
  });
  const target = createNoteNative2Context(candidateText);
  const nextRead: Context['source'] = { document: { ...read.document, revision: 2, snapshotHash: hash(candidateText) }, snapshotText: candidateText,
    file: { fileVersion: 2, schemaBundle: target.schemaBundle, document: target.document, savedAt: target.savedAt } };
  const nextCallbacks = new Set<() => void>();
  const nextLease = { read: nextRead, provenance: { ...source.scope, role: 'owner' as const }, isCurrent: () => current,
    retire: vi.fn(), subscribeRetirement: (callback: () => void) => { nextCallbacks.add(callback); return () => { nextCallbacks.delete(callback); }; } };
  const reader: Native2StageReadFactory = { open: vi.fn(async () => nextLease), retire: vi.fn(), isCurrent: () => current,
    subscribeRetirement: nextLease.subscribeRetirement };
  const createReadLease = vi.fn(async () => reader);
  const recovery: ReturnType<typeof createAuthenticatedNative2ReceiptRecovery> = { isCurrent: () => current, retire: vi.fn(),
    subscribeRetirement: context.subscribeRetirement,
    recover: vi.fn(async original => ({ kind: 'historical_acknowledgment' as const, original,
      receipt: { operation: 'update' as const, idempotencyKey: original.idempotencyKey,
        requestHash: hash(JSON.stringify(['note-native2-snapshot-v1', tenantId, workspaceId, documentId, original.schemaAction,
          original.expectedRevision, original.expectedSnapshotHash, original.expectedPriorPinDigest, original.snapshotText])),
        document: nextRead.document, snapshotText: original.snapshotText }, isCurrent: () => current,
      retire: vi.fn(), subscribeRetirement: context.subscribeRetirement })) };
  const createReceiptRecoveryLease = vi.fn(async () => recovery);
  const operation = createNative2SchemaAdoptionOperation({ source, stage, journal: journal.office,
    createMutationLease, createReadLease, createReceiptRecoveryLease });
  return { operation, authority, source, stage, context, factory, createMutationLease, storage, journal,
    reader, nextLease, recovery, createReadLease, createReceiptRecoveryLease, receipt,
    retire: () => { current = false; [...callbacks, ...authorityCallbacks, ...nextCallbacks].forEach(callback => callback()); },
    cleanup: () => { operation.dispose(); staged.close(); authority.close(); } };
}
const proposal = (h: ReturnType<typeof setup>) => h.operation.preview({ snapshotText: candidateText, datasetPath: [4, 0], idempotencyKey: 'confirm-1' });

it('requires explicit confirm, durable original9 before PUT, and independent receipt-bound full A2 read', async () => {
  const h = setup();
  try {
    const model = h.authority.editor.exportDocument(), history = h.authority.editor.historyManager.getCurrentIndex();
    await proposal(h).validate(); expect(h.context.update).not.toHaveBeenCalled(); expect(h.storage.length).toBe(0);
    const result = await h.operation.confirm();
    expect(h.createMutationLease).toHaveBeenCalledTimes(2); // Fresh confirm does not reuse advisory authority.
    expect(h.context.update).toHaveBeenCalledTimes(1); expect(h.createReadLease).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('receipt-current-read'); expect(result.isCurrent()).toBe(true);
    expect(result.stage.session.exportSnapshot()).toBe(candidateText); expect(result.stage.session.editor.isEditable).toBe(false);
    expect(JSON.parse(JSON.stringify(result.stage.session.exportNativeDocument()))).toEqual(NATIVE_NOTE_FIXTURES.TARGET_A2.document);
    expect(h.stage.dispose).not.toHaveBeenCalled(); expect(h.stage.session.exportSnapshot()).toBe(sourceText);
    expect(h.authority.editor.exportDocument()).toEqual(model); expect(h.authority.editor.historyManager.getCurrentIndex()).toBe(history);
    expect((await h.journal.office.read())?.phase).toBe('pending'); // Persisted data does not declare current native adoption.
    await expect(h.operation.confirm()).rejects.toThrow('confirmation_unavailable');
  } finally { h.cleanup(); }
});

it('quota failure blocks PUT and leaves source and journal intact', async () => {
  const h = setup();
  try { proposal(h); h.storage.fail = true; await expect(h.operation.confirm()).rejects.toThrow('controlled quota');
    expect(h.context.update).not.toHaveBeenCalled(); expect(h.createReadLease).not.toHaveBeenCalled(); expect(h.storage.length).toBe(0);
    expect(h.stage.session.exportSnapshot()).toBe(sourceText);
  } finally { h.cleanup(); }
});

it('fresh confirm refuses changed A head even after advisory PASS and never rebases', async () => {
  const h = setup();
  try { await proposal(h).validate(); vi.mocked(h.factory.open).mockResolvedValueOnce({ ...h.context,
    source: { ...h.context.source, document: { ...h.context.source.document, revision: 2 } } });
    await expect(h.operation.confirm()).rejects.toThrow('native2_adoption_source_changed');
    expect(h.context.update).not.toHaveBeenCalled(); expect(h.storage.length).toBe(0);
  } finally { h.cleanup(); }
});

it('lost acknowledgment keeps original operation and later incomplete draft separately; fresh GET is historical only', async () => {
  const h = setup(); let release!: () => void;
  try {
    proposal(h); vi.mocked(h.context.update).mockImplementationOnce(async () => { await new Promise<void>(r => { release = r; }); throw Error('lost acknowledgment'); });
    const waiting = h.operation.confirm(); void waiting.catch(() => {}); await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    const before = (await h.journal.office.read())?.fixed;
    await h.operation.recordCandidate('{later incomplete'); release(); await expect(waiting).rejects.toThrow('lost acknowledgment');
    const record = await h.journal.office.read(); expect(record?.fixed).toEqual(before);
    expect(record?.latestCandidate.snapshotText).toBe('{later incomplete'); expect(record?.phase).toBe('unknown');
    const recovered = await h.operation.recoverHistorical(); expect(recovered.status).toBe('historical-acknowledgment');
    expect(h.recovery.recover).toHaveBeenCalledWith(before?.original); expect(h.context.update).toHaveBeenCalledTimes(1);
    expect(h.createReadLease).not.toHaveBeenCalled(); expect((await h.journal.office.read())?.phase).toBe('historical-acknowledgment');
    expect((await h.journal.office.read())?.latestCandidate.snapshotText).toBe('{later incomplete');
  } finally { release?.(); h.cleanup(); }
});

it('wrong receipt refuses A2 read and retains exact unknown operation', async () => {
  const h = setup();
  try { proposal(h); vi.mocked(h.context.update).mockImplementationOnce(async attempt => ({ ...h.receipt(attempt), idempotencyKey: 'foreign' }));
    await expect(h.operation.confirm()).rejects.toThrow('invalid_service_response'); expect(h.createReadLease).not.toHaveBeenCalled();
    expect((await h.journal.office.read())?.phase).toBe('unknown');
  } finally { h.cleanup(); }
});

it('another fresh current head cannot become receipt-confirmed A2', async () => {
  const h = setup();
  try { proposal(h); vi.mocked(h.reader.open).mockResolvedValueOnce({ ...h.nextLease,
    read: { ...h.nextLease.read, document: { ...h.nextLease.read.document, revision: 3 } } });
    await expect(h.operation.confirm()).rejects.toThrow('native2_adoption_receipt_head_changed');
    expect(h.stage.dispose).not.toHaveBeenCalled(); expect((await h.journal.office.read())?.phase).toBe('unknown');
  } finally { h.cleanup(); }
});

it('actual root input during held fresh authority stops PUT without discarding new native/history', async () => {
  const h = setup(); let release!: (context: Context) => void;
  try { proposal(h); vi.mocked(h.factory.open).mockReturnValueOnce(new Promise(resolve => { release = resolve; }));
    const waiting = h.operation.confirm(); void waiting.catch(() => {}); await Promise.resolve();
    const leaf = [...h.authority.editor.dataStore.getNodes().values()].find(node => node.text === 'Preserved mounted source S')!;
    await h.authority.editor.executeCommand('replaceText', { range: { type: 'range', startNodeId: leaf.sid!, endNodeId: leaf.sid!, startOffset: 0, endOffset: 0, collapsed: true }, text: 'latest input / ' });
    const raw = h.authority.editor.exportDocument(), index = h.authority.editor.historyManager.getCurrentIndex();
    release(h.context); await expect(waiting).rejects.toThrow('operation_retired');
    expect(h.context.update).not.toHaveBeenCalled(); expect(h.authority.editor.exportDocument()).toEqual(raw);
    expect(h.authority.editor.historyManager.getCurrentIndex()).toBe(index); expect(h.stage.dispose).not.toHaveBeenCalled();
  } finally { release?.(h.context); h.cleanup(); }
});

it('source retirement during held PUT refuses late result while fixed durable pending bytes survive', async () => {
  const h = setup(); let release!: () => void;
  try { proposal(h); vi.mocked(h.context.update).mockImplementationOnce(async attempt => { await new Promise<void>(r => { release = r; }); return h.receipt(attempt); });
    const waiting = h.operation.confirm(); void waiting.catch(() => {}); await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    const before = h.storage.getItem(h.journal.key); h.retire(); release(); await expect(waiting).rejects.toThrow('operation_retired');
    expect(h.storage.getItem(h.journal.key)).toBe(before); expect(h.createReadLease).not.toHaveBeenCalled(); expect(h.stage.dispose).not.toHaveBeenCalled();
  } finally { release?.(); h.cleanup(); }
});

it('reload candidate generation advances from durable state; a persisted fixed operation cannot send again', async () => {
  const h = setup();
  try {
    await h.journal.office.writeCandidate({ document: h.stage.read.document, snapshotText: h.stage.read.snapshotText }, { generation: 9, snapshotText: '{old draft' }); proposal(h);
    await h.operation.confirm(); expect((await h.journal.office.read())?.fixed?.generation).toBe(10);
    const fresh = createNative2SchemaAdoptionOperation({ source: h.source, stage: h.stage, journal: h.journal.office,
      createMutationLease: h.createMutationLease, createReadLease: h.createReadLease, createReceiptRecoveryLease: h.createReceiptRecoveryLease });
    try { fresh.preview({ snapshotText: candidateText, datasetPath: [4, 0], idempotencyKey: 'confirm-1' });
      await expect(fresh.confirm()).rejects.toThrow('native2_adoption_operation_fixed'); expect(h.context.update).toHaveBeenCalledTimes(1);
    } finally { fresh.dispose(); }
  } finally { h.cleanup(); }
});


it('joins actual private Office mutation/reader/WeakMap attempt with real journal and native models under controlled HTTP', async () => {
  vi.resetModules();
  const issuer = 'https://controlled-operation.example.test', subject = 'controlled-operation-person';
  vi.stubEnv('VITE_OFFICE_OIDC_ISSUER', issuer); vi.stubEnv('VITE_OFFICE_OIDC_CLIENT_ID', 'controlled-operation');
  const NativeRequest = globalThis.Request;
  vi.stubGlobal('Request', class extends NativeRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) { super(typeof input === 'string' ? new URL(input, location.origin) : input, init); }
  });
  const authority = openNoteTree({ stype: 'note', content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Real retained source S' }] }] });
  const callbacks = new Set<() => void>();
  const storage = new MemoryStorage();
  const base = { documentId, tenantId, workspaceId, product: 'note' as const, title: 'Full A1', creatorUserId: null,
    metadataRevision: 1, mode: 'snapshot' as const, pageId: 'native2-note-A', documentKey: `wonffice-${tenantId}-${documentId}`,
    fileFormat: 'barocss-note' as const, fileVersion: 2 as const, revision: 1, snapshotHash: hash(sourceText) };
  const prior = hash(JSON.stringify(['wonffice.note.snapshot-pins.cas.v1', tenantId, workspaceId, documentId, 'pinned',
    NATIVE_NOTE_FIXTURES.SOURCE_A.schemaBundle.selected.map(r => [r.schemaId, r.version, r.digest])]));
  let updated = false, effects = 0;
  const calls: { path: string; method: string; body: string }[] = [];
  let journal: ReturnType<typeof createExperimentalNative2AdoptJournal>;
  vi.stubGlobal('fetch', vi.fn(async (input: string | Request, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.origin);
    if (url.pathname.endsWith('/.well-known/openid-configuration')) return Response.json({ issuer,
      authorization_endpoint: issuer + '/authorize', token_endpoint: issuer + '/token' });
    if (url.href === issuer + '/token') return Response.json({ access_token: 'controlled-operation-memory', token_type: 'bearer', expires_in: 3600 });
    const request = input instanceof Request ? input : new Request(input, init), body = await request.clone().text();
    calls.push({ path: url.pathname, method: request.method, body });
    if (url.pathname === '/api/v1/me') return Response.json({ issuer, subject, currentUserId: null,
      tenants: [{ tenantId, name: 'Controlled tenant', role: 'editor' }], nextCursor: null });
    if (url.pathname.endsWith('/access')) return Response.json({ tenantId, role: 'editor' });
    if (url.pathname.endsWith('/workspaces')) return Response.json({ workspaces: [{ id: workspaceId, name: 'Controlled workspace' }], nextCursor: null });
    if (url.pathname.endsWith('/documents/' + documentId)) return Response.json({ document: updated ? { ...base, revision: 2, snapshotHash: hash(candidateText) } : base,
      snapshotText: updated ? candidateText : sourceText });
    if (url.pathname.endsWith('/schema-bundle')) return Response.json({ status: 'pinned', documentId, documentRevision: updated ? 2 : 1,
      snapshotHash: hash(updated ? candidateText : sourceText), nativeFormat: { format: 'barocss-note', version: 2 },
      bundle: updated ? NATIVE_NOTE_FIXTURES.TARGET_A2.schemaBundle : NATIVE_NOTE_FIXTURES.SOURCE_A.schemaBundle });
    if (url.pathname.endsWith('/validation')) {
      const value: { kind: string } = JSON.parse(body);
      const checks = ['current_authority', 'current_source', 'native2_file', 'registered_bundle', 'source_preconditions'];
      return Response.json({ status: 'structurally_valid', kind: value.kind, documentId, documentRevision: 1,
        snapshotHash: hash(sourceText), priorPinDigest: prior, checks: value.kind === 'document' ? checks :
          [...checks, 'candidate_file', 'candidate_registered_bundle', 'candidate_action_policy', 'pin_transition'],
        ...(value.kind === 'candidate' ? { candidateSnapshotHash: hash(candidateText), action: 'adopt' } : {}) });
    }
    if (url.pathname.endsWith('/snapshot') && request.method === 'PUT') {
      const fixed = (await journal.office.read())?.fixed;
      expect(fixed?.original.snapshotText).toBe(candidateText); expect(fixed?.original.idempotencyKey).toBe('real-operation-1');
      expect(JSON.parse(body)).toEqual({ schemaAction: 'adopt', expectedRevision: 1, expectedSnapshotHash: hash(sourceText),
        expectedPriorPinDigest: prior, snapshotText: candidateText, idempotencyKey: 'real-operation-1' });
      effects++; updated = true;
      return Response.json({ operation: 'update', idempotencyKey: 'real-operation-1', requestHash: fixed?.requestHash,
        document: { ...base, revision: 2, snapshotHash: hash(candidateText) }, snapshotText: candidateText });
    }
    throw Error('Unexpected controlled route ' + url.pathname);
  }));
  const auth = await import('../../office/src/auth-client');
  let operation: ReturnType<typeof createNative2SchemaAdoptionOperation> | undefined;
  let initial: ReturnType<typeof createExperimentalNative2ReadStage> | undefined;
  const readers: Native2StageReadFactory[] = [];
  try {
    sessionStorage.setItem('wonffice.oidc.pending', JSON.stringify({ state: 'state', verifier: 'verifier', intent: 'user' }));
    history.replaceState(null, '', '/auth/callback?state=state&code=code'); await auth.finishLogin();
    const host = await import('../../office/src/native2-authenticated-host');
    const readerApi = await import('../../office/src/native2-authenticated-reader');
    const binding = { isAuthorized: () => true, subscribeAuthority: (callback: () => void) => { callbacks.add(callback); return () => { callbacks.delete(callback); }; } };
    const source: Native2StageSource = { session: authority, authority, resourceIds: [], scope: { issuer, subject, currentUserId: null, tenantId, workspaceId, documentId },
      sourceSnapshot: () => JSON.stringify(authority.editor.exportDocument()), isCurrent: () => true, subscribeAuthority: binding.subscribeAuthority };
    const createReadLease = vi.fn(async () => { const reader = readerApi.createAuthenticatedNative2Reader(); readers.push(reader); return reader; });
    const leaf = [...authority.editor.dataStore.getNodes().values()].find(node => node.text === 'Real retained source S')!;
    expect(await authority.editor.executeCommand('replaceText', { range: { type: 'range', startNodeId: leaf.sid!, endNodeId: leaf.sid!,
      startOffset: 0, endOffset: 0, collapsed: true }, text: 'retained source input / ' })).toBe(true);
    const originalModel = authority.editor.exportDocument(), manager = authority.editor.historyManager, originalIndex = manager.getCurrentIndex();
    const entries = manager.getHistory().map(entry => ({ entry, forward: entry.operations, backward: entry.inverseOperations,
      operations: [...entry.operations], inverses: [...entry.inverseOperations] }));
    const first = await createReadLease();
    initial = createExperimentalNative2ReadStage({ source, readFresh: () => first.open({ tenantId, workspaceId, documentId }) });
    const stage = await initial.stage();
    journal = createExperimentalNative2AdoptJournal({ scope: { issuer, subject, tenantId, workspaceId }, documentId, storage, isWritableCurrent: () => stage.isCurrent() });
    operation = createNative2SchemaAdoptionOperation({ source, stage, journal: journal.office, createReadLease,
      createMutationLease: host.noteMutationLeaseFactory(tenantId, workspaceId, binding),
      createReceiptRecoveryLease: host.noteReceiptRecoveryLeaseFactory(tenantId, workspaceId, binding) });
    await operation.preview({ snapshotText: candidateText, datasetPath: [4, 0], idempotencyKey: 'real-operation-1' }).validate();
    expect(effects).toBe(0); const result = await operation.confirm();
    expect(effects).toBe(1); expect(result.isCurrent()).toBe(true); expect(stage.isCurrent()).toBe(true);
    expect(result.stage.session.exportSnapshot()).toBe(candidateText); expect(stage.session.exportSnapshot()).toBe(sourceText);
    expect(readers).toHaveLength(2); expect(calls.filter(c => c.method === 'PUT')).toHaveLength(1);
    expect(authority.editor.exportDocument()).toEqual(originalModel); expect(authority.editor.historyManager).toBe(manager);
    expect(manager.getCurrentIndex()).toBe(originalIndex);
    entries.forEach((before, index) => { const now = manager.getHistory()[index]; expect(now).toBe(before.entry);
      expect(now.operations).toBe(before.forward); expect(now.inverseOperations).toBe(before.backward);
      now.operations.forEach((value, at) => expect(value).toBe(before.operations[at]));
      now.inverseOperations.forEach((value, at) => expect(value).toBe(before.inverses[at])); });
    operation.dispose(); expect(stage.isCurrent()).toBe(true);
  } finally { operation?.dispose(); initial?.dispose(); readers.forEach(reader => reader.retire()); authority.close(); auth.clearSession();
    vi.unstubAllGlobals(); vi.unstubAllEnvs(); sessionStorage.clear(); }
});

it('a later incomplete candidate during held confirmation validation survives unchanged and blocks the older PUT', async () => {
  const h = setup(); let release!: (value: Native2Validation) => void;
  try {
    const result = await h.context.validate(await h.context.prepare({ snapshotText: candidateText, schemaAction: 'adopt', idempotencyKey: 'confirm-1' }));
    vi.mocked(h.context.validate).mockReturnValueOnce(new Promise(resolve => { release = resolve; }));
    proposal(h); const waiting = h.operation.confirm(); void waiting.catch(() => {});
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    await h.operation.recordCandidate('{newer draft during validation'); const before = h.storage.getItem(h.journal.key);
    release(result); await expect(waiting).rejects.toBeDefined();
    expect(h.storage.getItem(h.journal.key)).toBe(before); expect(h.context.update).not.toHaveBeenCalled();
    expect((await h.journal.office.read())?.latestCandidate.snapshotText).toBe('{newer draft during validation');
  } finally { h.cleanup(); }
});

it.each(['candidate', 'fixed'] as const)('operation-only dispose during real journal %s hashing preserves pre-barrier storage bytes', async phase => {
  const h = setup(); let entered!: () => void, release!: () => void;
  const reached = new Promise<void>(resolve => { entered = resolve; }), held = new Promise<void>(resolve => { release = resolve; });
  const realDigest = crypto.subtle.digest.bind(crypto.subtle); let intercepted = false;
  const spy = vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const value = await realDigest(...args), text = new TextDecoder().decode(args[1]);
    if (!intercepted && (phase === 'candidate' ? text === sourceText : text.startsWith('["note-native2-snapshot-v1"'))) {
      intercepted = true; entered(); await held;
    }
    return value;
  });
  try {
    proposal(h);
    const waiting = phase === 'candidate' ? h.operation.recordCandidate(candidateText) : h.operation.confirm();
    void waiting.catch(() => {}); await reached;
    const before = h.storage.getItem(h.journal.key);
    expect(h.source.isCurrent()).toBe(true); expect(h.stage.isCurrent()).toBe(true);
    h.operation.dispose(); release(); await expect(waiting).rejects.toBeDefined();
    expect(h.storage.getItem(h.journal.key)).toBe(before); expect(h.context.update).not.toHaveBeenCalled();
    expect(h.stage.dispose).not.toHaveBeenCalled();
  } finally { release(); spy.mockRestore(); h.cleanup(); }
});
