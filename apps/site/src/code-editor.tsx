import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { EditorState } from '@codemirror/state';
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
 * transaction** when it closes — one undo, whatever happened inside.
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

export function CodeEditor({
  edit,
  onCommit,
  onClose
}: {
  edit: CodeEdit;
  /** The whole text, once — one transaction, one undo, whatever happened inside. */
  onCommit: (code: string) => void;
  onClose: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const [code, setCode] = useState(edit.code);

  useLayoutEffect(() => {
    const where = host.current;
    if (!where) return;

    const language = LANGUAGES[edit.language.trim().toLowerCase()];
    const state = EditorState.create({
      doc: edit.code,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        history(),
        /*
         * `indentWithTab` last, so it does not take Tab from the keys before it. Inside a code
         * editor Tab is an indent — which is the one place it may be taken, because nobody tabs out
         * of a program and the way out of this layer is Escape.
         */
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        indentUnit.of('  '),
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) setCode(update.state.doc.toString());
        }),
        ...(language ? [language() as never] : [])
      ]
    });

    view.current = new EditorView({ state, parent: where });
    view.current.focus();

    return () => {
      view.current?.destroy();
      view.current = null;
    };
    // The layer is made for one block and thrown away; nothing here changes while it is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Escape closes it, and closing is what commits.
   *
   * Listened for on the window rather than on the layer, because CodeMirror stops the key from
   * bubbling out of its own view — and a reader who cannot get out of an editor they opened by
   * accident is the worst thing this could be.
   */
  useEffect(() => {
    const leave = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      if (code !== edit.code) onCommit(code);
      onClose();
    };
    window.addEventListener('keydown', leave, true);
    return () => window.removeEventListener('keydown', leave, true);
  }, [code, edit.code, onCommit, onClose]);

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
    >
      <header className="st-code-layer-bar">
        <span>{edit.language || '언어 없음'}</span>
        <span className="st-code-layer-hint">Esc로 닫고 반영합니다</span>
      </header>
      <div ref={host} className="st-code-layer-body" />
    </div>
  );
}
