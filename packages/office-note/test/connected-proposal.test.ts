import { afterEach, expect, it } from 'vitest';
import type { INode } from '@barocss/datastore';
import { FragmentEditor } from '@barocss/model';
import { captureNoteParagraph } from '../src/connected-proposal';
import { openNoteTree, noteTreeOf, type NoteSession } from '../src/session';
import { serializeNoteFile, type NoteDocument } from '../src/note-file-codec';

const sessions: NoteSession[] = [];
const captures: Array<{ dispose(): void }> = [];
afterEach(() => { captures.splice(0).forEach(capture => capture.dispose()); sessions.splice(0).forEach(session => session.close()); });
const text = 'Original paragraph';
const replacement = 'A deliberate reviewed replacement.';
function fixture(empty = false): NoteDocument {
  return { stype: 'note', attributes: { pageId: 'note-proposal-original', title: 'Original' }, content: [
    { stype: 'paragraph', metadata: { loadedAt: 'authored-paragraph', unknown: { keep: true } }, content: [
      { stype: 'inline-text', text, metadata: { loadedAt: 'authored-run', custom: ['keep'] }, ...(empty ? { marks: [] } : {}) }
    ] },
    { stype: 'paragraph', content: [{ stype: 'inline-text', text }] },
    { stype: 'blockQuote', content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Rich original', marks: [{ stype: 'bold', range: [0, 4] }] }] }] },
    { stype: 'resources', content: [{ stype: 'richText', attributes: { id: 'resource-keep' }, metadata: { loadedAt: 'original-resource' }, content: [
      { stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Resource', marks: [] },
        { stype: 'pageReference', attributes: { pageId: 'other-original-page', title: 'Reference' } }] }
    ] }] }
  ] };
}
function expected(document: NoteDocument, value: string) {
  const next = structuredClone(document);
  (next.content[0] as { content: { text: string }[] }).content[0].text = value;
  return next;
}
// Wire oracle for the existing Save projection's member order. It retains every
// authored field/value. Structural native expectations above stay authored as-is.
function savedBytes(document: NoteDocument) {
  const order = ['stype', 'text', 'attributes', 'marks', 'metadata', 'content'];
  const node = (value: unknown): unknown => {
    const one = value as Record<string, unknown>;
    const keys = [...order.filter(key => Object.hasOwn(one, key)), ...Object.keys(one).filter(key => !order.includes(key))];
    return Object.fromEntries(keys.map(key => [key, key === 'content' && Array.isArray(one[key])
      ? one[key].map(node) : one[key]]));
  };
  return serializeNoteFile({ ...document, content: document.content.map(node) });
}
function start(document = fixture()) {
  const session = openNoteTree(document); sessions.push(session);
  const editor = session.editor;
  const paragraph = String(editor.dataStore.getNode(session.rootId)!.content![0]);
  const run = String(editor.dataStore.getNode(paragraph)!.content![0]);
  const selection = { type: 'range' as const, startNodeId: run, endNodeId: run, startOffset: 0, endOffset: text.length, collapsed: false };
  editor.updateSelection(selection);
  let hostCurrent = true, inputCurrent = true;
  const native = () => ({ ...document, content: noteTreeOf(editor.dataStore, session.rootId)!.content as unknown[] });
  const snapshotText = serializeNoteFile(document);
  const options = { editor, rootId: session.rootId, snapshotText, capture: { selection, isCurrent: () => inputCurrent },
    nativeDocument: native, current: () => hostCurrent };
  const capture = captureNoteParagraph(options);
  if (capture) captures.push(capture);
  const proposal = (value = replacement) => ({ targetId: capture!.target.id, snapshotText,
    replacement: value, expectedSnapshotText: savedBytes(expected(document, value)) });
  return { session, editor, document, paragraph, run, selection, native, options, capture, proposal,
    retireHost: () => { hostCurrent = false; }, retireInput: () => { inputCurrent = false; } };
}

it.each([false, true])('keeps complete native before/after and real history for authored empty marks=%s', async empty => {
  const f = start(fixture(empty)), beforeRuntime = structuredClone(f.editor.exportDocument());
  const beforeSelection = structuredClone(f.editor.selection), after = expected(f.document, replacement);
  expect(f.capture?.target).toMatchObject({ kind: 'note-paragraph', quote: text,
    selector: { version: 1, pageId: 'note-proposal-original', paragraphIndex: 0 } });
  expect(f.capture!.target.id).not.toBe(f.run);
  expect(f.capture!.current()).toBe(true);
  const preview = f.capture!.preview(f.proposal())!;
  expect(preview.current()).toBe(true); expect(f.native()).toStrictEqual(f.document); expect(f.editor.canUndo()).toBe(false);
  expect(await preview.apply()).toBe(true);
  expect(f.native()).toStrictEqual(after);
  const afterRuntime = structuredClone(beforeRuntime);
  const change = (node: INode): void => {
    if (node.sid === f.run) node.text = replacement;
    for (const child of node.content ?? []) if (typeof child !== 'string') change(child);
  };
  change(afterRuntime);
  const afterSelection = { ...f.selection, startOffset: replacement.length, endOffset: replacement.length,
    collapsed: true, direction: 'none' as const };
  expect(f.editor.exportDocument()).toStrictEqual(afterRuntime); expect(f.editor.selection).toStrictEqual(afterSelection);
  expect(f.editor.getHistoryStats().totalEntries).toBe(1);
  expect(await preview.apply()).toBe(false);
  for (let i = 0; i < 3; i++) {
    expect(await f.editor.undo()).toBe(true); expect(f.native()).toStrictEqual(f.document);
    expect(f.editor.exportDocument()).toStrictEqual(beforeRuntime); expect(f.editor.selection).toStrictEqual(beforeSelection);
    expect(await f.editor.redo()).toBe(true); expect(f.native()).toStrictEqual(after);
    expect(f.editor.exportDocument()).toStrictEqual(afterRuntime); expect(f.editor.selection).toStrictEqual(afterSelection);
  }
  expect(f.editor.getHistoryStats().totalEntries).toBe(1);
});

it('declines/disposes without native mutation or history', async () => {
  const f = start(), before = structuredClone(f.editor.exportDocument());
  const preview = f.capture!.preview(f.proposal())!;
  preview.dispose(); expect(preview.current()).toBe(false); expect(await preview.apply()).toBe(false);
  f.capture!.dispose(); expect(f.capture!.preview(f.proposal())).toBeNull();
  expect(f.editor.exportDocument()).toStrictEqual(before); expect(f.editor.canUndo()).toBe(false);
});
it('reports a no-op without claiming a committed history unit', async () => {
  const f = start(), before = structuredClone(f.editor.exportDocument()), selection = structuredClone(f.editor.selection);
  const preview = f.capture!.preview(f.proposal(text));
  expect(preview).not.toBeNull();
  expect(await preview!.apply()).toBe(false);
  expect(f.editor.exportDocument()).toStrictEqual(before); expect(f.editor.selection).toStrictEqual(selection);
  expect(f.editor.canUndo()).toBe(false);
});
it.each(['forged-delta', 'other-capture', 'newline', 'source-bytes'] as const)('refuses %s before any native/history write', reason => {
  const f = start(), before = structuredClone(f.editor.exportDocument()), proposal = f.proposal();
  const baseline = f.capture!.preview(f.proposal());
  expect(baseline).not.toBeNull(); baseline!.dispose();
  if (reason === 'forged-delta') { const changed = expected(f.document, replacement); changed.attributes.title = 'Forbidden'; proposal.expectedSnapshotText = serializeNoteFile(changed); }
  if (reason === 'other-capture') proposal.targetId = crypto.randomUUID();
  if (reason === 'newline') proposal.replacement = 'Two\nparagraphs';
  if (reason === 'source-bytes') proposal.snapshotText += ' ';
  expect(f.capture!.preview(proposal)).toBeNull(); expect(f.editor.exportDocument()).toStrictEqual(before); expect(f.editor.canUndo()).toBe(false);
});
it.each(['partial', 'marked', 'locked', 'nested-root', 'pending-input'] as const)('does not capture an unsupported %s target', reason => {
  const document = fixture();
  if (reason === 'marked') (document.content[0] as { content: { marks?: unknown[] }[] }).content[0].marks = [{ stype: 'bold', range: [0, 4] }];
  if (reason === 'locked') (document.content[0] as { attributes?: unknown }).attributes = { locked: true };
  const f = start(document), options = { ...f.options };
  f.capture?.dispose();
  if (reason === 'partial') options.capture = { ...options.capture, selection: { ...f.selection, startOffset: 1 } };
  if (reason === 'nested-root') options.rootId = f.paragraph;
  if (reason === 'pending-input') f.retireInput();
  expect(captureNoteParagraph(options)).toBeNull(); expect(f.native()).toStrictEqual(document); expect(f.editor.canUndo()).toBe(false);
});
it.each(['selection-ABA', 'content-ABA', 'host', 'input', 'root', 'read-only-ABA', 'policy', 'schema'] as const)(
  'refuses queued Apply after %s without retargeting an equal paragraph', async reason => {
    const f = start(), preview = f.capture!.preview(f.proposal())!;
    const lock = await f.editor.dataStore.acquireLock('owned-proposal-queued');
    const pending = preview.apply();
    let restore = () => {};
    try {
      if (reason === 'selection-ABA') { f.editor.updateSelection(null); f.editor.updateSelection(f.selection); }
      if (reason === 'content-ABA') { f.editor.dataStore.updateNode(f.run, { text: 'Changed' }, false); f.editor.dataStore.updateNode(f.run, { text }, false); }
      if (reason === 'host') f.retireHost();
      if (reason === 'input') f.retireInput();
      if (reason === 'root') f.editor.loadDocument(f.document, f.session.session);
      if (reason === 'read-only-ABA') { f.editor.setEditable(false); f.editor.setEditable(true); }
      if (reason === 'policy') FragmentEditor.forEditor(f.editor).configure({ schemaId: 'changed-policy' });
      if (reason === 'schema') {
        const paragraph = f.editor.dataStore.getActiveSchema()!.nodes.get('paragraph')!;
        const had = Object.hasOwn(paragraph, 'isolating'), old = paragraph.isolating;
        paragraph.isolating = true;
        restore = () => { if (had) paragraph.isolating = old; else delete paragraph.isolating; };
      }
      const current = structuredClone(f.editor.exportDocument()), selection = structuredClone(f.editor.selection);
      f.editor.dataStore.releaseLock(lock);
      expect(await pending).toBe(false); expect(f.editor.exportDocument()).toStrictEqual(current);
      expect(f.editor.selection).toStrictEqual(selection); expect(f.editor.canUndo()).toBe(false);
    } finally { f.editor.dataStore.releaseLock(lock); await pending; restore(); }
  });

it('keeps genuine preceding/following typing separate from one reviewed paragraph transaction', async () => {
  const f = start(); f.capture!.dispose();
  f.editor.updateSelection({ ...f.selection, startOffset: text.length, endOffset: text.length, collapsed: true });
  expect(await f.editor.executeCommand('insertText', { text: ' PRE', selection: f.editor.selection })).toBe(true);
  const beforeProposal = expected(f.document, text + ' PRE');
  expect(f.native()).toStrictEqual(beforeProposal);
  const selected = { ...f.selection, endOffset: text.length + 4 };
  f.editor.updateSelection(selected);
  const source = serializeNoteFile(f.native());
  const capture = captureNoteParagraph({ ...f.options, snapshotText: source,
    capture: { selection: selected, isCurrent: () => true } });
  expect(capture).not.toBeNull(); captures.push(capture!);
  const after = expected(f.document, replacement);
  const preview = capture!.preview({ targetId: capture!.target.id, snapshotText: source,
    replacement, expectedSnapshotText: savedBytes(after) });
  expect(preview).not.toBeNull(); expect(await preview!.apply()).toBe(true);
  expect(f.native()).toStrictEqual(after);
  expect(await f.editor.executeCommand('insertText', { text: ' POST', selection: f.editor.selection })).toBe(true);
  const following = expected(f.document, replacement + ' POST');
  expect(f.native()).toStrictEqual(following); expect(f.editor.getHistoryStats().totalEntries).toBe(3);
  expect(await f.editor.undo()).toBe(true); expect(f.native()).toStrictEqual(after);
  expect(await f.editor.undo()).toBe(true); expect(f.native()).toStrictEqual(beforeProposal); expect(f.editor.selection).toStrictEqual(selected);
  expect(await f.editor.undo()).toBe(true); expect(f.native()).toStrictEqual(f.document);
  expect(await f.editor.redo()).toBe(true); expect(f.native()).toStrictEqual(beforeProposal);
  expect(await f.editor.redo()).toBe(true); expect(f.native()).toStrictEqual(after);
  expect(await f.editor.redo()).toBe(true); expect(f.native()).toStrictEqual(following);
  preview!.dispose();
});
