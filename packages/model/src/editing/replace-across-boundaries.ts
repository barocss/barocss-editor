import type { DataStore } from '@barocss/datastore';
import { validateEditingContent, type Schema } from '@barocss/schema';
import type { EditingPlan, FragmentNode } from './types';
import { clip, tree, walk } from './fragment';

type Replacement = Pick<EditingPlan, 'parentId' | 'index' | 'removeIds' | 'content' | 'retainIds' | 'caret' | 'actions'>;

/** Inline replacement that preserves target roles. It never joins unlike containers or invents a type. */
export function replaceAcrossBoundaries(store: DataStore, schema: Schema, startId: string, from: number,
  endId: string, to: number, incoming: FragmentNode[]): Replacement {
  const ancestors = (id: string): string[] => {
    const result: string[] = [];
    let node = store.getNode(id);
    while (node?.parentId) {
      if (result.includes(node.parentId)) throw new Error('Cyclic target ancestry');
      result.push(node.parentId); node = store.getNode(node.parentId);
    }
    return result;
  };
  const left = ancestors(startId), right = ancestors(endId), parentId = left.find(id => right.includes(id));
  if (!parentId) throw new Error('Text endpoints have no common container');
  for (const path of [left, right]) for (const id of path.slice(0, path.indexOf(parentId))) {
    const definition = schema.getNodeType(store.getNode(id)!.stype);
    if (definition?.isolating || definition?.atom) throw new Error('Cannot replace across an isolated or atomic boundary');
  }
  const parent = store.getNode(parentId)!;
  const siblings = parent.content as string[];
  const firstBranch = left.indexOf(parentId) ? left[left.indexOf(parentId) - 1] : startId;
  const lastBranch = right.indexOf(parentId) ? right[right.indexOf(parentId) - 1] : endId;
  const index = siblings.indexOf(firstBranch), endIndex = siblings.indexOf(lastBranch);
  if (index < 0 || endIndex < index) throw new Error('Text range must be in document order');
  const removeIds = siblings.slice(index, endIndex + 1);
  const originals = removeIds.map(id => tree(store, id));
  const retained = new WeakMap<FragmentNode, string>();
  const keep = (node: FragmentNode): FragmentNode => {
    if (node.sourceId) retained.set(node, node.sourceId);
    delete node.sourceId;
    return node;
  };
  const endPath = new Set([endId, ...right]);
  let active = false, finished = false, caretNode: FragmentNode | undefined, caretOffset = 0;
  walk(incoming, node => { if (typeof node.text === 'string') { caretNode = node; caretOffset = node.text.length; } });
  const empty = (node: FragmentNode): FragmentNode | null => {
    if (schema.getNodeType(node.stype)?.atom) return null;
    if (typeof node.text === 'string') return { ...node, text: '', marks: [] };
    if (!node.content) return null;
    return { ...node, content: node.content.flatMap(child => { const value = empty(child); return value ? [value] : []; }) };
  };
  const children = (type: string, nodes: FragmentNode[]): FragmentNode[] => {
    const entries = nodes.map(node => ({ node, values: visit(node), restored: false }));
    const content = () => entries.flatMap(entry => entry.values);
    const valid = () => validateEditingContent(schema, type, nodes === originals
      ? [...siblings.slice(0, index).map(id => tree(store, id)), ...content(), ...siblings.slice(endIndex + 1).map(id => tree(store, id))]
      : content()).valid;
    if (!valid()) {
      // Restore only empty existing containers needed by the parent's content expression.
      for (const entry of entries) if (!entry.values.length) {
        const shell = empty(entry.node);
        if (shell) { walk([shell], keep); entry.values = [shell]; entry.restored = true; }
      }
      if (!valid()) throw new Error('Range replacement cannot preserve required children');
      for (const entry of [...entries].reverse()) if (entry.restored) {
        const saved = entry.values; entry.values = [];
        if (!valid()) entry.values = saved;
      }
    }
    return content();
  };
  const visit = (node: FragmentNode): FragmentNode[] => {
    const id = node.sourceId;
    if (id === startId) {
      if (active || finished) throw new Error('Invalid target range');
      active = true;
      const prefix = keep(clip(node, 0, from));
      if (!caretNode) { caretNode = prefix; caretOffset = from; }
      return [prefix, ...incoming];
    }
    if (id === endId) {
      if (!active) throw new Error('Text range must be in document order');
      finished = true;
      return [keep(clip(node, to, node.text!.length))];
    }
    if (active && !finished && !endPath.has(id!)) return [];
    if (node.content) return [keep({ ...node, content: children(node.stype, node.content) })];
    return [keep(node)];
  };
  const content = children(parent.stype, originals);
  if (!finished) throw new Error('Range endpoints are outside the target');
  const retainIds: Record<string, string> = {};
  let caret: EditingPlan['caret'] = null;
  walk(content, (node, path) => {
    const id = retained.get(node); if (id) retainIds[path.join('.')] = id;
    if (node === caretNode) caret = { path, offset: caretOffset };
  });
  return { parentId, index, removeIds, content, retainIds, caret, actions: ['replace', 'insert'] };
}
