import type { INode } from '../types';
import type { ModelSelection } from '@barocss/editor-core';
import type { DataStore } from '../data-store';

/**
 * Utility for serializing/deserializing selected range to JSON format (INode[]).
 *
 * Phase 1 implementation scope:
 * - When start/end are same node: extracts only text portion of that node and returns as new node.
 * - For cross-node range: currently serializes only at block level (additional detailed splitting to be extended later).
 * - On deserialize: assigns new sid and inserts matching only parent/content relationships.
 */
export class SerializationOperations {
  constructor(private dataStore: DataStore) {}

  /**
   * Serializes selected range to JSON node array.
   */
  serializeRange(range: ModelSelection): INode[] {
    const nodes: INode[] = [];

    // Text range within single node
    if (range.startNodeId === range.endNodeId) {
      const node = this.dataStore.getNode(range.startNodeId);
      if (!node) return [];

      if (typeof node.text === 'string') {
        const start = range.startOffset ?? 0;
        const end = range.endOffset ?? node.text.length;
        if (start >= end) return [];
        const text = node.text.substring(start, end);
        nodes.push({
          stype: node.stype,
          // Include only text-only fragment (content/children not included at current stage)
          text,
          marks: node.marks
        } as INode);
        return nodes;
      }

      // Copy entire node as one node if node has no text
      nodes.push({ ...node });
      return nodes;
    }

    // multi-node range: at current stage, copy text nodes between start~end as-is
    const allNodes = this.dataStore.getAllNodes();
    const startIndex = allNodes.findIndex(n => n.sid === range.startNodeId);
    const endIndex = allNodes.findIndex(n => n.sid === range.endNodeId);
    if (startIndex === -1 || endIndex === -1 || startIndex > endIndex) {
      return [];
    }

    for (let i = startIndex; i <= endIndex; i++) {
      const node = allNodes[i];
      if (!node || typeof node.text !== 'string') continue;
      nodes.push({ ...node });
    }

    return nodes;
  }

  /**
   * Inserts JSON node array at specified parent/position and returns list of created sids.
   */
  deserializeNodes(
    inputNodes: INode[],
    targetParentId: string,
    targetPosition?: number
  ): string[] {
    const createdIds: string[] = [];
    const parent = this.dataStore.getNode(targetParentId);
    if (!parent) {
      return createdIds;
    }

    // Ensure parent.content
    if (!Array.isArray(parent.content)) {
      parent.content = [];
      this.dataStore.updateNode(targetParentId, { content: parent.content });
    }

    const content = parent.content as string[];
    const insertAt = typeof targetPosition === 'number'
      ? Math.min(Math.max(targetPosition, 0), content.length)
      : content.length;

    // At current stage, assuming input nodes are root-level array,
    // treat each node as individual document root and use createNodeWithChildren.
    const newIds: string[] = [];
    for (const node of inputNodes) {
      const cloned: INode = { ...node };
      cloned.parentId = targetParentId;
      const created = this.dataStore.core.createNodeWithChildren(cloned);
      newIds.push(created.sid!);
    }

    // Insert new ids into parent.content
    content.splice(insertAt, 0, ...newIds);
    this.dataStore.updateNode(targetParentId, { content });

    createdIds.push(...newIds);
    return createdIds;
  }
}


