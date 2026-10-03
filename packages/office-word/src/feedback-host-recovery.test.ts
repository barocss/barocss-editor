import { afterEach, expect, it, vi } from 'vitest';
import { createHash, webcrypto } from 'node:crypto';
import type { DocumentNode } from '@barocss/office-text';
import { createWordEditor } from './word-kit';
import { createStarterDocument } from './starter-document';
import { createWordFeedbackHost, type WordFeedbackHost } from './feedback-host';
import { readWordFile, wordFileText } from './word-file';
import { serverWordFileText } from '../../../apps/word/src/server-file';

const editors: ReturnType<typeof createWordEditor>[] = [], hosts: WordFeedbackHost[] = [];
afterEach(() => { hosts.splice(0).forEach(host => host.dispose()); editors.splice(0).forEach(editor => editor.destroy()); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const target = { kind: 'word-comment' as const, id: 'persisted-original', quote: 'Plain bold link' }, body = 'Review the selected native range.';
function native(editor: ReturnType<typeof createWordEditor>) {
  const read = readWordFile(wordFileText(editor.exportDocument(), ''));
  if ('error' in read) throw new Error(read.error);
  return read.document as DocumentNode;
}
function snapshot(editor: ReturnType<typeof createWordEditor>) {
  return { tree: native(editor), selection: structuredClone(editor.selection), history: structuredClone(editor.historyManager.getHistory()), stats: editor.historyManager.getStats() };
}
function walk(node: DocumentNode, fn: (node: DocumentNode) => void) { fn(node); for (const child of node.content ?? []) if (typeof child !== 'string') walk(child, fn); }
async function fixture(document?: DocumentNode) {
  vi.stubGlobal('crypto', webcrypto);
  const source = createStarterDocument() as unknown as DocumentNode;
  const surface = source.content!.find(node => typeof node !== 'string' && node.stype === 'surface') as DocumentNode;
  surface.content = [{ stype: 'paragraph', attributes: { objectId: 'covered-paragraph' }, content: [
    { stype: 'inline-text', text: 'Plain ', marks: [] },
    { stype: 'inline-text', text: 'bold ', marks: [{ stype: 'bold', range: [0, 5], attrs: {} }] },
    { stype: 'inline-text', text: 'link tail', marks: [{ stype: 'link', range: [0, 4], attrs: { href: 'https://example.test/' } }] }
  ] }, { stype: 'paragraph', content: [{ stype: 'inline-text', text: target.quote, marks: [] }] }];
  const editor = createWordEditor({ editable: true, author: { name: 'Fictional Writer', date: () => '2026-10-03' } });
  editors.push(editor); editor.loadDocument(document ?? source, document ? 'reopened-word' : 'word');
  const paragraph = [...editor.dataStore.getNodes().values()].find(node => node.attributes?.objectId === 'covered-paragraph')!;
  const runs = paragraph.content!.map(id => editor.dataStore.getNode(String(id))!);
  editor.updateSelection({ type: 'range', startNodeId: runs[0].sid!, startOffset: 0, endNodeId: runs[2].sid!, endOffset: 4, collapsed: false });
  if (!document) expect(await editor.run('insertComment', { selection: editor.selection, id: target.id, text: body })).toBe(true);
  let id = 'owned-document', permitted = true;
  const captureSelection = vi.fn(() => { throw new Error('Recovery must never recapture selection'); });
  const host = createWordFeedbackHost({ editor, id: () => id, canComment: () => permitted, captureSelection, nativeDocument: () => editor.exportDocument() });
  hosts.push(host);
  const run = vi.spyOn(editor, 'run');
  return { editor, host, runs, captureSelection, run, changeId: (next: string) => { id = next; }, revoke: () => { permitted = false; } };
}
it('hashes the complete canonical server-save bytes including full native marks/resources/metadata, with no capture, command, selection or history changes', async () => {
  const f = await fixture(), before = snapshot(f.editor);
  const bytes = serverWordFileText(f.editor.exportDocument(), '');
  expect(bytes).toBe(wordFileText(f.editor.exportDocument(), ''));
  expect(f.host.committedComment!(target, body)).toBe('located');
  expect(await f.host.commentFingerprint!(target, body)).toBe(createHash('sha256').update(bytes).digest('hex'));
  expect(snapshot(f.editor)).toEqual(before); expect(f.captureSelection).not.toHaveBeenCalled(); expect(f.run).not.toHaveBeenCalled();
  const reopened = await fixture(before.tree), reopenedBefore = snapshot(reopened.editor);
  expect(reopened.runs[0].sid).not.toBe(f.runs[0].sid);
  expect(reopened.host.committedComment!(target, body)).toBe('located');
  expect(await reopened.host.commentFingerprint!(target, body)).toBe(createHash('sha256').update(serverWordFileText(reopened.editor.exportDocument(), '')).digest('hex'));
  expect(snapshot(reopened.editor)).toEqual(reopenedBefore); expect(reopened.captureSelection).not.toHaveBeenCalled(); expect(reopened.run).not.toHaveBeenCalled();
});
for (const damage of ['missing', 'body', 'quote', 'ambiguous', 'protected'] as const) {
  it(`returns honest ${damage} status without hashing or adopting identical text elsewhere`, async () => {
    const original = await fixture(), document = native(original.editor);
    walk(document, node => {
      if (damage === 'missing' && node.text === 'bold ') node.marks = node.marks!.filter(mark => mark.stype !== 'commentRef');
      if (damage === 'body' && node.text === body) node.text = 'Different original.';
      if (damage === 'ambiguous' && node.text === 'bold ') node.marks!.push(structuredClone(node.marks!.find(mark => mark.stype === 'commentRef')!));
      if (damage === 'protected' && node.attributes?.objectId === 'covered-paragraph') node.attributes.protected = true;
    });
    const f = await fixture(document), before = snapshot(f.editor), requested = damage === 'quote' ? { ...target, quote: target.quote + ' ' } : target;
    const digest = vi.spyOn(webcrypto.subtle, 'digest');
    expect(f.host.committedComment!(requested, body)).toBe(damage === 'ambiguous' ? 'ambiguous' : damage === 'body' || damage === 'quote' ? 'changed' : 'missing');
    expect(await f.host.commentFingerprint!(requested, body)).toBeNull(); expect(digest).not.toHaveBeenCalled();
    expect(snapshot(f.editor)).toEqual(before); expect(f.captureSelection).not.toHaveBeenCalled(); expect(f.run).not.toHaveBeenCalled();
  });
}
for (const change of ['native-command', 'direct-source', 'root', 'document-id', 'permission', 'editable', 'disposed'] as const) {
  it(`refuses a digest result after ${change} lifetime changes without adding native mutations`, async () => {
    const f = await fixture();
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; }), waiting = new Promise<void>(resolve => { entered = resolve; });
    const realDigest = webcrypto.subtle.digest.bind(webcrypto.subtle);
    vi.spyOn(webcrypto.subtle, 'digest').mockImplementation(async (algorithm, data) => { entered(); await gate; return realDigest(algorithm, data); });
    const pending = f.host.commentFingerprint!(target, body); await waiting;
    if (change === 'native-command') { const previous = native(f.editor);
      expect(await f.editor.run('replaceText', { range: f.editor.selection, text: 'Explicit new source.' })).toBe(true);
      expect(native(f.editor)).not.toEqual(previous); f.run.mockClear();
    }
    if (change === 'direct-source') { const run = f.editor.dataStore.getNode(f.runs[0].sid!)!; f.editor.dataStore.setNode({ ...run, text: 'Changed source ' }); }
    if (change === 'root') f.editor.loadDocument(createStarterDocument(), 'different-root');
    if (change === 'document-id') f.changeId('different-owned-document');
    if (change === 'permission') f.revoke();
    if (change === 'editable') f.editor.setEditable(false);
    if (change === 'disposed') f.host.dispose();
    const afterAuthorizedChange = snapshot(f.editor); release();
    expect(await pending).toBeNull(); expect(snapshot(f.editor)).toEqual(afterAuthorizedChange);
    expect(f.captureSelection).not.toHaveBeenCalled(); expect(f.run).not.toHaveBeenCalled();
  });
}
