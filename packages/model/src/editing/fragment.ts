import type { DataStore, INode } from '@barocss/datastore';
import type { DocumentFragment, EditingPolicy, FragmentNode, FragmentOrigin, FragmentReference } from './types';

export function fromNode(node: INode): FragmentNode {
  return structuredClone({ stype: node.stype, sourceId: node.sid, attributes: node.attributes, text: node.text, marks: node.marks });
}
export function tree(store: DataStore, sid: string, seen = new Set<string>()): FragmentNode {
  if (seen.has(sid)) throw new Error('Cyclic or duplicate node in fragment');
  seen.add(sid);
  const node = store.getNode(sid);
  if (!node) throw new Error(`Missing source node: ${sid}`);
  return { ...fromNode(node), ...(node.content ? { content: node.content.map(child => {
    if (typeof child !== 'string') throw new Error('Expected stored child IDs');
    return tree(store, child, seen);
  }) } : {}) };
}
export function walk(nodes: FragmentNode[], visit: (node: FragmentNode, path: number[]) => void, prefix: number[] = []): void {
  nodes.forEach((node, index) => { const path = [...prefix, index]; visit(node, path); walk(node.content ?? [], visit, path); });
}
export function references(nodes: FragmentNode[], policy: EditingPolicy): FragmentReference[] {
  const result: FragmentReference[] = [];
  const ids = new Set<string>();
  walk(nodes, node => {
    if (node.sourceId) {
      if (ids.has(node.sourceId)) throw new Error(`Duplicate source ID: ${node.sourceId}`);
      ids.add(node.sourceId);
    }
    for (const [attribute, rule] of Object.entries(policy.references?.[node.stype] ?? {})) {
      const target = node.attributes?.[attribute];
      if (target === undefined) continue;
      if (!node.sourceId || typeof target !== 'string') throw new Error(`Invalid reference: ${node.stype}.${attribute}`);
      result.push({ sourceId: node.sourceId, attribute, target, kind: rule.kind });
    }
  });
  return result;
}
export function fragment(content: FragmentNode[], selection: 'range' | 'nodes', origin: FragmentOrigin, policy: EditingPolicy, open = 0): DocumentFragment {
  return { version: 1, selection, origin, content, openStart: open, openEnd: open, references: references(content, policy), resources: [] };
}
export function clip(node: FragmentNode, from: number, to: number): FragmentNode {
  return { ...structuredClone(node), text: node.text!.slice(from, to), marks: node.marks?.flatMap(mark => {
    const [a, b] = mark.range ?? [0, node.text!.length];
    const low = Math.max(from, a), high = Math.min(to, b);
    return low < high ? [{ ...mark, range: [low - from, high - from] as [number, number] }] : [];
  }) };
}
