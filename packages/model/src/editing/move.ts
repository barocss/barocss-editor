import type { DataStore } from '@barocss/datastore';
import { validateEditingFragment, type Schema } from '@barocss/schema';
import type { EditingPlan, EditingPolicy, EditingSource, EditingTarget, FragmentNode } from './types';
import { clip, tree, walk } from './fragment';
import { signature } from './state';

type Replacement = Pick<EditingPlan, 'parentId' | 'index' | 'removeIds' | 'content' | 'retainIds' | 'caret' | 'actions' | 'noop'>;
function ancestry(store: DataStore, id: string): string[] {
  const path: string[] = [];
  for (let node = store.getNode(id); node; node = node.parentId ? store.getNode(node.parentId) : undefined) {
    if (!node.sid || path.includes(node.sid)) throw new Error('Invalid target ancestry');
    path.push(node.sid);
  }
  return path;
}
function commonParent(store: DataStore, schema: Schema, first: string, last: string): string {
  const left = ancestry(store, first), right = ancestry(store, last), common = left.find(id => right.includes(id));
  if (!common) throw new Error('Move endpoints have no common container');
  for (const path of [left, right]) for (const id of path.slice(0, path.indexOf(common))) {
    const definition = schema.getNodeType(store.getNode(id)!.stype);
    if (definition?.isolating || definition?.atom) throw new Error('Move crosses an isolated or atomic container');
  }
  return common;
}
function validate(schema: Schema, root: FragmentNode): void {
  const result = validateEditingFragment(schema, [root]);
  if (!result.valid) throw new Error(result.errors.join('; '));
}
function finish(store: DataStore, root: FragmentNode, retained: WeakMap<FragmentNode, string>, caretNode?: FragmentNode, offset = 0): Replacement {
  const parentId = root.sourceId!, content = root.content ?? [], retainIds: Record<string, string> = {};
  let caret: EditingPlan['caret'] = null;
  const seen = new Set<string>();
  walk(content, (node, path) => {
    const id = retained.get(node) ?? node.sourceId;
    if (id) {
      if (seen.has(id)) throw new Error('Move would duplicate a retained node');
      seen.add(id); retainIds[path.join('.')] = id;
    }
    delete node.sourceId;
    if (node === caretNode) caret = { path, offset };
  });
  return { parentId, index: 0, removeIds: [...store.getNode(parentId)!.content as string[]], content, retainIds, caret, actions: ['move'] };
}

/** One common-ancestor replacement makes source removal and insertion one reversible edit. */
export function planNodeMove(store: DataStore, schema: Schema, ids: string[], target: Extract<EditingTarget, { kind: 'children' }>): Replacement {
  const nodes = ids.map(id => store.getNode(id));
  const sourceParent = nodes[0]?.parentId, destination = store.getNode(target.parentId);
  if (!ids.length || new Set(ids).size !== ids.length || !sourceParent || nodes.some(node => node?.parentId !== sourceParent)) throw new Error('Move requires distinct sibling nodes');
  if (!destination || !Number.isInteger(target.index) || target.index < 0 || target.index > (destination.content?.length ?? 0) || target.deleteCount) throw new Error('Move requires a valid insertion gap');
  if (ancestry(store, target.parentId).some(id => ids.includes(id))) throw new Error('Cannot move a node into itself or its descendants');
  const parentId = commonParent(store, schema, sourceParent, target.parentId), root = tree(store, parentId);
  const original = signature(root), sources = new Map<string, FragmentNode>();
  walk(root.content ?? [], node => { if (node.sourceId && ids.includes(node.sourceId)) sources.set(node.sourceId, node); });
  const ordered = (store.getNode(sourceParent)!.content as string[]).filter(id => sources.has(id));
  if (ordered.length !== ids.length) throw new Error('Move source is outside the document');
  const index = target.index - (sourceParent === target.parentId ? (destination.content as string[]).slice(0, target.index).filter(id => sources.has(id)).length : 0);
  const transform = (node: FragmentNode): void => {
    if (!node.content) return;
    node.content = node.content.filter(child => !sources.has(child.sourceId!));
    node.content.forEach(transform);
    if (node.sourceId === target.parentId) node.content.splice(index, 0, ...ordered.map(id => sources.get(id)!));
  };
  transform(root);
  validate(schema, root);
  const noop = original === signature(root);
  let caretNode: FragmentNode | undefined;
  walk(ordered.map(id => sources.get(id)!), node => { if (!caretNode && typeof node.text === 'string') caretNode = node; });
  return { ...finish(store, root, new WeakMap(), caretNode), noop };
}

/** Text moves split runs; the original run keeps its ID and the transferred text gets new IDs. */
export function planTextMove(store: DataStore, schema: Schema, policy: EditingPolicy, source: Extract<EditingSource, { kind: 'text' }>, target: Extract<EditingTarget, { kind: 'text' }>, insertion: EditingPlan): Replacement {
  const node = store.getNode(source.nodeId)!, destination = store.getNode(target.nodeId)!;
  if (typeof node.text !== 'string' || !node.parentId || !destination.parentId) throw new Error('Move requires text endpoints');
  if (Object.keys(policy.references?.[node.stype] ?? {}).some(key => node.attributes?.[key] !== undefined)) throw new Error('Moving reference-bearing text requires a conversion');
  if (target.from !== target.to || target.endNodeId && target.endNodeId !== target.nodeId) throw new Error('Text move requires a collapsed destination');
  if (insertion.parentId !== destination.parentId || !insertion.actions.includes('join') || insertion.losses.length) throw new Error('Text move requires a lossless inline join');
  const parentId = commonParent(store, schema, node.parentId, destination.parentId), root = tree(store, parentId);
  const retained = new WeakMap<FragmentNode, string>();
  let caretNode: FragmentNode | undefined, offset = 0;
  if (node.sid === destination.sid) {
    if (target.from >= source.from && target.from <= source.to) return { ...finish(store, root, retained), noop: true };
    let held: FragmentNode | undefined;
    walk(root.content ?? [], item => { if (item.sourceId === node.sid) held = item; });
    if (!held) throw new Error('Missing move source');
    const moved = clip(held, source.from, source.to); delete moved.sourceId;
    caretNode = moved; offset = moved.text!.length;
    const ranges = target.from < source.from
      ? [[0, target.from], [source.from, source.to], [target.from, source.from], [source.to, node.text.length]]
      : [[0, source.from], [source.to, target.from], [source.from, source.to], [target.from, node.text.length]];
    const movedAt = target.from < source.from ? 1 : 2;
    let pieces = ranges.map(([from, to], index) => index === movedAt ? moved : clip(held!, from, to));
    pieces.forEach(item => delete item.sourceId); retained.set(pieces[0], node.sid!);
    if (schema.getNodeType(store.getNode(node.parentId)!.stype)?.code && !node.marks?.length) {
      pieces = [{ ...pieces[0], text: pieces.map(piece => piece.text).join('') }];
      retained.set(pieces[0], node.sid!); caretNode = pieces[0]; offset = target.from < source.from ? target.from + source.to - source.from : target.from;
    }
    walk([root], item => { if (item.sourceId === node.parentId) item.content!.splice(item.content!.indexOf(held!), 1, ...pieces); });
  } else {
    const replacement = structuredClone(insertion.content);
    walk(replacement, (item, path) => {
      const id = insertion.retainIds[path.join('.')]; if (id) retained.set(item, id);
      if (signature(path) === signature(insertion.caret?.path)) { caretNode = item; offset = insertion.caret!.offset; }
      delete item.sourceId;
    });
    const transform = (item: FragmentNode): void => {
      if (item.sourceId === destination.parentId) item.content = replacement;
      if ((retained.get(item) ?? item.sourceId) === node.sid) {
        const before = clip({ ...item, text: node.text }, 0, source.from), after = clip({ ...item, text: node.text }, source.to, node.text!.length);
        item.text = before.text! + after.text!;
        item.marks = [...(before.marks ?? []), ...(after.marks ?? []).map(mark => ({ ...mark, range: [mark.range![0] + source.from, mark.range![1] + source.from] as [number, number] }))];
      }
      item.content?.forEach(transform);
    };
    transform(root);
  }
  validate(schema, root);
  return { ...finish(store, root, retained, caretNode, offset), actions: ['move', 'join'] };
}
