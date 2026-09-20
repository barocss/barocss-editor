import type { DataStore } from '@barocss/datastore';
import type { Schema } from '@barocss/schema';
import type { DocumentFragment, EditingPlan, EditingPolicy, EditingTarget, FragmentNode } from './types';
import { clip, tree, walk } from './fragment';
import { sameAttributes } from './policy';
import { replaceAcrossBoundaries } from './replace-across-boundaries';

type Replacement = Pick<EditingPlan, 'parentId' | 'index' | 'removeIds' | 'content' | 'retainIds' | 'caret' | 'actions'>;
interface BoundaryHooks {
  choose(boundaries: FragmentNode[], leaves: FragmentNode[], target: FragmentNode): 'join-inline' | 'preserve';
  closed(content: FragmentNode[], target: FragmentNode): void;
  losses(boundaries: FragmentNode[], target: FragmentNode, parentId: string): void;
  guard(node: FragmentNode, targetId: string): void;
}

/** Text runs and flow containers; cross-role replacement requires an explicit policy. */
export function planTextRange(store: DataStore, schema: Schema, policy: EditingPolicy, input: DocumentFragment,
  target: Extract<EditingTarget, { kind: 'text' }>, hooks: BoundaryHooks): Replacement {
  const start = store.getNode(target.nodeId), end = store.getNode(target.endNodeId ?? target.nodeId);
  if (typeof start?.text !== 'string' || typeof end?.text !== 'string' || !Number.isInteger(target.from) || !Number.isInteger(target.to)
    || target.from < 0 || target.from > start.text.length || target.to < 0 || target.to > end.text.length
    || start.sid === end.sid && target.from > target.to) throw new Error('Invalid text target');
  const first = start.parentId ? store.getNode(start.parentId) : undefined;
  const last = end.parentId ? store.getNode(end.parentId) : undefined;
  if (!first?.sid || !last?.sid) throw new Error('Text range has no containers');
  const leftAt = first.content?.indexOf(start.sid!) ?? -1, rightAt = last.content?.indexOf(end.sid!) ?? -1;
  if (leftAt < 0 || rightAt < 0 || first.sid === last.sid && leftAt > rightAt) throw new Error('Text range must be in document order');
  const referenceBearing = (node: typeof start) => Object.keys(policy.references?.[node.stype] ?? {}).some(key => node.attributes?.[key] !== undefined);
  if (referenceBearing(start) || referenceBearing(end)) throw new Error('Splitting a reference-bearing text node requires a conversion');
  const differentRoles = first.sid !== last.sid && (first.parentId !== last.parentId || first.stype !== last.stype || !sameAttributes(schema, tree(store, first.sid), tree(store, last.sid)));
  if (differentRoles) {
    if (policy.rangeReplacement !== 'preserve-boundaries' || input.selection !== 'range' || input.openStart || input.openEnd
      || input.content.some(node => schema.getNodeType(node.stype)?.group !== 'inline')) throw new Error('Text range crosses incompatible containers');
    if (hooks.choose([], input.content, tree(store, first.sid)) !== 'join-inline') throw new Error('Inline replacement requires an accepted insertion strategy');
    return replaceAcrossBoundaries(store, schema, start.sid!, target.from, end.sid!, target.to, input.content);
  }

  const retained = new WeakMap<FragmentNode, string>();
  const kept = (node: FragmentNode): FragmentNode => {
    if (node.sourceId) retained.set(node, node.sourceId);
    delete node.sourceId;
    node.content?.forEach(kept);
    return node;
  };
  const prefix = kept(tree(store, first.sid)), suffix = kept(tree(store, last.sid));
  prefix.content = prefix.content!.slice(0, leftAt + 1);
  const left = clip(prefix.content[leftAt], 0, target.from);
  retained.set(left, start.sid!); prefix.content[leftAt] = left;
  suffix.content = suffix.content!.slice(rightAt);
  const right = clip(suffix.content[0], target.to, end.text.length);
  retained.set(right, end.sid!); suffix.content[0] = right;
  let content = input.content, caretNode: FragmentNode | undefined;
  walk(content, node => { if (typeof node.text === 'string') caretNode = node; });
  let caretOffset = caretNode?.text?.length ?? 0;
  const actions: EditingPlan['actions'] = [start.sid === end.sid && target.from === target.to ? 'insert' : 'replace'];
  let joined = false;
  if (input.selection === 'range') {
    if (input.openStart !== input.openEnd) throw new Error('Asymmetric open boundaries require an explicit conversion');
    let depth = input.openStart;
    const outer: FragmentNode[] = [];
    while (depth > 1 && content.length === 1 && content[0].content) {
      outer.push(content[0]); content = content[0].content!; depth--;
    }
    if (depth > 1) throw new Error('Range spans incompatible source containers');
    const inline = depth === 0;
    const blocks = inline ? [{ ...prefix, content }] : content;
    if (!blocks.length || blocks.some(node => !node.content || node.content.some(child => schema.getNodeType(child.stype)?.group !== 'inline'))) throw new Error('Open range requires inline flow content');
    for (const node of [...outer, ...(inline ? [] : [blocks[0], blocks.at(-1)!])]) {
      hooks.guard(node, first.sid); hooks.guard(node, last.sid);
    }
    const firstBoundary = inline ? outer : [...outer, blocks[0]], lastBoundary = inline ? outer : [...outer, blocks.at(-1)!];
    const head = hooks.choose(firstBoundary, blocks[0].content!, prefix);
    const tail = blocks.length === 1 && first.sid === last.sid ? head : hooks.choose(lastBoundary, blocks.at(-1)!.content!, suffix);
    if (head !== tail) throw new Error('Mixed source edge strategies require an explicit conversion');
    if (head === 'join-inline') {
      if (first.sid !== last.sid && (first.stype !== last.stype || !sameAttributes(schema, prefix, suffix))) throw new Error('Selected target boundaries have different semantics');
      hooks.losses(firstBoundary, prefix, first.sid);
      if (blocks.length > 1 || first.sid !== last.sid) hooks.losses(lastBoundary, suffix, last.sid);
      content = [...blocks];
      content[0] = { ...prefix, content: [...prefix.content!, ...blocks[0].content!] };
      retained.set(content[0], first.sid);
      content[content.length - 1] = { ...content.at(-1)!, content: [...content.at(-1)!.content!, ...suffix.content!] };
      if (content.length === 1) retained.set(content[0], first.sid);
      if (inline && start.sid === end.sid && schema.getNodeType(first.stype)?.code
        && input.content.length === 1 && typeof input.content[0].text === 'string'
        && !input.content[0].marks?.length && !start.marks?.length && !referenceBearing(first)
        && sameAttributes(schema, input.content[0], left) && input.content[0].stype === left.stype) {
        left.text = start.text.slice(0, target.from) + input.content[0].text + end.text.slice(target.to);
        caretNode = left; caretOffset = target.from + input.content[0].text.length;
        content[0].content = [...prefix.content!, ...suffix.content!.slice(1)];
      }
      joined = true; actions.push('join');
    } else content = [prefix, ...input.content, suffix];
  } else {
    hooks.closed(content, prefix);
    content = [prefix, ...content, suffix];
  }
  let parentId: string, index: number, removeIds: string[];
  if (joined && content.length === 1 && first.sid === last.sid) {
    parentId = first.sid; index = 0; removeIds = first.content as string[]; content = content[0].content!;
  } else {
    if (!first.parentId || first.parentId !== last.parentId) throw new Error('Cannot split a root or incompatible text container');
    for (const node of [first, last]) {
      const def = schema.getNodeType(node.stype);
      if (def?.isolating || def?.atom) throw new Error('Cannot split an isolated or atomic boundary');
      if (referenceBearing(node)) throw new Error('Splitting a reference-bearing block requires a conversion');
    }
    parentId = first.parentId;
    const siblings = store.getNode(parentId)!.content as string[];
    index = siblings.indexOf(first.sid);
    const endIndex = siblings.indexOf(last.sid);
    if (index < 0 || endIndex < index) throw new Error('Text range must be in document order');
    removeIds = siblings.slice(index, endIndex + 1);
    actions.push('split');
  }
  const retainIds: Record<string, string> = {}, seen = new Set<string>();
  let caret: EditingPlan['caret'] = null;
  walk(content, (node, path) => {
    const id = retained.get(node);
    if (id && !seen.has(id)) { retainIds[path.join('.')] = id; seen.add(id); }
    if (node === caretNode) caret = { path, offset: caretOffset };
  });
  if (!caret) walk(content, (node, path) => { if (!caret && node === right) caret = { path, offset: 0 }; });
  return { parentId, index, removeIds, content, retainIds, caret, actions };
}
