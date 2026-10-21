import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect } from 'vitest';
import { registerPreCommitGuard } from '@barocss/model';
import { createSlidesEditor } from '../../src/slides-kit';
import { deckSlides, noteFor } from '../../src/deck';
import { emptyNotesDraft, NotesDraftInput } from '../../src/notes-draft-input';

/** Observe native commands reached by actual typing, including typing while creation waits. */
export async function probeNotesInput() {
  const previousAct = (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host), editor = createSlidesEditor();
  editor.loadDocument({ stype: 'document', content: [
    { stype: 'surface', attributes: { kind: 'slide' }, content: [] },
    { stype: 'resources', attributes: {}, content: [] }
  ] });
  const doc = { rootId: editor.getRootId()!, getNode: (sid: string) => editor.dataStore.getNode(sid) };
  const slideSid = deckSlides(doc)[0]!.sid;
  const native = () => structuredClone(editor.exportDocument());
  const before = native(), draft = emptyNotesDraft();
  const snapshots: { command: string; success: boolean; native: ReturnType<typeof native> }[] = [];
  const observe = (event: { command: string; success: boolean }) => {
    snapshots.push({ command: event.command, success: event.success, native: native() });
  };
  editor.on('editor:command.after', observe);
  const stopObserve = () => editor.off('editor:command.after', observe);
  let release!: () => void, entered!: () => void, ready!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  const guardEntered = new Promise<void>(resolve => { entered = resolve; });
  const handedOff = new Promise<void>(resolve => { ready = resolve; });
  let first = true;
  const stopGuard = registerPreCommitGuard(editor, async () => {
    if (!first) return;
    first = false; entered(); await waiting;
  });
  function Input() {
    const [, refresh] = useState(0);
    return createElement(NotesDraftInput, { editor, slideSid, draft, active: true,
      canApply: () => editor.isEditable && host.isConnected,
      onDraftChange: () => refresh(value => value + 1), onReady: () => ready() });
  }
  const type = (text: string) => {
    const input = host.querySelector('textarea')!;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };
  try {
    await act(async () => root.render(createElement(Input)));
    await act(async () => { type('첫 글'); await guardEntered; });
    expect(draft.pending).toBe(true);
    await act(async () => type('첫 글과 후속 입력\n둘째 줄'));
    expect(draft.text).toBe('첫 글과 후속 입력\n둘째 줄');
    await act(async () => { release(); await handedOff; });
    stopObserve();
    expect(snapshots.map(entry => entry.command)).toEqual(['addSlideNote', 'updateSlideNoteDraft']);
    expect(snapshots.every(entry => entry.success)).toBe(true);
    const noteId = noteFor(doc, slideSid)!;
    const paragraphs = editor.dataStore.getNode(noteId)!.content as string[];
    expect(paragraphs.map(sid => (editor.dataStore.getNode(sid)!.content as string[])
      .map(run => editor.dataStore.getNode(run)!.text ?? '').join('')))
      .toEqual(['첫 글과 후속 입력', '둘째 줄']);
    const after = native();
    expect(await editor.undo()).toBe(true); expect(native()).toEqual(snapshots[0].native);
    expect(await editor.undo()).toBe(true); expect(native()).toEqual(before);
    expect(await editor.redo()).toBe(true); expect(native()).toEqual(snapshots[0].native);
    expect(await editor.redo()).toBe(true); expect(native()).toEqual(after);
    return snapshots.map((entry, index) => ({ command: entry.command,
      changed: JSON.stringify(entry.native) !== JSON.stringify(index ? snapshots[index - 1].native : before) }));
  } finally {
    release(); stopGuard(); stopObserve();
    await act(async () => root.unmount()); host.remove(); editor.destroy();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: previousAct });
  }
}
