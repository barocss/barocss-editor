import { useEffect, useState } from 'react';
import { watchAnswers, type Editor } from '@barocss/editor-core';
import { selectionRectIn } from '@barocss/editor-view-dom';
import { FloatingSurface, Icon, useRevision } from '@barocss/office-ui';

/**
 * The toolbar that **follows the words a reader has chosen**.
 *
 * ## Why it took four layers to be possible
 *
 * There have been two of these in `packages/extensions` for as long as it has existed, and no
 * product installed either: they drew their own DOM into `document.body`, which a product cannot
 * theme, place or style. Taking that out left three layers finished and one unreachable — *where the
 * selection is on screen* — which lived inside the decorator system and nothing published.
 *
 * `EditorViewDOM.selectionRect()` publishes it, `FloatingSurface` draws it in the suite's tokens,
 * and this is the four lines a product writes. That is the whole point of the split: a **second**
 * surface here is a list of buttons, not a mechanism.
 *
 * ## What it offers, and why these four
 *
 * The commands that act on **a run of text** and are worth having under the pointer: bold, italic,
 * and the two the panel added today, size and colour. Everything else a reader might do to words is
 * already one press away in the ribbon, and a floating toolbar that repeats a ribbon is a second
 * thing to keep in step.
 *
 * ## Why it is not open all the time
 *
 * A caret is not a selection. These commands each need a **range** — `applyMark` over zero
 * characters commits and changes nothing — so with a caret the toolbar would be four controls that
 * decline. `selectionRect()` answers for a caret too, which is what a `/` menu will want; this asks
 * the narrower question.
 */
export function TextSurface({
  editor,
  mode
}: {
  editor: Editor;
  /** Only while the reader is in the text — in select mode the panel is the surface. */
  mode: 'select' | 'text';
}) {
  /*
   * `watchAnswers` rather than a hand-rolled listener, and the reason is written where it lives: the
   * only thing a caller can get wrong here is *which* events to subscribe to, and six hand-rolled
   * copies once listened to three different subsets of them.
   */
  const revision = useRevision((reread) => watchAnswers(editor, reread), [editor]);

  /*
   * Measured after the selection has moved rather than on every render, and re-measured on scroll
   * and resize: `selectionRect()` is viewport coordinates, so a page that scrolls under a surface
   * leaves it behind. The listeners are passive and go with the effect.
   */
  const [at, setAt] = useState<DOMRect | null>(null);
  useEffect(() => {
    const measure = () => {
      const selection = editor.selection as { type?: string; collapsed?: boolean } | undefined;
      const range = selection?.type === 'range' && selection.collapsed !== true;
      /*
       * `document` rather than one view's content layer: this product makes an `EditorViewDOM` per
       * **board** and draws three of one page at once, so the reader is typing in exactly one of
       * them and which one is not something this surface should have to know. A single-view product
       * asks its view, which passes its own layer and answers only for words inside it.
       */
      setAt(range && mode === 'text' ? selectionRectIn(document) : null);
    };
    measure();

    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [editor, mode, revision]);

  const run = (name: string, payload: Record<string, unknown> = {}) =>
    void editor.executeCommand(name, payload);

  const can = (name: string) => editor.canRun(name);

  return (
    <FloatingSurface open={!!at} at={at}>
      {[
        { command: 'toggleBold', icon: 'bold', label: '굵게' },
        { command: 'toggleItalic', icon: 'italic', label: '기울임' }
      ].map((one) => (
        <button
          key={one.command}
          type="button"
          title={one.label}
          aria-label={one.label}
          disabled={!can(one.command)}
          onMouseDown={(event) => {
            // The selection is what this acts on; letting the press move it would empty the range.
            event.preventDefault();
            run(one.command);
          }}
          className="flex h-6 w-6 items-center justify-center rounded-[var(--ou-radius)] hover:bg-[color:var(--ou-ground)] disabled:opacity-40"
        >
          <Icon name={one.icon} size={14} />
        </button>
      ))}
    </FloatingSurface>
  );
}
