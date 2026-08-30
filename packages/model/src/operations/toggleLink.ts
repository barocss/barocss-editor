import { defineOperation } from './define-operation';
import { defineOperationDSL } from './define-operation-dsl';
import type { TransactionContext } from '../types';

export const toggleLink = defineOperationDSL(
  (href: string, title?: string) => ({
    type: 'toggleLink',
    payload: { href, ...(title != null && { title }) }
  } as any),
  { atom: false, category: 'mark' }
);

defineOperation('toggleLink', async (operation: any, context: TransactionContext) => {
  const { href, title } = operation.payload;
  const dataStore = context.dataStore;
  const selection = context.selection.current;

  if (!selection || selection.type !== 'range') {
    throw new Error('toggleLink: no range selection');
  }

  const { startNodeId, startOffset, endNodeId, endOffset } = selection;
  if (!startNodeId || !endNodeId) throw new Error('toggleLink: invalid selection');

  const startNode = dataStore.getNode(startNodeId);
  if (!startNode) throw new Error('toggleLink: start node not found');

  /**
   * Whether these words already point **at this address**.
   *
   * It was *whether they carry a link at all*, and the difference is a fault a reader meets the
   * second time they use the command: press 링크 on linked words with a new address and the link was
   * **taken off** — the href in the payload was read only on the branch that adds one, so a change of
   * address was silently a removal.
   *
   * A toggle takes off what it would have put on. `toggleBold` pressed on bold text unbolds it
   * because there is only one bold; a link is a *value*, so the same gesture with a different value
   * is a change and not a removal — which is what `removeLink` beside it is for.
   *
   * Found writing this operation's first test by hand: the conformance probe asks whether a command
   * moves the document, and both branches move it.
   */
  const hasLink = startNode.marks?.some(
    (m: any) => (m.stype || m.type) === 'link' && (m.attrs?.href ?? m.attrs?.url) === href
  );

  /**
   * Exactly what every run in the range carried, before this rewrites them.
   *
   * The inverse used to be this operation again, on the reasoning that toggling
   * twice is the identity. It is not, unless nothing happens in between — and
   * toggling back writes *this* href over whatever the link used to point at,
   * so undoing a re-link left the text linked to the wrong page. It also acted
   * on one node where a selection covers several, so undoing a link applied
   * across a sentence unlinked the first run and left the rest.
   *
   * `applyMark` and `toggleMark` learned the same thing: restore the list, do
   * not run the opposite. One `setMarks` per run, as a `batch`.
   */
  const inRange: string[] = (() => {
    if (startNodeId === endNodeId) return [startNodeId];
    try {
      return (dataStore.getNodesInRange(startNodeId, endNodeId) as string[]).filter(
        (sid) => typeof dataStore.getNode(sid)?.text === 'string'
      );
    } catch {
      return [startNodeId];
    }
  })();

  const restore = inRange.map((sid) => ({
    type: 'setMarks',
    payload: {
      nodeId: sid,
      marks: JSON.parse(JSON.stringify(dataStore.getNode(sid)?.marks ?? []))
    }
  }));
  const inverse =
    restore.length === 1
      ? restore[0]
      : { type: 'batch', payload: { operations: restore } };

  if (hasLink) {
    const rangeSelection = {
      type: 'range' as const,
      startNodeId,
      startOffset: startOffset || 0,
      endNodeId,
      endOffset: endOffset || 0
    };
    dataStore.removeMark(rangeSelection as any, 'link');
    return {
      ok: true,
      data: { removed: true },
      inverse
    };
  }

  const rangeSelection = {
    type: 'range' as const,
    startNodeId,
    startOffset: startOffset || 0,
    endNodeId,
    endOffset: endOffset || 0
  };
  /*
   * Off first, then on — because a change of address is one link and not two.
   *
   * `applyMark` appends, so laying `https://…/docs` over words already pointing at `https://…` left
   * **both** marks on the run: two links over the same characters, and which one a reader followed
   * depended on which the drawing happened to read first. `removeMark` over the range takes whatever
   * was there off, whatever it pointed at, and the mark below is the one that stays.
   */
  dataStore.removeMark(rangeSelection as any, 'link');

  const markData = {
    stype: 'link',
    attrs: { href, ...(title != null && { title }) },
  };
  dataStore.applyMark(rangeSelection as any, markData as any);

  return {
    ok: true,
    data: { applied: true, href },
    inverse
  };
});
