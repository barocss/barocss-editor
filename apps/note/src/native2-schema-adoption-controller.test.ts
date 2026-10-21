import { createHash } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { createNoteNative2Context, openNoteNativeSnapshot, openNoteTree } from '@barocss/office-note';
import type { createAuthenticatedNative2Mutation, Native2MutationAttempt, Native2Validation } from '../../office/src/native2-authenticated-mutation';
import type { Native2StageSource, Native2ReadonlyStage } from './experimental-native2-authenticated-stage';
import { NATIVE_NOTE_FIXTURES } from './native2-scenario-fixtures';
import { createNative2SchemaAdoptionController } from './native2-schema-adoption-controller';

const tenantId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', workspaceId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const documentId = '33333333-3333-4333-8333-333333333333';
const sourceText = JSON.stringify(NATIVE_NOTE_FIXTURES.SOURCE_A), candidateText = JSON.stringify(NATIVE_NOTE_FIXTURES.TARGET_A2, null, 2) + '\n';
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
type Factory = ReturnType<typeof createAuthenticatedNative2Mutation>;
type Context = Awaited<ReturnType<Factory['open']>>;
afterEach(() => vi.restoreAllMocks());
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
    update: vi.fn(async () => { throw Error('No update permission from this advisory coordinator'); }),
    recover: vi.fn(async () => { throw Error('No recovery effect from preview/validation'); }) };
  const factory: Factory = { open: vi.fn(async () => context), isCurrent: () => current, retire: vi.fn(), subscribeRetirement: context.subscribeRetirement };
  const createMutationLease = vi.fn(async () => factory);
  const source: Native2StageSource = { session: authority, authority, resourceIds: [],
    scope: { issuer: 'controlled-issuer', subject: 'controlled-subject', currentUserId: null, tenantId, workspaceId, documentId },
    sourceSnapshot: () => JSON.stringify(authority.editor.exportDocument()), isCurrent: () => current,
    subscribeAuthority: callback => { authorityCallbacks.add(callback); return () => { authorityCallbacks.delete(callback); }; } };
  const stage: Native2ReadonlyStage = { session: staged, read, isCurrent: () => current, dispose: vi.fn() };
  const controller = createNative2SchemaAdoptionController({ source, stage, createMutationLease });
  return { controller, authority, source, stage, context, factory, createMutationLease,
    retire: () => { current = false; [...callbacks, ...authorityCallbacks].forEach(callback => callback()); },
    cleanup: () => { controller.dispose(); staged.close(); authority.close(); } };
}

it('opens complete readonly A2 with no transport or write, then explicitly validates advisory data only', async () => {
  const h = setup();
  try {
    const model = h.authority.editor.exportDocument(), index = h.authority.editor.historyManager.getCurrentIndex();
    const value = h.controller.preview({ snapshotText: candidateText, datasetPath: [4, 0], idempotencyKey: 'advisory-1' });
    expect(value.view.session.exportSnapshot()).toBe(candidateText);
    expect(JSON.parse(JSON.stringify(value.view.session.exportNativeDocument()))).toEqual(NATIVE_NOTE_FIXTURES.TARGET_A2.document);
    expect(h.createMutationLease).not.toHaveBeenCalled();
    const validated = await value.validate();
    expect(validated.status).toBe('structurally_valid'); expect(validated.advisory).toBe(true); expect(validated.isCurrent()).toBe(true);
    expect(h.factory.open).toHaveBeenCalledWith({ tenantId, workspaceId, documentId });
    expect(h.context.prepare).toHaveBeenCalledWith({ snapshotText: candidateText, schemaAction: 'adopt', idempotencyKey: 'advisory-1' });
    expect(h.context.update).not.toHaveBeenCalled(); expect(h.context.recover).not.toHaveBeenCalled();
    expect(Object.keys(value)).not.toContain('confirm'); expect(Object.keys(validated)).not.toContain('saved');
    value.dispose(); value.dispose(); expect(h.authority.editor.exportDocument()).toEqual(model);
    expect(h.authority.editor.historyManager.getCurrentIndex()).toBe(index); expect(h.stage.dispose).not.toHaveBeenCalled();
    expect(h.stage.session.exportSnapshot()).toBe(sourceText);
  } finally { h.cleanup(); }
});

it('refuses a fresh context with another original head/raw instead of rebasing the proposal', async () => {
  const h = setup();
  try {
    const value = h.controller.preview({ snapshotText: candidateText, datasetPath: [4, 0], idempotencyKey: 'advisory-1' });
    vi.mocked(h.factory.open).mockResolvedValueOnce({ ...h.context, source: { ...h.context.source, document: { ...h.context.source.document, revision: 2 } } });
    await expect(value.validate()).rejects.toThrow('native2_adoption_source_changed');
    expect(h.context.prepare).not.toHaveBeenCalled(); expect(h.context.validate).not.toHaveBeenCalled(); expect(h.context.update).not.toHaveBeenCalled();
  } finally { h.cleanup(); }
});

it('source mutation during held open refuses without acknowledging or replacing the source', async () => {
  const h = setup(); let release!: (context: Context) => void;
  try {
    vi.mocked(h.factory.open).mockReturnValueOnce(new Promise(resolve => { release = resolve; }));
    const value = h.controller.preview({ snapshotText: candidateText, datasetPath: [4, 0], idempotencyKey: 'advisory-1' });
    const waiting = value.validate(); await Promise.resolve();
    const leaf = [...h.authority.editor.dataStore.getNodes().values()].find(node => node.text === 'Preserved mounted source S')!;
    expect(await h.authority.editor.executeCommand('replaceText', { range: { type: 'range', startNodeId: leaf.sid!, endNodeId: leaf.sid!,
      startOffset: 0, endOffset: 0, collapsed: true }, text: 'last source input / ' })).toBe(true);
    const changed = h.authority.editor.exportDocument(), history = h.authority.editor.historyManager.getCurrentIndex();
    release(h.context); await expect(waiting).rejects.toThrow('native2_adoption_preview_retired');
    expect(h.authority.editor.exportDocument()).toEqual(changed); expect(h.authority.editor.historyManager.getCurrentIndex()).toBe(history);
    expect(h.context.validate).not.toHaveBeenCalled(); expect(h.stage.dispose).not.toHaveBeenCalled();
  } finally { release?.(h.context); h.cleanup(); }
});

it('terminal authority retirement during validation rejects its late advisory result and leaves originals intact', async () => {
  const h = setup(); let release!: (value: Awaited<ReturnType<Context['validate']>>) => void;
  try {
    const result = await h.context.validate(await h.context.prepare({ snapshotText: candidateText, schemaAction: 'adopt', idempotencyKey: 'advisory-1' }));
    vi.mocked(h.context.validate).mockReturnValueOnce(new Promise(resolve => { release = resolve; }));
    const value = h.controller.preview({ snapshotText: candidateText, datasetPath: [4, 0], idempotencyKey: 'advisory-1' });
    const waiting = value.validate(); await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    h.retire(); release(result); await expect(waiting).rejects.toThrow('native2_adoption_preview_retired');
    expect(value.isCurrent()).toBe(false); expect(h.stage.dispose).not.toHaveBeenCalled(); expect(h.stage.session.exportSnapshot()).toBe(sourceText);
  } finally { h.cleanup(); }
});

it('a newer candidate retires an old pending validation without retiring the newer readonly model', async () => {
  const h = setup(); let release!: (context: Context) => void;
  try {
    vi.mocked(h.factory.open).mockReturnValueOnce(new Promise(resolve => { release = resolve; }));
    const first = h.controller.preview({ snapshotText: candidateText, datasetPath: [4, 0], idempotencyKey: 'advisory-1' });
    const waiting = first.validate(); await Promise.resolve();
    const second = h.controller.preview({ snapshotText: candidateText + ' ', datasetPath: [4, 0], idempotencyKey: 'advisory-2' });
    release(h.context); await expect(waiting).rejects.toThrow('native2_adoption_preview_retired');
    expect(second.isCurrent()).toBe(true); expect(second.view.session.exportSnapshot()).toBe(candidateText + ' ');
    expect(h.stage.dispose).not.toHaveBeenCalled();
  } finally { release?.(h.context); h.cleanup(); }
});


it('synchronous already-retired factory subscription closes only its own proposal and refuses validation', async () => {
  const h = setup();
  try {
    const value = h.controller.preview({ snapshotText: candidateText, datasetPath: [4, 0], idempotencyKey: 'advisory-1' });
    vi.spyOn(h.factory, 'subscribeRetirement').mockImplementation(callback => { callback(); return vi.fn(); });
    await expect(value.validate()).rejects.toThrow('native2_adoption_preview_retired');
    expect(h.factory.open).not.toHaveBeenCalled(); expect(h.context.update).not.toHaveBeenCalled();
    expect(h.stage.dispose).not.toHaveBeenCalled(); expect(h.stage.session.exportSnapshot()).toBe(sourceText);
  } finally { h.cleanup(); }
});

it('preserves operated original history entry/operation identities and full B while qualifying its own readonly proposal', async () => {
  const h = setup(); h.controller.dispose();
  const leaf = [...h.authority.editor.dataStore.getNodes().values()].find(node => node.text === 'Preserved mounted source S')!;
  expect(await h.authority.editor.executeCommand('replaceText', { range: { type: 'range', startNodeId: leaf.sid!, endNodeId: leaf.sid!,
    startOffset: 0, endOffset: 0, collapsed: true }, text: 'retained root input / ' })).toBe(true);
  const controller = createNative2SchemaAdoptionController({ source: h.source, stage: h.stage, createMutationLease: h.createMutationLease });
  const manager = h.authority.editor.historyManager, index = manager.getCurrentIndex();
  const entries = manager.getHistory().map(entry => ({ entry, forward: entry.operations, backward: entry.inverseOperations,
    forwardRefs: [...entry.operations], backwardRefs: [...entry.inverseOperations] }));
  const original = h.authority.editor.exportDocument(), b = JSON.stringify(NATIVE_NOTE_FIXTURES.SOURCE_B);
  try {
    const value = controller.preview({ snapshotText: candidateText, datasetPath: [4, 0], idempotencyKey: 'advisory-1' });
    await value.validate(); controller.dispose();
    expect(h.authority.editor.exportDocument()).toEqual(original); expect(h.authority.editor.historyManager).toBe(manager); expect(manager.getCurrentIndex()).toBe(index);
    entries.forEach((before, i) => { const entry = manager.getHistory()[i]; expect(entry).toBe(before.entry);
      expect(entry.operations).toBe(before.forward); expect(entry.inverseOperations).toBe(before.backward);
      entry.operations.forEach((operation, j) => expect(operation).toBe(before.forwardRefs[j]));
      entry.inverseOperations.forEach((operation, j) => expect(operation).toBe(before.backwardRefs[j])); });
    expect(JSON.stringify(NATIVE_NOTE_FIXTURES.SOURCE_B)).toBe(b); expect(h.stage.dispose).not.toHaveBeenCalled();
  } finally { controller.dispose(); h.cleanup(); }
});

it('foreign staged scope and unrelated candidate native refuse before obtaining an Office factory', () => {
  const h = setup(); h.controller.dispose();
  try {
    const foreign = createNative2SchemaAdoptionController({ source: h.source, stage: { ...h.stage, read: { ...h.stage.read,
      document: { ...h.stage.read.document, documentId: '99999999-9999-4999-8999-999999999999' } } }, createMutationLease: h.createMutationLease });
    expect(() => foreign.preview({ snapshotText: candidateText, datasetPath: [4, 0], idempotencyKey: 'advisory-1' })).toThrow('native2_adoption_source_changed'); foreign.dispose();
    const controller = createNative2SchemaAdoptionController({ source: h.source, stage: h.stage, createMutationLease: h.createMutationLease });
    expect(() => controller.preview({ snapshotText: JSON.stringify(NATIVE_NOTE_FIXTURES.SOURCE_B), datasetPath: [4, 0], idempotencyKey: 'advisory-1' })).toThrow();
    expect(h.createMutationLease).not.toHaveBeenCalled(); controller.dispose();
  } finally { h.cleanup(); }
});
