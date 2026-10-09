import { afterEach, expect, it, vi } from 'vitest';
import { createNoteNative2Context, openNoteNativeSnapshot, openNoteTree } from '@barocss/office-note';
import { NATIVE_NOTE_FIXTURES } from './native2-scenario-fixtures';
import { createNative2SchemaAdoptionPreview } from './native2-schema-adoption-preview';

const sourceText = JSON.stringify(NATIVE_NOTE_FIXTURES.SOURCE_A);
const candidateText = JSON.stringify(NATIVE_NOTE_FIXTURES.TARGET_A2, null, 2) + '\n';
const jsonValue = (value: unknown): unknown => JSON.parse(JSON.stringify(value));
afterEach(() => vi.unstubAllGlobals());

it('admits the independently authored complete A2 Owner declaration into its own readonly model', () => {
  const before = JSON.stringify(NATIVE_NOTE_FIXTURES), path = [4, 0];
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  const value = createNative2SchemaAdoptionPreview(sourceText, candidateText, path);
  try {
    path[0] = 99;
    expect(value.status).toBe('preview_only');
    expect(value.sourceSnapshotText).toBe(sourceText);
    expect(value.candidateSnapshotText).toBe(candidateText);
    expect(value.datasetPath).toStrictEqual([4, 0]);
    expect(Object.getPrototypeOf(value.prior)).toBeNull();
    expect(Object.getPrototypeOf(value.next)).toBeNull();
    expect(jsonValue(value.prior)).toStrictEqual(NATIVE_NOTE_FIXTURES.SOURCE_A.schemaBundle.selected[0]);
    expect(jsonValue(value.next)).toStrictEqual(NATIVE_NOTE_FIXTURES.TARGET_A2.schemaBundle.selected[0]);
    expect(value.session.editor.isEditable).toBe(false);
    expect(value.session.exportSnapshot()).toBe(candidateText);
    expect(jsonValue(value.session.exportNativeDocument())).toStrictEqual(NATIVE_NOTE_FIXTURES.TARGET_A2.document);
    expect(jsonValue(value.session.context.schemaBundle)).toStrictEqual(NATIVE_NOTE_FIXTURES.TARGET_A2.schemaBundle);
    expect(value.session.editor.getHistoryStats()).toStrictEqual({ totalEntries: 0, currentIndex: -1, canUndo: false, canRedo: false });
    expect(JSON.stringify(NATIVE_NOTE_FIXTURES)).toBe(before);
    expect(fetcher).not.toHaveBeenCalled();
  } finally { value.dispose(); value.dispose(); }
  expect(() => value.session.exportNativeDocument()).toThrow('native_context_changed');
});

it('preserves an operated source, last root/nested input and whole B while closing only its candidate', async () => {
  const authority = openNoteTree({ stype: 'note', content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Original authority' }] }] });
  const source = openNoteNativeSnapshot(createNoteNative2Context(sourceText), { authority: authority.editor });
  try {
    const leaf = [...source.editor.dataStore.getNodes().values()].find(node => node.text === '목표 A');
    if (!leaf?.sid) throw new Error('Original source SID required');
    expect(await source.editor.executeCommand('replaceText', { range: { type: 'range', startNodeId: leaf.sid,
      endNodeId: leaf.sid, startOffset: 4, endOffset: 4, collapsed: true }, text: ' / retained input' })).toBe(true);
    const resource = [...source.editor.dataStore.getNodes().values()].find(node => node.stype === 'richText');
    if (!resource?.sid) throw new Error('Original nested resource required');
    const child = source.openChildResource(resource.sid);
    try {
      const text = [...child.editor.dataStore.getNodes().values()].find(node => node.text === '항목 본문 A');
      if (!text?.sid) throw new Error('Original nested SID required');
      expect(await child.editor.executeCommand('replaceText', { range: { type: 'range', startNodeId: text.sid,
        endNodeId: text.sid, startOffset: 7, endOffset: 7, collapsed: true }, text: ' / retained nested input' })).toBe(true);
      expect(await source.commitChildResource(resource.sid, child)).toBe(true);
    } finally { child.close(); }
    const before = { raw: source.exportSnapshot(), native: source.exportNativeDocument(), model: source.editor.exportDocument(),
      selection: source.editor.selection, manager: source.editor.historyManager, index: source.editor.historyManager.getCurrentIndex() };
    const entries = before.manager.getHistory().map(entry => ({ entry, forward: entry.operations, inverse: entry.inverseOperations }));
    const b = JSON.stringify(NATIVE_NOTE_FIXTURES.SOURCE_B);
    expect(entries.length).toBeGreaterThan(0);
    const value = createNative2SchemaAdoptionPreview(sourceText, candidateText, [4, 0]);
    value.dispose();
    expect(source.editor.isEditable).toBe(true);
    expect(source.exportSnapshot()).toBe(before.raw);
    expect(source.exportNativeDocument()).toStrictEqual(before.native);
    expect(source.editor.exportDocument()).toStrictEqual(before.model);
    expect(source.editor.selection).toStrictEqual(before.selection);
    expect(source.editor.historyManager).toBe(before.manager);
    expect(before.manager.getCurrentIndex()).toBe(before.index);
    expect(before.manager.getHistory()).toHaveLength(entries.length);
    for (const [index, reference] of entries.entries()) {
      const entry = before.manager.getHistory()[index];
      expect(entry).toBe(reference.entry); expect(entry.operations).toBe(reference.forward); expect(entry.inverseOperations).toBe(reference.inverse);
    }
    expect(JSON.stringify(NATIVE_NOTE_FIXTURES.SOURCE_B)).toBe(b);
  } finally { source.close(); authority.close(); }
});

it('refuses pin-only substitution and an unrelated native body change with all input bytes retained', () => {
  const pinOnly = JSON.stringify({ ...NATIVE_NOTE_FIXTURES.SOURCE_A, schemaBundle: NATIVE_NOTE_FIXTURES.TARGET_A2.schemaBundle });
  expect(() => createNative2SchemaAdoptionPreview(sourceText, pinOnly, [4, 0])).toThrow();
  const unrelated = structuredClone(NATIVE_NOTE_FIXTURES.TARGET_A2);
  unrelated.document.attributes.title = 'Unrelated title edit';
  const changed = JSON.stringify(unrelated), before = sourceText;
  expect(() => createNative2SchemaAdoptionPreview(sourceText, changed, [4, 0])).toThrow('native2_preview_unrelated_native_change');
  expect(sourceText).toBe(before);
  expect(changed).toBe(JSON.stringify(unrelated));
});

it('refuses a wrong dataset path, unchanged pin and complete B retargeted as A2', () => {
  expect(() => createNative2SchemaAdoptionPreview(sourceText, candidateText, [4, 1])).toThrow('invalid_native2_dataset_path');
  expect(() => createNative2SchemaAdoptionPreview(sourceText, sourceText, [4, 0])).toThrow('unsupported_native2_adoption');
  const b = JSON.stringify(NATIVE_NOTE_FIXTURES.SOURCE_B);
  expect(() => createNative2SchemaAdoptionPreview(b, candidateText, [4, 0])).toThrow();
  expect(b).toBe(JSON.stringify(NATIVE_NOTE_FIXTURES.SOURCE_B));
});

it('refuses reordered or reserialized original definition texts without normalizing the candidate', () => {
  for (const kind of ['order', 'text'] as const) {
    const candidate = structuredClone(NATIVE_NOTE_FIXTURES.TARGET_A2);
    if (kind === 'order') [candidate.schemaBundle.definitions[0], candidate.schemaBundle.definitions[1]] =
      [candidate.schemaBundle.definitions[1], candidate.schemaBundle.definitions[0]];
    else candidate.schemaBundle.definitions[0].definitionText += '\n';
    const text = JSON.stringify(candidate);
    expect(() => createNative2SchemaAdoptionPreview(sourceText, text, [4, 0])).toThrow('native2_preview_original_definition_changed');
    expect(JSON.stringify(candidate)).toBe(text);
  }
});
