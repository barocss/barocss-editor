import { afterEach, describe, expect, it } from 'vitest';
import type { INode } from '@barocss/datastore';
import type { ModelSelection } from '@barocss/editor-core';
import { FragmentEditor, type EditingPlan } from '@barocss/model';
import { noteTreeOf, openNoteTree, type NoteSession } from '../src/session';
import { readNoteV1SnapshotFile as readNoteSnapshotFile, serializeNoteFile, type NoteDocument } from '../src/note-file-codec';

const sessions: NoteSession[] = [];
afterEach(() => sessions.splice(0).reverse().forEach(session => session.close()));
const originalText = 'Original paragraph';
const replacementText = 'A reviewed paragraph with a clear result.';
const savedAt = 'authored-time-kept-verbatim';
type MarkShape = 'omitted' | 'empty';

function authored(shape: MarkShape): NoteDocument {
  return {
    stype: 'note', attributes: { title: 'Reviewed Note fixture', pageId: 'note-native-original' },
    content: [
      { stype: 'paragraph', attributes: { alignment: 'left' },
        metadata: { loadedAt: 'authored-paragraph', custom: { source: 'original', approved: false } },
        content: [{ stype: 'inline-text', text: originalText, attributes: {},
          metadata: { loadedAt: 'authored-run', retained: ['unknown', 'compatible'] },
          ...(shape === 'empty' ? { marks: [] } : {}) }] },
      { stype: 'paragraph', content: [
        { stype: 'inline-text', text: 'Keep rich text', marks: [{ stype: 'bold', range: [0, 4] }] },
        { stype: 'pageReference', attributes: { pageId: 'other-native-page', title: 'Original reference' } }
      ] },
      { stype: 'blockQuote', metadata: { loadedAt: 'authored-quote', keep: true }, content: [
        { stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Untouched quote', marks: [] }] }
      ] },
      { stype: 'resources', content: [
        { stype: 'richText', attributes: { id: 'retained-resource' }, metadata: { loadedAt: 'authored-resource' }, content: [
          { stype: 'paragraph', content: [
            { stype: 'inline-text', text: 'Resource content', marks: [{ stype: 'italic', range: [0, 8] }] },
            { stype: 'pageReference', attributes: { pageId: 'note-native-original', title: 'Same original' } }
          ] }
        ] }
      ] }
    ]
  };
}

function start(shape: MarkShape) {
  const document = authored(shape);
  const input = readNoteSnapshotFile(serializeNoteFile(document, { savedAt }));
  expect(input).toStrictEqual({ document, savedAt });
  if ('error' in input) throw new Error(input.error);
  const session = openNoteTree(input.document);
  sessions.push(session);
  const editor = session.editor;
  const paragraphId = editor.dataStore.getNode(session.rootId)!.content![0] as string;
  const runId = editor.dataStore.getNode(paragraphId)!.content![0] as string;
  expect(editor.dataStore.getNode(paragraphId)?.stype).toBe('paragraph');
  expect(editor.dataStore.getNode(runId)?.stype).toBe('inline-text');
  const range = (from: number, to: number): ModelSelection => ({ type: 'range', startNodeId: runId,
    endNodeId: runId, startOffset: from, endOffset: to, collapsed: from === to });
  editor.updateSelection(range(0, originalText.length));
  const editing = FragmentEditor.forEditor(editor);
  const native = (): NoteDocument => {
    const tree = noteTreeOf(editor.dataStore, session.rootId);
    if (!tree) throw new Error('The actual native Note must remain readable');
    return { ...input.document, content: tree.content as unknown[] };
  };
  const runtime = () => structuredClone(editor.exportDocument());
  const state = () => ({ runtime: runtime(), native: native(), selection: structuredClone(editor.selection),
    history: structuredClone(editor.historyManager.getHistory()), stats: editor.getHistoryStats() });
  const plan = (): EditingPlan => {
    const before = state();
    const fragment = structuredClone(editing.plainText(replacementText, runId, true));
    // The import declares the target's authored shape; empty and omitted marks
    // are different native inputs. No expected output is normalized to [] here.
    if (shape === 'empty') fragment.content[0].marks = [];
    const result = editing.plan({ intent: 'copy', fragment,
      target: { kind: 'text', nodeId: runId, from: 0, to: editor.dataStore.getNode(runId)!.text!.length } });
    expect(result, result.ok ? '' : result.reason).toMatchObject({ ok: true });
    if (!result.ok) throw new Error(result.reason);
    expect(result.plan.outcome).toBe('direct');
    expect(result.plan.losses).toStrictEqual([]);
    expect(Object.values(result.plan.retainIds)).toContain(runId);
    expect(state()).toStrictEqual(before);
    return result.plan;
  };
  expect(native()).toStrictEqual(document);
  return { document, session, editor, editing, paragraphId, runId, range, native, runtime, state, plan };
}

function authoredChange(document: NoteDocument, text: string): NoteDocument {
  const expected = structuredClone(document);
  const paragraph = expected.content[0] as { content: { text: string }[] };
  paragraph.content[0].text = text;
  return expected;
}

function find(tree: INode, id: string): INode {
  if (tree.sid === id) return tree;
  for (const child of tree.content ?? []) {
    if (typeof child !== 'string') {
      const candidate = findOptional(child, id);
      if (candidate) return candidate;
    }
  }
  throw new Error('The original runtime target must still exist');
}
function findOptional(tree: INode, id: string): INode | undefined {
  if (tree.sid === id) return tree;
  for (const child of tree.content ?? []) {
    if (typeof child !== 'string') { const result = findOptional(child, id); if (result) return result; }
  }
}

function historyAt(f: ReturnType<typeof start>, entries: number, index: number) {
  expect(f.editor.getHistoryStats()).toStrictEqual({ totalEntries: entries, currentIndex: index,
    canUndo: index >= 0, canRedo: index < entries - 1 });
}

describe.each(['omitted', 'empty'] as const)('actual Note paragraph proposal with %s marks', shape => {
  it('preserves the whole native tree, target and selection through three real Undo/Redo cycles and codec reopen', async () => {
    const f = start(shape);
    const before = f.runtime(), selectionBefore = structuredClone(f.editor.selection);
    const expectedNative = authoredChange(f.document, replacementText);
    const expectedRuntime = structuredClone(before);
    find(expectedRuntime, f.runId).text = replacementText;
    const plan = f.plan();
    historyAt(f, 0, -1);
    expect((await f.editing.apply(plan))).toMatchObject({ success: true, committed: true });
    expect(f.runtime()).toStrictEqual(expectedRuntime);
    expect(f.native()).toStrictEqual(expectedNative);
    expect(f.editor.dataStore.getNode(f.paragraphId)!.content).toStrictEqual([f.runId]);
    const selectionAfter = { ...f.range(replacementText.length, replacementText.length), direction: 'none' as const };
    expect(f.editor.selection).toStrictEqual(selectionAfter);
    historyAt(f, 1, 0);
    const history = structuredClone(f.editor.historyManager.getHistory());

    for (let cycle = 0; cycle < 3; cycle++) {
      expect(await f.editor.undo()).toBe(true);
      expect(f.runtime()).toStrictEqual(before);
      expect(f.native()).toStrictEqual(f.document);
      expect(f.editor.selection).toStrictEqual(selectionBefore);
      historyAt(f, 1, -1);
      expect(await f.editor.redo()).toBe(true);
      expect(f.runtime()).toStrictEqual(expectedRuntime);
      expect(f.native()).toStrictEqual(expectedNative);
      expect(f.editor.selection).toStrictEqual(selectionAfter);
      expect(f.editor.historyManager.getHistory()).toStrictEqual(history);
      historyAt(f, 1, 0);
    }

    const confirmedBytes = serializeNoteFile(f.native(), { savedAt });
    expect(JSON.parse(confirmedBytes)).toStrictEqual(JSON.parse(serializeNoteFile(expectedNative, { savedAt })));
    const reopenedFile = readNoteSnapshotFile(confirmedBytes);
    expect(reopenedFile).toStrictEqual({ document: expectedNative, savedAt });
    if ('error' in reopenedFile) throw new Error(reopenedFile.error);
    const reopened = openNoteTree(reopenedFile.document);
    sessions.push(reopened);
    expect({ ...reopenedFile.document, content: noteTreeOf(reopened.editor.dataStore, reopened.rootId)!.content })
      .toStrictEqual(expectedNative);
    // This is native codec/session reopen, not API persistence or durable history.
    expect(reopened.editor.getHistoryStats().totalEntries).toBe(0);
  });

  it('keeps preceding and following genuine text commands separate from the proposal history unit', async () => {
    const f = start(shape);
    f.editor.updateSelection(f.range(originalText.length, originalText.length));
    expect(await f.editor.executeCommand('insertText', { text: ' PRE', selection: f.editor.selection })).toBe(true);
    const withPre = authoredChange(f.document, originalText + ' PRE');
    expect(f.native()).toStrictEqual(withPre);
    historyAt(f, 1, 0);
    f.editor.updateSelection(f.range(0, originalText.length + 4));
    const selectionBeforeProposal = structuredClone(f.editor.selection);
    expect(await f.editing.apply(f.plan())).toMatchObject({ success: true, committed: true });
    const applied = authoredChange(f.document, replacementText);
    expect(f.native()).toStrictEqual(applied);
    historyAt(f, 2, 1);
    expect(await f.editor.executeCommand('insertText', { text: ' POST', selection: f.editor.selection })).toBe(true);
    const withPost = authoredChange(f.document, replacementText + ' POST');
    expect(f.native()).toStrictEqual(withPost);
    historyAt(f, 3, 2);
    expect(await f.editor.undo()).toBe(true); expect(f.native()).toStrictEqual(applied); historyAt(f, 3, 1);
    expect(await f.editor.undo()).toBe(true); expect(f.native()).toStrictEqual(withPre); historyAt(f, 3, 0);
    expect(f.editor.selection).toStrictEqual(selectionBeforeProposal);
    expect(await f.editor.undo()).toBe(true); expect(f.native()).toStrictEqual(f.document); historyAt(f, 3, -1);
    expect(await f.editor.redo()).toBe(true); expect(f.native()).toStrictEqual(withPre);
    expect(await f.editor.redo()).toBe(true); expect(f.native()).toStrictEqual(applied);
    expect(await f.editor.redo()).toBe(true); expect(f.native()).toStrictEqual(withPost); historyAt(f, 3, 2);
  });
});

it.each(['write', 'write-ABA', 'selection', 'schema', 'policy', 'root', 'read-only'] as const)(
  'refuses an actual Note plan after queued %s change without consuming native history', async change => {
    const f = start('omitted');
    const plan = f.plan();
    const lock = await f.editor.dataStore.acquireLock('note-proposal-before-apply');
    let pending: ReturnType<FragmentEditor['apply']> | undefined;
    let schemaRestore = () => {};
    try {
      pending = f.editing.apply(plan);
      if (change === 'write' || change === 'write-ABA') {
        f.editor.dataStore.updateNode(f.runId, { text: 'A later source edit' }, false);
        if (change === 'write-ABA') f.editor.dataStore.updateNode(f.runId, { text: originalText }, false);
      }
      if (change === 'selection') f.editor.updateSelection(f.range(1, 1));
      if (change === 'schema') {
        const paragraph = f.editor.dataStore.getActiveSchema()!.nodes.get('paragraph')!;
        const had = Object.hasOwn(paragraph, 'isolating'), prior = paragraph.isolating;
        paragraph.isolating = true;
        schemaRestore = () => { if (had) paragraph.isolating = prior; else delete paragraph.isolating; };
      }
      if (change === 'policy') f.editing.configure({ schemaId: 'changed-note-policy' });
      if (change === 'root') f.editor.loadDocument(f.document, f.session.session);
      if (change === 'read-only') f.editor.setEditable(false);
      const current = f.state();
      f.editor.dataStore.releaseLock(lock);
      expect(await pending).toMatchObject({ success: false, committed: false });
      expect(f.state()).toStrictEqual(current);
      historyAt(f, 0, -1);
    } finally {
      f.editor.dataStore.releaseLock(lock);
      if (pending) await pending;
      schemaRestore();
    }
  });
