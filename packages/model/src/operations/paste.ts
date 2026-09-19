import { fitContent } from '@barocss/schema';
import { defineOperation, globalOperationRegistry } from './define-operation';
import type { TransactionContext } from '../types';
import type { INode } from '@barocss/datastore';
import { defineOperationDSL } from './define-operation-dsl';
import { findBlockAncestor } from './split-at-caret';
import { subtreeOf } from './subtree';

export interface PasteInput { nodes: INode[] }
export interface PasteResult { insertedNodeIds: string[]; newSelection: any | null }
export const paste = defineOperationDSL((nodes: INode[], range: any) => ({
  type: 'paste', payload: { data: { nodes }, range }
}), { atom: true, category: 'clipboard' });

type Tree = Omit<INode, 'content'> & { content?: Tree[] };
/** Keep the inline wrappers and clip mark ranges along with their text. */
function sliceAt(node: Tree, sid: string, offset: number, before: boolean): Tree | null {
  if (node.sid === sid && typeof node.text === 'string') {
    const from = before ? 0 : offset, to = before ? offset : node.text.length;
    return { ...node, text: node.text.slice(from, to), marks: (node.marks ?? []).flatMap(mark => {
      const [a, b] = mark.range ?? [0, node.text!.length];
      const start = Math.max(a, from), end = Math.min(b, to);
      return start < end ? [{ ...mark, range: [start - from, end - from] as [number, number] }] : [];
    }) };
  }
  const children = node.content ?? [];
  for (let index = 0; index < children.length; index++) {
    const sliced = sliceAt(children[index], sid, offset, before);
    if (sliced) return { ...node, content: before ? [...children.slice(0, index), sliced] : [sliced, ...children.slice(index + 1)] };
  }
  return null;
}
function textLeaves(node: Tree): Tree[] {
  return typeof node.text === 'string' ? [node] : (node.content ?? []).flatMap(textLeaves);
}
function fresh(node: Tree, context: TransactionContext): Tree {
  const { sid: _sid, parentId: _parent, ...rest } = node;
  return { ...rest, sid: context.dataStore.generateId(), ...(node.content ? { content: node.content.map(child => fresh(child, context)) } : {}) };
}

defineOperation('paste', async (operation: any, context: TransactionContext) => {
  if (operation.payload.plan) {
    const result = await globalOperationRegistry.get('batch')!.execute({ type: 'batch', payload: { operations: operation.payload.plan } }, context) as any;
    return { ...result, selectionAfter: operation.payload.caret };
  }
  const { range, data } = operation.payload;
  if (!range || !Array.isArray(data?.nodes) || !data.nodes.length) return { ok: false };
  const store = context.dataStore, schema = context.schema ?? store.getActiveSchema();
  const start = store.getNode(range.startNodeId), end = store.getNode(range.endNodeId);
  if (typeof start?.text !== 'string' || typeof end?.text !== 'string' || range.startOffset < 0 || range.endOffset < 0 ||
      range.startOffset > start.text.length || range.endOffset > end.text.length) return { ok: false };
  const first = findBlockAncestor(store, schema, start.sid!), last = findBlockAncestor(store, schema, end.sid!);
  if (first && last && first.sid === last.sid && !first.parentId && data.nodes.every((node: Tree) => typeof node.text === 'string')) {
    const prefix = sliceAt(subtreeOf(context, first.sid) as unknown as Tree, start.sid!, range.startOffset, true)!;
    const suffix = sliceAt(subtreeOf(context, last.sid) as unknown as Tree, end.sid!, range.endOffset, false)!;
    const incoming = (data.nodes as Tree[]).map(node => fresh(node, context));
    const children = [...(prefix.content ?? []), ...incoming, ...(fresh(suffix, context).content ?? [])].filter(node => node.text !== '');
    const caret = incoming.at(-1)!;
    const steps = [
      { type: 'removeChildren', payload: { parentId: first.sid, childIds: [...first.content] } },
      { type: 'addChild', payload: { parentId: first.sid, children, position: 0 } }
    ];
    operation.payload.plan = steps;
    operation.payload.caret = { nodeId: caret.sid, offset: caret.text!.length };
    const result = await globalOperationRegistry.get('batch')!.execute({ type: 'batch', payload: { operations: steps } }, context) as any;
    return { ...result, insertedNodeIds: incoming.map(node => node.sid), newSelection: operation.payload.caret, selectionAfter: operation.payload.caret };
  }
  if (first?.parentId && last?.parentId && first.parentId !== last.parentId && schema) {
    // Cross-container replacement is deliberately inline-only. Keep required list items,
    // callout headers/bodies and other prose wrappers instead of guessing how to merge them.
    const prose = new Set(['paragraph', 'heading', 'list', 'listItem', 'blockquote', 'taskItem', 'callout', 'calloutTitle', 'bDetails', 'bSummary']);
    const ancestry = (sid: string): INode[] => {
      const nodes: INode[] = [], seen = new Set<string>();
      let node = store.getNode(sid);
      while (node?.sid && !seen.has(node.sid)) { seen.add(node.sid); nodes.push(node); node = node.parentId ? store.getNode(node.parentId) : undefined; }
      return nodes;
    };
    const a = ancestry(start.sid!), b = ancestry(end.sid!);
    const common = a.find(node => b.some(other => other.sid === node.sid));
    const safePath = (path: INode[]) => path.slice(0, path.findIndex(node => node.sid === common?.sid)).every(node => schema.getNodeType(node.stype)?.group === 'inline' || prose.has(node.stype));
    const inline = (node: Tree): boolean => schema.getNodeType(node.stype)?.group === 'inline' && (node.content ?? []).every(inline);
    const fragment = data.nodes as Tree[];
    const inlineOnly = fragment.every(inline) || fragment.length === 1 && fragment[0].stype === 'paragraph' && (fragment[0].content ?? []).every(inline);
    const ordered = [...store.createRangeIterator(start.sid!, end.sid!, { includeStart: true, includeEnd: true })];
    const safeRange = ordered.length > 1 && ordered[0] === start.sid && ordered.at(-1) === end.sid && ordered.every(sid => {
      const node = store.getNode(sid)!;
      return node.sid === common?.sid || schema.getNodeType(node.stype)?.group === 'inline' || prose.has(node.stype);
    });
    if (common && !['resources', 'dataset', 'table', 'tableRow', 'tableCell'].includes(common.stype) && safePath(a) && safePath(b) && safeRange && inlineOnly) {
      const atoms = ordered.slice(1, -1).map(sid => store.getNode(sid)!).filter(node => node.parentId && typeof node.text !== 'string' && !node.content?.length && schema.getNodeType(node.stype)?.group === 'inline');
      const collapsed = { ...range, endNodeId: start.sid, endOffset: range.startOffset, collapsed: true };
      const steps = [{ type: 'deleteRange', payload: { range } },
        ...atoms.map(node => ({ type: 'removeChild', payload: { parentId: node.parentId, childId: node.sid } })),
        { type: 'paste', payload: { range: collapsed, data } }];
      const result = await globalOperationRegistry.get('batch')!.execute({ type: 'batch', payload: { operations: steps } }, context) as any;
      if (result?.ok === false) return result;
      const caret = result.data?.at(-1)?.selectionAfter;
      operation.payload.plan = steps; operation.payload.caret = caret;
      return { ...result, selectionAfter: caret };
    }
  }
  if (!first?.parentId || first.parentId !== last?.parentId) return { ok: false, error: 'paste: range crosses incompatible containers' } as any;
  const parent = store.getNode(first.parentId)!;
  const ids = parent.content as string[];
  const from = ids.indexOf(first.sid), to = ids.indexOf(last.sid);
  if (from < 0 || to < from || (start.sid === end.sid && range.startOffset > range.endOffset)) return { ok: false };
  const prefix = sliceAt(subtreeOf(context, first.sid) as unknown as Tree, start.sid!, range.startOffset, true)!;
  const suffix = sliceAt(subtreeOf(context, last.sid) as unknown as Tree, end.sid!, range.endOffset, false)!;
  if (!prefix || !suffix) return { ok: false };
  const normalize = (node: Tree): Tree[] => {
    const children = node.content?.flatMap(normalize);
    if (node.stype === 'image' && !schema?.hasNodeType('image') && schema?.hasNodeType('inline-image')) return [{ ...node, stype: 'inline-image' }];
    if (node.stype === 'link' && !schema?.hasNodeType('link')) {
      const mark = (child: Tree): Tree => typeof child.text === 'string'
        ? { ...child, marks: [...(child.marks ?? []), { stype: 'link', attrs: { href: String(node.attributes?.href ?? ''), ...(node.attributes?.title ? { title: node.attributes.title } : {}) }, range: [0, child.text.length] }] }
        : { ...child, ...(child.content ? { content: child.content.map(mark) } : {}) };
      return (children ?? []).map(mark);
    }
    return [{ ...node, ...(children ? { content: children } : {}) }];
  };
  let incoming = (data.nodes as Tree[]).flatMap(normalize);
  const blocks: Tree[] = [];
  let inline: Tree[] = [];
  const flush = () => { if (inline.length) { blocks.push({ stype: 'paragraph', content: inline }); inline = []; } };
  for (const node of incoming) {
    if (schema?.getNodeType(node.stype)?.group === 'inline') inline.push(node);
    else { flush(); blocks.push(node); }
  }
  flush(); incoming = blocks;
  if (schema) {
    const fitted = fitContent(parent.stype!, incoming as any, {
      groupOf: (type: string) => schema.getNodeType(type)?.group,
      hasNodeType: (type: string) => schema.hasNodeType(type),
      contentModelOf: (type: string) => schema.getNodeType(type)?.content
    });
    // A foreign element with no representation must not silently disappear.
    if (fitted.dropped.length) return { ok: false, error: 'paste: clipboard contains unsupported content' } as any;
    incoming = fitted.nodes as Tree[];
  }
  if (!incoming.length) return { ok: false };
  incoming = incoming.map(node => fresh(node, context));
  // Paragraph fragments join the prose on either side; structural blocks retain their identity.
  const output: Tree[] = [];
  const firstIncoming = incoming[0];
  if (firstIncoming.stype === 'paragraph') {
    incoming[0] = { ...prefix, content: [...(prefix.content ?? []), ...(firstIncoming.content ?? [])] };
  } else if (textLeaves(prefix).some(node => node.text)) output.push(prefix);
  else if (first.stype === 'bSummary' || first.stype === 'calloutTitle') output.push(prefix);
  const tail = incoming[incoming.length - 1];
  let caret = textLeaves(tail).at(-1);
  if (!caret) {
    // An atomic paste still leaves a writable caret after it.
    const empty = fresh({ stype: 'inline-text', text: '' }, context);
    incoming.push({ stype: 'paragraph', content: [empty] });
    caret = empty;
  }
  const caretId = caret.sid!, caretOffset = caret.text!.length;
  const keepsBodyRole = first.sid !== last.sid && (first.stype === 'bSummary' || first.stype === 'calloutTitle') && incoming.length === 1;
  if (keepsBodyRole) incoming.push(fresh(suffix, context));
  else if (incoming.at(-1)!.stype === 'paragraph' || incoming.length === 1 && firstIncoming.stype === 'paragraph') {
    const at = incoming.length - 1;
    incoming[at] = { ...incoming[at], content: [...(incoming[at].content ?? []), ...(fresh(suffix, context).content ?? [])] };
  } else if (textLeaves(suffix).some(node => node.text)) incoming.push(fresh(suffix, context));
  output.push(...incoming);
  // A split title/summary keeps its unique first-child role only on the prefix.
  for (let index = 1; index < output.length; index++) {
    if (output[index].stype === 'calloutTitle' || output[index].stype === 'bSummary') output[index] = { ...output[index], stype: 'paragraph', attributes: {} };
  }
  const steps = [
    { type: 'removeChildren', payload: { parentId: parent.sid, childIds: ids.slice(from, to + 1) } },
    { type: 'addChild', payload: { parentId: parent.sid, children: output, position: from } }
  ];
  // History replays the accepted fragment with the same durable ids and caret.
  operation.payload.plan = steps;
  operation.payload.caret = { nodeId: caretId, offset: caretOffset };
  const result = await globalOperationRegistry.get('batch')!.execute({ type: 'batch', payload: { operations: steps } }, context) as any;
  if (result?.ok === false) return result;
  return { ...result, insertedNodeIds: output.map(node => node.sid).filter(Boolean), selectionAfter: { nodeId: caretId, offset: caretOffset } };
});
