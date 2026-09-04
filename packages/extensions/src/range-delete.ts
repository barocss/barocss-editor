import type { Editor, ModelSelection } from '@barocss/editor-core';
import { control, deleteRange, deleteTextRange, moveChildren, removeChild } from '@barocss/model';

/**
 * **두 지점 사이를 지우는 연산들** — 한 곳에서.
 *
 * ## 왜 한 곳이어야 했나
 *
 * `_buildDeleteTextOperations` existed **twice**, under one name, doing two different things:
 *
 * | | 한 런 안 | 블록을 넘을 때 |
 * |---|---|---|
 * | `delete.ts` | `deleteTextRange` | `deleteRange` — 글자는 맞고 블록은 안 합쳐짐 |
 * | `text.ts` | `deleteTextRange` | **`deleteTextRange` 그대로** — 시작 런 안에서 잘라냄 |
 *
 * So Backspace over three paragraphs left the text right and the blocks apart, and **typing** over
 * the same three mangled the first run and left the other two untouched. Two spellings of *delete
 * between two points*, and the second one was not a smaller version of the first — it was wrong.
 *
 * ## 무엇을 하는가
 *
 * 1. `deleteRange` — the runs. It is correctly named and it edits text; nothing about blocks.
 * 2. `removeChild` for every block wholly inside the range.
 * 3. `moveChildren` — what is left of the last block joins the first.
 * 4. `removeChild` for the last block, now empty.
 *
 * Built out of operations that each already have an inverse, rather than folded into `deleteRange`'s
 * runtime: one transaction, one undo, and no new inverse to get right.
 *
 * **Which block survives is the one the range started in** — a drag from a heading into a paragraph
 * leaves a heading. That is what a reader means by dragging in that direction, and it is why
 * `mergeBlockNodes` is not used: it refuses two different stypes, and refusing is the wrong answer
 * to a question that has one.
 */
export function deleteRangeOperations(range: ModelSelection, editor?: Editor): unknown[] {
  if (range.startNodeId === range.endNodeId) {
    return control(range.startNodeId, [deleteTextRange(range.startOffset, range.endOffset)]) as never;
  }

  return [
    deleteRange({
      startNodeId: range.startNodeId,
      startOffset: range.startOffset,
      endNodeId: range.endNodeId,
      endOffset: range.endOffset
    }),
    ...(editor ? joinAcross(editor, range) : [])
  ];
}

/**
 * The structural half — see above.
 *
 * Read **before** the transaction runs, which is safe because `deleteRange` only edits text: the
 * sids and the parentage this walks are the same afterwards.
 *
 * Returns nothing when the two ends are not siblings under one parent — a range from inside a
 * quotation out into the body, say. That case leaves the text correct and the blocks apart, which is
 * what happens today; it is a smaller wrong than a guess about which container should survive, and
 * it is written down rather than silently attempted.
 */
export function joinAcross(editor: Editor, range: ModelSelection): unknown[] {
  /*
   * A host that cannot be walked gets the text and nothing else, which is what happened before this
   * existed. Guarded rather than assumed: a test with a mock store and a renderer-less environment
   * both reach here, and neither has a reason to grow a `getNode`.
   *
   * (이 주석이 두 번 적혀 있었다 — 편집 사고이고, 두 판이 조금 달라서 어느 쪽이 지금 사실인지 읽는
   * 사람이 알 수 없었다. 둘 다 사실이라 넓은 쪽을 남긴다.)
   */
  const store = editor.dataStore;
  if (typeof store?.getNode !== 'function') return [];

  /**
   * The block a run lives in — walk up while the node itself is **inline**.
   *
   * Written the other way round first, asking whether the *parent* is inline, and it returned the
   * run: a paragraph is not inline either, so the very first step passed. The question is about the
   * node, not about what holds it.
   */
  const blockOf = (sid: string): string | undefined => {
    let at: string | undefined = sid;
    for (let depth = 0; at && depth < 32; depth += 1) {
      const node = store.getNode(at);
      if (!node) return undefined;
      if (!isInline(editor, node)) return at;
      at = node.parentId;
    }
    return undefined;
  };

  const first = blockOf(range.startNodeId);
  const last = blockOf(range.endNodeId);
  if (!first || !last || first === last) return [];

  const parentId = store.getNode(first)?.parentId;
  if (!parentId || store.getNode(last)?.parentId !== parentId) return [];

  const kids = (store.getNode(parentId)?.content ?? []) as string[];
  const from = kids.indexOf(first);
  const to = kids.indexOf(last);
  if (from < 0 || to < 0 || from >= to) return [];

  const ops: unknown[] = [];
  /* Every block wholly inside the range — its text is already gone, and so is its reason to exist. */
  for (let at = from + 1; at < to; at += 1) ops.push(removeChild(parentId, kids[at]));

  /* And what is left of the last block joins the first, at its end. */
  const tail = (store.getNode(last)?.content ?? []) as string[];
  const held = (store.getNode(first)?.content ?? []) as string[];
  if (tail.length > 0) ops.push(moveChildren(last, first, tail, held.length));
  ops.push(removeChild(parentId, last));

  return ops;
}

/**
 * Whether a node is inline — **asked of the schema**, which is the only thing that knows.
 *
 * Guessed by name first (`inline-text`, `link`, anything starting `inline`) and that is the shape of
 * a rule that works until a product names something else: the site's `richText`, a deck's connector
 * label. The schema declares a `group` for exactly this.
 */
function isInline(editor: Editor, node: { stype?: string; text?: string }): boolean {
  if (typeof node?.text === 'string') return true;
  /*
   * **`Editor` has no `schema`** — the store does, and it is the store that validates against one.
   * Reached for on the editor first and it came back `undefined` every time, which the text check
   * above hid: a run has text, so the walk worked and a `link` would have broken it.
   */
  return editor.dataStore?.getActiveSchema?.()?.getNodeType?.(String(node?.stype ?? ''))?.group === 'inline';
}
