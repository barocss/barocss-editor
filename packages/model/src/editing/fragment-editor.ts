import type { DataStore, INode } from '@barocss/datastore';
import { validateEditingContent, validateEditingFragment, type Schema } from '@barocss/schema';
import type { Editor, ModelSelection } from '@barocss/editor-core';
import { transaction } from '../transaction-dsl';
import { defineOperation } from '../operations/define-operation';
import { subtreeOf } from '../operations/subtree';
import type { TransactionContext } from '../types';
import type { DocumentFragment, EditingBasis, EditingDecision, EditingPlan, EditingPolicy, EditingRequest, EditingRuleTrace, FragmentNode, FragmentOrigin } from './types';
import { clip, fragment, fromNode, references, tree, walk } from './fragment';
import { documentState, freeze, identity, schemaState, signature } from './state';
import { defineEditingPolicy, effectiveAttributes, resolveEditingRule, sameAttributes } from './policy';
import { planNodeMove, planTextMove } from './move';
import type { TransactionResult } from '../transaction';
import { planTextRange } from './text-range';

const sessions = new WeakMap<object, FragmentEditor>();

/** One policy owner per editor, shared by clipboard commands and explicit fragment edits. */
export class FragmentEditor {
  /** Reuse the policy owner configured by the product; never reset it per command. */
  static forEditor(editor: Editor, initialPolicy: EditingPolicy = {}): FragmentEditor {
    return sessions.get(editor) ?? new FragmentEditor(editor, initialPolicy);
  }
  private policy: EditingPolicy = {};
  private policyRevision = 0;
  private readonly owner = identity(this);
  constructor(private readonly editor: Editor, policy: EditingPolicy = {}) {
    this.configure(policy);
    sessions.set(editor, this);
  }
  configure(policy: EditingPolicy): void {
    this.policy = defineEditingPolicy(policy);
    this.policyRevision++;
  }
  private get store(): DataStore { return this.editor.dataStore; }
  private get schema(): Schema {
    const schema = this.store.getActiveSchema();
    if (!schema) throw new Error('Editing requires an active schema');
    return schema;
  }
  private documentId(): string { return `${identity(this.store)}:${this.store.getDocumentEpoch()}`; }
  private origin(): FragmentOrigin {
    return { format: 'wonffice-fragment/1', schemaId: this.policy.schemaId ?? identity(this.schema), schemaRevision: this.policy.schemaRevision ?? schemaState(this.schema), documentId: this.documentId() };
  }
  private basis(): EditingBasis {
    return { owner: this.owner, document: this.documentId(), revision: this.store.getEditRevision(), snapshot: documentState(this.store), schema: schemaState(this.schema), policy: this.policyRevision, selection: signature(this.editor.selection) };
  }
  /** Capture before asynchronous input. This token is local, not a transport credential. */
  checkpoint(): string { return signature(this.basis()); }
  /** Drag source validity excludes transient cursor changes, but includes document/schema/policy state. */
  sourceCheckpoint(): string { return signature({ ...this.basis(), selection: undefined }); }
  isSourceCurrent(checkpoint: string): boolean { return sessions.get(this.editor) === this && this.sourceCheckpoint() === checkpoint; }
  isCurrent(checkpoint: string): boolean { return sessions.get(this.editor) === this && checkpoint === this.checkpoint(); }
  /** Explicit plain-text import in the destination text vocabulary; no rich source schema is claimed. */
  plainText(text: string, targetNodeId: string, literal = false): DocumentFragment {
    const target = this.store.getNode(targetNodeId);
    if (typeof target?.text !== 'string') throw new Error('Plain text requires a text target');
    const leaf = (value: string): FragmentNode => ({ stype: target.stype, attributes: structuredClone(target.attributes), text: value });
    const normalized = text.replace(/\r\n?/g, '\n');
    if (literal || !normalized.includes('\n')) return freeze(fragment([leaf(normalized)], 'range', this.origin(), this.policy));
    const parent = target.parentId ? this.store.getNode(target.parentId) : undefined;
    if (!parent || this.schema.getNodeType(parent.stype)?.group !== 'block') throw new Error('Multiline text requires a flow block target');
    const content = normalized.split('\n').map(line => ({ stype: parent.stype, attributes: structuredClone(parent.attributes), content: [leaf(line)] }));
    return freeze(fragment(content, 'range', this.origin(), this.policy, 1));
  }
  captureNodes(ids: string[], contiguous = true): DocumentFragment {
    if (!ids.length || new Set(ids).size !== ids.length) throw new Error('Select distinct sibling nodes');
    const nodes = ids.map(id => this.store.getNode(id));
    const parentId = nodes[0]?.parentId;
    const parent = parentId && this.store.getNode(parentId);
    if (!parent || nodes.some(node => !node || node.parentId !== parentId)) throw new Error('Select sibling nodes');
    const positions = ids.map(id => parent.content?.indexOf(id) ?? -1).sort((a, b) => a - b);
    if (positions[0] < 0 || contiguous && positions.some((position, i) => position !== positions[0] + i)) throw new Error('Select contiguous siblings');
    const content = positions.map(position => tree(this.store, parent.content![position] as string));
    return freeze(fragment(content, 'nodes', this.origin(), this.policy));
  }
  /** First producer: one text range, with all cut ancestor boundaries retained. */
  captureText(nodeId: string, from: number, to: number): DocumentFragment {
    const node = this.store.getNode(nodeId);
    if (typeof node?.text !== 'string' || ![from, to].every(Number.isInteger) || from < 0 || to > node.text.length || from >= to) throw new Error('Invalid nonempty text range');
    let content = clip(fromNode(node), from, to), parentId = node.parentId, open = 0;
    const seen = new Set([nodeId]);
    while (parentId && parentId !== this.store.getRootNodeId()) {
      if (seen.has(parentId)) throw new Error('Cyclic source ancestry');
      seen.add(parentId);
      const parent = this.store.getNode(parentId);
      if (!parent) throw new Error('Missing source ancestor');
      content = { ...fromNode(parent), content: [content] };
      parentId = parent.parentId;
      open++;
    }
    return freeze(fragment([content], 'range', this.origin(), this.policy, open));
  }
  /** Capture normalized text endpoints, including partial ancestors and all intervening nodes. */
  captureRange(range: ModelSelection): DocumentFragment {
    if (range.type !== 'range') throw new Error('Expected a text range');
    const { startNodeId, endNodeId, startOffset, endOffset } = range;
    if (startNodeId === endNodeId) return this.captureText(startNodeId, startOffset, endOffset);
    const start = this.store.getNode(startNodeId), end = this.store.getNode(endNodeId);
    if (typeof start?.text !== 'string' || typeof end?.text !== 'string'
      || !Number.isInteger(startOffset) || !Number.isInteger(endOffset)
      || startOffset < 0 || startOffset > start.text.length || endOffset < 0 || endOffset > end.text.length) throw new Error('Invalid text range endpoints');
    const rootId = this.store.getRootNodeId();
    if (!rootId) throw new Error('Missing document root');
    let active = false, finished = false;
    const visit = (node: FragmentNode): FragmentNode | null => {
      if (finished) return null;
      if (node.sourceId === startNodeId) active = true;
      if (node.sourceId === endNodeId && !active) throw new Error('Range endpoints must be in document order');
      if (typeof node.text === 'string') {
        if (!active) return null;
        const selected = clip(node, node.sourceId === startNodeId ? startOffset : 0, node.sourceId === endNodeId ? endOffset : node.text.length);
        if (node.sourceId === endNodeId) finished = true;
        return selected;
      }
      if (!node.content?.length) return active ? node : null;
      const content = node.content.flatMap(child => { const selected = visit(child); return selected ? [selected] : []; });
      return content.length ? { ...node, content } : null;
    };
    const selected = visit(tree(this.store, rootId));
    if (!selected?.content?.length || !finished) throw new Error('Range is outside the document');
    const depth = (id: string): number => {
      let count = 0, parent = this.store.getNode(id)?.parentId;
      while (parent && parent !== rootId) { count++; parent = this.store.getNode(parent)?.parentId; }
      return count;
    };
    return freeze({ ...fragment(selected.content, 'range', this.origin(), this.policy, depth(startNodeId)), openEnd: depth(endNodeId) });
  }
  plan(request: EditingRequest): EditingDecision {
    const losses: EditingPlan['losses'] = [];
    const trace: EditingRuleTrace[] = [];
    try {
      if (this.store.isTransactionActive()) throw new Error('Plan outside an active transaction');
      const basis = this.basis();
      if (request.intent === 'move') return this.planMove(request, trace);
      let input = structuredClone(request.fragment);
      if (input.version !== 1) throw new Error('Unsupported fragment version');
      let outcome: EditingPlan['outcome'] = 'direct';
      const origin = this.origin();
      if (input.origin.format !== origin.format || input.origin.schemaId !== origin.schemaId || input.origin.schemaRevision !== origin.schemaRevision) {
        const adapter = this.policy.adapters?.find(value => value.format === input.origin.format && value.schemaId === input.origin.schemaId);
        if (!adapter) throw new Error('Source schema or format requires a registered conversion');
        const conversion = adapter.convert(input);
        input = structuredClone(conversion.content);
        outcome = conversion.outcome;
        losses.push(...conversion.losses);
      }
      if (input.version !== 1 || !['range', 'nodes'].includes(input.selection) || input.selection === 'nodes' && (input.openStart || input.openEnd)) throw new Error('Invalid fragment boundaries');
      if (!input.content.length || input.resources.length) throw new Error('Empty fragment or unsupported resources');
      const checked = validateEditingFragment(this.schema, input.content, input.openStart, input.openEnd);
      if (!checked.valid) throw new Error(checked.errors.join('; '));
      const declared = references(input.content, this.policy);
      if (signature(declared) !== signature(input.references)) throw new Error('Fragment reference declarations differ from the target policy');
      const sourceIds = new Set<string>();
      walk(input.content, node => {
        if (Object.keys(node).some(key => !['stype', 'attributes', 'text', 'marks', 'content', 'sourceId'].includes(key))) throw new Error('Unsupported fragment node field');
        if (node.sourceId === undefined) return;
        if (typeof node.sourceId !== 'string' || !node.sourceId || sourceIds.has(node.sourceId)) throw new Error('Invalid or duplicate fragment source id');
        sourceIds.add(node.sourceId);
      });
      for (const ref of declared) {
        if (ref.kind === 'node' && sourceIds.has(ref.target)) continue;
        let source: FragmentNode | undefined;
        walk(input.content, node => { if (node.sourceId === ref.sourceId) source = node; });
        const rule = this.policy.references![source!.stype][ref.attribute];
        if (rule.outside === 'reject' || rule.outside === 'same-document' && input.origin.documentId !== origin.documentId) throw new Error(`Reference cannot cross this boundary: ${ref.attribute}`);
        if (ref.kind === 'node' && !this.store.getNode(ref.target)) throw new Error(`Missing referenced node: ${ref.target}`);
      }
      const actions: EditingPlan['actions'] = outcome === 'direct' ? [] : ['transform'];
      let content = input.content;
      let parentId: string, index: number, removeIds: string[];
      const retainIds: Record<string, string> = {};
      let caret: EditingPlan['caret'] = null;
      if (request.target.kind === 'children') {
        ({ parentId, index } = request.target);
        const parent = this.store.getNode(parentId);
        const count = request.target.deleteCount ?? 0;
        if (!parent || !Number.isInteger(index) || !Number.isInteger(count) || index < 0 || count < 0 || index + count > (parent.content?.length ?? 0)) throw new Error('Invalid child insertion target');
        removeIds = (parent.content ?? []).slice(index, index + count) as string[];
        if (input.selection === 'range') {
          const opened = this.inspectOpen(input, parentId);
          content = opened.leaves;
          let wrapper: FragmentNode | undefined;
          const candidate = (parent.content ?? []).map(id => tree(this.store, id as string));
          candidate.splice(index, count, ...content);
          if (!validateEditingContent(this.schema, parent.stype, candidate).valid) {
            const candidates = [...this.schema.nodes.values()].filter(def => def.group === 'block' && validateEditingContent(this.schema, def.name, content).valid);
            const type = this.policy.defaultBlock ?? (candidates.length === 1 ? candidates[0].name : undefined);
            if (!type) throw new Error('A default block policy is required for this schema');
            const attributes = Object.fromEntries(Object.entries(this.schema.getNodeType(type)?.attrs ?? {}).filter(([, def]) => def.default !== undefined).map(([name, def]) => [name, structuredClone(def.default)]));
            wrapper = { stype: type, attributes, content };
          }
          const effect = this.chooseOpen(opened, wrapper ?? fromNode(parent), request.target.kind, trace);
          if (effect === 'preserve') content = input.content;
          else {
            this.reportOpenLosses(opened.boundaries, wrapper ?? fromNode(parent), parentId, losses);
            if (wrapper) { content = [wrapper]; actions.push('wrap'); }
            else actions.push('join');
          }
        } else {
          this.chooseClosed(content, fromNode(parent), request.target.kind, trace);
        }
        actions.push(count ? 'replace' : 'insert');
        walk(content, (node, path) => { if (node.text !== undefined) caret = { path, offset: node.text.length }; });
      } else {
        const replacement = planTextRange(this.store, this.schema, this.policy, input, request.target, {
          choose: (boundaries, leaves, target) => this.chooseOpen({ boundaries, leaves }, target, 'text', trace),
          closed: (nodes, target) => this.chooseClosed(nodes, target, 'text', trace),
          losses: (boundaries, target, id) => this.reportOpenLosses(boundaries, target, id, losses),
          guard: (node, id) => this.guardOpenBoundary(input, node, id),
        });
        ({ parentId, index, removeIds, content, caret } = replacement);
        Object.assign(retainIds, replacement.retainIds);
        actions.push(...replacement.actions);
      }
      caret ??= { path: [content.length - 1], offset: 0 };
      const parent = this.store.getNode(parentId)!;
      const closed = validateEditingFragment(this.schema, content);
      const siblings = (parent.content ?? []).map(id => tree(this.store, id as string));
      siblings.splice(index, removeIds.length, ...content);
      const valid = validateEditingContent(this.schema, parent.stype, siblings);
      // Parent mark restrictions apply to direct text children too.
      const parentChecked = validateEditingFragment(this.schema, [{ stype: parent.stype, attributes: parent.attributes, content: siblings }]);
      if (!closed.valid || !valid.valid || !parentChecked.valid) throw new Error([...closed.errors, ...valid.errors, ...parentChecked.errors].join('; '));
      const keptSourceIds = new Set<string>();
      walk(content, node => { if (node.sourceId) keptSourceIds.add(node.sourceId); });
      if (declared.some(ref => !keptSourceIds.has(ref.sourceId) || ref.kind === 'node' && sourceIds.has(ref.target) && !keptSourceIds.has(ref.target))) throw new Error('An opened boundary would remove a reference endpoint');
      const removed = new Set<string>();
      removeIds.forEach(id => walk([tree(this.store, id)], n => { if (n.sourceId) removed.add(n.sourceId); }));
      Object.values(retainIds).forEach(id => removed.delete(id));
      for (const node of this.store.getAllNodes()) {
        if (removed.has(node.sid!)) continue;
        for (const [attr, rule] of Object.entries(this.policy.references?.[node.stype] ?? {})) {
          if (rule.kind === 'node' && removed.has(String(node.attributes?.[attr]))) throw new Error('Replacement would leave an external reference dangling');
        }
      }
      for (const ref of declared) if (ref.kind === 'node' && !keptSourceIds.has(ref.target) && removed.has(ref.target)) throw new Error('Replacement would remove a referenced node');
      if (signature(basis) !== signature(this.basis())) throw new Error('Planning callback changed document, selection, schema or policy');
      return { ok: true, plan: freeze({ basis, outcome, losses, trace, actions, parentId, index, removeIds, content, retainIds, references: declared, caret }) };
    } catch (error) {
      return { ok: false, reason: error instanceof Error ? error.message : String(error), losses, trace };
    }
  }
  private planMove(request: EditingRequest, trace: EditingRuleTrace[]): EditingDecision {
    const basis = this.basis(), source = request.source;
    if (!source) throw new Error('Move requires a local source');
    const captured = source.kind === 'nodes' ? this.captureNodes(source.nodeIds, false) : this.captureText(source.nodeId, source.from, source.to);
    if (signature(captured) !== signature(request.fragment)) throw new Error('Move fragment differs from the current source');
    let replacement: ReturnType<typeof planNodeMove>;
    if (source.kind === 'nodes') {
      if (request.target.kind !== 'children') throw new Error('Whole-node moves require a child gap');
      const parent = this.store.getNode(request.target.parentId);
      if (!parent) throw new Error('Missing move destination');
      this.chooseClosed(captured.content, fromNode(parent), 'children', trace);
      replacement = planNodeMove(this.store, this.schema, source.nodeIds, request.target);
    } else {
      if (request.target.kind !== 'text') throw new Error('Text moves require a text destination');
      const insertion = this.plan({ ...request, intent: 'copy' });
      if (!insertion.ok) return insertion;
      trace.push(...insertion.plan.trace);
      replacement = planTextMove(this.store, this.schema, this.policy, source, request.target, insertion.plan);
    }
    if (signature(basis) !== signature(this.basis())) throw new Error('Move planning changed its basis');
    return { ok: true, plan: freeze({ ...replacement, basis, outcome: 'direct', trace, losses: [], references: [] }) };
  }
  private inspectOpen(input: DocumentFragment, targetParent: string): { boundaries: FragmentNode[]; leaves: FragmentNode[] } {
    if (input.openStart !== input.openEnd) throw new Error('Unequal open boundaries require the extended paste planner');
    let nodes = input.content;
    const boundaries: FragmentNode[] = [];
    for (let depth = 0; depth < input.openStart; depth++) {
      if (nodes.length !== 1 || !nodes[0].content) throw new Error('Initial range consumer requires a single open chain');
      const node = nodes[0];
      boundaries.push(node);
      this.guardOpenBoundary(input, node, targetParent);
      nodes = node.content!;
    }
    if (!nodes.length || nodes.some(node => typeof node.text !== 'string' || this.schema.getNodeType(node.stype)?.group !== 'inline')) throw new Error('Initial range consumer requires inline text leaves');
    return { boundaries, leaves: nodes };
  }
  private guardOpenBoundary(input: DocumentFragment, node: FragmentNode, targetParent: string): void {
    const def = this.schema.getNodeType(node.stype);
    if (!def?.isolating && !def?.atom) return;
    let target = this.store.getNode(targetParent);
    while (target && target.sid !== node.sourceId) target = target.parentId ? this.store.getNode(target.parentId) : undefined;
    if (!target || input.origin.documentId !== this.documentId()) throw new Error('Cannot join across an isolated or atomic boundary');
  }
  private chooseOpen(opened: { boundaries: FragmentNode[]; leaves: FragmentNode[] }, target: FragmentNode, targetKind: EditingRequest['target']['kind'], trace: EditingRuleTrace[]): 'join-inline' | 'preserve' {
    const sources = opened.boundaries.length ? [opened.boundaries.at(-1)!] : opened.leaves;
    const decisions = sources.map(source => {
      const compatible = !opened.boundaries.length || source.stype === target.stype && sameAttributes(this.schema, source, target);
      const decision = resolveEditingRule(this.policy, this.schema, source, target, { boundary: 'open', targetKind }, compatible
        ? { effect: 'join-inline', reason: 'Open inline content has compatible boundary type and attributes' }
        : { effect: 'preserve', reason: 'Different boundary type or attributes require structure preservation or an explicit join rule' });
      trace.push(decision);
      if (decision.effect === 'reject') throw new Error(decision.reason);
      return decision.effect;
    });
    if (new Set(decisions).size !== 1) throw new Error('Conflicting strategies for inline fragment nodes');
    return decisions[0];
  }
  private chooseClosed(content: FragmentNode[], target: FragmentNode, targetKind: EditingRequest['target']['kind'], trace: EditingRuleTrace[]): void {
    for (const source of content) {
      const decision = resolveEditingRule(this.policy, this.schema, source, target, { boundary: 'closed', targetKind }, { effect: 'preserve', reason: 'Closed nodes preserve their structure' });
      trace.push(decision);
      if (decision.effect === 'reject') throw new Error(decision.reason);
    }
  }
  private reportOpenLosses(boundaries: FragmentNode[], targetNode: FragmentNode, targetParent: string, losses: EditingPlan['losses']): void {
    const inner = boundaries.at(-1);
    if (inner && inner.stype !== targetNode.stype) losses.push({ kind: 'structure', reason: `Open ${inner.stype} content is joined into ${targetNode.stype}` });
    for (const node of boundaries) {
      if (!Object.keys(effectiveAttributes(this.schema, node)).length || node.stype === targetNode.stype && sameAttributes(this.schema, node, targetNode)) continue;
      let target: INode | undefined = this.store.getNode(targetParent);
      while (target && !(target.stype === node.stype && sameAttributes(this.schema, node, fromNode(target)))) target = target.parentId ? this.store.getNode(target.parentId) : undefined;
      if (!target) losses.push({ kind: 'attribute', reason: `Open ${node.stype} boundary attributes are not transferred to the target` });
    }
  }
  apply(plan: EditingPlan): Promise<TransactionResult> {
    if (plan.noop) {
      const valid = this.editor.isEditable !== false && !this.store.isTransactionActive() && this.isCurrent(signature(plan.basis));
      return Promise.resolve({ success: valid, committed: false, operations: [], errors: valid ? [] : ['Stale or read-only editing plan'] });
    }
    return transaction(this.editor, [{ type: 'fragmentEdit', payload: { plan } }]).commit();
  }
  /** Called only under TransactionManager's lock, before any fragment writes. */
  materialize(plan: EditingPlan): { children: INode[]; caret: { nodeId: string; offset: number } | null } {
    if (this.editor.isEditable === false) throw new Error('Editor is read-only');
    if (signature(plan.basis) !== signature(this.basis())) throw new Error('Stale editing plan');
    const ids = new Map<string, string>(), paths = new Map<string, string>();
    walk(plan.content, (node, path) => {
      const id = plan.retainIds[path.join('.')] ?? this.store.generateId();
      paths.set(path.join('.'), id);
      if (node.sourceId) ids.set(node.sourceId, id);
    });
    const build = (node: FragmentNode, path: number[]): INode => {
      const { content, ...rest } = structuredClone(node);
      delete rest.sourceId;
      const attributes = { ...rest.attributes };
      for (const ref of plan.references.filter(ref => ref.sourceId === node.sourceId)) {
        if (ref.kind === 'node' && ids.has(ref.target)) attributes[ref.attribute] = ids.get(ref.target)!;
      }
      const retainedId = plan.retainIds[path.join('.')];
      const existing = retainedId ? this.store.getNode(retainedId) : undefined;
      const local = existing ? Object.fromEntries(['metadata', 'version', 'createdAt', 'updatedAt']
        .filter(key => Object.hasOwn(existing, key)).map(key => [key, structuredClone(existing[key as keyof INode])])) : {};
      return { ...local, ...rest, ...(rest.attributes || Object.keys(attributes).length ? { attributes } : {}), sid: paths.get(path.join('.')), ...(content ? { content: content.map((child, index) => build(child, [...path, index])) } : {}) };
    };
    const children = plan.content.map((node, index) => build(node, [index]));
    return { children, caret: plan.caret ? { nodeId: paths.get(plan.caret.path.join('.'))!, offset: plan.caret.offset } : null };
  }
}

interface AcceptedEdit { selection?: ModelSelection | null; parentId: string; index: number; removeIds: string[]; children: INode[]; caret: { nodeId: string; offset: number } | null }
interface EditPayload { plan?: EditingPlan; accepted?: AcceptedEdit }

/** Synchronous writes under one transaction: no await between stale check and application. */
defineOperation('fragmentEdit', async (operation: { payload: EditPayload }, context: TransactionContext) => {
  if (!context.editor || !context.dataStore.isTransactionActive() || !context.dataStore.isLocked()) throw new Error('Fragment edits require an editor transaction');
  let accepted = operation.payload.accepted;
  if (!accepted) {
    const session = sessions.get(context.editor), plan = operation.payload.plan;
    if (!session || !plan) throw new Error('Missing editor policy or editing plan');
    accepted = { parentId: plan.parentId, index: plan.index, removeIds: plan.removeIds, ...session.materialize(plan) };
  }
  const parent = context.dataStore.getNode(accepted.parentId);
  if (!parent || accepted.removeIds.some((id, i) => parent.content?.[accepted!.index + i] !== id)) throw new Error('Editing target no longer exists');
  const selectionBefore = structuredClone(context.selection.current);
  const previous = accepted.removeIds.map(id => structuredClone(subtreeOf(context, id)) as unknown as INode);
  const nextIds = new Set<string>();
  const collect = (node: INode): void => { nextIds.add(node.sid!); node.content?.forEach(child => { if (typeof child !== 'string') collect(child); }); };
  accepted.children.forEach(collect);
  const obsolete = accepted.removeIds.flatMap(id => [...context.dataStore.getAllDescendants(id).map(node => node.sid!).reverse(), id]).filter(id => !nextIds.has(id));
  if (accepted.removeIds.length) context.dataStore.content.removeChildren(accepted.parentId, accepted.removeIds);
  obsolete.forEach(id => context.dataStore.deleteNode(id));
  const ids = accepted.children.map((child, index) => context.dataStore.content.addChild(accepted!.parentId, structuredClone(child), accepted!.index + index));
  operation.payload.accepted = accepted;
  delete operation.payload.plan;
  if ('selection' in accepted) context.selection.current = structuredClone(accepted.selection ?? null);
  if (accepted.caret) context.selection.setCaret(accepted.caret.nodeId, accepted.caret.offset);
  return { ok: true, inverse: { type: 'fragmentEdit', payload: { accepted: { parentId: accepted.parentId, index: accepted.index, removeIds: ids, children: previous, caret: null, selection: selectionBefore } } }, ...(accepted.caret ? { selectionAfter: accepted.caret } : {}) };
});
