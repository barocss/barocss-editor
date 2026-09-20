import type { Editor, ModelSelection } from '@barocss/editor-core';
import { insideLockedRegion, selectedNodeIds } from '@barocss/editor-core';
import { FRAGMENT_DRAG_TYPE, FRAGMENT_NODE_DRAG_TYPE, type FragmentDragFeedback } from '@barocss/shared';
import { FragmentEditor, type DocumentFragment, type EditingDecision, type EditingSource, type EditingTarget, type EditingLoss, type EditingPlan } from '@barocss/model';

import { standardClipboardPolicy } from './standard-clipboard';

interface DragSession { token: string; checkpoint: string; fragment: DocumentFragment; source?: EditingSource }
interface Hooks {
  editing(): FragmentEditor | undefined;
  write(fragment: DocumentFragment, data: Pick<DataTransfer, 'setData'>): void;
  copyInput?(fragment: DocumentFragment, target: EditingTarget): { fragment: DocumentFragment; losses: EditingLoss[] } | undefined;
  read(json?: string, html?: string): DocumentFragment | undefined;
}
interface DropPayload {
  target?: EditingTarget; intent?: 'copy' | 'move'; token?: string;
  clipboardFragment?: string; clipboardHtml?: string; clipboardText?: string; acceptLosses?: boolean;
  onDecision?: (value: FragmentDragFeedback) => void;
}
function dropAllowed(editor: Editor, target: EditingTarget): boolean {
  const parent = target.kind === 'children' ? target.parentId : editor.dataStore.getNode(target.nodeId)?.parentId;
  return !!parent && editor.dataStore.isDroppableNode(parent) && !insideLockedRegion(editor.dataStore, parent);
}
function sourceAllowed(editor: Editor, ids: string[]): boolean {
  return ids.every(id => editor.dataStore.isDraggableNode(id));
}
function moveAllowed(editor: Editor, source: EditingSource): boolean {
  const store = editor.dataStore;
  return source.kind === 'text' ? !insideLockedRegion(store, source.nodeId)
    : source.nodeIds.every(id => !insideLockedRegion(store, store.getNode(id)?.parentId) && !insideLockedRegion(store, id, 'lockDelete'));
}
const random = () => Array.from(crypto.getRandomValues(new Uint32Array(4)), value => value.toString(16)).join('-');

/** A live local source authorizes removal. Serialized source IDs never do. */
export function installFragmentDrag(editor: Editor, hooks: Hooks): () => void {
  const owner = random(); let current: DragSession | undefined;
  const reject = (payload: DropPayload, reason: string): false => {
    payload.onDecision?.({ accepted: false, reason, intent: 'copy' });
    editor.emit('editor:drag.plan', { ok: false, reason, losses: [], trace: [] });
    return false;
  };
  const resolve = (payload: DropPayload, preview: boolean): { decision: EditingDecision; editing: FragmentEditor; intent: 'copy' | 'move'; acceptLosses: boolean } | false | undefined => {
    const editing = hooks.editing();
    if (!editing || !payload.target || editor.isEditable === false) return reject(payload, 'Drop requires an editable schema target');
    if (!dropAllowed(editor, payload.target)) return reject(payload, 'Schema disallows dropping into this container');
    let local = preview && !payload.token ? !!current : false;
    if (payload.token) {
      let identity: { owner?: string; token?: string };
      try { identity = JSON.parse(payload.token); } catch { return reject(payload, 'Invalid drag session'); }
      if (!identity || typeof identity.owner !== 'string' || typeof identity.token !== 'string') return reject(payload, 'Invalid drag session');
      local = identity.owner === owner;
      if (local && (!current || identity.token !== current.token)) return reject(payload, 'Drag session has expired');
    }
    const session = local ? current : undefined;
    if (session && !editing.isSourceCurrent(session.checkpoint)) return reject(payload, 'Drag source changed');
    const intent = session && payload.intent !== 'copy' ? 'move' : 'copy';
    if (intent === 'move' && !session?.source) return reject(payload, 'Moving a range across multiple source runs is not supported');
    if (intent === 'move' && !moveAllowed(editor, session!.source!)) return reject(payload, 'Move source is locked');
    let fragment: DocumentFragment | undefined;
    try { fragment = session?.fragment ?? hooks.read(payload.clipboardFragment, payload.clipboardHtml); }
    catch { return reject(payload, 'Invalid drag fragment'); }
    if (!fragment) return undefined;
    let input: ReturnType<NonNullable<Hooks['copyInput']>>;
    try { input = intent === 'copy' ? hooks.copyInput?.(fragment, payload.target) : undefined; }
    catch { return reject(payload, 'Drop conversion failed'); }
    let decision = editing.plan({ intent, fragment: input?.fragment ?? fragment, target: payload.target, ...(intent === 'move' ? { source: session!.source } : {}) });
    if (decision.ok && input?.losses.length) {
      const actions: EditingPlan['actions'] = ['transform', ...decision.plan.actions], losses = [...input.losses, ...decision.plan.losses];
      losses.forEach(Object.freeze); Object.freeze(actions); Object.freeze(losses);
      decision = { ok: true, plan: Object.freeze({ ...decision.plan, outcome: 'converted', actions, losses }) };
    }
    const acceptLosses = payload.acceptLosses === true || !!input;
    const accepted = decision.ok && (!decision.plan.losses.length || acceptLosses);
    payload.onDecision?.({ accepted, intent, ...(decision.ok ? { noop: decision.plan.noop } : { reason: decision.reason }) });
    editor.emit('editor:drag.plan', decision);
    return { decision, editing, intent, acceptLosses };
  };
  editor.registerCommand({ name: 'beginFragmentDrag', canExecute: (_editor, payload?: { dataTransfer?: unknown; selection?: ModelSelection }) => !!payload?.dataTransfer && !!(payload.selection ?? editor.selection), execute: (_editor, payload?: { selection?: ModelSelection; nodeIds?: string[]; dataTransfer?: Pick<DataTransfer, 'setData'>; onStart?: () => void }) => {
    current = undefined;
    const editing = hooks.editing(), selection = payload?.selection ?? editor.selection;
    if (!editing || !selection || !payload?.dataTransfer) return false;
    try {
      const nodeIds = payload.nodeIds ?? selectedNodeIds(selection);
      if (!sourceAllowed(editor, nodeIds.length ? nodeIds : [selection.startNodeId, selection.endNodeId])) return false;
      const fragment = nodeIds.length ? editing.captureNodes(nodeIds, false) : editing.captureRange(selection);
      const source: EditingSource | undefined = nodeIds.length ? { kind: 'nodes', nodeIds }
        : selection.startNodeId === selection.endNodeId ? { kind: 'text', nodeId: selection.startNodeId, from: selection.startOffset, to: selection.endOffset } : undefined;
      const token = random();
      hooks.write(fragment, payload.dataTransfer);
      payload.dataTransfer.setData(FRAGMENT_DRAG_TYPE, JSON.stringify({ owner, token }));
      if (nodeIds.length) payload.dataTransfer.setData(FRAGMENT_NODE_DRAG_TYPE, '1');
      current = { token, source, fragment, checkpoint: editing.sourceCheckpoint() };
      payload.onStart?.(); return true;
    } catch { return false; }
  } });
  editor.registerCommand({ name: 'cancelFragmentDrag', canExecute: () => !!current, execute: () => { current = undefined; return true; } });
  editor.registerCommand({ name: 'previewFragmentDrop', canExecute: (_editor, payload?: DropPayload) => editor.isEditable !== false && !!payload?.target, execute: (_editor, payload?: DropPayload) => {
    if (!payload) return false;
    const result = resolve(payload, true);
    if (result === undefined) { payload.onDecision?.({ accepted: true, intent: 'copy', candidate: true }); return true; }
    return !!result && result.decision.ok && (!result.decision.plan.losses.length || result.acceptLosses);
  } });
  editor.registerCommand({ name: 'dropFragment', canExecute: (_editor, payload?: DropPayload) => editor.isEditable !== false && !!payload?.target, execute: async (_editor, payload?: DropPayload) => {
    if (!payload) return false;
    const result = resolve(payload, false);
    current = undefined;
    if (result === false) return false;
    if (!result) {
      if (payload.clipboardHtml === undefined && payload.clipboardText === undefined) return reject(payload, 'Drop contains no supported input');
      if (payload.target?.kind !== 'text' || payload.target.from !== payload.target.to) return reject(payload, 'External text requires a resolved text drop position');
      const selection: ModelSelection = { type: 'range', startNodeId: payload.target.nodeId, startOffset: payload.target.from, endNodeId: payload.target.nodeId, endOffset: payload.target.to, collapsed: true };
      return editor.executeCommand('paste', { selection, clipboardHtml: payload.clipboardHtml, clipboardText: payload.clipboardText, acceptLosses: payload.acceptLosses });
    }
    if (!result.decision.ok || result.decision.plan.losses.length && !result.acceptLosses) return false;
    return (await result.editing.apply(result.decision.plan)).success;
  } });
  editor.registerCommand({ name: 'transferNodes', canExecute: (_editor, payload?: NodeTransferPayload) => editor.isEditable !== false && !!payload?.nodeIds?.length && !!payload.target,
    execute: (_editor, payload?: NodeTransferPayload) => transferNodes(editor, payload) });
  return () => { current = undefined; };
}

export interface NodeTransferPayload { nodeIds?: string[]; target?: EditingTarget; intent?: 'copy' | 'move'; acceptLosses?: boolean }
/** Trusted product input shares the native drag planner, without requiring clipboard installation. */
export async function transferNodes(editor: Editor, payload?: NodeTransferPayload): Promise<boolean> {
  const schema = editor.dataStore.getActiveSchema();
  if (!schema || editor.isEditable === false || !payload?.nodeIds?.length || !payload.target) return false;
  if (!sourceAllowed(editor, payload.nodeIds) || !dropAllowed(editor, payload.target)) return false;
  if (payload.intent !== 'copy' && !moveAllowed(editor, { kind: 'nodes', nodeIds: payload.nodeIds })) return false;
  const editing = FragmentEditor.forEditor(editor, standardClipboardPolicy(type => schema.hasNodeType(type)));
  let fragment: DocumentFragment;
  try { fragment = editing.captureNodes(payload.nodeIds, false); } catch { return false; }
  const decision = editing.plan({ intent: payload.intent ?? 'move', fragment, source: { kind: 'nodes', nodeIds: payload.nodeIds }, target: payload.target });
  editor.emit('editor:drag.plan', decision);
  if (!decision.ok || decision.plan.losses.length && !payload.acceptLosses) return false;
  return (await editing.apply(decision.plan)).success;
}
