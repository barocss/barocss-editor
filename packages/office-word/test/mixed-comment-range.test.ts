import { afterEach, expect, it } from 'vitest';
import { createSchema } from '@barocss/schema';
import { DataStore } from '@barocss/datastore';
import type { ModelSelection } from '@barocss/editor-core';
import type { DocumentAccess, DocumentNode } from '@barocss/office-text';
import { createStarterDocument, createWordEditor, getWordSchemaDefinition, wordFileText, readWordFile } from '../src/index';
import { collectCommentRange, resolveCommentTarget } from '../src/comments';

const editors: ReturnType<typeof createWordEditor>[] = [];
afterEach(() => { editors.splice(0).forEach(editor => editor.destroy()); });
function fixture(source?: unknown, defaultStore = false) {
  const schema = createSchema('word', getWordSchemaDefinition());
  const editor = createWordEditor({ ...(defaultStore ? {} : { schema, dataStore: new DataStore(undefined, schema) }), editable: true,
    author: { name: 'Fictional Writer', date: () => '2026-10-03' } });
  editors.push(editor);
  const document = createStarterDocument() as unknown as DocumentNode;
  const surface = document.content!.find(one => typeof one !== 'string' && one.stype === 'surface') as DocumentNode;
  surface.content = [{ stype: 'paragraph', attributes: { styleId: 'Body', purpose: 'preserve' }, content: [
    { stype: 'inline-text', text: 'Plain ', attributes: { lang: 'en' }, marks: [] },
    { stype: 'inline-text', text: 'bold ', marks: [{ stype: 'bold', range: [0, 5], attrs: {} }] },
    { stype: 'inline-text', text: 'link tail', marks: [{ stype: 'link', range: [0, 4], attrs: { href: 'https://example.test/' } }] }
  ] }, { stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Plain bold link tail', marks: [] }] }];
  editor.loadDocument(source ?? document, source ? 'reopened-word' : 'word');
  const doc: DocumentAccess = { rootId: editor.getRootId()!, getNode: id => editor.dataStore.getNode(id) as DocumentNode };
  const nodes = [...editor.dataStore.getNodes().values()];
  const paragraph = nodes.find(node => node.stype === 'paragraph' && node.attributes?.purpose === 'preserve')!;
  const runs = source ? paragraph.content!.map(id => editor.dataStore.getNode(String(id))!) :
    ['Plain ', 'bold ', 'link tail'].map(text => nodes.find(node => node.text === text)!);
  const selection: ModelSelection = { type: 'range', startNodeId: runs[0].sid!, startOffset: 2,
    endNodeId: runs.at(-1)!.sid!, endOffset: Math.min(4, runs.at(-1)!.text!.length), collapsed: false };
  editor.updateSelection(selection);
  return { editor, doc, runs, selection };
}
function native(editor: ReturnType<typeof createWordEditor>) {
  const parsed = readWordFile(wordFileText(editor.exportDocument(), ''));
  if ('error' in parsed) throw new Error(parsed.error);
  return parsed.document as DocumentNode;
}
function visit(node: DocumentNode, callback: (one: DocumentNode) => void) {
  callback(node); for (const child of node.content ?? []) if (typeof child !== 'string') visit(child, callback);
}
async function comment(f: ReturnType<typeof fixture>) {
  return f.editor.run('insertComment', { selection: f.selection, id: 'mixed-fictional', text: 'Review this range.' });
}
it('collects forward and backward coverage in native paragraph order, never from an equal quote', () => {
  const f = fixture();
  const expected = { paragraphSid: f.runs[0].parentId!, anchors: [
    { sid: f.runs[0].sid!, start: 2, end: 6 }, { sid: f.runs[1].sid!, start: 0, end: 5 }, { sid: f.runs[2].sid!, start: 0, end: 4 }
  ], quote: 'ain bold link' };
  expect(collectCommentRange(f.doc, f.selection)).toEqual(expected);
  expect(collectCommentRange(f.doc, { ...f.selection, startNodeId: f.runs[2].sid!, startOffset: 4,
    endNodeId: f.runs[0].sid!, endOffset: 2 })).toEqual(expected);
});
it('stores one atomic independently declared rich native comment delta and exact whole-document Undo/Redo', async () => {
  const f = fixture(), before = native(f.editor), expected = structuredClone(before);
  visit(expected, one => {
    if (one.text === 'Plain ') one.marks!.push({ stype: 'commentRef', range: [2, 6], attrs: { id: 'mixed-fictional', part: 0 } });
    if (one.text === 'bold ') one.marks!.push({ stype: 'commentRef', range: [0, 5], attrs: { id: 'mixed-fictional', part: 1 } });
    if (one.text === 'link tail') one.marks!.push({ stype: 'commentRef', range: [0, 4], attrs: { id: 'mixed-fictional', part: 2 } });
    if (one.stype === 'resources') one.content!.push({ stype: 'commentThread', attributes: { id: 'mixed-fictional', resolved: false,
      coverage: [{ text: 'ain ' }, { text: 'bold ' }, { text: 'link' }] }, content: [{ stype: 'paragraph',
      attributes: { author: 'Fictional Writer', date: '2026-10-03' }, content: [{ stype: 'inline-text', text: 'Review this range.' }] }] });
  });
  const bodyIds = f.runs.map(run => run.sid);
  expect(await comment(f)).toBe(true); expect(native(f.editor)).toEqual(expected);
  expect(f.runs.map(run => f.editor.dataStore.getNode(run.sid!)?.sid)).toEqual(bodyIds);
  expect(resolveCommentTarget(f.doc, 'mixed-fictional')).toMatchObject({ status: 'located', anchors: [
    { sid: f.runs[0].sid, start: 2, end: 6 }, { sid: f.runs[1].sid, start: 0, end: 5 }, { sid: f.runs[2].sid, start: 0, end: 4 }
  ] });
  expect(await f.editor.undo()).toBe(true); expect(native(f.editor)).toEqual(before);
  expect(await f.editor.redo()).toBe(true); expect(native(f.editor)).toEqual(expected);
  expect(await f.editor.run('deleteComment', { id: 'mixed-fictional' })).toBe(true); expect(native(f.editor)).toEqual(before);
  expect(await f.editor.undo()).toBe(true); expect(native(f.editor)).toEqual(expected);
});
it('resolves persisted ordered parts after file reopen with regenerated runtime SIDs', async () => {
  const f = fixture(); expect(await comment(f)).toBe(true);
  const reopened = fixture(native(f.editor));
  expect(reopened.runs[0].sid).not.toBe(f.runs[0].sid);
  const found = resolveCommentTarget(reopened.doc, 'mixed-fictional');
  expect(found.status).toBe('located');
  if (found.status !== 'located') throw new Error('ordered range required');
  expect(found.anchors.map(anchor => reopened.doc.getNode(anchor.sid)!.text!.slice(anchor.start, anchor.end))).toEqual(['ain ', 'bold ', 'link']);
});
for (const corruption of ['missing', 'changed', 'duplicate', 'reordered', 'split', 'merged'] as const) {
  it(`refuses ${corruption} coverage without choosing the repeated quote`, async () => {
    const f = fixture(); expect(await comment(f)).toBe(true); const source = native(f.editor);
    let paragraph!: DocumentNode; visit(source, one => { if (one.stype === 'paragraph' && one.attributes?.purpose === 'preserve') paragraph = one; });
    const runs = paragraph.content as DocumentNode[];
    if (corruption === 'missing') runs[1].marks = runs[1].marks!.filter(mark => mark.stype !== 'commentRef');
    if (corruption === 'changed') runs[1].text = 'cold ';
    if (corruption === 'duplicate') runs[1].marks!.push(structuredClone(runs[1].marks!.find(mark => mark.stype === 'commentRef')!));
    if (corruption === 'reordered') [runs[0], runs[1]] = [runs[1], runs[0]];
    if (corruption === 'split') runs.splice(1, 1, { ...structuredClone(runs[1]), text: 'bo' }, { ...structuredClone(runs[1]), text: 'ld ' });
    if (corruption === 'merged') { runs[0].text += runs[1].text!; runs[0].marks!.push(...runs[1].marks!); runs.splice(1, 1); }
    const corrupted = fixture(source), before = native(corrupted.editor);
    expect(resolveCommentTarget(corrupted.doc, 'mixed-fictional').status).not.toBe('located');
    expect(native(corrupted.editor)).toEqual(before);
  });
}
it('refuses cross-paragraph, detached, protected and non-text gaps without a native mutation', async () => {
  const f = fixture(), before = native(f.editor);
  const repeated = [...f.editor.dataStore.getNodes().values()].find(node => node.text === 'Plain bold link tail')!;
  const cross = { ...f.selection, endNodeId: repeated.sid!, endOffset: 5 };
  expect(collectCommentRange(f.doc, cross)).toBeNull();
  expect(await f.editor.run('insertComment', { selection: cross, id: 'cross-fictional', text: 'Refused.' })).toBe(false);
  expect(collectCommentRange(f.doc, { ...f.selection, endNodeId: 'detached' })).toBeNull();
  const original = f.doc.getNode(f.runs[1].sid!)!;
  const locked: DocumentAccess = { ...f.doc, getNode: id => id === original.sid ? { ...original, attributes: { locked: true } } : f.doc.getNode(id) };
  expect(collectCommentRange(locked, f.selection)).toBeNull();
  const protectedAncestor: DocumentAccess = { ...f.doc, getNode: id => id === original.parentId ?
    { ...f.doc.getNode(id)!, attributes: { protected: true } } : f.doc.getNode(id) };
  expect(collectCommentRange(protectedAncestor, f.selection)).toBeNull();
  const nonText: DocumentAccess = { ...f.doc, getNode: id => id === original.sid ? { ...original, stype: 'math' } : f.doc.getNode(id) };
  expect(collectCommentRange(nonText, f.selection)).toBeNull(); expect(native(f.editor)).toEqual(before);
});

it('inserts a backward mixed selection with ordered parts and retains its native selection orientation', async () => {
  const f = fixture();
  f.selection = { ...f.selection, startNodeId: f.runs[2].sid!, startOffset: 4, endNodeId: f.runs[0].sid!, endOffset: 2 };
  f.editor.updateSelection(f.selection); const before = structuredClone(f.editor.selection);
  expect(await comment(f)).toBe(true); expect(f.editor.selection).toEqual(before);
  const found = resolveCommentTarget(f.doc, 'mixed-fictional'); expect(found.status).toBe('located');
  if (found.status !== 'located') throw new Error('ordered range required');
  expect(found.anchors.map(anchor => anchor.sid)).toEqual(f.runs.map(run => run.sid));
});

it('keeps the committed ordered source current during its own unguarded native comment overlay', async () => {
  const f = fixture(undefined, true);
  const doc: DocumentAccess = { rootId: f.doc.rootId, getNode: id => f.editor.dataStore.getNodes().get(id) as DocumentNode };
  const range = collectCommentRange(doc, f.selection)!;
  const bytes = JSON.stringify(range.anchors.map(anchor => doc.getNode(anchor.sid)));
  const current = () => { const now = collectCommentRange(doc, f.selection); return !!now &&
    JSON.stringify(now.anchors.map(anchor => doc.getNode(anchor.sid))) === bytes; };
  expect(current()).toBe(true);
  expect(await f.editor.run('insertComment', { selection: f.selection, id: 'mixed-current', text: 'Keep this draft.', canApply: current })).toBe(true);
  expect(resolveCommentTarget(f.doc, 'mixed-current').status).toBe('located');
});
