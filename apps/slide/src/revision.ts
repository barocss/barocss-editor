import { watchAnswers, watchContent, type Editor } from '@barocss/editor-core';
import { useRevision } from '@barocss/office-ui';

/**
 * The two halves, joined — here, because this is where both are known.
 *
 * `useRevision` is pure UI: it counts, and has never heard of an editor.
 * `watchAnswers` is the editor's: it knows which of its own events mean "an
 * answer could be different now", which is a fact about its event vocabulary and
 * not about a panel. The app is the first place that has both in scope, so the
 * one line that puts them together lives here.
 *
 * Word has the same file. That duplication is deliberate and cheap: what could
 * *drift* was the set of event names, and that is no longer in this file — it is
 * one constant in `editor-core`, so the two copies cannot disagree about
 * anything. If a third product wants this line too, that is the point at which
 * an `office-react` package has two data points instead of a guess.
 */

/** For a panel that reads the **selection**: the ribbon, the properties, the
 *  overlay, the timeline. */
export const useEditorRevision = (editor: Editor | null): number =>
  useRevision((reread) => watchAnswers(editor, reread), [editor]);

/** For one that reads only the **document**: the speaker notes. */
export const useDocumentRevision = (editor: Editor | null): number =>
  useRevision((reread) => watchContent(editor, reread), [editor]);
