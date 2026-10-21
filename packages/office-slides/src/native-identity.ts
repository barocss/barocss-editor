import { forFile } from '@barocss/shared';
import { CANVAS_NAMES } from '@barocss/office-controls';
import type { Editor } from '@barocss/editor-core';

type NativeNode = Record<string, unknown> & { stype: string; sid?: string; attributes?: Record<string, unknown>; content?: NativeNode[] };
const SCOPES = new Set(['surface', 'slideLayout', 'slideMaster', 'component']);
const identity = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= 128;
export const newSlidesObjectId = (): string => crypto.randomUUID();
export const isSlidesObject = (stype: string): boolean => Object.hasOwn(CANVAS_NAMES, stype);

function cloneTree(value: unknown): NativeNode {
  const seen = new Set<unknown>();
  let count = 0;
  const clone = (value: unknown, depth: number): NativeNode => {
    if (!value || typeof value !== 'object' || Array.isArray(value) || seen.has(value) || depth > 100 || ++count > 10000)
      throw new Error('Invalid Slides native tree.');
    seen.add(value);
    const node = value as NativeNode;
    if (typeof node.stype !== 'string' || (node.content !== undefined && !Array.isArray(node.content))
      || (node.attributes !== undefined && (!node.attributes || typeof node.attributes !== 'object' || Array.isArray(node.attributes))))
      throw new Error('Invalid Slides native node.');
    const copy = { ...node, ...(node.attributes ? { attributes: { ...node.attributes } } : {}) };
    if (node.content) copy.content = node.content.map(child => clone(child, depth + 1));
    return copy;
  };
  const tree = clone(value, 0);
  if (tree.stype !== 'document') throw new Error('Invalid Slides document root.');
  return tree;
}

function graph(tree: NativeNode) {
  const ids = new Map<string, NativeNode>();
  const sids = new Map<string, NativeNode>();
  const scopes = new Map<NativeNode, NativeNode | undefined>();
  const nodes: NativeNode[] = [];
  const visit = (node: NativeNode, scope?: NativeNode) => {
    const ownScope = SCOPES.has(node.stype) ? node : scope;
    scopes.set(node, ownScope); nodes.push(node);
    const id = node.attributes?.objectId;
    if (id !== undefined) {
      if (!isSlidesObject(node.stype) || !identity(id) || /:\d+$/.test(id) || ids.has(id)) throw new Error('Duplicate or invalid Slides object identity.');
      ids.set(id, node);
    }
    if (node.sid !== undefined) {
      if (!identity(node.sid) || sids.has(node.sid)) throw new Error('Duplicate or invalid Slides session identity.');
      sids.set(node.sid, node);
    }
    node.content?.forEach(child => visit(child, ownScope));
  };
  visit(tree);
  return { ids, sids, scopes, nodes };
}

function checkTarget(node: NativeNode, target: NativeNode | undefined, indexed: ReturnType<typeof graph>, end: 'start' | 'end'): NativeNode {
  if (!target || target === node || !isSlidesObject(target.stype) || !indexed.scopes.get(node)
    || indexed.scopes.get(target) !== indexed.scopes.get(node)) throw new Error('Missing or wrong-scope Slides connector target.');
  const along = node.attributes?.[`${end}T`];
  if (target.stype === 'connector' && (typeof along !== 'number' || !Number.isFinite(along) || along < 0 || along > 1))
    throw new Error('A connector target requires a valid line position.');
  return target;
}

/** Validate durable wire references without assigning identities or guessing legacy attachments. */
export function assertSlidesNativeReferences(value: unknown): void {
  const tree = cloneTree(value);
  const indexed = graph(tree);
  for (const node of indexed.nodes) {
    const attrs = node.attributes ?? {};
    for (const end of ['start', 'end'] as const) {
      if (attrs[`${end}NodeId`] !== undefined && attrs[`${end}NodeId`] !== '') throw new Error('Slides native files cannot retain session connector targets.');
      const id = attrs[`${end}ObjectId`];
      if (id !== undefined) {
        if (node.stype !== 'connector' || !identity(id)) throw new Error('Invalid Slides connector target identity.');
        checkTarget(node, indexed.ids.get(id), indexed, end);
      }
    }
  }
}

/** Encode live references, or normalize a valid native tree for an explicit v2 load/migration. */
export function normalizeSlidesNativeDocument(value: unknown): unknown {
  const tree = cloneTree(value);
  const indexed = graph(tree);
  for (const node of indexed.nodes) {
    if (!isSlidesObject(node.stype)) continue;
    node.attributes ??= {};
    if (node.attributes.objectId === undefined) node.attributes.objectId = newSlidesObjectId();
  }
  // The index points at these same cloned nodes; new target IDs are now document-owned.
  for (const node of indexed.nodes) {
    const attrs = node.attributes ?? {};
    for (const end of ['start', 'end'] as const) {
      const sid = attrs[`${end}NodeId`];
      if (sid === '') { delete attrs[`${end}NodeId`]; continue; }
      if (sid === undefined) continue;
      if (node.stype !== 'connector' || !identity(sid)) throw new Error('Invalid Slides connector session target.');
      const target = checkTarget(node, indexed.sids.get(sid), indexed, end);
      const targetId = target.attributes!.objectId;
      if (attrs[`${end}ObjectId`] !== undefined && attrs[`${end}ObjectId`] !== targetId)
        throw new Error('Inconsistent Slides connector target identities.');
      attrs[`${end}ObjectId`] = targetId;
      delete attrs[`${end}NodeId`];
    }
  }
  const native = forFile(tree);
  assertSlidesNativeReferences(native);
  return native;
}

/** Resolve a validated wire graph into fresh, collision-free transient IDs before the loader emits. */
export function prepareSlidesNativeLoad(value: unknown, allocateId: () => string): unknown {
  const tree = cloneTree(normalizeSlidesNativeDocument(value));
  const indexed = graph(tree);
  for (const node of indexed.nodes) node.sid = allocateId();
  for (const node of indexed.nodes) {
    if (node.stype !== 'connector') continue;
    const attrs = node.attributes ?? {};
    for (const end of ['start', 'end'] as const) {
      const id = attrs[`${end}ObjectId`];
      if (id === undefined) continue;
      const target = checkTarget(node, indexed.ids.get(id as string), indexed, end);
      attrs[`${end}NodeId`] = target.sid;
      delete attrs[`${end}ObjectId`];
    }
  }
  return tree;
}

/** Assign new objects at the product store boundary, including command-created and restored nodes. */
export function installSlidesObjectIdentity(editor: Editor): void {
  const store = editor.dataStore;
  const setNode = store.setNode.bind(store);
  const assigned = new Map<string, string>();
  store.setNode = (node, validate) => {
    if (isSlidesObject(String(node.stype))) {
      node.attributes ??= {};
      let id = (node.sid ? assigned.get(node.sid) : undefined) ?? node.attributes.objectId ?? newSlidesObjectId();
      // A command-created copy can carry a definition's ID. Its new SID is not that object.
      if (!assigned.has(node.sid!) && store.isTransactionActive()
        && [...assigned.entries()].some(([sid, known]) => sid !== node.sid && known === id)) id = newSlidesObjectId();
      if (!identity(id)) throw new Error('Invalid Slides object identity.');
      node.attributes.objectId = id;
      if (node.sid) assigned.set(node.sid, id);
    }
    setNode(node, validate);
  };
  editor.on('editor:destroy', () => { assigned.clear(); store.setNode = setNode; });
}
