import { afterEach, expect, it } from 'vitest';
import { registerPreCommitGuard } from '@barocss/model';
import { createWordEditor } from '../src/word-kit';
import { createStarterDocument } from '../src/starter-document';
import { commentThreads } from '../src/comments';

const editors: ReturnType<typeof createWordEditor>[] = [];
afterEach(() => editors.splice(0).forEach(editor => editor.destroy()));
function fixture() {
  const editor = createWordEditor({ author: { name: 'Explicit local author', date: () => '2026-10-03' } });
  editors.push(editor); editor.loadDocument(createStarterDocument());
  const run = [...editor.dataStore.getNodes().values()].find(node => node.stype === 'inline-text')!;
  editor.dataStore.setNode({ ...run, text: '고객 설치 안내 문장', marks: [{ stype: 'bold' }] });
  editor.setRange({ startNodeId: run.sid!, endNodeId: run.sid!, startOffset: 0, endOffset: 7, type: 'range', collapsed: false });
  return { editor, run: run.sid! };
}
const threads = (editor: ReturnType<typeof createWordEditor>) => commentThreads({ rootId: editor.getRootId()!, getNode: id => editor.dataStore.getNode(id) });
const native = (editor: ReturnType<typeof createWordEditor>) => structuredClone(editor.exportDocument());
const snapshot = (editor: ReturnType<typeof createWordEditor>) => ({ tree: native(editor), selection: structuredClone(editor.selection), history: structuredClone(editor.historyManager.getHistory()) });

it('inserts a supplied durable thread identity through native history without changing the body or original marks', async () => {
  const { editor, run } = fixture(), before = snapshot(editor);
  const id = '7b614b7e-72aa-40a9-bfe6-804bc4a54815';
  expect(await editor.run('insertComment', { id, text: '앱이 켜져 있을 때의 조치도 안내해주세요.' })).toBe(true);
  expect(threads(editor)[0].id).toBe(id);
  expect(editor.dataStore.getNode(run)?.text).toBe('고객 설치 안내 문장');
  expect(editor.selection).toEqual(before.selection);
  expect(editor.historyManager.getHistory()).toHaveLength(1);
  const after = native(editor);
  expect(await editor.undo()).toBe(true); expect(native(editor)).toEqual(before.tree);
  expect(await editor.redo()).toBe(true); expect(native(editor)).toEqual(after);
});

it('refuses a captured native comment after its required policy changes across an awaited authority guard', async () => {
  const { editor } = fixture();
  let permitted = true;
  let entered!: () => void, finish!: () => void;
  const waiting = new Promise<void>(resolve => { entered = resolve; });
  const gate = new Promise<void>(resolve => { finish = resolve; });
  const off = registerPreCommitGuard(editor, async () => { entered(); await gate; });
  const before = snapshot(editor);
  const pending = editor.run('insertComment', { id: 'captured-comment', text: 'Opinion', canApply: () => permitted });
  await waiting; permitted = false; finish();
  expect(await pending).toBe(false); off();
  expect(snapshot(editor)).toEqual(before);
});

it('never writes a duplicate supplied comment identity', async () => {
  const { editor } = fixture();
  expect(await editor.run('insertComment', { id: 'one-thread', text: 'First' })).toBe(true);
  const before = snapshot(editor);
  expect(await editor.run('insertComment', { id: 'one-thread', text: 'Second' })).toBe(false);
  expect(snapshot(editor)).toEqual(before);
});

import { createWordFeedbackHost } from '../src/feedback-host';
import { resolveCommentTarget } from '../src/comments';
import { wordFileText, readWordFile } from '../src/word-file';

function feedback(editor: ReturnType<typeof createWordEditor>, canComment = () => true) {
  return createWordFeedbackHost({ editor, id: () => 'canonical-document', canComment, captureSelection: () => editor.selection });
}
it('captures the actual quote, creates one stable native thread, and retries without adding a second history entry', async () => {
  const { editor } = fixture(), host = feedback(editor), target = host.capture()!;
  expect(target).toEqual({ kind: 'word-comment', id: expect.stringMatching(/^[0-9a-f-]{36}$/), quote: '고객 설치 안' });
  const before = snapshot(editor);
  expect(await host.comment(target, 'Keep my Korean draft')).toEqual(target);
  const after = snapshot(editor);
  expect(await host.comment({ ...target }, 'Keep my Korean draft')).toEqual(target);
  expect(snapshot(editor)).toEqual(after);
  expect(threads(editor)[0].entries[0].author).toBe('Explicit local author');
  expect(await editor.undo()).toBe(true); expect(native(editor)).toEqual(before.tree);
  expect(await editor.redo()).toBe(true); expect(native(editor)).toEqual(after.tree);
  const file = readWordFile(wordFileText(editor.exportDocument()));
  if ('error' in file) throw new Error(file.error);
  editor.loadDocument(file.document, 'reopened');
  expect(host.locate(target)).toBe('located');
  expect(threads(editor)[0].id).toBe(target.id);
  host.dispose();
});
it.each(['selection', 'authority', 'root', 'host'] as const)('refuses a captured comment after %s changes and returns', async kind => {
  const { editor } = fixture(); let allowed = true;
  const host = feedback(editor, () => allowed), target = host.capture()!;
  expect(host.ownsCapture!(target)).toBe(true);
  const original = structuredClone(editor.selection!);
  if (kind === 'selection') { editor.updateSelection(null); editor.updateSelection(original); }
  if (kind === 'authority') { editor.setEditable(false); editor.setEditable(true); }
  if (kind === 'root') editor.loadDocument(editor.exportDocument(), 'replaced');
  if (kind === 'host') allowed = false;
  const before = snapshot(editor);
  expect(host.ownsCapture!(target)).toBe(false);
  await expect(host.comment(target, 'Do not lose this draft')).rejects.toThrow();
  expect(snapshot(editor)).toEqual(before); host.dispose();
});
it('refuses a viewer or unsupported cross-run selection and leaves native selection unchanged', () => {
  const { editor } = fixture(), host = feedback(editor, () => false), before = snapshot(editor);
  expect(host.capture()).toBeNull(); expect(host.editable()).toBe(false);
  expect(snapshot(editor)).toEqual(before); host.dispose();
  const supported = feedback(editor);
  editor.updateSelection({ ...editor.selection!, endNodeId: editor.getRootId()! });
  expect(supported.capture()).toBeNull(); supported.dispose();
});
it('never guesses a missing or duplicate native comment anchor from its quote', async () => {
  const { editor, run } = fixture(), host = feedback(editor), target = host.capture()!;
  await host.comment(target, 'Opinion');
  const node = editor.dataStore.getNode(run)!;
  const mark = node.marks!.find(mark => mark.stype === 'commentRef')!;
  editor.dataStore.setNode({ ...node, marks: [...node.marks!, { ...mark, range: [8, 10] }] });
  const before = snapshot(editor);
  expect(host.locate(target)).toBe('ambiguous'); expect(snapshot(editor)).toEqual(before);
  editor.dataStore.setNode({ ...node, marks: node.marks!.filter(mark => mark.stype !== 'commentRef') });
  const missing = snapshot(editor);
  expect(host.locate(target)).toBe('missing'); expect(snapshot(editor)).toEqual(missing);
  host.dispose();
});
it('a held adapter request is still refused at final native commit after an awaited policy check', async () => {
  const { editor } = fixture(); let allowed = true;
  const host = feedback(editor, () => allowed), target = host.capture()!;
  let entered!: () => void, finish!: () => void;
  const waiting = new Promise<void>(resolve => { entered = resolve; }), gate = new Promise<void>(resolve => { finish = resolve; });
  const off = registerPreCommitGuard(editor, async () => { entered(); await gate; });
  const before = snapshot(editor), pending = host.comment(target, 'Opinion');
  await waiting; allowed = false; finish();
  await expect(pending).rejects.toThrow(); expect(snapshot(editor)).toEqual(before);
  off(); host.dispose();
});
it('reports duplicate thread resources as ambiguous without selecting one', async () => {
  const { editor } = fixture(), host = feedback(editor), target = host.capture()!;
  await host.comment(target, 'Opinion');
  const first = threads(editor)[0], res = [...editor.dataStore.getNodes().values()].find(node => node.stype === 'resources')!;
  const node = editor.dataStore.getNode(first.sid)!;
  const duplicate = { ...node, sid: editor.dataStore.generateId() };
  editor.dataStore.setNode(duplicate); editor.dataStore.setNode({ ...res, content: [...res.content!, duplicate.sid] });
  expect(resolveCommentTarget({ rootId: editor.getRootId()!, getNode: id => editor.dataStore.getNode(id) }, target.id).status).toBe('ambiguous');
  host.dispose();
});
