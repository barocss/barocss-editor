import { fitContent } from '@barocss/schema';
import type { INode } from '../types';
import type { ModelSelection } from '@barocss/editor-core';
import type { DataStore } from '../data-store';

/**
 * Utility for serializing/deserializing selected range to JSON format (INode[]).
 *
 * Range fragments follow document order, clip both endpoints and retain inline atoms and marks.
 * - On deserialize: assigns new sid and inserts matching only parent/content relationships.
 */
export class SerializationOperations {
  constructor(private dataStore: DataStore) {}

  /**
   * Serializes selected range to JSON node array.
   */
  serializeRange(range: ModelSelection): INode[] {
    if (range.type !== 'range') return [];
    const start = this.dataStore.getNode(range.startNodeId), end = this.dataStore.getNode(range.endNodeId);
    if (!start || !end) return [];
    if (typeof start.text === 'string' && (!Number.isInteger(range.startOffset) || range.startOffset < 0 || range.startOffset > start.text.length) ||
        typeof end.text === 'string' && (!Number.isInteger(range.endOffset) || range.endOffset < 0 || range.endOffset > end.text.length)) return [];
    if (start.sid === end.sid && typeof start.text === 'string' && range.startOffset >= range.endOffset) return [];
    const ancestors = (node: INode): string[] => {
      const result: string[] = [];
      for (let current: INode | undefined = node; current?.sid && !result.includes(current.sid); current = current.parentId ? this.dataStore.getNode(current.parentId) : undefined) result.push(current.sid);
      return result;
    };
    const endAncestors = new Set(ancestors(end));
    let scopeId = ancestors(start).find(sid => endAncestors.has(sid));
    if (!scopeId) return [];
    let scope = this.dataStore.getNode(scopeId)!;
    const schema = this.dataStore.getActiveSchema();
    // Keep inline wrappers (including links) around a fragment selected inside them.
    while (scope.parentId && (typeof scope.text === 'string' || schema?.getNodeType(scope.stype)?.group === 'inline')) {
      scope = this.dataStore.getNode(scope.parentId)!;
      scopeId = scope.sid!;
    }
    let active = false, finished = false;
    const visit = (sid: string): INode | null => {
      const node = this.dataStore.getNode(sid);
      if (!node || finished) return null;
      if (sid === start.sid) active = true;
      const { sid: _sid, parentId: _parentId, metadata: _metadata, ...held } = node;
      const copy: INode = JSON.parse(JSON.stringify(held));
      if (typeof node.text === 'string') {
        if (!active) return null;
        const from = sid === start.sid ? Math.max(0, range.startOffset) : 0;
        const to = sid === end.sid ? Math.min(node.text.length, range.endOffset) : node.text.length;
        if (sid === end.sid) finished = true;
        return { ...copy, text: node.text.slice(from, to), marks: copy.marks?.flatMap(mark => {
          const [a, b] = mark.range ?? [0, node.text!.length];
          const low = Math.max(from, a), high = Math.min(to, b);
          return low < high ? [{ ...mark, range: [low - from, high - from] as [number, number] }] : [];
        }) };
      }
      const children = (node.content ?? []).flatMap(child => {
        const childId = typeof child === 'string' ? child : child.sid;
        const value = childId ? visit(childId) : null;
        return value ? [value] : [];
      });
      if (sid === end.sid) finished = true;
      if (children.length) return { ...copy, content: children };
      // An inline atom between the endpoints is selected content too.
      return active && (!node.content?.length || sid === start.sid) ? { ...copy } : null;
    };
    const fragment = visit(scopeId);
    if (!fragment || !finished) return [];
    if (start.sid === end.sid && typeof start.text !== 'string') return [fragment];
    return (fragment.content as INode[] | undefined) ?? [fragment];
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

    // Normalise the incoming nodes against the target's content model before
    // creating anything. Pasted content comes from foreign documents and often
    // does not fit — inserting it verbatim would produce a document that
    // violates its own schema, which the commit-time check then rejects,
    // losing the whole paste. Fitting keeps what fits, unwraps foreign
    // wrappers, and drops only what has nowhere to go.
    const schema = this.dataStore.getActiveSchema();
    let nodesToInsert = inputNodes;
    if (schema && parent.stype) {
      const fitted = fitContent(parent.stype, inputNodes as any, {
        groupOf: (t: string) => schema.getNodeType(t)?.group,
        hasNodeType: (t: string) => schema.hasNodeType(t),
        contentModelOf: (t: string) => schema.getNodeType(t)?.content
      });
      if (fitted.dropped.length > 0 || fitted.unwrapped.length > 0) {
        console.warn('[DataStore] deserializeNodes: content adjusted to fit', {
          parentType: parent.stype,
          dropped: fitted.dropped.map((n) => n.stype),
          unwrapped: fitted.unwrapped.map((n) => n.stype)
        });
      }
      nodesToInsert = fitted.nodes as unknown as INode[];
    }

    const newIds: string[] = [];
    for (const node of nodesToInsert) {
      const cloned: INode = { ...node };
      cloned.parentId = targetParentId;
      const created = this.dataStore.core.createNodeWithChildren(cloned);
      newIds.push(created.sid!);
    }

    // Insert new ids into parent.content (preserve input order: first node at insertAt, second at insertAt+1, ...)
    content.splice(insertAt, 0, ...newIds);
    this.dataStore.updateNode(targetParentId, { content });

    createdIds.push(...newIds);
    return createdIds;
  }
}


