import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { registerPreCommitGuard } from '@barocss/model';
import { createSlidesEditor } from '../src/slides-kit';
import { deckSlides, noteFor } from '../src/deck';
import { emptyNotesDraft, NotesDraftInput } from '../src/notes-draft-input';
import { NotesPane, type NotesPaneProps } from '../src/notes';
import { registerSlidesRenderers } from '../src/renderers';
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


type NotesRecovery = NonNullable<Parameters<NonNullable<NotesPaneProps['onInputRecoveryReady']>>[0]>;
const richNoteFailure = async () => {
  registerSlidesRenderers();
  const slide = slides()[0].sid;
  expect(await editor.run('addSlideNote', { slideId: slide, initialText: 'Original note' })).toBe(true);
  let recovery: NotesRecovery | null = null, delivery: ((isCurrent: () => boolean) => Promise<boolean>) | null = null;
  const registerRecovery = (next: NotesRecovery | null) => { recovery = next; };
  const registerDelivery = (next: typeof delivery) => { delivery = next; };
  await act(async () => root.render(<NotesPane editor={editor} slideSid={slide} revision={0}
    onInputRecoveryReady={registerRecovery} onInputDeliveryReady={registerDelivery} />));
  const rich = host.querySelector('.sl-notes-host [data-bc-layer="content"]') as HTMLElement;
  expect(rich).not.toBeNull();
  const walker = document.createTreeWalker(rich, NodeFilter.SHOW_TEXT);
  let leaf = walker.nextNode() as Text;
  while (leaf && leaf.data !== 'Original note') leaf = walker.nextNode() as Text;
  expect(leaf?.data).toBe('Original note');
  const sid = leaf.parentElement!.closest('[data-bc-sid]')!.getAttribute('data-bc-sid')!;
  const error = new Error('rich note input refused');
  vi.spyOn(editor, 'executeCommand').mockRejectedValueOnce(error);
  await act(async () => {
    leaf.data += '!'; const range = document.createRange(); range.setStart(leaf, leaf.length); range.collapse(true);
    window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
    editor.setRange({ type: 'range', startNodeId: sid, endNodeId: sid, startOffset: leaf.length, endOffset: leaf.length, collapsed: true });
    expect(await delivery!(() => true)).toBe(false);
  });
  expect(recovery).not.toBeNull();
  expect(recovery!.failed()).toBe(true); expect(recovery!.matches(error)).toBe(true);
  expect(recovery!.matches(new Error('rich note input refused'))).toBe(false);
  expect(text(slide)).toBe('Original note');
  return { slide, error, recovery: recovery!, registerRecovery, registerDelivery };
};

it('exposes a real rich-note failure and performs only an explicit owned correlated retry', async () => {
  const failed = await richNoteFailure();
  expect(await failed.recovery.retry(() => false)).toBe(false);
  expect(failed.recovery.failed()).toBe(true);
  await act(async () => expect(await failed.recovery.retry(() => true)).toBe(true));
  expect(text(failed.slide)).toBe('Original note!');
  expect(failed.recovery.failed()).toBe(false); expect(failed.recovery.matches(failed.error)).toBe(false);
  expect(await failed.recovery.retry(() => true)).toBe(false);
  await act(async () => expect(await editor.undo()).toBe(true)); expect(text(failed.slide)).toBe('Original note');
  await act(async () => expect(await editor.redo()).toBe(true)); expect(text(failed.slide)).toBe('Original note!');
});

it.each(['slide change', 'editable ABA', 'same-root replacement', 'disconnection', 'unmount'])('refuses stale rich-note recovery after %s', async mode => {
  const failed = await richNoteFailure();
  await act(async () => {
    if (mode === 'slide change') root.render(<NotesPane editor={editor} slideSid={slides()[1].sid} revision={0}
      onInputRecoveryReady={failed.registerRecovery} onInputDeliveryReady={failed.registerDelivery} />);
    else if (mode === 'editable ABA') { editor.setEditable(false); editor.setEditable(true); }
    else if (mode === 'same-root replacement') editor.loadDocument(editor.exportDocument());
    else if (mode === 'disconnection') host.remove();
    else root.render(null);
  });
  const before = JSON.stringify(editor.exportDocument()), history = JSON.stringify(editor.historyManager.getHistory());
  expect(failed.recovery.failed()).toBe(false); expect(failed.recovery.matches(failed.error)).toBe(false);
  expect(await failed.recovery.retry(() => true)).toBe(false);
  expect(JSON.stringify(editor.exportDocument())).toBe(before); expect(JSON.stringify(editor.historyManager.getHistory())).toBe(history);
});
