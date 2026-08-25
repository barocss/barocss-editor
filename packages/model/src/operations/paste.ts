import { defineOperation } from './define-operation';
import type { TransactionContext } from '../types';
import type { INode } from '@barocss/datastore';
import { defineOperationDSL } from './define-operation-dsl';

export interface PasteInput {
  nodes: INode[];
}

export interface PasteResult {
  insertedNodeIds: string[];
  newSelection: any | null;
}

type PasteOperation = {
  range: any; // ModelSelection
  data: PasteInput;
};


export const paste = defineOperationDSL(
  (nodes: INode[], range: any) => ({
    type: 'paste',
    payload: {
      data: { nodes },
      range
    }
  }),
  { atom: true, category: 'clipboard' }
);

defineOperation(
  'paste',
  async (operation: any, context: TransactionContext) => {
    const { range, data } = operation.payload as PasteOperation;
    if (!range || !data || !Array.isArray(data.nodes)) {
      throw new Error('[paste] range and data.nodes are required');
    }

    // Simple version: insert nodes under startNodeId's parent
    const startNode = context.dataStore.getNode(range.startNodeId);
    if (!startNode || !startNode.parentId) {
      throw new Error('[paste] startNode or its parent not found');
    }

    const parentId = startNode.parentId;
    const parent = context.dataStore.getNode(parentId);
    if (!parent || !Array.isArray(parent.content)) {
      throw new Error('[paste] parent node or its content not found');
    }

    const index = (parent.content as string[]).indexOf(range.startNodeId);
    const position = index >= 0 ? index + 1 : parent.content.length;

    const insertedNodeIds = context.dataStore.deserializeNodes(data.nodes, parentId, position);

    const newSelection = insertedNodeIds.length
      ? {
          type: 'range',
          startNodeId: insertedNodeIds[insertedNodeIds.length - 1],
          startOffset: 0,
          endNodeId: insertedNodeIds[insertedNodeIds.length - 1],
          endOffset: 0,
          collapsed: true,
          direction: 'forward'
        }
      : null;

    const result: PasteResult = {
      insertedNodeIds,
      newSelection
    };

    return {
      ...result,
      ok: true,
      /**
       * Taking back exactly what was put in.
       *
       * Pasting had no inverse at all, so Ctrl+V followed by Ctrl+Z left the
       * pasted nodes in the document — the plainest kind of undo there is, and
       * it did nothing. `removeChildren` names them, records where each sat,
       * and refuses any that are not the parent's, so a paste undone twice
       * cannot take a neighbour with it.
       */
      ...(insertedNodeIds.length
        ? { inverse: { type: 'removeChildren', payload: { parentId, childIds: insertedNodeIds } } }
        : {})
    } as any;
  }
);


