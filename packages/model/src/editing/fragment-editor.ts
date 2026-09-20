import type { DataStore, INode } from '@barocss/datastore';
import { validateEditingContent, validateEditingFragment, type Schema } from '@barocss/schema';
import type { Editor, ModelSelection } from '@barocss/editor-core';
import { transaction } from '../transaction-dsl';
import { defineOperation } from '../operations/define-operation';
import { subtreeOf } from '../operations/subtree';
import type { TransactionContext } from '../types';
import type { DocumentFragment, EditingBasis, EditingDecision, EditingPlan, EditingPolicy, EditingRequest, FragmentNode, FragmentOrigin } from './types';
import { clip, fragment, fromNode, references, tree, walk } from './fragment';
import { documentState, freeze, identity, schemaState, signature } from './state';

const sessions = new WeakMap<object, FragmentEditor>();

/** One policy owner per editor. This opt-in path does not replace legacy paste. */
export class FragmentEditor {
  private policy: EditingPolicy = {};
  private policyRevision = 0;
  private readonly owner = identity(this);
  constructor(private readonly editor: Editor, policy: EditingPolicy = {}) {
    this.configure(policy);
    sessions.set(editor, this);
  }
  configure(policy: EditingPolicy): void {
    // Copy caller-owned configuration; callbacks must be pure and replaced by configure().
    this.policy = freeze({ ...policy, references: structuredClone(policy.references), adapters: policy.adapters?.map(adapter => ({ ...adapter })) });
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
    return { format: 'wonffice-fragment/1', schemaId: this.policy.schemaId ?? identity(this.schema), schemaRevision: schemaState(this.schema), documentId: this.documentId() };
  }
  private basis(): EditingBasis {
    return { owner: this.owner, document: this.documentId(), revision: this.store.getEditRevision(), snapshot: documentState(this.store), schema: schemaState(this.schema), policy: this.policyRevision, selection: signature(this.editor.selection) };
  }
  captureNodes(ids: string[]): DocumentFragment {
    if (!ids.length || new Set(ids).size !== ids.length) throw new Error('Select distinct sibling nodes');
    const nodes = ids.map(id => this.store.getNode(id));
    const parentId = nodes[0]?.parentId;
    const parent = parentId && this.store.getNode(parentId);
    if (!parent || nodes.some(node => !node || node.parentId !== parentId)) throw new Error('Select sibling nodes');
    const positions = ids.map(id => parent.content?.indexOf(id) ?? -1).sort((a, b) => a - b);
    if (positions[0] < 0 || positions.some((position, i) => position !== positions[0] + i)) throw new Error('Select contiguous siblings');
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
  plan(request: EditingRequest): EditingDecision {
    const losses: EditingPlan['losses'] = [];
    try {
      if (this.store.isTransactionActive()) throw new Error('Plan outside an active transaction');
      const basis = this.basis();
      if (request.intent !== 'copy') throw new Error('Move planning is not supported by this initial flow consumer');
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
      walk(input.content, node => { if (node.sourceId) sourceIds.add(node.sourceId); });
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
        if (input.openStart || input.openEnd) {
          content = this.openText(input, parentId, losses);
          const candidate = (parent.content ?? []).map(id => tree(this.store, id as string));
          candidate.splice(index, count, ...content);
          if (!validateEditingContent(this.schema, parent.stype, candidate).valid) {
            const candidates = [...this.schema.nodes.values()].filter(def => def.group === 'block' && validateEditingContent(this.schema, def.name, content).valid);
            const type = this.policy.defaultBlock ?? (candidates.length === 1 ? candidates[0].name : undefined);
            if (!type) throw new Error('A default block policy is required for this schema');
            const attributes = Object.fromEntries(Object.entries(this.schema.getNodeType(type)?.attrs ?? {}).filter(([, def]) => def.default !== undefined).map(([name, def]) => [name, structuredClone(def.default)]));
            content = [{ stype: type, attributes, content }];
            actions.push('wrap');
          }
        }
        actions.push(count ? 'replace' : 'insert');
        walk(content, (node, path) => { if (node.text !== undefined) caret = { path, offset: node.text.length }; });
      } else {
        const { nodeId, from, to } = request.target;
        const node = this.store.getNode(nodeId);
        const parent = node?.parentId && this.store.getNode(node.parentId);
        if (typeof node?.text !== 'string' || !parent || ![from, to].every(Number.isInteger) || from < 0 || from > to || to > node.text.length) throw new Error('Invalid text target');
        const before = clip(fromNode(node), 0, from), after = clip(fromNode(node), to, node.text.length);
        delete before.sourceId; delete after.sourceId;
        if (Object.keys(this.policy.references?.[node.stype] ?? {}).some(key => node.attributes?.[key] !== undefined)) throw new Error('Splitting a reference-bearing text node requires a conversion');
        if (input.selection === 'range') {
          const incoming = this.openText(input, parent.sid!, losses);
          parentId = parent.sid!; index = parent.content!.indexOf(nodeId); removeIds = [nodeId];
          content = [before, ...incoming, after];
          retainIds['0'] = nodeId;
          actions.push(from === to ? 'insert' : 'replace', 'join');
          caret = { path: [incoming.length], offset: incoming.at(-1)!.text!.length };
        } else {
          if (parent.content?.length !== 1 || !parent.parentId) throw new Error('Initial closed-block insertion requires a single-run target block');
          if (this.schema.getNodeType(parent.stype)?.isolating || this.schema.getNodeType(parent.stype)?.atom) throw new Error('Cannot split an isolated or atomic boundary');
          if (Object.keys(this.policy.references?.[parent.stype] ?? {}).some(key => parent.attributes?.[key] !== undefined)) throw new Error('Splitting a reference-bearing block requires a conversion');
          const prefix = { ...fromNode(parent), content: [before] }, suffix = { ...fromNode(parent), content: [after] };
          delete prefix.sourceId; delete suffix.sourceId;
          parentId = parent.parentId; index = this.store.getNode(parentId)!.content!.indexOf(parent.sid!); removeIds = [parent.sid!];
          content = [prefix, ...content, suffix];
          retainIds['0'] = parent.sid!; retainIds['0.0'] = nodeId;
          actions.push(from === to ? 'insert' : 'replace', 'split');
          walk(input.content, (n, path) => { if (n.text !== undefined) caret = { path: [path[0] + 1, ...path.slice(1)], offset: n.text.length }; });
        }
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
      return { ok: true, plan: freeze({ basis, outcome, losses, actions, parentId, index, removeIds, content, retainIds, references: declared, caret }) };
    } catch (error) {
      return { ok: false, reason: error instanceof Error ? error.message : String(error), losses };
    }
  }
  private openText(input: DocumentFragment, targetParent: string, losses: EditingPlan['losses']): FragmentNode[] {
    if (input.openStart !== input.openEnd) throw new Error('Unequal open boundaries require the extended paste planner');
    let nodes = input.content;
    for (let depth = 0; depth < input.openStart; depth++) {
      if (nodes.length !== 1 || !nodes[0].content) throw new Error('Initial range consumer requires a single open chain');
      const node = nodes[0], def = this.schema.getNodeType(node.stype);
      if (def?.isolating || def?.atom) {
        let target: INode | undefined = this.store.getNode(targetParent);
        while (target && target.sid !== node.sourceId) target = target.parentId ? this.store.getNode(target.parentId) : undefined;
        if (!target || input.origin.documentId !== this.documentId()) throw new Error('Cannot join across an isolated or atomic boundary');
      }
      if (Object.keys(node.attributes ?? {}).length) {
        let target: INode | undefined = this.store.getNode(targetParent);
        while (target && !(target.stype === node.stype && signature(target.attributes) === signature(node.attributes))) target = target.parentId ? this.store.getNode(target.parentId) : undefined;
        if (!target) losses.push({ kind: 'attribute', reason: `Open ${node.stype} boundary attributes are not transferred to the target` });
      }
      nodes = node.content!;
    }
    if (!nodes.length || nodes.some(node => typeof node.text !== 'string' || this.schema.getNodeType(node.stype)?.group !== 'inline')) throw new Error('Initial range consumer requires inline text leaves');
    return nodes;
  }
  apply(plan: EditingPlan) {
    return transaction(this.editor, [{ type: 'fragmentEdit', payload: { plan } }]).commit();
  }
  /** Called only under TransactionManager's lock, before any fragment writes. */
  materialize(plan: EditingPlan): { children: INode[]; caret: { nodeId: string; offset: number } | null } {
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
      return { ...rest, ...(rest.attributes || Object.keys(attributes).length ? { attributes } : {}), sid: paths.get(path.join('.')), ...(content ? { content: content.map((child, index) => build(child, [...path, index])) } : {}) };
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
