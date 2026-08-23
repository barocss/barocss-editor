import { useEffect, useReducer } from 'react';

/**
 * A counter that goes up whenever something says "read again".
 *
 * ## What it does not know
 *
 * Anything. It takes a function that subscribes and returns an unsubscribe, and
 * it counts. It has never heard of an editor, a document, a selection or an
 * event name — which is the point: **this package is pure UI**, and a control
 * that knows how the host's state is announced is a control the host cannot
 * reuse. The knowing half lives with the thing that emits the events
 * (`watchAnswers` in `editor-core`), and the two are composed by whoever has
 * both — a product package or the app.
 *
 * ```ts
 * // In the app, where an editor exists:
 * const revision = useRevision((reread) => watchAnswers(editor, reread), [editor]);
 * const summary = useMemo(() => editor.getSelectionSummary(), [editor, revision]);
 * ```
 *
 * ## Why a counter and not the value
 *
 * Because a panel that *holds* an answer holds a second copy of the host's state,
 * and a copy that falls behind is a control that lies — a bold button that
 * remembers being pressed is wrong the moment something is undone. A counter in a
 * `useMemo`'s dependencies means the answer is recomputed and never stored.
 *
 * Holding the value looked equivalent and was not, for a subtler reason too: a
 * host that returns a shared constant for "nothing selected" hands React the same
 * object twice, React skips the render, and anything read *during* that render
 * from outside React — whether a command can run, say — stays stale. A number
 * that always changes cannot be skipped.
 */
export function useRevision(
  subscribe: (reread: () => void) => () => void,
  /**
   * When to subscribe again, exactly like `useEffect`'s.
   *
   * Taken explicitly because the natural way to call this is with an inline
   * arrow, and an inline arrow is a new function on every render — a hook that
   * depended on the function's identity would unsubscribe and resubscribe
   * forever, which is a render loop rather than a bug you notice once.
   */
  deps: readonly unknown[]
): number {
  const [revision, reread] = useReducer((count: number) => count + 1, 0);

  // `subscribe` is deliberately not a dependency; `deps` is what the caller
  // says it turns on. See the note above.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => subscribe(reread), deps);

  return revision;
}
