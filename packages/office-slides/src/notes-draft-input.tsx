import { useEffect, useRef } from 'react';
import type { Editor } from '@barocss/editor-core';
import { Button } from '@barocss/office-ui';
import { noteFor } from './deck';

/** Only the first input waits here. Accepted content uses the existing rich Notes view. */
export interface NotesInputDraft {
  text: string;
  acceptedText?: string;
  noteId?: string;
  pending: boolean;
  composing?: boolean;
  /** Owned first-input delivery; the retained draft remains authoritative until accepted. */
  deliverInput?: (isCurrent: () => boolean) => Promise<boolean>;
  error?: string;
  start: number;
  end: number;
}
export const emptyNotesDraft = (): NotesInputDraft => ({ text: '', pending: false, start: 0, end: 0 });

export function NotesDraftInput({ editor, slideSid, draft, active, canApply, onReady, onDraftChange }: {
  editor: Editor; slideSid: string; draft: NotesInputDraft; active: boolean;
  canApply: () => boolean; onDraftChange: () => void;
  onReady: (noteId: string, start: number, end: number, focus: boolean) => void;
}) {
  const input = useRef<HTMLTextAreaElement>(null);
  const composing = useRef(false);
  const pendingFlush = useRef<Promise<boolean> | null>(null);
  const refresh = onDraftChange;
  const latest = useRef({ canApply, onReady }); latest.current = { canApply, onReady };
  useEffect(() => { if (active) input.current?.focus({ preventScroll: true }); }, [active]);

  const flush = (): Promise<boolean> => {
    if (pendingFlush.current) return pendingFlush.current;
    if (composing.current) return Promise.resolve(false);
    if ((!draft.text && draft.acceptedText === undefined) ||
      (draft.acceptedText === draft.text && !!draft.noteId && !draft.error)) return Promise.resolve(true);
    if (!canApply()) return Promise.resolve(false);
    const belongs = canApply;
    draft.pending = true; refresh();
    const work = (async () => {
      try {
        while (belongs() && !composing.current) {
          const text = draft.text;
          const success = draft.acceptedText === undefined
            ? await editor.executeCommand('addSlideNote', { slideId: slideSid, initialText: text, canApply: belongs })
            : await editor.executeCommand('updateSlideNoteDraft', { slideId: slideSid, noteId: draft.noteId,
              expectedText: draft.acceptedText, text, canApply: belongs });
          if (!success) { draft.error = '노트를 적용하지 못했습니다. 입력한 글은 여기에 남아 있습니다.'; return false; }
          draft.acceptedText = text;
          draft.noteId = noteFor({ rootId: editor.getRootId()!, getNode: sid => editor.dataStore.getNode(sid) }, slideSid);
          if (!belongs() || !draft.noteId) return false;
          if (draft.text === text && !composing.current) {
            const focus = !!input.current?.parentElement?.contains(input.current.ownerDocument.activeElement);
            draft.error = undefined;
            latest.current.onReady(draft.noteId, draft.start, draft.end, focus);
            return true;
          }
        }
        return false;
      } catch {
        draft.error = '노트를 적용하지 못했습니다. 입력한 글은 여기에 남아 있습니다.';
        return false;
      } finally { draft.pending = false; refresh(); }
    })();
    pendingFlush.current = work;
    void work.then(() => { if (pendingFlush.current === work) pendingFlush.current = null; });
    return work;
  };
  const latestFlush = useRef(flush); latestFlush.current = flush;
  useEffect(() => {
    const deliver = async (isCurrent: () => boolean) => {
      if (!isCurrent() || composing.current || draft.composing || draft.error) return false;
      const accepted = await latestFlush.current();
      return accepted && isCurrent() && !composing.current && !draft.composing && !draft.pending && !draft.error;
    };
    draft.deliverInput = deliver;
    return () => { if (draft.deliverInput === deliver) delete draft.deliverInput; };
  }, [draft]);

  const capture = (element: HTMLTextAreaElement) => {
    draft.text = element.value; draft.start = element.selectionStart; draft.end = element.selectionEnd; refresh();
  };
  return <div className="sl-notes-draft">
    <textarea ref={input} value={draft.text} aria-label="발표자 노트 입력" placeholder="발표자 노트를 입력하세요"
      readOnly={!editor.isEditable} aria-busy={draft.pending} spellCheck
      onKeyDown={event => {
        if (!draft.text && !draft.pending && !composing.current && canApply() && editor.isEditable &&
          (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
          event.preventDefault(); event.stopPropagation(); void editor.executeCommand(event.shiftKey ? 'redo' : 'undo');
        }
      }}
      onSelect={event => { draft.start = event.currentTarget.selectionStart; draft.end = event.currentTarget.selectionEnd; }}
      onChange={event => { capture(event.currentTarget); if (!composing.current) void flush(); }}
      onCompositionStart={() => { composing.current = true; draft.composing = true; }}
      onCompositionEnd={event => { capture(event.currentTarget); composing.current = false; draft.composing = false; void flush(); }} />
    {draft.error && <div className="sl-notes-draft-error" role="alert"><span>{draft.error}</span>
      <Button disabled={!editor.isEditable} aria-disabled={draft.pending} onClick={() => void flush()}>다시 시도</Button>
    </div>}
  </div>;
}
