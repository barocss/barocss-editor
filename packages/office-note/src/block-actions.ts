import { transferNodes } from '@barocss/extensions';
import { copyNoteDatabaseResources } from './database';
import type { Editor } from '@barocss/editor-core';
import { gapBeforeRemoval, addChild, moveNode, removeChild, transaction } from '@barocss/model';
import { validateTree } from '@barocss/schema';
import { NOTE_BLOCKS } from './note-schema';

export const NOTE_CONVERSIONS = [
  { kind: 'paragraph', label: '문단' },
  { kind: 'heading1', label: '제목 1' },
  { kind: 'heading2', label: '제목 2' },
  { kind: 'heading3', label: '제목 3' },
  { kind: 'heading4', label: '제목 4' },
  { kind: 'heading5', label: '제목 5' },
  { kind: 'heading6', label: '제목 6' },
  { kind: 'taskItem', label: '체크리스트' },
  { kind: 'blockQuote', label: '인용' }
] as const;
type Tree = { sid?: string; stype: string; text?: string; attributes?: Record<string, unknown>; marks?: unknown[]; content?: Tree[] };
type Payload = { nodeId?: string; kind?: string };
const inlineBlocks = new Set(['paragraph', 'heading', 'taskItem']);

function tree(editor: Editor, sid: string, seen = new Set<string>()): Tree | undefined {
  if (seen.has(sid)) return;
  seen.add(sid);
  const node = editor.dataStore.getNode(sid);
  if (!node) return;
  const content: Tree[] = [];
  for (const child of node.content ?? []) {
    if (typeof child !== 'string') return;
    const cloned = tree(editor, child, seen);
    if (!cloned) return;
    content.push(cloned);
  }
  return {
    sid, stype: String(node.stype),
    ...(typeof node.text === 'string' ? { text: node.text } : {}),
    ...(node.attributes ? { attributes: structuredClone(node.attributes) } : {}),
    ...(node.marks ? { marks: structuredClone(node.marks) } : {}),
    ...(node.content ? { content } : {})
  };
}

function target(editor: Editor, sid?: string) {
  if (!sid) return;
  const store = editor.dataStore, node = store.getNode(sid);
  if (!node?.parentId || !NOTE_BLOCKS.includes(node.stype as never)) return;
  const parent = store.getNode(node.parentId);
  if (!parent?.sid || !Array.isArray(parent.content)) return;
  const index = parent.content.indexOf(sid);
  if (index < 0) return;
  return { node, parent, index, sid };
}

function permits(editor: Editor, stype: string, ids: unknown[]): boolean {
  const schema = editor.dataStore.getActiveSchema();
  const children = ids.map(id => typeof id === 'string' ? editor.dataStore.getNode(id) : id);
  return !!schema?.validateContent(stype, children).valid;
}

function converted(editor: Editor, payload?: Payload): Tree | undefined {
  const at = target(editor, payload?.nodeId);
  if (!at || !NOTE_CONVERSIONS.some(item => item.kind === payload?.kind)) return;
  const original = tree(editor, at.sid);
  if (!original) return;
  let source = original;
  if (source.stype === 'blockQuote') {
    if (source.content?.length !== 1) return;
    source = source.content[0];
  }
  if (!inlineBlocks.has(source.stype)) return;
  const kind = payload!.kind!;
  const stype = kind.startsWith('heading') ? 'heading' : kind;
  const attrs: Record<string, unknown> = {};
  const definition = editor.dataStore.getActiveSchema()?.getNodeType(stype);
  // Keep shared presentation attributes, without carrying checked/level into unrelated types.
  for (const [name, value] of Object.entries(source.attributes ?? {})) {
    if (definition?.attrs?.[name]) attrs[name] = value;
  }
  if (stype === 'heading') attrs.level = Number(kind.slice(-1));
  if (stype === 'taskItem') attrs.checked = source.stype === 'taskItem' ? source.attributes?.checked ?? false : false;
  const next: Tree = stype === 'blockQuote'
    ? { stype, content: [source] }
    : { stype, attributes: attrs, content: source.content ?? [] };
  if (original.stype === stype && (stype !== 'heading' || original.attributes?.level === attrs.level)) return;
  const siblings = [...at.parent.content!];
  siblings.splice(at.index, 1, next as never);
  const schema = editor.dataStore.getActiveSchema();
  if (!schema || validateTree(schema, next).length || !permits(editor, String(at.parent.stype), siblings)) return;
  return next;
}

function nesting(editor: Editor, payload: Payload | undefined, outward: boolean) {
  const at = target(editor, payload?.nodeId);
  if (!at) return;
  const store = editor.dataStore;
  const destination = outward
    ? at.parent.parentId ? store.getNode(at.parent.parentId) : undefined
    : at.index > 0 ? store.getNode(String(at.parent.content![at.index - 1])) : undefined;
  if (!destination?.sid || !Array.isArray(destination.content)) return;
  // Keep list/table/header roles intact; only ordinary prose containers accept these gestures.
  if (!['note', 'blockQuote', 'callout', 'bDetails', 'listItem'].includes(String(destination.stype))) return;
  if (!outward && destination.stype === 'note') return;
  const index = outward ? destination.content.indexOf(at.parent.sid!) + 1 : destination.content.length;
  if (outward && index === 0) return;
  const remaining = at.parent.content!.filter(id => id !== at.sid);
  const added = [...destination.content];
  added.splice(index, 0, at.sid);
  if (!permits(editor, String(at.parent.stype), remaining) || !permits(editor, String(destination.stype), added)) return;
  return { sid: at.sid, parentId: destination.sid, index };
}

/** Product commands reuse reversible model operations and validate their final parent shapes. */
export function registerNoteBlockActions(editor: Editor): void {
  registerBatchActions(editor);
  editor.registerCommand({
    name: 'convertNoteBlock',
    canExecute: (_editor, payload?: Payload) => !!converted(editor, payload),
    execute: async (_editor, payload?: Payload) => {
      const next = converted(editor, payload), at = target(editor, payload?.nodeId);
      if (!next || !at) return false;
      const focus = prepare(editor, next);
      return (await transaction(editor, [removeChild(at.parent.sid!, at.sid), addChild(at.parent.sid!, next as never, at.index), ...focus] as never).commit()).success;
    }
  });
  const canDuplicate = (payload?: Payload) => {
    const at = target(editor, payload?.nodeId);
    if (!at || !editor.isEditable) return false;
    const cloned = tree(editor, at.sid);
    if (!cloned || !copyNoteDatabaseResources(editor, databaseSources(cloned))) return false;
    const siblings = [...at.parent.content!];
    siblings.splice(at.index + 1, 0, at.sid);
    return permits(editor, String(at.parent.stype), siblings);
  };
  editor.registerCommand({
    name: 'duplicateNoteBlock', canExecute: (_editor, payload?: Payload) => canDuplicate(payload),
    execute: async (_editor, payload?: Payload) => {
      const at = target(editor, payload?.nodeId);
      if (!at || !canDuplicate(payload)) return false;
      const cloned = tree(editor, at.sid);
      if (!cloned) return false;
      const resources = copyNoteDatabaseResources(editor, databaseSources(cloned));
      if (!resources) return false;
      const retarget = (node: Tree) => {
        if (node.stype === 'noteDatabase' && typeof node.attributes?.source === 'string') {
          node.attributes.source = resources.names.get(node.attributes.source) ?? node.attributes.source;
        }
        node.content?.forEach(retarget);
      };
      retarget(cloned);
      const focus = prepare(editor, cloned);
      return (await transaction(editor, [...resources.operations, addChild(at.parent.sid!, cloned as never, at.index + 1), ...focus] as never).commit()).success;
    }
  });
  for (const [name, outward] of [['indentNoteBlock', false], ['outdentNoteBlock', true]] as const) {
    editor.registerCommand({
      name, canExecute: (_editor, payload?: Payload) => !!nesting(editor, payload, outward),
      execute: async (_editor, payload?: Payload) => {
        const where = nesting(editor, payload, outward);
        if (!where) return false;
        return (await transaction(editor, [moveNode(where.sid, where.parentId, where.index)] as never).commit()).success;
      }
    });
  }
}

/** Mint every copied id and carry a caret into the matching text run when possible. */
function prepare(editor: Editor, copy: Tree): unknown[] {
  const ids = new Map<string, string>();
  let first: string | undefined;
  const visit = (node: Tree) => {
    const next = editor.dataStore.generateId();
    if (node.sid) ids.set(node.sid, next);
    node.sid = next;
    if (typeof node.text === 'string' && !first) first = next;
    node.content?.forEach(visit);
  };
  visit(copy);
  const prior = editor.selection;
  const matched = prior?.startNodeId ? ids.get(prior.startNodeId) : undefined;
  const nodeId = matched ?? first;
  if (!nodeId) return [];
  const offset = matched ? prior?.startOffset ?? 0 : 0;
  const endId = prior?.endNodeId ? ids.get(prior.endNodeId) : undefined;
  return [{ type: 'setSelection', payload: { anchor: { nodeId, offset }, head: { nodeId: endId ?? nodeId, offset: endId ? prior?.endOffset ?? offset : offset } } }];
}

function databaseSources(node: Tree): string[] {
  return [
    ...(node.stype === 'noteDatabase' && typeof node.attributes?.source === 'string' ? [node.attributes.source] : []),
    ...(node.content ?? []).flatMap(databaseSources)
  ];
}


type BatchPayload = { nodeIds?: string[]; at?: number };
function batchTarget(editor: Editor, payload?: BatchPayload) {
  if (!editor.isEditable || !payload?.nodeIds || payload.nodeIds.length < 2) return;
  const root = editor.dataStore.getNode(editor.getRootId()!);
  if (!root?.sid || !root.content) return;
  const wanted = new Set(payload.nodeIds);
  const ids = root.content.filter(id => wanted.has(String(id))) as string[];
  if (ids.length !== wanted.size) return;
  const start = root.content.indexOf(ids[0]), end = root.content.indexOf(ids[ids.length - 1]);
  if (end - start + 1 !== ids.length) return;
  return { root, ids, start, end };
}
function registerBatchActions(editor: Editor) {
  for (const action of ['duplicate', 'delete', 'up', 'down', 'move'] as const) {
    const can = (payload?: BatchPayload) => {
      const at = batchTarget(editor, payload);
      if (!at) return false;
      if (action === 'move') return Number.isInteger(payload?.at) && payload!.at! >= 0 && payload!.at! <= at.root.content!.length - at.ids.length && payload!.at !== at.start;
      if (action === 'up') return at.start > 0;
      if (action === 'down') return at.end < at.root.content!.length - 1;
      if (action === 'duplicate') return !!copyNoteDatabaseResources(editor, at.ids.flatMap(id => databaseSources(tree(editor, id)!)));
      return true;
    };
    editor.registerCommand({ name: `batchNoteBlocks:${action}`, canExecute: (_editor, payload?: BatchPayload) => can(payload),
      execute: async (_editor, payload?: BatchPayload) => {
        const at = batchTarget(editor, payload);
        if (!at || !can(payload)) return false;
        const operations: unknown[] = [];
        if (action === 'move') {
          return transferNodes(editor, { nodeIds: at.ids, target: {
            kind: 'children', parentId: at.root.sid!, index: gapBeforeRemoval(at.root.content as string[], at.ids, payload!.at!)
          } });
        }
        else if (action === 'up') operations.push(moveNode(String(at.root.content![at.start - 1]), at.root.sid!, at.end));
        else if (action === 'down') operations.push(moveNode(String(at.root.content![at.end + 1]), at.root.sid!, at.start));
        else if (action === 'delete') {
          operations.push(...at.ids.map(id => removeChild(at.root.sid!, id)));
          // A fully deleted document must remain writable.
          const empty: Tree = { stype: 'paragraph', content: [{ stype: 'inline-text', text: '' }] };
          if (at.ids.length === at.root.content!.length) {
            const focus = prepare(editor, empty);
            operations.push(addChild(at.root.sid!, empty as never, 0), ...focus);
          } else {
            const next = String(at.root.content![at.end + 1] ?? at.root.content![at.start - 1]);
            const first = (node: Tree): string | undefined => typeof node.text === 'string' ? node.sid : node.content?.map(first).find(Boolean);
            const nodeId = first(tree(editor, next)!);
            if (nodeId) operations.push({ type: 'setSelection', payload: { anchor: { nodeId, offset: 0 }, head: { nodeId, offset: 0 } } });
            else {
              const focus = prepare(editor, empty);
              operations.push(addChild(at.root.sid!, empty as never, Math.min(at.start, at.root.content!.length - at.ids.length)), ...focus);
            }
          }
        } else {
          const copies = at.ids.map(id => tree(editor, id)!);
          const resources = copyNoteDatabaseResources(editor, copies.flatMap(databaseSources));
          if (!resources) return false;
          operations.push(...resources.operations);
          const retarget = (node: Tree) => {
            if (node.stype === 'noteDatabase' && typeof node.attributes?.source === 'string') node.attributes.source = resources.names.get(node.attributes.source) ?? node.attributes.source;
            node.content?.forEach(retarget);
          };
          copies.forEach((copy, index) => { retarget(copy); const focus = prepare(editor, copy); operations.push(addChild(at.root.sid!, copy as never, at.end + 1 + index)); if (index === copies.length - 1) operations.push(...focus); });
        }
        return (await transaction(editor, operations as never).commit()).success;
      }
    });
  }
}
