import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { registerPreCommitGuard } from '@barocss/model';
import { createSlidesEditor } from '../src/slides-kit';
import { deckSlides, noteFor } from '../src/deck';
import { emptyNotesDraft, NotesDraftInput } from '../src/notes-draft-input';
import { NotesPane } from '../src/notes';
let editor: ReturnType<typeof createSlidesEditor>, host: HTMLElement, root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  editor = createSlidesEditor(); editor.loadDocument({ stype: 'document', content: [
    { stype: 'surface', attributes: { kind: 'slide' }, content: [] },
    { stype: 'surface', attributes: { kind: 'slide' }, content: [] },
    { stype: 'resources', attributes: {}, content: [] }
  ] });
});
afterEach(async () => { await act(async () => root.unmount()); editor.destroy(); host.remove(); vi.restoreAllMocks(); });
const slides = () => deckSlides({ rootId: editor.getRootId()!, getNode: sid => editor.dataStore.getNode(sid) });
const type = (value: string) => {
  const input = host.querySelector('textarea')!;
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
};
const text = (slideSid: string) => {
  const doc = { rootId: editor.getRootId()!, getNode: (sid: string) => editor.dataStore.getNode(sid) };
  const id = noteFor(doc, slideSid); if (!id) return undefined;
  const visit = (sid: string): string => { const n = doc.getNode(sid)!; return n.text ?? (n.content ?? []).map(child => visit(child as string)).join(''); };
  return visit(id);
};
const gateInput = () => {
  let release!: () => void, entered!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { entered = resolve; }); let first = true;
  const stop = registerPreCommitGuard(editor, async () => { if (first) { first = false; entered(); await waiting; } });
  return { release, started, stop };
};

it('awaits actual pending note creation and the newer retained draft before success', async () => {
  const slide = slides()[0].sid, draft = emptyNotesDraft(), gate = gateInput();
  function Input() { const [, refresh] = useState(0); return <NotesDraftInput editor={editor} slideSid={slide} draft={draft}
    active canApply={() => editor.isEditable && host.isConnected} onReady={() => {}} onDraftChange={() => refresh(n => n + 1)} />; }
  await act(async () => root.render(<Input />));
  await act(async () => { type('first'); await gate.started; });
  let finished = false;
  const delivery = draft.deliverInput!(() => true).then(ok => { finished = true; return ok; });
  expect(finished).toBe(false);
  await act(async () => type('first and deepest input'));
  await act(async () => { gate.release(); expect(await delivery).toBe(true); }); gate.stop();
  expect(text(slide)).toBe('first and deepest input'); expect(draft.pending).toBe(false);
});

it('refuses active composition, preserves its draft, and delivers after its actual end', async () => {
  const slide = slides()[0].sid, draft = emptyNotesDraft();
  function Input() { const [, refresh] = useState(0); return <NotesDraftInput editor={editor} slideSid={slide} draft={draft}
    active canApply={() => true} onReady={() => {}} onDraftChange={() => refresh(n => n + 1)} />; }
  await act(async () => root.render(<Input />));
  const input = host.querySelector('textarea')!;
  await act(async () => { input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })); type('한글'); });
  expect(await draft.deliverInput!(() => true)).toBe(false); expect(text(slide)).toBeUndefined(); expect(draft.text).toBe('한글');
  await act(async () => { input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })); expect(await draft.deliverInput!(() => true)).toBe(true); });
  expect(text(slide)).toBe('한글');
});

it('preserves a failed draft and requires its visible explicit retry before delivery', async () => {
  const slide = slides()[0].sid, draft = emptyNotesDraft();
  vi.spyOn(editor, 'executeCommand').mockResolvedValueOnce(false);
  function Input() { const [, refresh] = useState(0); return <NotesDraftInput editor={editor} slideSid={slide} draft={draft}
    active canApply={() => true} onReady={() => {}} onDraftChange={() => refresh(n => n + 1)} />; }
  await act(async () => root.render(<Input />)); await act(async () => type('retained'));
  expect(await draft.deliverInput!(() => true)).toBe(false); expect(draft.text).toBe('retained'); expect(text(slide)).toBeUndefined();
  await act(async () => [...host.querySelectorAll('button')].find(b => b.textContent === '다시 시도')!.click());
  expect(await draft.deliverInput!(() => true)).toBe(true); expect(text(slide)).toBe('retained');
});

it('refuses an unfinished retained draft after changing slides instead of silently dropping it', async () => {
  const [a, b] = slides(), gate = gateInput();
  let delivery: ((isCurrent: () => boolean) => Promise<boolean>) | null = null;
  const register = (next: typeof delivery) => { delivery = next; };
  await act(async () => root.render(<NotesPane editor={editor} slideSid={a.sid} revision={0} onInputDeliveryReady={register} />));
  await act(async () => { type('old slide draft'); await gate.started; });
  await act(async () => root.render(<NotesPane editor={editor} slideSid={b.sid} revision={0} onInputDeliveryReady={register} />));
  await act(async () => gate.release()); gate.stop();
  expect(await delivery!(() => true)).toBe(false); expect(text(a.sid)).toBeUndefined(); expect(text(b.sid)).toBeUndefined();
  await act(async () => root.render(<NotesPane editor={editor} slideSid={a.sid} revision={0} onInputDeliveryReady={register} />));
  expect(host.querySelector('textarea')!.value).toBe('old slide draft');
});
