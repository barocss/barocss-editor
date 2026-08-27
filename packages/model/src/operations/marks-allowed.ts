import type { TransactionContext } from '../types';

/**
 * Whether this mark may go on this run at all — the schema's `marks`, read.
 *
 * ## What the field means
 *
 * A node definition may carry `marks: string[]`: the marks a run inside it may take. **Absent** is
 * "anything", which is what every node in this schema but one says and is why nothing had to read it
 * until now. `[]` is "none", and a list is a list.
 *
 * ## Why the operation and not the toolbar
 *
 * A greyed-out button is a courtesy; this is the guard. A mark can reach a run through a paste, a
 * command, a document loaded from elsewhere and a test, and only one of those goes past a toolbar.
 * The operation is where the document's rules are true — which is the same argument the roster makes
 * about inverses.
 *
 * ## What it cost to not have it
 *
 * Bold inside a code block. A `<strong>` inside a `<pre>` is something no syntax highlighter expects
 * and no round-trip through plain text survives — the mark is silently lost the moment the code is
 * copied out, which is what a code block is *for*. The field to say so has been on the node
 * definition since the schema was written and nothing consulted it.
 *
 * ## Which operations ask
 *
 * The ones an **author** reaches for: `applyMark` and `toggleMark`. Not `setMarks`, which writes a
 * list wholesale and is how an inverse puts back what an operation took away — a guard there would
 * make undo refuse to restore a document to a state it was actually in, which is a worse failure
 * than the one being prevented. And a mark that is already on a run can still be **removed**, which
 * is how a document that arrives holding one is cleaned up.
 *
 * ## The nearest ancestor decides
 *
 * A run is inside a paragraph inside a quotation inside a page, and the closest thing that has an
 * opinion is the one that means it. A quotation that allowed everything would otherwise overrule the
 * code block inside it.
 */
export const marksAllowed = (
  context: TransactionContext,
  nodeId: string,
  markType: string
): boolean => {
  const schema = context.schema ?? (context.dataStore as any)?.getActiveSchema?.();
  if (!schema?.getNodeType) return true;

  let at: string | undefined = nodeId;
  for (let hop = 0; at && hop < 32; hop += 1) {
    const node = context.dataStore.getNode(at) as any;
    if (!node) return true;
    const allowed = schema.getNodeType(String(node.stype))?.marks;
    if (Array.isArray(allowed)) return allowed.includes(markType);
    at = node.parentId as string | undefined;
  }
  return true;
};

