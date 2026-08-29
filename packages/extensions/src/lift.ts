import type { Editor } from '@barocss/editor-core';
import { deleteOp, moveNode } from '@barocss/model';
import { findAncestorNode } from '@barocss/datastore';

/**
 * Getting a block **out of the thing that wraps it** — the half every block toggle was missing.
 *
 * ## What was there
 *
 * `toggleBulletList`, `toggleOrderedList` and `toggleBlockquote` each called a `wrapIn…` operation
 * and nothing else. A paragraph became a bullet the first time and stayed one for ever: pressing the
 * control again ran the command, wrapped nothing, reported success and changed nothing. So there was
 * **no way to turn a list or a quotation back into paragraphs** in any of the three products — the
 * only route out was undo, and only if it was the last thing you did.
 *
 * Found by asking whether a toggle is its own inverse. Every *mark* toggle here is; the three
 * **block** ones were not, and they are exactly the three that change the shape of the document
 * rather than the look of a run.
 *
 * ## Why it is composed rather than a new operation
 *
 * There is no `unwrapFromList`, and `unwrap` is about the characters at the ends of a range. What
 * getting out *is* — move the blocks up to where the wrapper sits, then take the wrapper away — is
 * two operations this package already has, and composing them means the inverse comes for nothing:
 * each knows how to undo itself, and a transaction of the two undoes as one gesture.
 *
 * ## Two things it took a browser-less measurement to get right
 *
 * **The wrapper goes with its children.** `removeChild` takes the wrapper's reference out of its
 * parent and leaves the `listItem`s in the store — by then empty, because the blocks have just been
 * moved out. The transaction validates what it touched when it commits and refused the whole thing:
 * *"Content of 'listItem' ended early; 'block+' requires more children."* `deleteOp` takes the
 * descendants with it, and the blocks are already elsewhere.
 *
 * **The blocks move from the last backwards, at one index.** Inserting forwards at a fixed place
 * reverses them — the same arithmetic a paste does, and the same reason.
 */
export function liftOutOf(
  editor: Editor,
  /** The wrapper to dissolve — a `list`, a `blockQuote`. */
  wrapper: string,
  /**
   * The level between the wrapper and the blocks, when there is one.
   *
   * A list holds `listItem`s which hold blocks; a quotation holds blocks directly. Named rather than
   * guessed, because "one level or two" is a fact about the node type and a walk that guessed would
   * lift a list's items out as items — which is a `listItem` sitting on a page, and nothing accepts
   * one.
   */
  through?: string
): unknown[] | null {
  const store = editor.dataStore;
  const parentId = store?.getNode(wrapper)?.parentId as string | undefined;
  if (!store || !parentId) return null;

  const at = ((store.getNode(parentId)?.content ?? []) as string[]).indexOf(wrapper);
  if (at < 0) return null;

  const held = (sid: string) =>
    ((store.getNode(sid)?.content ?? []) as unknown[]).filter((one): one is string => typeof one === 'string');

  const blocks = through
    ? held(wrapper)
        .filter((one) => store.getNode(one)?.stype === through)
        .flatMap(held)
    : held(wrapper);
  if (blocks.length === 0) return null;

  return [...[...blocks].reverse().map((block) => moveNode(block, parentId, at)), deleteOp(wrapper)];
}

/** The nearest ancestor of a type, from where the caret is. */
export function wrapperAround(
  editor: Editor,
  startNodeId: string | undefined,
  stype: string
): { sid: string; attributes?: Record<string, unknown> } | undefined {
  const store = editor.dataStore;
  if (!store || !startNodeId) return undefined;

  const found = findAncestorNode(
    (id: string) => store.getNode(id),
    startNodeId,
    (node: { stype?: string }) => node.stype === stype
  ) as { sid?: string; attributes?: Record<string, unknown> } | undefined;

  return found?.sid ? { sid: found.sid, attributes: found.attributes } : undefined;
}
