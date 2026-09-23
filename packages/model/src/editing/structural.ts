import { DataStore, type INode } from '@barocss/datastore';
import { SelectionManager, insideLockedRegion, type ModelSelection } from '@barocss/editor-core';
import { validateEditingContent, validateEditingFragment, type Schema } from '@barocss/schema';
import { globalOperationRegistry } from '../operations/define-operation';
import { SelectionContext } from '../selection-context';
import type { TransactionContext } from '../types';
import type { EditingPlan, EditingPolicy, EditingRuleTrace, FragmentNode, StructuralRequest } from './types';
import { clip, fromNode, references, tree, walk } from './fragment';
import { resolveEditingRule, sameAttributes } from './policy';
import { replaceAcrossBoundaries } from './replace-across-boundaries';
import { signature } from './state';

type Replacement = Pick<EditingPlan, 'parentId' | 'index' | 'removeIds' | 'content' | 'retainIds' | 'references' | 'caret' | 'actions' | 'noop'>;
const enterOperations = new Set(['insertParagraph', 'splitListItem', 'transformNode', 'moveChildren', 'removeChild', 'setAttrs', 'addChild', 'setSelection', 'deleteRange', 'deleteTextRange']);
function ancestors(store: DataStore, id: string): string[] {
  const result: string[] = [];
  for (let node = store.getNode(id); node; node = node.parentId ? store.getNode(node.parentId) : undefined) {
    if (!node.sid || result.includes(node.sid)) throw new Error('Invalid structural ancestry');
    result.push(node.sid);
  }
  return result;
}
function boundary(store: DataStore, schema: Schema, left: string, right: string): void {
  const a = ancestors(store, left), b = ancestors(store, right), common = a.find(id => b.includes(id));
  if (!common) throw new Error('Structural endpoints are outside the document');
  for (const path of [a, b]) for (const id of path.slice(0, path.indexOf(common))) {
    const def = schema.getNodeType(store.getNode(id)!.stype);
    if (def?.isolating || def?.atom) throw new Error('Structural edit crosses an isolated or atomic boundary');
  }
}
function joinDecision(store: DataStore, schema: Schema, policy: EditingPolicy, left: INode, right: INode, trace: EditingRuleTrace[]): 'join-inline' | 'preserve' {
  boundary(store, schema, left.sid!, right.sid!);
  const a = fromNode(left), b = fromNode(right);
  const compatible = left.parentId === right.parentId && a.stype === b.stype && sameAttributes(schema, a, b);
  const decision = resolveEditingRule(policy, schema, b, a, { boundary: 'open', targetKind: 'text' }, compatible
    ? { effect: 'join-inline', reason: 'Open inline content has compatible boundary type and attributes' }
    : { effect: 'preserve', reason: 'Different boundary type or attributes require structure preservation or an explicit join rule' });
  trace.push(decision);
  if (decision.effect === 'reject') throw new Error(decision.reason);
  return decision.effect;
}
function validateRange(store: DataStore, range: ModelSelection): void {
  const start = store.getNode(range.startNodeId), end = store.getNode(range.endNodeId);
  if (range.type !== 'range' || typeof start?.text !== 'string' || typeof end?.text !== 'string'
    || !Number.isInteger(range.startOffset) || !Number.isInteger(range.endOffset)
    || range.startOffset < 0 || range.startOffset > start.text.length || range.endOffset < 0 || range.endOffset > end.text.length
    || start.sid === end.sid && range.startOffset > range.endOffset) throw new Error('Invalid structural text range');
}
function installReplacement(store: DataStore, value: Pick<EditingPlan, 'parentId' | 'index' | 'removeIds' | 'content' | 'retainIds' | 'caret'>): { nodeId: string; offset: number } {
  const paths = new Map<string, string>();
  const build = (node: FragmentNode, path: number[]): INode => {
    const sid = value.retainIds[path.join('.')] ?? store.generateId(); paths.set(path.join('.'), sid);
    const { content, ...rest } = node;
    delete rest.sourceId;
    return { ...rest, sid, ...(content ? { content: content.map((child, i) => build(child, [...path, i])) } : {}) };
  };
  const content = value.content.map((node, i) => build(node, [i]));
  const kept = new Set(paths.values());
  const removed = value.removeIds.flatMap(id => [...store.getAllDescendants(id).map(node => node.sid!).reverse(), id]);
  store.content.removeChildren(value.parentId, value.removeIds);
  removed.filter(id => !kept.has(id)).forEach(id => store.deleteNode(id));
  content.forEach((node, i) => store.content.addChild(value.parentId, node, value.index + i));
  if (!value.caret) throw new Error('Structural deletion has no caret');
  return { nodeId: paths.get(value.caret.path.join('.'))!, offset: value.caret.offset };
}
function deleteRange(store: DataStore, schema: Schema, policy: EditingPolicy, range: ModelSelection, trace: EditingRuleTrace[]): { nodeId: string; offset: number } {
  validateRange(store, range);
  const start = store.getNode(range.startNodeId)!, end = store.getNode(range.endNodeId)!;
  if (start.sid === end.sid) {
    const before = clip(fromNode(start), 0, range.startOffset), after = clip(fromNode(start), range.endOffset, start.text!.length);
    store.setNode({ ...start, text: before.text! + after.text!, marks: [...(before.marks ?? []), ...(after.marks ?? []).map(mark => ({ ...mark, range: [mark.range![0] + range.startOffset, mark.range![1] + range.startOffset] as [number, number] }))] }, false);
    return { nodeId: start.sid!, offset: range.startOffset };
  }
  boundary(store, schema, start.sid!, end.sid!);
  const first = store.getNode(start.parentId!)!, last = store.getNode(end.parentId!)!;
  const decision = first.sid === last.sid ? 'preserve' : joinDecision(store, schema, policy, first, last, trace);
  if (first.sid !== last.sid && decision === 'preserve' && policy.rangeReplacement !== 'preserve-boundaries') throw new Error('Range deletion requires a boundary preservation policy');
  const replacement = replaceAcrossBoundaries(store, schema, start.sid!, range.startOffset, end.sid!, range.endOffset, []);
  const caret = installReplacement(store, replacement);
  if (first.sid !== last.sid && decision === 'join-inline') {
    if (first.parentId !== last.parentId) throw new Error('Joining ranges requires sibling text containers');
    const a = store.getNode(first.sid!)!, b = store.getNode(last.sid!)!;
    if (!a || !b) throw new Error('Missing retained deletion boundary');
    store.content.moveChildren(b.sid!, a.sid!, [...b.content as string[]], a.content?.length ?? 0);
    store.content.removeChild(b.parentId!, b.sid!);
    store.deleteNode(b.sid!);
  }
  return caret;
}

/** Evaluate only built-in Enter candidates against a private store. No live editor or hooks are exposed. */
export async function planStructural(store: DataStore, schema: Schema, policy: EditingPolicy, request: StructuralRequest, trace: EditingRuleTrace[]): Promise<Replacement> {
  if (request.intent === 'delete' && request.range.startNodeId === request.range.endNodeId) {
    validateRange(store, request.range);
    const range = request.range, original = store.getNode(range.startNodeId)!;
    if (!original.parentId || insideLockedRegion(store, original.sid!, 'lockContent')) throw new Error('Deletion requires editable text');
    const node = fromNode(original), before = clip(node, 0, range.startOffset), after = clip(node, range.endOffset, original.text!.length);
    const content = [{ ...node, text: before.text! + after.text!, marks: [...(before.marks ?? []), ...(after.marks ?? []).map(mark => ({ ...mark, range: [mark.range![0] + range.startOffset, mark.range![1] + range.startOffset] as [number, number] }))] }];
    const parent = tree(store, original.parentId), index = parent.content!.findIndex(child => child.sourceId === original.sid);
    parent.content!.splice(index, 1, ...content);
    const valid = validateEditingFragment(schema, [parent]);
    if (!valid.valid) throw new Error(valid.errors.join('; '));
    return { parentId: original.parentId, index, removeIds: [original.sid!], content, retainIds: { '0': original.sid! }, caret: { path: [0], offset: range.startOffset }, references: references(content, policy), actions: ['delete'], noop: range.startOffset === range.endOffset };
  }
  const rootId = store.getRootNodeId();
  if (!rootId) throw new Error('Missing structural document');
  const documentNodes = [store.getNode(rootId)!, ...store.getAllDescendants(rootId)];
  const draft = new DataStore();
  draft.setActiveSchema(schema);
  draft.restoreFromSnapshot(new Map(documentNodes.map(node => {
    const value = fromNode(node);
    delete value.sourceId;
    return [node.sid!, { ...value, sid: node.sid, parentId: node.parentId, ...(node.content ? { content: [...node.content] } : {}) }];
  })), rootId);
  const range = request.intent === 'join' || request.intent === 'remove-gap' || request.intent === 'remove' ? null : structuredClone(request.range);
  const selection = new SelectionContext(range);
  const context: TransactionContext = { dataStore: draft, schema, selection, selectionManager: new SelectionManager({ dataStore: draft }) };
  const run = async (type: string, payload: Record<string, unknown> = {}): Promise<void> => {
    const operation = globalOperationRegistry.get(type);
    if (!operation) throw new Error(`Missing built-in structural operation: ${type}`);
    const result = await operation.execute({ type, payload: structuredClone(payload) }, context);
    if (result && 'ok' in result && result.ok === false) throw new Error(`Structural candidate failed: ${type}`);
    if (result && 'selectionAfter' in result && result.selectionAfter) selection.setCaret(draft.resolveAlias(result.selectionAfter.nodeId), result.selectionAfter.offset);
  };
  draft.begin();
  try {
    if (request.intent === 'remove') {
      const nodes = request.nodeIds.map(id => draft.getNode(id)), parentId = nodes[0]?.parentId;
      if (!parentId || !nodes.length || new Set(request.nodeIds).size !== nodes.length || nodes.some(node => !node || node.parentId !== parentId || node.content?.length || schema.getNodeType(node.stype)?.group !== 'inline')) throw new Error('Object deletion requires distinct inline siblings');
      const siblings = draft.getNode(parentId)!.content as string[], first = Math.min(...request.nodeIds.map(id => siblings.indexOf(id)));
      const before = siblings.slice(0, first).reverse().map(id => draft.getNode(id)!).find(node => typeof node.text === 'string' && !request.nodeIds.includes(node.sid!));
      const after = siblings.slice(first).map(id => draft.getNode(id)!).find(node => typeof node.text === 'string' && !request.nodeIds.includes(node.sid!));
      let caret = before ?? after;
      for (const id of request.nodeIds) { draft.content.removeChild(parentId, id); draft.deleteNode(id); }
      if (!caret) {
        if (!policy.defaultText || schema.getNodeType(policy.defaultText)?.group !== 'inline') throw new Error('Object deletion requires an explicit default text type');
        const id = draft.content.addChild(parentId, { stype: policy.defaultText, text: '' }, 0);
        caret = draft.getNode(id)!;
      }
      selection.setCaret(caret.sid!, before ? caret.text!.length : 0);
      // Close only the seam made by a single inline object, preserving unrelated runs.
      if (request.nodeIds.length === 1 && before && after && siblings[first - 1] === before.sid && siblings[first + 1] === after.sid && sameAttributes(schema, fromNode(before), fromNode(after)) && before.stype === after.stype) await run('mergeTextNodes', { leftNodeId: before.sid, rightNodeId: after.sid });
    } else if (request.intent === 'join' || request.intent === 'remove-gap') {
      const left = draft.getNode(request.leftId), right = draft.getNode(request.rightId);
      if (!left?.parentId || right?.parentId !== left.parentId) throw new Error('Join requires sibling containers');
      const siblings = draft.getNode(left.parentId)!.content as string[];
      if (siblings.indexOf(right.sid!) !== siblings.indexOf(left.sid!) + 1) throw new Error('Join requires adjacent containers');
      const decision = joinDecision(draft, schema, policy, left, right, trace);
      if (request.intent === 'join' && decision !== 'join-inline') throw new Error('Policy preserves this boundary');
      const leaves = (left.content ?? []).map(id => draft.getNode(id as string)!);
      if (![...leaves, ...(right.content ?? []).map(id => draft.getNode(id as string)!)].every(node => schema.getNodeType(node.stype)?.group === 'inline')) throw new Error('Join requires inline flow containers');
      if (request.intent === 'remove-gap') {
        if (!policy.removeEmptyBefore?.[left.stype]?.includes(right.stype)
          || typeof left.text === 'string' && left.text !== ''
          || leaves.some(node => node.text !== '' || node.content?.length)
          || decision === 'preserve' && trace.at(-1)!.ruleIds.some(id => !id.startsWith('builtin:'))) throw new Error('Policy preserves this empty boundary');
        const caret = (right.content ?? []).map(id => draft.getNode(id as string)!).find(node => typeof node.text === 'string');
        if (!caret) throw new Error('Empty boundary removal requires a text caret');
        draft.content.removeChild(left.parentId, left.sid!);
        for (const node of leaves) draft.deleteNode(node.sid!);
        draft.deleteNode(left.sid!);
        selection.setCaret(caret.sid!, 0);
      } else {
        const caret = [...leaves].reverse().find(node => typeof node.text === 'string');
        if (!caret) throw new Error('Join requires a text caret');
        draft.content.moveChildren(right.sid!, left.sid!, [...right.content as string[]], left.content?.length ?? 0);
        draft.content.removeChild(right.parentId!, right.sid!);
        draft.deleteNode(right.sid!);
        selection.setCaret(caret.sid!, caret.text!.length);
      }
    } else {
      validateRange(draft, request.range);
      if (request.range.startNodeId !== request.range.endNodeId || request.range.startOffset !== request.range.endOffset) {
        if (request.intent === 'split' && request.handlesRange) {
          boundary(draft, schema, request.range.startNodeId, request.range.endNodeId);
          const first = draft.getNode(draft.getNode(request.range.startNodeId)!.parentId!)!, last = draft.getNode(draft.getNode(request.range.endNodeId)!.parentId!)!;
          if (first.sid !== last.sid && joinDecision(draft, schema, policy, first, last, trace) === 'preserve' && policy.rangeReplacement !== 'preserve-boundaries') throw new Error('Range deletion requires a boundary preservation policy');
        } else {
          const caret = deleteRange(draft, schema, policy, request.range, trace);
          selection.setCaret(caret.nodeId, caret.offset);
        }
      }
      if (request.intent === 'replace') await run('insertText', { nodeId: selection.current!.startNodeId, pos: selection.current!.startOffset, text: request.text });
      if (request.intent === 'split') {
        const node = draft.getNode(selection.current!.startNodeId)!, block = draft.getNode(node.parentId!)!;
        if (!block) throw new Error('Split requires a text container');
        const definition = schema.getNodeType(block.stype);
        if (definition?.isolating || definition?.atom) throw new Error('Cannot split an isolated or atomic container');
        const rule = policy.splits?.[block.stype];
        if (rule?.mode === 'reject') throw new Error(`Policy rejects splitting ${block.stype}`);
        if ([block, node].some(value => Object.keys(policy.references?.[value.stype] ?? {}).some(key => value.attributes?.[key] !== undefined))) throw new Error('Splitting reference-bearing containers requires an explicit conversion');
        const candidates = request.operations ?? [{ type: 'insertParagraph', payload: { blockType: 'same' } }];
        if (!candidates.length) throw new Error('Empty split candidate');
        for (const candidate of candidates) {
          if (!enterOperations.has(candidate.type)) throw new Error('Unsupported structural candidate');
          const payload = { ...candidate.payload };
          if (candidate.type === 'insertParagraph' && rule?.atEnd && selection.current!.startOffset === node.text!.length && block.content?.at(-1) === node.sid) payload.blockType = rule.atEnd;
          await run(candidate.type, payload);
        }
      }
    }
    draft.end();
    if (signature(fromNode(store.getNode(rootId)!)) !== signature(fromNode(draft.getNode(rootId)!))) throw new Error('Structural edits cannot change document root attributes');
    const root = tree(draft, rootId);
    const originals = new Map(documentNodes.map(node => [node.sid!, node]));
    const live = new Set<string>(); walk([root], node => { if (node.sourceId) live.add(node.sourceId); });
    for (const [id, node] of originals) {
      const current = draft.getNode(id);
      const changed = !live.has(id) || signature(fromNode(node)) !== signature(current && fromNode(current)) || signature(node.content) !== signature(current?.content) || node.parentId !== current?.parentId;
      if (changed && insideLockedRegion(store, id, 'lockContent')) throw new Error('Structural edit affects locked content');
      if (!live.has(id) && insideLockedRegion(store, id, 'lockDelete')) throw new Error('Structural edit removes a locked node');
      if (current && live.has(id) && node.parentId !== current.parentId) {
        const protectedPath = (source: DataStore) => ancestors(source, id).filter(sid => { const def = schema.getNodeType(source.getNode(sid)!.stype); return def?.isolating || def?.atom; });
        if (signature(protectedPath(store)) !== signature(protectedPath(draft))) throw new Error('Structural edit crosses an isolated or atomic boundary');
      }
    }
    walk([root], node => {
      for (const [attribute, ref] of Object.entries(policy.references?.[node.stype] ?? {})) {
        const target = node.attributes?.[attribute];
        if (target !== undefined && (typeof target !== 'string' || ref.kind === 'node' && !live.has(target))) throw new Error('Structural edit would leave a reference dangling');
      }
    });
    // Descend through unchanged containers, then replace only the changed sibling interval.
    const position = selection.current;
    const caretLeaf = position ? draft.getNode(position.startNodeId) : undefined;
    if (!position || position.type !== 'range' || !position.collapsed || typeof caretLeaf?.text !== 'string' || !Number.isInteger(position.startOffset) || position.startOffset < 0 || position.startOffset > caretLeaf.text.length || !live.has(position.startNodeId)) throw new Error('Structural result has an invalid text caret');
    let parent = root;
    const containsCaret = (node: FragmentNode): boolean => {
      let found = false; walk([node], child => { if (child.sourceId === position?.startNodeId) found = true; }); return found;
    };
    while (parent.content?.length) {
      const original = store.getNode(parent.sourceId!);
      if (!original || original.content?.length !== parent.content.length) break;
      const changed = parent.content.filter((node, index) => signature(node) !== signature(tree(store, original.content![index] as string)));
      const child = changed.length === 1 ? changed[0] : undefined;
      const old = child?.sourceId ? store.getNode(child.sourceId) : undefined;
      if (!child?.content || !old || !containsCaret(child) || signature(fromNode(old)) !== signature(fromNode(draft.getNode(child.sourceId!)!))) break;
      parent = child;
    }
    const originalIds = [...store.getNode(parent.sourceId!)!.content as string[]];
    let begin = 0, end = parent.content?.length ?? 0, oldEnd = originalIds.length;
    while (begin < Math.min(end, oldEnd) && !containsCaret(parent.content![begin]) && signature(parent.content![begin]) === signature(tree(store, originalIds[begin]))) begin++;
    while (end > begin && oldEnd > begin && !containsCaret(parent.content![end - 1]) && signature(parent.content![end - 1]) === signature(tree(store, originalIds[oldEnd - 1]))) { end--; oldEnd--; }
    const content = (parent.content ?? []).slice(begin, end), retainIds: Record<string, string> = {};
    const checked = validateEditingFragment(schema, content), container = validateEditingContent(schema, parent.stype, parent.content ?? []);
    if (!checked.valid || !container.valid) throw new Error([...checked.errors, ...container.errors].join('; '));
    const allowedMarks = schema.getNodeType(parent.stype)?.marks;
    if (allowedMarks && content.some(node => node.marks?.some(mark => !allowedMarks.includes(mark.stype)))) throw new Error('Structural result has a mark forbidden by its parent');
    const noop = signature(tree(store, rootId)) === signature(root) && signature(range) === signature(position);
    let caret: EditingPlan['caret'] = null;
    walk(content, (node, path) => {
      if (node.sourceId && originals.has(node.sourceId)) retainIds[path.join('.')] = node.sourceId;
      if (node.sourceId === position?.startNodeId) caret = { path, offset: position!.startOffset };
    });
    if (!caret) throw new Error('Structural result has no valid caret');
    const actions: EditingPlan['actions'] = [request.intent === 'remove' || request.intent === 'remove-gap' ? 'delete' : request.intent];
    return { parentId: parent.sourceId!, index: begin, removeIds: originalIds.slice(begin, oldEnd), content, retainIds, caret, references: references(content, policy), actions, noop };
  } finally {
    if (draft.isTransactionActive()) draft.rollback();
  }
}
