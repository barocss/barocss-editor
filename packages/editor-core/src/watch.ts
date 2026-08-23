import type { Editor } from './editor';

/**
 * "Tell me when something could change what I would answer."
 *
 * ## Why this is the editor's knowledge and not the chrome's
 *
 * Every panel around a document — a toolbar, a properties panel, an outline, a
 * timeline — is a reader: it holds no state of its own and re-reads the document
 * whenever the answer could have changed. To do that it has to subscribe, and
 * subscribing means knowing **which events mean "an answer might be different
 * now"**. That is a fact about this editor's event vocabulary, so it belongs
 * here, beside the code that emits them.
 *
 * It was not here, and the cost was measured. Six panels across two products
 * each picked their own set of event names, and they picked three different
 * sets. `updateSelection(null)` emits **only** `editor:selection.change` — the
 * model event is for a selection that *is* something, and a selection cleared is
 * announced on the other one and nowhere else. Word's ribbon did not listen to
 * it, and `deleteTable` clears the selection when it succeeds, so a toolbar
 * could go on describing cells that no longer existed. Slides had already found
 * that and written it down in its own copy of the subscription, where it helped
 * nobody else.
 *
 * A panel should not have to know that. It should say what it reads — the
 * selection, or only the document — and be told when to read again.
 *
 * ## Called once, immediately
 *
 * Both of these call the listener once after subscribing. Not a wasted call: a
 * document is loaded asynchronously, so `content.change` can be emitted between
 * a panel deciding to subscribe and the subscription existing, and an event
 * nobody is listening to yet never arrives. Without it a panel can read the
 * document once, before there is one, and never read it again.
 */

/** What a panel reading a **selection** has to hear. */
const ANSWER_EVENTS = [
  'editor:selection.model',
  /**
   * Not a duplicate of the one above.
   *
   * `selection.model` carries a selection; this one also fires when there is no
   * longer one to carry. Listening to only the first leaves a panel drawing
   * handles around a shape nobody has selected.
   */
  'editor:selection.change',
  /**
   * And the content, because what is *under* a selection can change without the
   * selection moving: type a character and the summary of what is selected is
   * different while the range is the same.
   */
  'editor:content.change'
] as const;

/** And one reading only what the document says. */
const CONTENT_EVENTS = ['editor:content.change'] as const;

function watch(
  editor: Editor | null,
  events: readonly string[],
  listener: () => void
): () => void {
  if (!editor) return () => {};
  for (const event of events) editor.on(event as never, listener);
  // See the note above: subscribe, then read, or lose whatever happened in
  // between.
  listener();
  return () => {
    for (const event of events) editor.off(event, listener);
  };
}

/**
 * Watch everything that could change what a panel reading the **selection**
 * would answer — a toolbar, a properties panel, an overlay, a timeline.
 *
 * Returns the unsubscribe, so it drops straight into an effect:
 *
 * ```ts
 * useEffect(() => watchAnswers(editor, reread), [editor]);
 * ```
 */
export function watchAnswers(editor: Editor | null, listener: () => void): () => void {
  return watch(editor, ANSWER_EVENTS, listener);
}

/**
 * Watch only the **document** — for a panel that reads no selection at all, like
 * speaker notes or a title.
 *
 * A separate function rather than an option, because the only reason to want the
 * narrower one is cost: a panel that rebuilds a model on every caret move is
 * doing real work for nothing. Two names with no arguments means a caller cannot
 * half-choose, which is exactly how six hand-rolled copies ended up listening to
 * three different subsets.
 */
export function watchContent(editor: Editor | null, listener: () => void): () => void {
  return watch(editor, CONTENT_EVENTS, listener);
}
