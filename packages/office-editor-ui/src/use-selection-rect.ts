import { useEffect, useState } from 'react';
import type { Editor } from '@barocss/editor-core';
import { selectionRectIn } from '@barocss/editor-view-dom';
import { useEditorRevision } from './revision';

/**
 * **고른 것이 화면 어디인가**, 계속 따라가면서.
 *
 * ## 무엇이 여기 모였나
 *
 * Two surfaces float over a selection — the `/` menu and the site's bubble toolbar — and both had
 * the same fourteen lines: a revision to re-measure on, a `DOMRect` in state, a `measure` that asks
 * `selectionRectIn` or clears, and listeners on **scroll with capture** and resize.
 *
 * `true` on the scroll listener is the half that is easy to leave out and impossible to notice until
 * a reader scrolls a pane rather than the window: scroll does not bubble, so a listener without
 * capture never hears the one that matters.
 *
 * ## `when` 이 조건인 이유
 *
 * The two conditions are genuinely different — the `/` menu measures while its menu is open, the
 * bubble toolbar while the selection is a range that is not collapsed — and both are about the
 * product's own state. A boolean rather than a branch, which is this package's rule.
 *
 * `null` while the condition is false, not a stale rect: a surface positioned at where the selection
 * *was* is worse than one that is not drawn, because it looks placed.
 */
export function useSelectionRect(editor: Editor, when: boolean): DOMRect | null {
  const revision = useEditorRevision(editor);
  const [at, setAt] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!when) {
      setAt(null);
      return;
    }
    const measure = () => setAt(selectionRectIn(document));
    measure();
    /* Capture, because scroll does not bubble and the pane that moved is not the window. */
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [editor, when, revision]);

  return at;
}
