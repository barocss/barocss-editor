import { watchAnswers, watchContent, type Editor } from '@barocss/editor-core';
import { useRevision } from '@barocss/office-ui';

/**
 * **에디터를 구독하는 두 줄** — 이 패키지가 있어야 했던 이유의 가장 작은 형태.
 *
 * `useRevision` is pure UI: it counts, and has never heard of an editor. `watchAnswers` is the
 * editor's: it knows which of its own events mean *an answer could be different now*. Joining them
 * is one line, and until this package existed there was nowhere for that line to live — so Word had
 * a `revision.ts` and the deck had the same `revision.ts`, with a comment in both saying so.
 *
 * That comment also named the condition for stopping: *if a third product wants this line too, that
 * is the point at which an `office-react` package has two data points instead of a guess.* A note
 * wants it, the site's inspector wants it, and `useControls` in this package wanted it — so here it
 * is, under the name the layering actually took.
 */

/**
 * For anything that reads the **selection**: a ribbon, a properties panel, an overlay, a timeline.
 *
 * Both halves, and it has to be both: a toggle's state is a fact about the selection and whether an
 * insert may run is a fact about the document. Word's ribbon listened to two of the three events
 * once, so a *cleared* selection never reached it — and `deleteTable` clears the selection when it
 * succeeds. That is the bug this exists to have exactly one copy of.
 */
export const useEditorRevision = (editor: Editor | null): number =>
  useRevision((reread) => watchAnswers(editor, reread), [editor]);

/**
 * For one that reads only the **document** — speaker notes, an outline, a word count.
 *
 * Narrower on purpose: a pane that redraws when the caret moves is a pane that redraws on every
 * keystroke, and the caret does not change what an outline says.
 */
export const useDocumentRevision = (editor: Editor | null): number =>
  useRevision((reread) => watchContent(editor, reread), [editor]);
