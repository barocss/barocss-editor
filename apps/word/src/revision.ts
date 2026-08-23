import { watchAnswers, watchContent, type Editor } from '@barocss/editor-core';
import { useRevision } from '@barocss/office-ui';

/**
 * The two halves, joined — here, because this is where both are known.
 *
 * `useRevision` is pure UI: it counts, and has never heard of an editor.
 * `watchAnswers` is the editor's: it knows which of its own events mean "an
 * answer could be different now". The app is the first place that has both in
 * scope. See `apps/slide/src/revision.ts`, which is the same file for the same
 * reason — what could drift between them was the set of event names, and that now
 * sits in `editor-core` as one constant.
 *
 * This ribbon is the reason the constant exists: it listened to two of the three
 * events, so a *cleared* selection never reached it, and `deleteTable` clears the
 * selection when it succeeds.
 */

/** For a panel that reads the **selection**: the ribbon. */
export const useEditorRevision = (editor: Editor | null): number =>
  useRevision((reread) => watchAnswers(editor, reread), [editor]);

/**
 * For one that reads only the **document**.
 *
 * No caller yet: the outline pane, the comments pane and the ruler each keep a
 * pair of per-event callbacks rather than a revision counter, which is a
 * different shape and a separate question. Exported so the answer to that
 * question does not have to start by writing this line again.
 */
export const useDocumentRevision = (editor: Editor | null): number =>
  useRevision((reread) => watchContent(editor, reread), [editor]);
