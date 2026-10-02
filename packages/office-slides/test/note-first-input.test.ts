import { afterEach, expect, it } from 'vitest';
import { createSchema } from '@barocss/schema';
import { type Editor } from '@barocss/editor-core';
import { registerPreCommitGuard, registerPreExecutionGuard, transaction } from '@barocss/model';
import { createSlidesEditor } from '../src/slides-kit';
import { getSlidesSchemaDefinition } from '../src/slides-schema';
import { deckSlides, noteFor } from '../src/deck';
import { deckFileText, readDeckFile } from '../src/deck-file';

const editors: Editor[] = [];
afterEach(() => { editors.splice(0).forEach(editor => editor.destroy()); });
function fixture() {
  const editor = createSlidesEditor({ editable: true, schema: createSchema('notes-first-input', getSlidesSchemaDefinition()) });
  editors.push(editor);
  editor.loadDocument({ sid: 'doc', stype: 'document', content: [
    { sid: 'slide', stype: 'surface', attributes: { kind: 'slide', name: 'First' }, content: [] },
    { sid: 'other-slide', stype: 'surface', attributes: { kind: 'slide', name: 'Other' }, content: [] },
    { sid: 'resources', stype: 'resources', attributes: {}, content: [] }
  ] });
  return editor;
}
const slideId = (editor: Editor) => deckSlides({ rootId: editor.getRootId()!, getNode: sid => editor.dataStore.getNode(sid) })[0]!.sid;
const native = (editor: Editor) => structuredClone(editor.exportDocument());
const state = (editor: Editor) => ({ native: native(editor), history: structuredClone(editor.historyManager.getHistory()), selection: structuredClone(editor.selection), stats: editor.getHistoryStats() });
function note(editor: Editor) {
  return noteFor({ rootId: editor.getRootId()!, getNode: sid => editor.dataStore.getNode(sid) }, slideId(editor));
}
function lines(editor: Editor) {
  return (editor.dataStore.getNode(note(editor)!)?.content ?? []).map(id => {
    const paragraph = editor.dataStore.getNode(id as string)!;
    return (paragraph.content ?? []).map(run => editor.dataStore.getNode(run as string)?.text ?? '').join('');
  });
}

it('creates initial typing and its note binding as one exact native Undo/Redo step', async () => {
  const editor = fixture(); const before = state(editor);
  expect(await editor.run('addSlideNote', { slideId: slideId(editor), initialText: '바로 쓰는 발표 노트' })).toBe(true);
  expect(lines(editor)).toEqual(['바로 쓰는 발표 노트']); expect(editor.historyManager.getHistory()).toHaveLength(1);
  const after = native(editor); const noteId = note(editor);
  expect(await editor.undo()).toBe(true); expect(native(editor)).toEqual(before.native); expect(editor.selection).toEqual(before.selection);
  expect(await editor.redo()).toBe(true); expect(native(editor)).toEqual(after); expect(note(editor)).toBe(noteId);
});

it('creates pasted line breaks and empty lines as native paragraphs without losing text', async () => {
  const editor = fixture(); const before = native(editor);
  expect(await editor.run('addSlideNote', { slideId: slideId(editor), initialText: 'First\r\n\r\n셋째\n' })).toBe(true);
  expect(lines(editor)).toEqual(['First', '', '셋째', '']); const after = native(editor);
  expect(await editor.undo()).toBe(true); expect(native(editor)).toEqual(before);
  expect(await editor.redo()).toBe(true); expect(native(editor)).toEqual(after);
});

it('rejects stale lifecycle after awaiting the transaction lock without creating a note', async () => {
  const editor = fixture(); let current = true; const before = state(editor);
  const lock = await editor.dataStore.acquireLock('first-input-test');
  const pending = editor.run('addSlideNote', { slideId: slideId(editor), initialText: 'Do not attach to the old slide', canApply: () => current });
  current = false; editor.dataStore.releaseLock(lock);
  expect(await pending).toBe(false); expect(state(editor)).toEqual(before);
});

it('rejects lifecycle retirement during the current host pre-execution guard', async () => {
  const editor = fixture(); let current = true; const before = state(editor);
  const dispose = registerPreExecutionGuard(editor, async () => { current = false; });
  expect(await editor.run('addSlideNote', { slideId: slideId(editor), initialText: 'Old draft', canApply: () => current })).toBe(false);
  expect(state(editor)).toEqual(before); dispose();
});

it('rejects lifecycle retirement during an awaited host final guard and allows a clean retry', async () => {
  const editor = fixture(); let current = true; const before = state(editor);
  const dispose = registerPreCommitGuard(editor, async () => { await Promise.resolve(); current = false; });
  expect(await editor.run('addSlideNote', { slideId: slideId(editor), initialText: 'Old draft', canApply: () => current })).toBe(false);
  expect(state(editor)).toEqual(before); dispose(); current = true;
  expect(await editor.run('addSlideNote', { slideId: slideId(editor), initialText: 'Fresh draft', canApply: () => current })).toBe(true);
  expect(lines(editor)).toEqual(['Fresh draft']); expect(editor.historyManager.getHistory()).toHaveLength(1);
});

it('flushes buffered plain draft text and newlines with stable existing run IDs and exact history', async () => {
  const editor = fixture(); expect(await editor.run('addSlideNote', { slideId: slideId(editor), initialText: 'A' })).toBe(true);
  const created = native(editor); const noteId = note(editor)!;
  const paragraphId = editor.dataStore.getNode(noteId)!.content![0] as string;
  const runId = editor.dataStore.getNode(paragraphId)!.content![0];
  expect(await editor.run('updateSlideNoteDraft', { slideId: slideId(editor), noteId, expectedText: 'A', text: 'AB\n둘째\n' })).toBe(true);
  expect(lines(editor)).toEqual(['AB', '둘째', '']);
  expect(editor.dataStore.getNode(noteId)!.content![0]).toBe(paragraphId);
  expect(editor.dataStore.getNode(paragraphId)!.content![0]).toBe(runId);
  const flushed = native(editor); expect(editor.historyManager.getHistory()).toHaveLength(2);
  expect(await editor.undo()).toBe(true); expect(native(editor)).toEqual(created);
  expect(await editor.redo()).toBe(true); expect(native(editor)).toEqual(flushed);
  expect(await editor.run('updateSlideNoteDraft', { slideId: slideId(editor), noteId, expectedText: 'AB\n둘째\n', text: 'Final' })).toBe(true);
  const shortened = native(editor); expect(lines(editor)).toEqual(['Final']);
  expect(await editor.undo()).toBe(true); expect(native(editor)).toEqual(flushed);
  expect(await editor.redo()).toBe(true); expect(native(editor)).toEqual(shortened);
});

it('does not overwrite unexpected native content or rich text through draft continuation', async () => {
  const editor = fixture(); expect(await editor.run('addSlideNote', { slideId: slideId(editor), initialText: 'A' })).toBe(true);
  const noteId = note(editor)!; let before = state(editor);
  expect(await editor.run('updateSlideNoteDraft', { slideId: slideId(editor), noteId, expectedText: 'wrong', text: 'Overwrite' })).toBe(false);
  expect(state(editor)).toEqual(before);
  const paragraphId = editor.dataStore.getNode(noteId)!.content![0] as string;
  const runId = editor.dataStore.getNode(paragraphId)!.content![0];
  expect((await transaction(editor, [{ type: 'applyMark', payload: { nodeId: runId, start: 0, end: 1, markType: 'bold' } }]).commit()).success).toBe(true);
  before = state(editor);
  expect(await editor.run('updateSlideNoteDraft', { slideId: slideId(editor), noteId, expectedText: 'A', text: 'Overwrite' })).toBe(false);
  expect(state(editor)).toEqual(before);
});

it('preserves other native resources and their content through first-input Undo/Redo', async () => {
  const editor = fixture();
  const otherSlide = deckSlides({ rootId: editor.getRootId()!, getNode: sid => editor.dataStore.getNode(sid) })[1]!.sid;
  expect(await editor.run('addSlideNote', { slideId: otherSlide, initialText: 'Other slide notes\nKeep me' })).toBe(true);
  const before = native(editor);
  expect(await editor.run('addSlideNote', { slideId: slideId(editor), initialText: 'First slide notes' })).toBe(true);
  const after = native(editor);
  expect(await editor.undo()).toBe(true); expect(native(editor)).toEqual(before);
  expect(await editor.redo()).toBe(true); expect(native(editor)).toEqual(after);
});

it('refuses a queued second creation instead of replacing the first note binding', async () => {
  const editor = fixture(); const slide = slideId(editor);
  const lock = await editor.dataStore.acquireLock('queued-first-input');
  const first = editor.run('addSlideNote', { slideId: slide, initialText: 'First' });
  const second = editor.run('addSlideNote', { slideId: slide, initialText: 'Second' });
  editor.dataStore.releaseLock(lock);
  expect(await first).toBe(true); const after = state(editor);
  expect(await second).toBe(false); expect(state(editor)).toEqual(after);
  expect(lines(editor)).toEqual(['First']); expect(editor.historyManager.getHistory()).toHaveLength(1);
});

it('refuses a buffered draft after its lifecycle is retired across an awaited host check', async () => {
  const editor = fixture();
  expect(await editor.run('addSlideNote', { slideId: slideId(editor), initialText: 'Original' })).toBe(true);
  let current = true; const before = state(editor);
  const dispose = registerPreCommitGuard(editor, async () => { await Promise.resolve(); current = false; });
  expect(await editor.run('updateSlideNoteDraft', {
    slideId: slideId(editor), noteId: note(editor), expectedText: 'Original', text: 'Retain locally', canApply: () => current
  })).toBe(false);
  expect(state(editor)).toEqual(before); dispose();
});

it('keeps current read-only authority for creation and buffered continuation', async () => {
  const editor = fixture(); editor.setEditable(false); let before = state(editor);
  expect(await editor.run('addSlideNote', { slideId: slideId(editor), initialText: 'Denied' })).toBe(false);
  expect(state(editor)).toEqual(before); editor.setEditable(true);
  expect(await editor.run('addSlideNote', { slideId: slideId(editor), initialText: 'Created' })).toBe(true);
  editor.setEditable(false); before = state(editor);
  expect(await editor.run('updateSlideNoteDraft', {
    slideId: slideId(editor), noteId: note(editor), expectedText: 'Created', text: 'Denied'
  })).toBe(false);
  expect(state(editor)).toEqual(before);
});

it('does not update a first-input note once another slide shares its binding', async () => {
  const editor = fixture();
  expect(await editor.run('addSlideNote', { slideId: slideId(editor), initialText: 'A' })).toBe(true);
  const other = deckSlides({ rootId: editor.getRootId()!, getNode: sid => editor.dataStore.getNode(sid) })[1]!.sid;
  expect((await transaction(editor, [{ type: 'setAttrs', payload: { nodeId: other, attrs: { noteId: slideId(editor) } } }]).commit()).success).toBe(true);
  const before = state(editor);
  expect(await editor.run('updateSlideNoteDraft', { slideId: slideId(editor), noteId: note(editor), expectedText: 'A', text: 'AB' })).toBe(false);
  expect(state(editor)).toEqual(before);
});

it('refuses first input from a previous loaded document even when the UI callback still allows it', async () => {
  const editor = fixture(); const document = editor.exportDocument()!;
  const lock = await editor.dataStore.acquireLock('previous-root');
  const pending = editor.run('addSlideNote', { slideId: slideId(editor), initialText: 'Old root', canApply: () => true });
  editor.loadDocument(document); const before = state(editor);
  editor.dataStore.releaseLock(lock);
  expect(await pending).toBe(false); expect(state(editor)).toEqual(before);
});


it('keeps first-input and buffered new paragraphs exact through native JSON save/load/save', async () => {
  const editor = fixture(); const reopened = fixture();
  expect(await editor.run('addSlideNote', { slideId: slideId(editor), initialText: '첫 줄\nSecond line' })).toBe(true);
  const firstFile = deckFileText(editor.exportDocument(), 'fixed');
  const firstRead = readDeckFile(firstFile);
  expect(firstRead).not.toHaveProperty('error');
  if ('error' in firstRead) throw new Error(firstRead.error);
  reopened.loadDocument(firstRead.document);
  expect(JSON.parse(deckFileText(reopened.exportDocument(), 'fixed'))).toEqual(JSON.parse(firstFile));
  expect(lines(reopened)).toEqual(['첫 줄', 'Second line']);

  expect(await editor.run('updateSlideNoteDraft', {
    slideId: slideId(editor), noteId: note(editor), expectedText: '첫 줄\nSecond line', text: '첫 줄\nSecond line\n\nMore'
  })).toBe(true);
  const bufferedFile = deckFileText(editor.exportDocument(), 'fixed');
  const bufferedRead = readDeckFile(bufferedFile);
  expect(bufferedRead).not.toHaveProperty('error');
  if ('error' in bufferedRead) throw new Error(bufferedRead.error);
  reopened.loadDocument(bufferedRead.document);
  expect(JSON.parse(deckFileText(reopened.exportDocument(), 'fixed'))).toEqual(JSON.parse(bufferedFile));
  expect(lines(reopened)).toEqual(['첫 줄', 'Second line', '', 'More']);
});
