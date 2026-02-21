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
      inverse: { type: 'toggleLink', payload: { href, title } }
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
    inverse: { type: 'removeMark', payload: { nodeId: startNodeId, markType: 'link' } }
  };
});
