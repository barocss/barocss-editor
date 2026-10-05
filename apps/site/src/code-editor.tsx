import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { indentUnit } from '@codemirror/language';
import { javascript } from '@codemirror/lang-javascript';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { python } from '@codemirror/lang-python';
import { json } from '@codemirror/lang-json';

/**
 * Editing a code block, in a layer of its own.
 *
 * ## Why not in the page
 *
 * A code block on a page is drawn `contenteditable="false"` with Prism's token spans in it, and the
 * caret never enters. That is the decision the rest of this follows from: the text stack never meets
 * a code block, so every question it would have had to answer — offsets through spans nothing in the
 * document owns, IME, marks, what Enter and Tab mean — simply stops being asked.
 *
 * It is also what makes a real code editor safe here. The objection to embedding one was always
 * about the *always-embedded* shape: a nested `contenteditable` inside the board's editable region,
 * a second undo stack fighting the document's, a second render path for the export. **None of those
 * apply to a layer that opens on a gesture**: it is a sibling of the boards rather than inside one,
 * it is gone when the reader is done, the export never sees it, and the document takes **one
 * transaction** when it flushes — one undo, whatever happened inside.
 *
 * ## Why it is in screen coordinates
 *
 * The boards live on a plane that zooms and pans. A layer inside the plane would line up with the
 * block exactly and would be *drawn at the reader's zoom* — code at 70% is code nobody can read, and
 * the editor's own gutter and cursor would shrink with it. So it opens over the block at the size it
 * has on screen and stays put; the plane does not move while it is open, because there is nothing to
 * move it with — the wheel belongs to the editor for as long as it is there.
 *
 * That is the same call the selection chrome made: the tool is drawn at the reader's size, not at
 * the page's.
 */
const LANGUAGES: Record<string, () => unknown> = {
  js: () => javascript(),
  javascript: () => javascript(),
  jsx: () => javascript({ jsx: true }),
  ts: () => javascript({ typescript: true }),
  typescript: () => javascript({ typescript: true }),
  tsx: () => javascript({ jsx: true, typescript: true }),
  html: () => html(),
  xml: () => html(),
  markup: () => html(),
  vue: () => html(),
  css: () => css(),
  scss: () => css(),
  less: () => css(),
  json: () => json(),
  py: () => python(),
  python: () => python()
};

export interface CodeEdit {
  /** The block being edited, and the run inside it the text belongs to. */
  sid: string;
  runSid?: string;
  code: string;
  language: string;
  /** Where it is on screen right now, which is where the layer opens. */
  box: { left: number; top: number; width: number; height: number };
}

interface CodeDraft {
  view: EditorView;
  active: boolean;
  editable: boolean;
  authorityVersion: number;
  pending: boolean;
  flush: () => Promise<void>;
  syncEditable: () => void;
}

export function CodeEditor({
  edit,
  editable = true,
  onCommit,
  onClose,
  registerFlush,
  onPendingChange
}: {
  edit: CodeEdit;
  editable?: boolean;
  /** Resolve only after the current document has accepted the whole buffer. */
  onCommit: (code: string, isCurrent: () => boolean) => void | Promise<void>;
  onClose: () => void;
  registerFlush?: (flush: () => Promise<void>) => () => void;
  onPendingChange?: (pending: boolean) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const draft = useRef<CodeDraft | null>(null);
  const callbacks = useRef({ edit, editable, onCommit, onClose, onPendingChange });
  callbacks.current = { edit, editable, onCommit, onClose, onPendingChange };
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useLayoutEffect(() => {
    const where = host.current;
    if (!where) return;

    const authority = new Compartment();
    let accepted = edit.code;
    let composing = false;
    let compositionTimer: ReturnType<typeof setTimeout> | undefined;
    let inFlight: Promise<void> | null = null;
    const permissions = () => [
      EditorState.readOnly.of(!callbacks.current.editable || !!inFlight),
      EditorView.editable.of(callbacks.current.editable && !inFlight)
    ];
    const notifyPending = () => {
      const pending = composing || current.view.state.doc.toString() !== accepted;
      if (current.pending === pending) return;
      current.pending = pending;
      callbacks.current.onPendingChange?.(pending);
    };
    const language = LANGUAGES[edit.language.trim().toLowerCase()];
    const state = EditorState.create({
      doc: edit.code,
      extensions: [
        authority.of(permissions()),
        lineNumbers(),
        highlightActiveLine(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        indentUnit.of('  '),
        EditorView.lineWrapping,
        EditorView.domEventHandlers({
          compositionstart: () => {
            clearTimeout(compositionTimer);
            composing = true;
            notifyPending();
          },
          compositionend: () => {
            // CodeMirror can receive the final DOM mutation after compositionend.
            // Keep snapshots blocked until that input has had time to settle.
            clearTimeout(compositionTimer);
            compositionTimer = setTimeout(() => { composing = false; notifyPending(); }, 50);
          }
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) { notifyPending(); setError(null); }
        }),
        ...(language ? [language() as never] : [])
      ]
    });
    const current: CodeDraft = {
      view: new EditorView({ state, parent: where }),
      active: true,
      editable: callbacks.current.editable,
      authorityVersion: 0,
      pending: false,
      syncEditable: () => current.view.dispatch({ effects: authority.reconfigure(permissions()) }),
      flush: () => {
        const reject = (message: string) => {
          if (current.active) setError(message);
          return Promise.reject(new Error(message));
        };
        if (!current.active || draft.current !== current) return reject('코드 편집창이 변경되었습니다.');
        if (composing || current.view.composing) return reject('문자 입력을 마친 후 다시 저장하세요.');
        if (inFlight) return inFlight;
        const code = current.view.state.doc.toString();
        if (code === accepted) return Promise.resolve();
        if (!callbacks.current.editable) return reject('읽기 전용입니다. 입력한 코드는 보관되어 있습니다.');
        const version = current.authorityVersion;
        const commit = callbacks.current.onCommit;
        const isCurrent = () => current.active && draft.current === current &&
          callbacks.current.edit.sid === edit.sid && callbacks.current.edit.runSid === edit.runSid &&
          callbacks.current.editable && current.authorityVersion === version;
        const assertCurrent = () => {
          if (!isCurrent()) {
            throw new Error('편집 권한 또는 문서가 변경되었습니다. 입력한 코드는 보관되어 있습니다.');
          }
        };
        setError(null);
        setCommitting(true);
        inFlight = Promise.resolve().then(async () => {
          assertCurrent();
          await commit(code, isCurrent);
          assertCurrent();
          accepted = code;
          notifyPending();
        }).catch((reason: unknown) => {
          if (current.active) setError(reason instanceof Error ? reason.message : '코드를 저장하지 못했습니다.');
          throw reason;
        }).finally(() => {
          inFlight = null;
          if (current.active) { setCommitting(false); current.syncEditable(); }
        });
        current.syncEditable();
        return inFlight;
      }
    };
    draft.current = current;
    setCommitting(false);
    setError(null);
    current.view.focus();
    return () => {
      current.active = false;
      clearTimeout(compositionTimer);
      current.view.destroy();
      if (draft.current === current) draft.current = null;
      callbacks.current.onPendingChange?.(false);
    };
    // A parent refresh of the same block must not replace an unsaved buffer.
    // The host keys this component by document lifetime and flushes before replacing it.
  }, [edit.sid, edit.runSid]);

  useLayoutEffect(() => {
    const current = draft.current;
    if (!current) return;
    if (current.editable !== editable) {
      current.editable = editable;
      current.authorityVersion += 1;
    }
    current.syncEditable();
  }, [editable, edit.sid, edit.runSid]);

  useLayoutEffect(() => {
    const current = draft.current;
    if (current && registerFlush) return registerFlush(current.flush);
  }, [registerFlush, edit.sid, edit.runSid]);

  useLayoutEffect(() => {
    onPendingChange?.(draft.current?.pending ?? false);
  }, [onPendingChange, edit.sid, edit.runSid]);

  useEffect(() => {
    const current = draft.current;
    if (!current) return;
    let closing = false;
    const leave = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing) return;
      event.preventDefault();
      event.stopPropagation();
      if (closing) return;
      closing = true;
      void current.flush().then(() => {
        if (current.active && draft.current === current) callbacks.current.onClose();
      }).catch(() => {
        // flush reports the error and keeps the buffer open for retry.
      }).finally(() => { closing = false; });
    };
    window.addEventListener('keydown', leave, true);
    return () => window.removeEventListener('keydown', leave, true);
  }, [edit.sid, edit.runSid]);

  return (
    <div
      className="st-code-layer"
      style={{
        left: `${edit.box.left}px`,
        top: `${edit.box.top}px`,
        width: `${Math.max(edit.box.width, 320)}px`,
        minHeight: `${Math.max(edit.box.height, 120)}px`
      }}
      role="dialog"
      aria-label="코드 편집"
      aria-busy={committing}
    >
      <header className="st-code-layer-bar">
        <span>{edit.language || '언어 없음'}</span>
        <span className="st-code-layer-hint">
          {committing ? '코드를 저장하고 있습니다' : editable ? 'Esc로 닫고 반영합니다' : '읽기 전용'}
        </span>
      </header>
      {error && <p role="alert">{error}</p>}
      <div ref={host} className="st-code-layer-body" />
    </div>
  );
}
