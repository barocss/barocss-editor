import { afterEach, expect, it } from 'vitest';
import type { DocumentAccess, DocumentNode } from '@barocss/office-text';
import { createStarterDocument, createWordEditor, readWordFile, wordFileText } from '../src/index';
import { inspectCommittedWordComment } from '../src/feedback-recovery';

const editors: ReturnType<typeof createWordEditor>[] = [];
afterEach(() => editors.splice(0).forEach(editor => editor.destroy()));
const target = { kind: 'word-comment' as const, id: 'original-comment', quote: 'Plain bold link' };
const body = 'Review this exact range.';
function source() {
  const document = createStarterDocument() as unknown as DocumentNode;
  const surface = document.content!.find(node => typeof node !== 'string' && node.stype === 'surface') as DocumentNode;
  surface.content = [{ stype: 'paragraph', attributes: { objectId: 'original-paragraph' }, content: [
    { stype: 'inline-text', text: 'Plain ', marks: [] },
    { stype: 'inline-text', text: 'bold ', marks: [{ stype: 'bold', range: [0, 5], attrs: {} }] },
    { stype: 'inline-text', text: 'link tail', marks: [{ stype: 'link', range: [0, 4], attrs: { href: 'https://example.test/' } }] }
  ] }, { stype: 'paragraph', content: [{ stype: 'inline-text', text: target.quote, marks: [] }] }];
  return document;
}
function fixture(document: DocumentNode = source(), prefix = 'word') {
  const editor = createWordEditor({ editable: true, author: { name: 'Fictional Writer', date: () => '2026-10-03' } });
  editors.push(editor); editor.loadDocument(document, prefix);
  const doc: DocumentAccess = { rootId: editor.getRootId()!, getNode: id => editor.dataStore.getNode(id) as DocumentNode };
  const paragraph = [...editor.dataStore.getNodes().values()].find(node => node.attributes?.objectId === 'original-paragraph')!;
  const runs = paragraph.content!.map(id => editor.dataStore.getNode(String(id))!);
  editor.updateSelection({ type: 'range', startNodeId: runs[0].sid!, startOffset: 0, endNodeId: runs[2].sid!, endOffset: 4, collapsed: false });
  return { editor, doc, runs };
}
function native(editor: ReturnType<typeof createWordEditor>) {
  const parsed = readWordFile(wordFileText(editor.exportDocument(), ''));
  if ('error' in parsed) throw new Error(parsed.error);
  return parsed.document as DocumentNode;
}
function snapshot(f: ReturnType<typeof fixture>) {
  return { document: native(f.editor), selection: structuredClone(f.editor.selection), history: structuredClone(f.editor.historyManager.getHistory()), historyStats: f.editor.historyManager.getStats() };
}
function visit(node: DocumentNode, fn: (node: DocumentNode) => void) {
  fn(node); for (const child of node.content ?? []) if (typeof child !== 'string') visit(child, fn);
}
async function committed() {
  const f = fixture();
  expect(await f.editor.run('insertComment', { selection: f.editor.selection, id: target.id, text: body })).toBe(true);
  return f;
}
function readOnly(f: ReturnType<typeof fixture>, expected: string, requested = target, submitted = body) {
  const before = snapshot(f);
  expect(inspectCommittedWordComment(f.doc, requested, submitted)).toBe(expected);
  expect(snapshot(f)).toEqual(before);
}
it('reads exact committed rich coverage and first body without changing native history or selection, also after distinct-SID file reopen', async () => {
  const f = fixture(), before = native(f.editor), expected = structuredClone(before);
  visit(expected, node => {
    const part = ['Plain ', 'bold ', 'link tail'].indexOf(node.text ?? '');
    if (part >= 0) node.marks!.push({ stype: 'commentRef', range: [0, part === 2 ? 4 : node.text!.length], attrs: { id: target.id, part } });
    if (node.stype === 'resources') node.content!.push({ stype: 'commentThread', attributes: { id: target.id, resolved: false,
      coverage: [{ text: 'Plain ' }, { text: 'bold ' }, { text: 'link' }] }, content: [{ stype: 'paragraph', attributes: { author: 'Fictional Writer', date: '2026-10-03' }, content: [{ stype: 'inline-text', text: body }] }] });
  });
  expect(await f.editor.run('insertComment', { selection: f.editor.selection, id: target.id, text: body })).toBe(true);
  expect(native(f.editor)).toEqual(expected); readOnly(f, 'located');
  const reopened = fixture(expected, 'reopened-word'); expect(reopened.runs[0].sid).not.toBe(f.runs[0].sid);
  readOnly(reopened, 'located');
  expect(await f.editor.undo()).toBe(true); expect(native(f.editor)).toEqual(before);
  expect(await f.editor.redo()).toBe(true); expect(native(f.editor)).toEqual(expected);
});
it('does not adopt equal text for a wrong or missing durable identity, and compares quote/body exactly', async () => {
  const f = await committed();
  readOnly(f, 'missing', { ...target, id: 'different-comment' });
  readOnly(f, 'changed', { ...target, quote: target.quote + ' ' });
  readOnly(f, 'changed', target, body + ' ');
});
for (const damage of ['missing-anchor', 'duplicate-anchor', 'duplicate-thread', 'coverage', 'text', 'body', 'protected', 'locked'] as const) {
  it(`truthfully refuses ${damage} and leaves the complete native source and history untouched`, async () => {
    const original = await committed(), document = native(original.editor);
    visit(document, node => {
      if (node.text === 'bold ' && damage === 'missing-anchor') node.marks = node.marks!.filter(mark => mark.stype !== 'commentRef');
      if (node.text === 'bold ' && damage === 'duplicate-anchor') node.marks!.push(structuredClone(node.marks!.find(mark => mark.stype === 'commentRef')!));
      if (node.text === 'bold ' && damage === 'text') node.text = 'cold ';
      if (node.text === body && damage === 'body') node.text = 'Changed review.';
      if (node.attributes?.objectId === 'original-paragraph' && (damage === 'protected' || damage === 'locked')) node.attributes[damage] = true;
      if (node.stype === 'commentThread' && damage === 'coverage') node.attributes!.coverage = [{ text: 'Plain ' }];
      if (node.stype === 'resources' && damage === 'duplicate-thread') node.content!.push(structuredClone(node.content!.find(child => typeof child !== 'string' && child.stype === 'commentThread')!));
    });
    const f = fixture(document, 'damaged-word');
    readOnly(f, damage.startsWith('duplicate') ? 'ambiguous' : damage === 'body' ? 'changed' : 'missing');
  });
}
it('preserves legacy one-run identity but refuses its protected source', async () => {
  const f = fixture(); f.editor.updateSelection({ type: 'range', startNodeId: f.runs[0].sid!, startOffset: 0, endNodeId: f.runs[0].sid!, endOffset: 5, collapsed: false });
  expect(await f.editor.run('insertComment', { selection: f.editor.selection, id: target.id, text: body })).toBe(true);
  const legacy = { ...target, quote: 'Plain' }; readOnly(f, 'located', legacy);
  const document = native(f.editor); visit(document, node => {
    if (node.attributes?.objectId === 'original-paragraph') node.attributes.locked = true;
  });
  readOnly(fixture(document, 'protected-word'), 'missing', legacy);
});

it('compares the original entry even when a later reply equals the submitted body', async () => {
  const original = await committed(), document = native(original.editor);
  visit(document, node => {
    if (node.text === body) node.text = 'Different original body.';
    if (node.stype === 'commentThread') node.content!.push({ stype: 'paragraph', attributes: { author: 'Fictional Reviewer', date: '2026-10-03' }, content: [{ stype: 'inline-text', text: body }] });
  });
  readOnly(fixture(document, 'reply-word'), 'changed');
});
it('reports a changed legacy quote and refuses unrelated target kinds', async () => {
  const original = fixture();
  original.editor.updateSelection({ type: 'range', startNodeId: original.runs[0].sid!, startOffset: 0, endNodeId: original.runs[0].sid!, endOffset: 5, collapsed: false });
  expect(await original.editor.run('insertComment', { selection: original.editor.selection, id: target.id, text: body })).toBe(true);
  const document = native(original.editor); visit(document, node => { if (node.text === 'Plain ') node.text = 'Other '; });
  const f = fixture(document, 'changed-legacy');
  const before = snapshot(f);
  expect(inspectCommittedWordComment(f.doc, { ...target, quote: 'Plain' }, body)).toBe('changed');
  expect(inspectCommittedWordComment(f.doc, { ...target, kind: 'word-revision' }, body)).toBe('missing');
  expect(snapshot(f)).toEqual(before);
});
