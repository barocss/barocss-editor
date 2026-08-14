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

  const hasLink = startNode.marks?.some((m: any) => (m.stype || m.type) === 'link');

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
