import { isDeepStrictEqual } from 'node:util';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Editor } from '@barocss/editor-core';
import type { INode } from '@barocss/datastore';
import { transaction } from '@barocss/model';
import { openNoteTree, noteNodeTreeOf, type NoteSession } from '../src/session';
import { createNoteNative2Context, openNoteNativeSnapshot, NativeNoteError, type NativeNoteSession } from '../src/native-session';
import { copyNoteSnapshotFile, readNoteSnapshotFile } from '../src/note-file-codec';
import { NATIVE_NOTE_FIXTURES, NATIVE_NOTE_EXPECTED_VARIANTS, NATIVE_B_VARIANTS } from '../../../apps/note/src/native2-scenario-fixtures';
const sessions: NoteSession[] = [];
afterEach(() => { for (const one of sessions.splice(0).reverse()) one.close(); });
const raw = (value: unknown) => JSON.stringify(value, null, 2) + '\n';
function safeExpected(value: unknown) {
  return JSON.parse(JSON.stringify(value), (_key, field) => field !== null && typeof field === 'object' && !Array.isArray(field) ? Object.assign(Object.create(null), field) : field);
}
const sourceA = NATIVE_NOTE_FIXTURES.SOURCE_A;
function start(file: unknown = sourceA, onSnapshotChange?: (snapshot: string) => void) {
  const parent = openNoteTree({ stype: 'note', content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Host authority' }] }] });
  sessions.push(parent);
  const context = createNoteNative2Context(raw(file)), one = openNoteNativeSnapshot(context, { authority: parent.editor, after: 60000, onSnapshotChange });
  sessions.push(one); return { parent, context, one };
}
function nodes(editor: Editor, sid = editor.getRootId() ?? ''): INode[] {
  const result: INode[] = [];
  const visit = (id: string) => {
    const node = editor.dataStore.getNode(id); if (!node) throw new Error('Real engine node must exist');
    result.push(node); for (const child of node.content ?? []) { if (typeof child !== 'string') throw new Error('Engine children must have owned SIDs'); visit(child); }
  };
  visit(sid); return result;
}
async function append(one: NativeNoteSession, before: string, suffix: string) {
  const node = nodes(one.editor).find(value => value.text === before);
  if (!node?.sid) throw new Error('The independently declared user target must exist');
  const range = { type: 'range' as const, startNodeId: node.sid, endNodeId: node.sid, startOffset: before.length, endOffset: before.length, collapsed: true };
  one.editor.selectionManager.setSelection(range);
  return one.editor.executeCommand('replaceText', { range, text: suffix });
}
function materializedExpected(value: unknown): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return value;
  const result: Record<string, unknown> = { ...value };
  if (!Object.hasOwn(value, 'attributes')) result.attributes = {};
  for (const key of ['text', 'marks', 'content']) if (!Object.hasOwn(value, key)) result[key] = undefined;
  const content = Object.getOwnPropertyDescriptor(value, 'content')?.value;
  if (Array.isArray(content)) result.content = content.map(materializedExpected);
  return result;
}
function nativeProjection(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(nativeProjection);
  if (value === null || typeof value !== 'object') return value;
  const result: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(value)) {
    if (key === 'sid' || key === 'parentId') continue;
    if (key === 'metadata' && field !== null && typeof field === 'object') {
      const metadata = Object.fromEntries(Object.entries(field).filter(([name]) => name !== 'loadedAt'));
      if (Object.keys(metadata).length) result.metadata = metadata;
    } else result[key] = key === 'content' && Array.isArray(field) ? field.map(nativeProjection) : field;
  }
  return result;
}
describe('explicit native2 original Note engine/context bridge', () => {
  it('keeps intrinsic A/B immutable and refuses an unrelated canonical alias before parent/model effects', () => {
    const ctxA = createNoteNative2Context(raw(sourceA)), ctxB = createNoteNative2Context(raw(NATIVE_NOTE_FIXTURES.SOURCE_B));
    expect(ctxA.document).toStrictEqual(safeExpected(sourceA.document)); expect(ctxB.document).toStrictEqual(safeExpected(NATIVE_NOTE_FIXTURES.SOURCE_B.document));
    expect(ctxA.schemaBundle).toStrictEqual(safeExpected(sourceA.schemaBundle)); expect(ctxB.rawSnapshotText).toBe(raw(NATIVE_NOTE_FIXTURES.SOURCE_B));
    expect(Object.isFrozen(ctxA)).toBe(true); expect(Object.isFrozen(ctxB.schemaBundle)).toBe(true);
    const parent = openNoteTree({ stype: 'note', content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Unchanged parent' }] }] }); sessions.push(parent);
    const before = { document: parent.editor.exportDocument(), history: parent.editor.getHistoryStats(), selection: parent.editor.selection };
    const unsupported = structuredClone(NATIVE_NOTE_FIXTURES.SOURCE_B);
    const marked = unsupported.document.content[0].content[0];
    if (!('marks' in marked) || !marked.marks?.[0]) throw new Error('Original literal mark required');
    marked.marks[0].stype = 'strikethrough';
    const alias = createNoteNative2Context(raw(unsupported));
    expect(() => openNoteNativeSnapshot(alias, { authority: parent.editor })).toThrowError(NativeNoteError);
    try { openNoteNativeSnapshot(alias, { authority: parent.editor }); } catch (error) { expect(error).toMatchObject({ code: 'unsupported_native_editor', detail: 'mark' }); }
    expect({ document: parent.editor.exportDocument(), history: parent.editor.getHistoryStats(), selection: parent.editor.selection }).toStrictEqual(before);
  });
  it('retains full codec-valid unknown root and descendant node JSON and refuses admission before effects', () => {
    for (const descendant of [false, true]) {
      const file = structuredClone(sourceA), target: Record<string, unknown> = descendant ? file.document.content[0] : file.document;
      target.authoredExtra = { keep: null, loadedAt: 'semantic-extra-clock' };
      const text = raw(file), context = createNoteNative2Context(text);
      expect(context.document).toStrictEqual(safeExpected(file.document)); expect(context.rawSnapshotText).toBe(text);
      const parent = openNoteTree({ stype: 'note', content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Unchanged host' }] }] }); sessions.push(parent);
      const before = { model: parent.editor.exportDocument(), history: parent.editor.getHistoryStats(), selection: parent.editor.selection };
      const writes: string[] = [];
      try { openNoteNativeSnapshot(context, { authority: parent.editor, onSnapshotChange: text => writes.push(text) }); throw new Error('Must refuse admission'); }
      catch (error) { expect(error).toMatchObject({ code: 'unsupported_native_editor', detail: 'node-field' }); }
      expect({ model: parent.editor.exportDocument(), history: parent.editor.getHistoryStats(), selection: parent.editor.selection }).toStrictEqual(before);
      expect(writes).toEqual([]); expect(context.rawSnapshotText).toBe(text);
    }
  });
  it('checks whole materialized A AND whole export before no-edit byte reuse', () => {
    const { one } = start();
    const evidence = process.env.NATIVE_NOTE_BASELINE_EVIDENCE;
    if (evidence) { mkdirSync(evidence, { recursive: true }); writeFileSync(join(evidence, 'materialized-full-A.json'), JSON.stringify({ materialized: one.editor.exportDocument(), projected: nativeProjection(one.editor.exportDocument()), expected: sourceA.document, exported: noteNodeTreeOf(one.editor.dataStore, one.rootId) }, null, 2) + '\n'); }
    const projected = nativeProjection(one.editor.exportDocument()), expectedRuntime = materializedExpected(sourceA.document), exported = noteNodeTreeOf(one.editor.dataStore, one.rootId);
    const inspect = (value: unknown, path = ''): unknown[] => {
      if (value === null || typeof value !== 'object') return [];
      return [{ path, prototype: Object.getPrototypeOf(value) === null ? 'null' : Object.getPrototypeOf(value)?.constructor?.name, undefinedKeys: Object.entries(value).filter(([, field]) => field === undefined).map(([key]) => key) }, ...Object.entries(value).flatMap(([key, field]) => inspect(field, path + '.' + key))];
    };
    if (evidence) writeFileSync(join(evidence, 'strict-comparison.json'), JSON.stringify({ runtimeEqual: isDeepStrictEqual(projected, expectedRuntime), exportedEqual: isDeepStrictEqual(exported, sourceA.document), projected: inspect(projected), expectedRuntime: inspect(expectedRuntime), exported: inspect(exported), source: inspect(sourceA.document) }, null, 2) + '\n');
    expect(nativeProjection(one.editor.exportDocument())).toStrictEqual(materializedExpected(sourceA.document));
    expect(noteNodeTreeOf(one.editor.dataStore, one.rootId)).toStrictEqual(sourceA.document);
    expect(one.exportNativeDocument()).toStrictEqual(safeExpected(sourceA.document)); expect(one.exportSnapshot()).toBe(raw(sourceA));
  });
  it('is read-only by default; a context is not permission', async () => {
    const one = openNoteNativeSnapshot(createNoteNative2Context(raw(sourceA))); sessions.push(one);
    expect(one.editor.isEditable).toBe(false); expect(await append(one, '목표 A', ' denied')).toBe(false); expect(one.exportSnapshot()).toBe(raw(sourceA));
  });
  it('preserves original bold prefix/full context on typing, immediate export, flush, reopen and three undo/redo cycles', async () => {
    const delivered: string[] = [], { one } = start(sourceA, snapshot => delivered.push(snapshot));
    expect(await append(one, '목표 A', ' • 독립 편집')).toBe(true);
    const expected = NATIVE_NOTE_EXPECTED_VARIANTS.typing;
    expect(nativeProjection(one.editor.exportDocument())).toStrictEqual(materializedExpected(expected.document));
    expect(one.exportNativeDocument()).toStrictEqual(safeExpected(expected.document));
    const snapshot = one.exportSnapshot(), parsed = readNoteSnapshotFile(snapshot);
    expect('error' in parsed).toBe(false); if ('error' in parsed || !('fileVersion' in parsed)) throw new Error('Aware export must remain2');
    expect(parsed.schemaBundle).toStrictEqual(safeExpected(sourceA.schemaBundle)); one.flush(); expect(delivered).toEqual([snapshot]);
    expect(start(JSON.parse(snapshot)).one.exportNativeDocument()).toStrictEqual(safeExpected(expected.document));
    for (let cycle = 0; cycle < 3; cycle++) {
      expect(await one.editor.undo()).toBe(true); expect(nativeProjection(one.editor.exportDocument())).toStrictEqual(materializedExpected(sourceA.document)); expect(one.exportNativeDocument()).toStrictEqual(safeExpected(sourceA.document)); expect(one.exportSnapshot()).toBe(raw(sourceA));
      expect(await one.editor.redo()).toBe(true); expect(nativeProjection(one.editor.exportDocument())).toStrictEqual(materializedExpected(expected.document)); expect(one.exportNativeDocument()).toStrictEqual(safeExpected(expected.document));
    }
  });
  it('preserves sparse unknown JSON/metadata null/omissions in real model and export', () => {
    const sparse = NATIVE_NOTE_EXPECTED_VARIANTS.sparse, { one } = start(sparse);
    expect(one.editor.dataStore.getNode(one.rootId)?.attributes).toStrictEqual(sparse.document.attributes);
    expect(one.exportNativeDocument()).toStrictEqual(safeExpected(sparse.document)); expect(one.exportSnapshot()).toBe(raw(sparse));
  });
  it('exports the last real nested resource edit immediately before debounce and preserves full context/history', async () => {
    const delivered: string[] = [], { one } = start(sourceA, value => delivered.push(value));
    expect(await append(one, '항목 본문 A', ' / 마지막 중첩 입력')).toBe(true);
    const expected = NATIVE_NOTE_EXPECTED_VARIANTS.nested;
    expect(nativeProjection(one.editor.exportDocument())).toStrictEqual(materializedExpected(expected.document));
    expect(one.exportNativeDocument()).toStrictEqual(safeExpected(expected.document));
    const immediately = one.exportSnapshot(); expect(delivered).toEqual([]); one.flush(); expect(delivered).toEqual([immediately]);
    const parsed = readNoteSnapshotFile(immediately); if ('error' in parsed || !('fileVersion' in parsed)) throw new Error('Full nested native2 output must decode');
    expect(parsed.schemaBundle).toStrictEqual(safeExpected(sourceA.schemaBundle));
    expect(await one.editor.undo()).toBe(true); expect(one.exportNativeDocument()).toStrictEqual(safeExpected(sourceA.document));
    expect(await one.editor.redo()).toBe(true); expect(one.exportNativeDocument()).toStrictEqual(safeExpected(expected.document));
    expect(start(JSON.parse(immediately)).one.exportNativeDocument()).toStrictEqual(safeExpected(expected.document));
  });
  it('delivers a bound real child body atomically with whole pins, history and unrelated-child refusal', async () => {
    const { one } = start();
    const resource = nodes(one.editor).find(value => value.stype === 'richText');
    if (!resource?.sid) throw new Error('Authored resource must exist');
    const child = one.openChildResource(resource.sid); sessions.push(child);
    const leaf = nodes(child.editor).find(value => value.text === '항목 본문 A');
    if (!leaf?.sid) throw new Error('Actual nested text must exist');
    const range = { type: 'range' as const, startNodeId: leaf.sid, endNodeId: leaf.sid, startOffset: 7, endOffset: 7, collapsed: true };
    expect(await child.editor.executeCommand('replaceText', { range, text: ' / 마지막 중첩 입력' })).toBe(true);
    const before = one.exportSnapshot();
    const unrelated = openNoteTree({ stype: 'note', content: [] }, { authority: one.editor }); sessions.push(unrelated);
    expect(await one.commitChildResource(resource.sid, unrelated)).toBe(false); expect(one.exportSnapshot()).toBe(before);
    expect(await one.commitChildResource(resource.sid, child)).toBe(true);
    expect(one.exportNativeDocument()).toStrictEqual(safeExpected(NATIVE_NOTE_EXPECTED_VARIANTS.nested.document));
    expect(await one.editor.undo()).toBe(true); expect(one.exportSnapshot()).toBe(raw(sourceA));
    expect(await one.editor.redo()).toBe(true); expect(one.exportNativeDocument()).toStrictEqual(safeExpected(NATIVE_NOTE_EXPECTED_VARIANTS.nested.document));
  });
  it('keeps a failed local callback and latest model available instead of closing or claiming save', async () => {
    let fail = true;
    const { one } = start(sourceA, () => { if (fail) throw new Error('Local host delivery refused'); });
    expect(await append(one, '목표 A', ' • 독립 편집')).toBe(true);
    expect(() => one.close()).toThrow('Local host delivery refused'); expect(one.editor.isEditable).toBe(false);
    expect(one.exportNativeDocument()).toStrictEqual(safeExpected(NATIVE_NOTE_EXPECTED_VARIANTS.typing.document));
    fail = false; one.flush(); one.close();
  });
  it('preserves existing full native structure through an actual block move and Undo/Redo', async () => {
    const { one } = start();
    const children = one.editor.dataStore.getNode(one.rootId)?.content; const firstId = children?.[0], secondId = children?.[1];
    if (typeof firstId !== 'string' || typeof secondId !== 'string') throw new Error('Actual two contiguous authored blocks must exist');
    const before = one.exportSnapshot();
    expect(await one.editor.executeCommand('batchNoteBlocks:down', { nodeIds: [firstId, secondId] })).toBe(true);
    const expected = structuredClone(sourceA); const original = expected.document.content; const a = original[0], b = original[1], c = original[2]; if (!a || !b || !c) throw new Error('Three independent full blocks required'); expected.document.content = [c, a, b, ...original.slice(3)];
    expect(one.exportNativeDocument()).toStrictEqual(safeExpected(expected.document));
    expect(await one.editor.undo()).toBe(true); expect(one.exportSnapshot()).toBe(before);
    expect(await one.editor.redo()).toBe(true); expect(one.exportNativeDocument()).toStrictEqual(safeExpected(expected.document));
  });
  it('moves the original single heading with the actual nodeId payload and whole native history', async () => {
    const { one } = start(), first = one.editor.dataStore.getNode(one.rootId)?.content?.[0];
    if (typeof first !== 'string') throw new Error('Heading SID required');
    const expected = structuredClone(sourceA), content = expected.document.content;
    expected.document.content = [content[1], content[0], ...content.slice(2)];
    expect(await one.editor.executeCommand('moveNoteBlockDown', { nodeId: first })).toBe(true);
    expect(one.exportNativeDocument()).toStrictEqual(safeExpected(expected.document));
    expect(await one.editor.undo()).toBe(true); expect(one.exportSnapshot()).toBe(raw(sourceA));
    expect(await one.editor.redo()).toBe(true); expect(one.exportNativeDocument()).toStrictEqual(safeExpected(expected.document));
  });
  it('keeps authored loadedAt, attribute JSON and null/omitted/empty keys distinct after new node deletion and history', async () => {
    const file = structuredClone(NATIVE_NOTE_EXPECTED_VARIANTS.sparse);
    const root: Record<string, unknown> = file.document;
    root.metadata = { loadedAt: 'authored-clock-not-engine', nullable: null, dictionary: { nested: [null, 'Café'] } };
    root.attributes = { ...file.document.attributes, authoredExtra: { keep: null, loadedAt: 'semantic-extra-clock' } };
    const { one, context } = start(file);
    const actualMetadata = one.editor.dataStore.getNode(one.rootId)?.metadata;
    expect(actualMetadata).toMatchObject({ nullable: null, dictionary: { nested: [null, 'Café'] } });
    expect(actualMetadata?.loadedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(context.document.metadata).toMatchObject({ loadedAt: 'authored-clock-not-engine' });
    expect(one.exportNativeDocument()).toStrictEqual(safeExpected(file.document));
    const block = { stype: 'paragraph', metadata: null, attributes: { unknown: { empty: [], value: null } }, content: [{ stype: 'inline-text', text: 'New authored body', marks: [] }] };
    const expected = { ...file.document, content: [...file.document.content.slice(0, 4), block, ...file.document.content.slice(4)] };
    expect((await transaction(one.editor, [{ type: 'addChild', payload: { parentId: one.rootId, child: block, position: 4 } }]).commit()).success).toBe(true);
    expect(one.exportNativeDocument()).toStrictEqual(safeExpected(expected));
    const added = one.editor.dataStore.getNode(one.rootId)?.content?.[4];
    if (typeof added !== 'string') throw new Error('New minted SID required');
    expect((await transaction(one.editor, [{ type: 'removeChild', payload: { parentId: one.rootId, childId: added } }]).commit()).success).toBe(true);
    expect(one.exportNativeDocument()).toStrictEqual(safeExpected(file.document));
    expect(await one.editor.undo()).toBe(true); expect(one.exportNativeDocument()).toStrictEqual(safeExpected(expected));
    expect(await one.editor.undo()).toBe(true); expect(one.exportNativeDocument()).toStrictEqual(safeExpected(file.document));
    expect(await one.editor.redo()).toBe(true); expect(one.exportNativeDocument()).toStrictEqual(safeExpected(expected));
    expect(await one.editor.redo()).toBe(true); expect(one.exportNativeDocument()).toStrictEqual(safeExpected(file.document));
  });
  it('keeps bound new body provenance/history and refuses an independently deleted resource', async () => {
    const { one } = start(), resource = nodes(one.editor).find(value => value.stype === 'richText');
    if (!resource?.sid || !resource.parentId) throw new Error('Resource identity required');
    const child = one.openChildResource(resource.sid); sessions.push(child);
    const block = { stype: 'paragraph', metadata: null, content: [{ stype: 'inline-text', text: 'New resource paragraph', marks: [] }] };
    const expected = structuredClone(sourceA), resources = expected.document.content[4];
    const resourceBody: unknown = resources.content[1];
    if (resourceBody === null || typeof resourceBody !== 'object' || !('content' in resourceBody) || !Array.isArray(resourceBody.content)) throw new Error('Independent full authored body required');
    resourceBody.content.push(block);
    expect((await transaction(child.editor, [{ type: 'addChild', payload: { parentId: child.rootId, child: block } }]).commit()).success).toBe(true);
    expect(await one.commitChildResource(resource.sid, child)).toBe(true);
    expect(one.exportNativeDocument()).toStrictEqual(safeExpected(expected.document));
    expect(await one.editor.undo()).toBe(true); expect(one.exportNativeDocument()).toStrictEqual(safeExpected(sourceA.document));
    expect(await one.editor.redo()).toBe(true); expect(one.exportNativeDocument()).toStrictEqual(safeExpected(expected.document));
    const freshChild = one.openChildResource(resource.sid); sessions.push(freshChild);
    expect((await transaction(one.editor, [{ type: 'removeChild', payload: { parentId: resource.parentId, childId: resource.sid } }]).commit()).success).toBe(true);
    const deleted = one.exportSnapshot(); expect(await one.commitChildResource(resource.sid, freshChild)).toBe(false); expect(one.exportSnapshot()).toBe(deleted);
  });
  it('refuses deleting the final child block according to the existing trusted nonempty schema', async () => {
    const { one } = start(), resource = nodes(one.editor).find(value => value.stype === 'richText');
    if (!resource?.sid) throw new Error('Resource required');
    const child = one.openChildResource(resource.sid); sessions.push(child);
    const first = child.editor.dataStore.getNode(child.rootId)?.content?.[0]; if (typeof first !== 'string') throw new Error('Paragraph required');
    const before = noteNodeTreeOf(child.editor.dataStore, child.rootId), hostBefore = one.exportSnapshot();
    expect((await transaction(child.editor, [{ type: 'removeChild', payload: { parentId: child.rootId, childId: first } }]).commit()).success).toBe(false);
    expect(noteNodeTreeOf(child.editor.dataStore, child.rootId)).toStrictEqual(before);
    expect(await one.commitChildResource(resource.sid, child)).toBe(true); expect(one.exportSnapshot()).toBe(hostBefore);
  });
  it('retires pending native delivery after authority revocation even if editability is restored', async () => {
    const delivered: string[] = [], { one, parent } = start(sourceA, value => delivered.push(value));
    expect(await append(one, '목표 A', ' • 독립 편집')).toBe(true);
    parent.editor.setEditable(false); parent.editor.setEditable(true);
    expect(() => one.flush()).toThrow(); expect(delivered).toEqual([]);
    expect(one.exportNativeDocument()).toStrictEqual(safeExpected(NATIVE_NOTE_EXPECTED_VARIANTS.typing.document));
    // Retain the dirty retired session; do not invent a successful delivery in cleanup.
    sessions.splice(sessions.indexOf(one), 1);
  });
  it('refuses a deleted target, child root reload and a queued revoked child without host effects', async () => {
    const { one } = start(), resource = nodes(one.editor).find(value => value.stype === 'richText');
    if (!resource?.sid || !resource.parentId) throw new Error('Resource identity required');
    const child = one.openChildResource(resource.sid); sessions.push(child);
    child.editor.loadDocument({ stype: 'note', content: [] });
    const before = one.exportSnapshot(); expect(await one.commitChildResource(resource.sid, child)).toBe(false); expect(one.exportSnapshot()).toBe(before);
    const second = one.openChildResource(resource.sid); sessions.push(second);
    const leaf = nodes(second.editor).find(value => value.text === '항목 본문 A');
    if (!leaf?.sid) throw new Error('Nested input target required');
    const range = { type: 'range' as const, startNodeId: leaf.sid, endNodeId: leaf.sid, startOffset: 7, endOffset: 7, collapsed: true };
    expect(await second.editor.executeCommand('replaceText', { range, text: ' pending' })).toBe(true);
    const lock = await one.editor.dataStore.acquireLock(), waiting = one.commitChildResource(resource.sid, second);
    one.editor.setEditable(false); one.editor.setEditable(true); one.editor.dataStore.releaseLock(lock);
    await expect(waiting).rejects.toThrow(); expect(one.exportSnapshot()).toBe(before);
    expect((await transaction(one.editor, [{ type: 'removeChild', payload: { parentId: resource.parentId, childId: resource.sid } }]).commit()).success).toBe(true);
    const deleted = one.exportSnapshot(); expect(await one.commitChildResource(resource.sid, second)).toBe(false); expect(one.exportSnapshot()).toBe(deleted);
    sessions.splice(sessions.indexOf(child), 1);
    sessions.splice(sessions.indexOf(second), 1); // Retired dirty child stays available; no false successful close.
  });
  it('materializes the complete frozen original C and preserves pins1 through typing and history', async () => {
    const file = NATIVE_NOTE_FIXTURES.COPY_A_ORACLE, { one } = start(file);
    expect(nativeProjection(one.editor.exportDocument())).toStrictEqual(materializedExpected(file.document));
    expect(one.exportSnapshot()).toBe(raw(file));
    const expected = structuredClone(file), target: unknown = expected.document.content[0].content[0];
    if (target === null || typeof target !== 'object' || !('text' in target) || typeof target.text !== 'string') throw new Error('Independent C heading text required');
    target.text = '목표 A • 독립 편집';
    expect(await append(one, '목표 A', ' • 독립 편집')).toBe(true);
    expect(nativeProjection(one.editor.exportDocument())).toStrictEqual(materializedExpected(expected.document));
    expect(one.exportNativeDocument()).toStrictEqual(safeExpected(expected.document));
    expect(one.context.schemaBundle).toStrictEqual(safeExpected(file.schemaBundle));
    expect(await one.editor.undo()).toBe(true); expect(one.exportSnapshot()).toBe(raw(file));
    expect(await one.editor.redo()).toBe(true); expect(one.exportNativeDocument()).toStrictEqual(safeExpected(expected.document));
  });
  it('opens explicit A2/C three-self-ID copy while complete B carrier/pins remain1', () => {
    const target = NATIVE_NOTE_FIXTURES.TARGET_A2, one = start(target).one;
    expect(one.exportNativeDocument()).toStrictEqual(safeExpected(target.document)); expect(one.context.schemaBundle.selected[0].version).toBe(2);
    const copy = copyNoteSnapshotFile(raw(target), 'native-copy-C'); if ('error' in copy) throw new Error(copy.error);
    const expected = structuredClone(target);
    const dictionary = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
    for (const path of [['document', 'attributes', 'pageId'], ['document', 'content', 1, 'content', 2, 'attributes', 'pageId'], ['document', 'content', 4, 'content', 1, 'content', 0, 'content', 1, 'attributes', 'pageId']]) {
      let value: unknown = expected;
      for (const segment of path.slice(0, -1)) {
        if (Array.isArray(value) && typeof segment === 'number') value = value[segment];
        else if (dictionary(value) && typeof segment === 'string') value = value[segment];
        else throw new Error('Independently declared self ID path must exist');
      }
      const key = path[path.length - 1]; if (!dictionary(value) || typeof key !== 'string') throw new Error('Self ID target must be an authored dictionary');
      value[key] = 'native-copy-C';
    }
    expect(start(JSON.parse(copy.snapshotText)).one.exportNativeDocument()).toStrictEqual(safeExpected(expected.document));
    const b = createNoteNative2Context(raw(NATIVE_NOTE_FIXTURES.SOURCE_B)); expect(b.schemaBundle.selected[0].version).toBe(1); expect(b.rawSnapshotText).toBe(raw(NATIVE_NOTE_FIXTURES.SOURCE_B));
  });
  it('refuses bare root/context replacement without erasing dirty model/history', async () => {
    const { one } = start(); expect(await append(one, '목표 A', ' • 독립 편집')).toBe(true);
    const before = { document: one.editor.exportDocument(), history: one.editor.getHistoryStats(), snapshot: one.exportSnapshot() };
    expect(() => one.editor.loadDocument(NATIVE_NOTE_FIXTURES.TARGET_A2.document)).toThrowError(NativeNoteError);
    expect({ document: one.editor.exportDocument(), history: one.editor.getHistoryStats(), snapshot: one.exportSnapshot() }).toStrictEqual(before);
  });
});

describe('literal strike runtime original baselines', () => {
  it('admits the complete original B and preserves materialized and pinned native data', () => {
    const { one } = start(NATIVE_NOTE_FIXTURES.SOURCE_B);
    expect(nativeProjection(one.editor.exportDocument())).toStrictEqual(materializedExpected(NATIVE_NOTE_FIXTURES.SOURCE_B.document));
    expect(one.exportNativeDocument()).toStrictEqual(safeExpected(NATIVE_NOTE_FIXTURES.SOURCE_B.document));
    expect(one.exportSnapshot()).toBe(raw(NATIVE_NOTE_FIXTURES.SOURCE_B));
  });
  it('exports new underline on original supported A as full valid native JSON', async () => {
    const { one } = start();
    const leaf = nodes(one.editor).find(node => node.text === '목표 A');
    if (!leaf?.sid) throw new Error('Original heading text SID required');
    const selection = { type: 'range' as const, startNodeId: leaf.sid, endNodeId: leaf.sid, startOffset: 2, endOffset: 4, collapsed: false };
    one.editor.selectionManager.setSelection(selection);
    expect(await one.editor.executeCommand('toggleUnderline')).toBe(true);
    const marks = one.editor.dataStore.getNode(leaf.sid)?.marks;
    const evidence = process.env.NATIVE_NOTE_BASELINE_EVIDENCE;
    if (evidence) { mkdirSync(evidence, { recursive: true }); writeFileSync(join(evidence, 'A-created-mark-shape.json'), JSON.stringify({ marks, optionalFields: marks?.map(mark => ({ keys: Object.keys(mark), undefinedKeys: Object.entries(mark).filter(([, value]) => value === undefined).map(([key]) => key) })) }, null, 2)); }
    expect(marks?.map(mark => ({ stype: mark.stype, range: mark.range }))).toEqual([{ stype: 'bold', range: [0, 2] }, { stype: 'underline', range: [2, 4] }]);
    const expected = structuredClone(sourceA);
    const marked = expected.document.content[0].content[0];
    if (!('marks' in marked) || !marked.marks) throw new Error('Authored marks array required');
    marked.marks.push({ stype: 'underline', range: [2, 4] });
    expect(JSON.parse(one.exportSnapshot())).toEqual(expected);
  });
  it('full B literal S restores exact original marks and omissions on cross-run undo', async () => {
    // Investigation only: the bare existing engine is not supported native2 admission or save.
    const one = openNoteTree(NATIVE_NOTE_FIXTURES.SOURCE_B.document, { nativeSource: true }); sessions.push(one);
    one.editor.setEditable(true);
    const first = nodes(one.editor).find(node => node.text === '검토 B'), second = nodes(one.editor).find(node => node.text === ' / 생략 B');
    if (!first?.sid || !second?.sid) throw new Error('Original B two declared text nodes required');
    expect(noteNodeTreeOf(one.editor.dataStore, one.rootId)).toStrictEqual(NATIVE_NOTE_FIXTURES.SOURCE_B.document);
    const selection = { type: 'range' as const, startNodeId: first.sid, endNodeId: second.sid, startOffset: 0, endOffset: 2, collapsed: false };
    one.editor.selectionManager.setSelection(selection);
    expect(await one.editor.executeCommand('toggleStrikeThrough')).toBe(true);
    expect(noteNodeTreeOf(one.editor.dataStore, one.rootId)).toStrictEqual(NATIVE_B_VARIANTS['cross-run-strike-off'].document);
    expect(await one.editor.undo()).toBe(true);
    const evidence = process.env.NATIVE_NOTE_BASELINE_EVIDENCE;
    if (evidence) { mkdirSync(evidence, { recursive: true }); writeFileSync(join(evidence, 'B-cross-run-undo.json'), JSON.stringify({ actual: noteNodeTreeOf(one.editor.dataStore, one.rootId), expected: NATIVE_NOTE_FIXTURES.SOURCE_B.document, selection: one.editor.selection }, null, 2)); }
    expect(noteNodeTreeOf(one.editor.dataStore, one.rootId)).toStrictEqual(NATIVE_NOTE_FIXTURES.SOURCE_B.document);
    expect(one.editor.selection).toMatchObject(selection);
  });
});

describe('whole original B supported editing and native boundaries', () => {
  function target(one: NativeNoteSession, text = '검토 B') {
    const leaf = nodes(one.editor).find(node => node.text === text);
    if (!leaf?.sid) throw new Error('Independently declared original text target required');
    return leaf.sid;
  }
  function range(one: NativeNoteSession, start: number, end: number, endId = target(one)) {
    return { type: 'range' as const, startNodeId: target(one), endNodeId: endId, startOffset: start, endOffset: end, collapsed: start === end && target(one) === endId };
  }
  async function checkHistory(one: NativeNoteSession, expected: unknown) {
    expect(one.exportNativeDocument()).toStrictEqual(safeExpected(expected));
    const snapshot = JSON.parse(one.exportSnapshot());
    expect(snapshot).toEqual({ ...NATIVE_NOTE_FIXTURES.SOURCE_B, document: expected });
    expect(Object.hasOwn(snapshot, 'savedAt')).toBe(false);
    const reopened = start(snapshot).one;
    expect(reopened.exportNativeDocument()).toStrictEqual(safeExpected(expected));
    expect(await one.editor.undo()).toBe(true);
    expect(one.exportSnapshot()).toBe(raw(NATIVE_NOTE_FIXTURES.SOURCE_B));
    expect(await one.editor.redo()).toBe(true);
    expect(one.exportNativeDocument()).toStrictEqual(safeExpected(expected));
  }
  it.each([
    ['outside', 4, ' • 편집 B', 'append-outside-strike'],
    ['inside', 1, '사', 'insert-inside-strike']
  ] as const)('keeps full B and adjusts literal ranges on %s input', async (_name, offset, text, variant) => {
    const { one } = start(NATIVE_NOTE_FIXTURES.SOURCE_B), selection = range(one, offset, offset);
    one.editor.selectionManager.setSelection(selection);
    expect(await one.editor.executeCommand('replaceText', { range: selection, text })).toBe(true);
    await checkHistory(one, NATIVE_B_VARIANTS[variant].document);
  });
  it.each([
    ['toggleStrikeThrough', 0, 2, 'remove-exact-strike'],
    ['toggleUnderline', 1, 4, 'underline-overlap']
  ] as const)('exports complete B after %s with exact literal names and order', async (command, startOffset, endOffset, variant) => {
    const { one } = start(NATIVE_NOTE_FIXTURES.SOURCE_B), selection = range(one, startOffset, endOffset);
    one.editor.selectionManager.setSelection(selection);
    expect(await one.editor.executeCommand(command)).toBe(true);
    await checkHistory(one, NATIVE_B_VARIANTS[variant].document);
    expect(one.editor.selection).toMatchObject(selection);
  });
  it('cross-run native S exports whole pins/resources and restores second-run absence', async () => {
    const { one } = start(NATIVE_NOTE_FIXTURES.SOURCE_B);
    const selection = range(one, 0, 2, target(one, ' / 생략 B')); one.editor.selectionManager.setSelection(selection);
    expect(await one.editor.executeCommand('toggleStrikeThrough')).toBe(true);
    await checkHistory(one, NATIVE_B_VARIANTS['cross-run-strike-off'].document);
    expect(one.editor.selection).toMatchObject(selection);
  });
  it('commits the exact row-B-1 last nested input with full pins and history', async () => {
    const { one } = start(NATIVE_NOTE_FIXTURES.SOURCE_B);
    const resource = nodes(one.editor).find(node => node.stype === 'richText' && node.attributes?.id === 'row-B-1');
    if (!resource?.sid) throw new Error('Original row-B-1 resource required');
    const child = one.openChildResource(resource.sid); sessions.push(child);
    const leaf = nodes(child.editor).find(node => node.text === 'B 자료 본문');
    if (!leaf?.sid) throw new Error('Captured child original text required');
    const selection = { type: 'range' as const, startNodeId: leaf.sid, endNodeId: leaf.sid, startOffset: 7, endOffset: 7, collapsed: true };
    expect(await child.editor.executeCommand('replaceText', { range: selection, text: ' / 마지막 B 입력' })).toBe(true);
    expect(await one.commitChildResource(resource.sid, child)).toBe(true);
    await checkHistory(one, NATIVE_B_VARIANTS['last-nested-input'].document);
  });
  it('creates, moves and deletes a block before terminal resources with exact native history', async () => {
    const { one } = start(NATIVE_NOTE_FIXTURES.SOURCE_B);
    const original = one.editor.dataStore.getNode(one.rootId)?.content?.[0];
    const block = NATIVE_B_VARIANTS['new-block'].document.content[1];
    expect((await transaction(one.editor, [{ type: 'addChild', payload: { parentId: one.rootId, child: block, position: 0 } }]).commit()).success).toBe(true);
    // The independently declared new-block is after the original paragraph.
    const added = one.editor.dataStore.getNode(one.rootId)?.content?.[0];
    if (typeof added !== 'string' || typeof original !== 'string') throw new Error('Actual original/new SIDs required');
    expect(await one.editor.executeCommand('moveNoteBlockDown', { nodeId: added })).toBe(true);
    expect(one.exportNativeDocument()).toStrictEqual(safeExpected(NATIVE_B_VARIANTS['new-block'].document));
    expect(await one.editor.executeCommand('moveNoteBlockDown', { nodeId: original })).toBe(true);
    expect(one.exportNativeDocument()).toStrictEqual(safeExpected(NATIVE_B_VARIANTS['move-original-below-new'].document));
    expect((await transaction(one.editor, [{ type: 'removeChild', payload: { parentId: one.rootId, childId: added } }]).commit()).success).toBe(true);
    expect(one.exportSnapshot()).toBe(raw(NATIVE_NOTE_FIXTURES.SOURCE_B));
    expect(await one.editor.undo()).toBe(true); expect(one.exportNativeDocument()).toStrictEqual(safeExpected(NATIVE_B_VARIANTS['move-original-below-new'].document));
    expect(await one.editor.undo()).toBe(true); expect(one.exportNativeDocument()).toStrictEqual(safeExpected(NATIVE_B_VARIANTS['new-block'].document));
    expect(await one.editor.redo()).toBe(true); expect(await one.editor.redo()).toBe(true); expect(one.exportSnapshot()).toBe(raw(NATIVE_NOTE_FIXTURES.SOURCE_B));
  });
  it('keeps B read-only by default and retains current parent generation across a queued mark', async () => {
    const readonly = openNoteNativeSnapshot(createNoteNative2Context(raw(NATIVE_NOTE_FIXTURES.SOURCE_B))); sessions.push(readonly);
    readonly.editor.selectionManager.setSelection(range(readonly, 0, 2));
    const original = readonly.exportSnapshot();
    expect(await readonly.editor.executeCommand('toggleStrikeThrough')).toBe(false); expect(readonly.exportSnapshot()).toBe(original);
    const { parent, one } = start(NATIVE_NOTE_FIXTURES.SOURCE_B); one.editor.selectionManager.setSelection(range(one, 0, 2));
    const before = { native: one.exportSnapshot(), model: one.editor.exportDocument(), history: one.editor.getHistoryStats() };
    const lock = await one.editor.dataStore.acquireLock(); const pending = one.editor.executeCommand('toggleStrikeThrough');
    parent.editor.setEditable(false); parent.editor.setEditable(true); one.editor.dataStore.releaseLock(lock);
    expect(await pending).toBe(false);
    expect({ native: one.exportSnapshot(), model: one.editor.exportDocument(), history: one.editor.getHistoryStats() }).toStrictEqual(before);
  });
});


it('failed full B callback retains draft and retries the latest actual input exactly once', async () => {
  let fail = true; const delivered: string[] = [];
  const { one } = start(NATIVE_NOTE_FIXTURES.SOURCE_B, snapshot => { if (fail) throw new Error('B host delivery refused'); delivered.push(snapshot); });
  expect(await append(one, '검토 B', ' • 편집 B')).toBe(true);
  const before = { model: one.editor.exportDocument(), history: one.editor.getHistoryStats() };
  expect(() => one.flush()).toThrow('B host delivery refused'); expect(delivered).toEqual([]);
  expect({ model: one.editor.exportDocument(), history: one.editor.getHistoryStats() }).toStrictEqual(before);
  expect(JSON.parse(one.exportSnapshot())).toEqual(NATIVE_B_VARIANTS['append-outside-strike']);
  const expected = structuredClone(NATIVE_B_VARIANTS['append-outside-strike']);
  const run = expected.document.content[0].content[0];
  if (!('text' in run) || typeof run.text !== 'string') throw new Error('Independent full B text required');
  run.text += ' latest';
  expect(await append(one, '검토 B • 편집 B', ' latest')).toBe(true);
  fail = false; one.flush(); expect(delivered).toEqual([raw(expected)]);
  one.flush(); expect(delivered).toEqual([raw(expected)]);
  expect(start(JSON.parse(delivered[0])).one.exportSnapshot()).toBe(raw(expected));
});
