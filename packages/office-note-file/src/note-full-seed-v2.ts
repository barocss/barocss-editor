import { createHash } from 'node:crypto';
import { getNoteSchemaDefinition, isNotePageId } from '@barocss/office-note';
import { readNoteSnapshotFile } from '@barocss/office-note/file';

/** This version has a different tree and hash meaning from note-text-seed-v1. */
export const NOTE_FULL_SEED_V2 = 'note-full-seed-v2' as const;

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };

export interface FullNoteSeedNode {
  id: string;
  stype: string;
  attributes?: JsonObject;
  marks?: Json[];
  text?: string;
  content?: FullNoteSeedNode[];
}

export interface FullNoteSeedSource {
  /** Exact PostgreSQL bytes; never regenerated from the parsed document. */
  snapshotText: string;
  sourceHash: string;
  document: JsonObject;
  savedAt?: string;
}

export interface FullNoteSeed {
  version: typeof NOTE_FULL_SEED_V2;
  sourceHash: string;
  sourcePageId?: string;
  pageId: string;
  tree: FullNoteSeedNode;
  canonicalTreeHash: string;
}

/** Immutable admission marker. The provider must verify the real Yorkie types. */
export interface FullNoteSeedMarker {
  version: typeof NOTE_FULL_SEED_V2;
  seedId: string;
  documentKey: string;
  providerProject: string;
  providerBuild: string;
  pageId: string;
  snapshotRevision: number;
  sourceHash: string;
  canonicalTreeHash: string;
}

/** Separate mutable proof namespace; never included in the seed tree hash. */
export interface FullNoteEditProof {
  actor: string;
  session: string;
  editId: string;
  operationHash: string;
}

export interface FullNoteSeedRoot {
  wonfficeSeed: FullNoteSeedMarker;
  note: FullNoteSeedNode;
  editProofs: FullNoteEditProof[];
}

const definition = getNoteSchemaDefinition();
const nodeDefinitions = definition.nodes;
const markDefinitions = definition.marks ?? {};
const record = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  try {
    const prototype: unknown = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return false;
    return Reflect.ownKeys(value).every(key => {
      if (typeof key !== 'string') return false;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return !!descriptor?.enumerable && Object.hasOwn(descriptor, 'value');
    });
  } catch { return false; }
};
function fail(path: string): never { throw new Error(`invalid_note_full_seed_source:${path}`); }
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/** JSON.parse silently drops duplicate keys. A migration must reject them instead. */
function assertNoDuplicateKeys(text: string): void {
  let at = 0;
  const space = () => { while (/\s/.test(text[at] ?? '')) at++; };
  const string = (): string => {
    const start = at;
    if (text[at++] !== '"') fail('json');
    while (at < text.length) {
      if (text[at++] === '"') return JSON.parse(text.slice(start, at)) as string;
      if (text[at - 1] === '\\') at++;
    }
    return fail('json');
  };
  const value = (depth = 0): void => {
    if (depth > 100) fail('json_depth');
    space();
    const first = text[at];
    if (first === '"') { string(); return; }
    if (first === '{') {
      at++; space();
      const seen = new Set<string>();
      while (text[at] !== '}') {
        const key = string();
        if (seen.has(key)) fail('duplicate_key');
        seen.add(key);
        space(); if (text[at++] !== ':') fail('json');
        value(depth + 1); space();
        if (text[at] !== ',') break;
        at++; space();
      }
      if (text[at++] !== '}') fail('json');
      return;
    }
    if (first === '[') {
      at++; space();
      while (text[at] !== ']') {
        value(depth + 1); space();
        if (text[at] !== ',') break;
        at++; space();
      }
      if (text[at++] !== ']') fail('json');
      return;
    }
    while (at < text.length && !/[\s,\]}]/.test(text[at])) at++;
    if (at === 0) fail('json');
  };
  value(); space();
  if (at !== text.length) fail('json');
}

function json(value: unknown, path: string, depth = 0): Json {
  if (depth > 100) fail(path);
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value) && !Object.is(value, -0) &&
      (!Number.isInteger(value) || Number.isSafeInteger(value))) return value;
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype ||
        Reflect.ownKeys(value).length !== value.length + 1 ||
        !Array.from({ length: value.length }, (_, index) => {
          const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
          return !!descriptor?.enumerable && Object.hasOwn(descriptor, 'value');
        }).every(Boolean)) fail(path);
    return value.map((item, index) => json(item, `${path}[${index}]`, depth + 1));
  }
  if (!record(value)) fail(path);
  const result: JsonObject = {};
  for (const [key, item] of Object.entries(value)) {
    Object.defineProperty(result, key, { value: json(item, `${path}.${key}`, depth + 1),
      enumerable: true, configurable: true, writable: true });
  }
  return result;
}

function fields(value: Record<string, unknown>, allowed: readonly string[], path: string): void {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail(`${path}.${key}`);
}

function validateAttributeValues(value: Record<string, unknown>, definitions: Record<string, {
  type: string; required?: boolean | ((attrs: Record<string, unknown>) => boolean);
  options?: readonly string[]; min?: number; max?: number;
  validator?: (value: unknown, attrs?: Record<string, unknown>) => boolean;
}>, path: string): void {
  for (const [key, spec] of Object.entries(definitions)) {
    const item = value[key];
    if (item === undefined) {
      if (typeof spec.required === 'function' ? spec.required(value) : spec.required) fail(`${path}.${key}`);
      continue;
    }
    if (item === null || (spec.type === 'array' && !Array.isArray(item)) ||
      (spec.type === 'object' && !record(item)) ||
      (spec.type !== 'array' && spec.type !== 'object' && spec.type !== 'custom' && typeof item !== spec.type) ||
      (typeof item === 'number' && !Number.isFinite(item)) ||
      (spec.options && !spec.options.includes(item as string)) ||
      (typeof item === 'number' && ((spec.min !== undefined && item < spec.min) ||
        (spec.max !== undefined && item > spec.max))) ||
      (spec.validator && !spec.validator(item, value))) fail(`${path}.${key}`);
  }
}

function validateMarks(value: unknown, path: string, textLength?: number): Json[] {
  if (!Array.isArray(value)) fail(path);
  return value.map((mark, index) => {
    const location = `${path}[${index}]`;
    if (!record(mark)) fail(location);
    fields(mark, ['stype', 'attrs', 'range'], location);
    if (typeof mark.stype !== 'string' || !Object.hasOwn(markDefinitions, mark.stype)) fail(`${location}.stype`);
    const definitions = markDefinitions[mark.stype].attrs ?? {};
    if (Object.hasOwn(mark, 'attrs')) {
      if (!record(mark.attrs)) fail(`${location}.attrs`);
      fields(mark.attrs, Object.keys(definitions), `${location}.attrs`);
      validateAttributeValues(mark.attrs, definitions, `${location}.attrs`);
      json(mark.attrs, `${location}.attrs`);
    } else validateAttributeValues({}, definitions, `${location}.attrs`);
    if (Object.hasOwn(mark, 'range') &&
      (!Array.isArray(mark.range) || mark.range.length !== 2 ||
       !mark.range.every((number: unknown) => Number.isSafeInteger(number) && (number as number) >= 0) ||
       (mark.range[0] as number) > (mark.range[1] as number) ||
       (textLength !== undefined && (mark.range[1] as number) > textLength))) fail(`${location}.range`);
    return json(mark, location);
  });
}

function sourceNode(value: unknown, path: string, depth = 0, withId = false): JsonObject {
  if (depth > 100 || !record(value) || typeof value.stype !== 'string') fail(path);
  fields(value, withId ? ['id', 'stype', 'attributes', 'text', 'marks', 'content'] :
    ['stype', 'attributes', 'text', 'marks', 'content'], path);
  const nodeDefinition = nodeDefinitions[value.stype];
  if (!nodeDefinition) fail(`${path}.stype`);
  if (Object.hasOwn(value, 'attributes')) {
    if (!record(value.attributes)) fail(`${path}.attributes`);
    // Legacy callout titles are preserved as source data; the product reader
    // normalizes them, which is why that reader cannot be the admission gate.
    const allowed = Object.keys(nodeDefinition.attrs ?? {});
    if (value.stype === 'callout') allowed.push('title');
    fields(value.attributes, allowed, `${path}.attributes`);
    validateAttributeValues(value.attributes, nodeDefinition.attrs ?? {}, `${path}.attributes`);
  }
  if (Object.hasOwn(value, 'text') && typeof value.text !== 'string') fail(`${path}.text`);
  if ((Object.hasOwn(value, 'text') && value.stype !== 'inline-text') ||
      (value.stype === 'inline-text' && !Object.hasOwn(value, 'text'))) fail(`${path}.text`);
  if (Object.hasOwn(value, 'marks')) validateMarks(value.marks, `${path}.marks`,
    typeof value.text === 'string' ? value.text.length : undefined);
  if (value.stype !== 'inline-text' && Array.isArray(value.marks) && value.marks.length)
    fail(`${path}.marks`);
  if (Object.hasOwn(value, 'content')) {
    if (!Array.isArray(value.content)) fail(`${path}.content`);
    if (value.stype === 'inline-text' && value.content.length) fail(`${path}.content`);
    if (nodeDefinition.atom && value.content.length) fail(`${path}.content`);
    if (nodeDefinition.marks?.length === 0 && value.content.some(child =>
      record(child) && Array.isArray(child.marks) && child.marks.length)) fail(`${path}.content.marks`);
    value.content.forEach((child, index) => sourceNode(child, `${path}.content[${index}]`, depth + 1, withId));
  }
  return json(value, path) as JsonObject;
}

/** Inspect the raw saved file before the product reader can normalize legacy forms. */
export function parseFullNoteSeedSource(snapshotText: string): FullNoteSeedSource {
  let raw: unknown;
  try { raw = JSON.parse(snapshotText); } catch { return fail('json'); }
  assertNoDuplicateKeys(snapshotText);
  if (!record(raw)) fail('envelope');
  fields(raw, ['format', 'version', 'document', 'savedAt'], 'envelope');
  if (raw.format !== 'barocss-note' || raw.version !== 1) fail('envelope.format');
  if (Object.hasOwn(raw, 'savedAt') && (typeof raw.savedAt !== 'string' || !raw.savedAt)) fail('envelope.savedAt');
  const document = sourceNode(raw.document, 'document');
  if (document.stype !== 'note' || !Array.isArray(document.content) ||
      (document.attributes !== undefined && !record(document.attributes))) fail('document');
  const attributes = (document.attributes ?? {}) as JsonObject;
  if (Object.hasOwn(attributes, 'title') && typeof attributes.title !== 'string') fail('document.attributes.title');
  if (Object.hasOwn(attributes, 'pageId') && !isNotePageId(attributes.pageId)) fail('document.attributes.pageId');
  // The product schema checks content models and attribute value types. The
  // normalized result is only a validator result, never migration source data.
  if ('error' in readNoteSnapshotFile(snapshotText)) fail('product_schema');
  return { snapshotText, sourceHash: sha256(snapshotText), document,
    ...(Object.hasOwn(raw, 'savedAt') ? { savedAt: raw.savedAt as string } : {}) };
}

function stable(value: Json): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (record(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key] as Json)}`).join(',')}}`;
  return JSON.stringify(value);
}

function makeTree(value: JsonObject, mintNodeId: () => string, seen: Set<string>, depth = 0): FullNoteSeedNode {
  if (depth > 100) fail('tree_depth');
  const id = mintNodeId();
  if (typeof id !== 'string' || !id.startsWith('node:') || id.length <= 5 || seen.has(id)) fail('node_id');
  seen.add(id);
  return { id, stype: value.stype as string,
    ...(Object.hasOwn(value, 'attributes') ? { attributes: value.attributes as JsonObject } : {}),
    ...(Object.hasOwn(value, 'marks') ? { marks: value.marks as Json[] } : {}),
    ...(Object.hasOwn(value, 'text') ? { text: value.text as string } : {}),
    ...(Object.hasOwn(value, 'content') ? { content: (value.content as JsonObject[]).map(child => makeTree(child, mintNodeId, seen, depth + 1)) } : {}) };
}

/** The caller must atomically persist this entire result before Yorkie I/O. */
export function createFullNoteSeed(source: FullNoteSeedSource,
  options: { pageId: string; mintNodeId: () => string }): FullNoteSeed {
  if (!isNotePageId(options.pageId)) fail('page_id');
  // Reparse exact source so a mutated caller-owned object cannot bypass admission.
  const admitted = parseFullNoteSeedSource(source.snapshotText);
  if (admitted.sourceHash !== source.sourceHash) fail('source_hash');
  const original = (admitted.document.attributes ?? {}) as JsonObject;
  if (typeof original.pageId === 'string' && original.pageId !== options.pageId) fail('page_id_mismatch');
  const bound = { ...admitted.document, attributes: { ...original, pageId: options.pageId } };
  const tree = makeTree(bound, options.mintNodeId, new Set());
  return { version: NOTE_FULL_SEED_V2, sourceHash: admitted.sourceHash,
    ...(typeof original.pageId === 'string' ? { sourcePageId: original.pageId } : {}),
    pageId: options.pageId, tree, canonicalTreeHash: canonicalFullNoteSeedHash(tree) };
}

/** Reject missing, extra, duplicate or non-server-owned node identities. */
export function decodeFullNoteSeedTree(value: unknown): FullNoteSeedNode {
  const seen = new Set<string>();
  const visit = (node: unknown, path: string, depth = 0): FullNoteSeedNode => {
    if (depth > 100 || !record(node)) fail(path);
    fields(node, ['id', 'stype', 'attributes', 'text', 'marks', 'content'], path);
    if (typeof node.id !== 'string' || !node.id.startsWith('node:') || node.id.length <= 5 || seen.has(node.id)) fail(`${path}.id`);
    seen.add(node.id);
    sourceNode(node, path, depth, true);
    return { id: node.id, stype: node.stype as string,
      ...(Object.hasOwn(node, 'attributes') ? { attributes: json(node.attributes, `${path}.attributes`) as JsonObject } : {}),
      ...(Object.hasOwn(node, 'marks') ? { marks: json(node.marks, `${path}.marks`) as Json[] } : {}),
      ...(Object.hasOwn(node, 'text') ? { text: node.text as string } : {}),
      ...(Object.hasOwn(node, 'content') ? { content: (node.content as unknown[]).map((child, index) => visit(child, `${path}.content[${index}]`, depth + 1)) } : {}) };
  };
  const tree = visit(value, 'tree');
  if (tree.stype !== 'note' || !tree.attributes ||
      (Object.hasOwn(tree.attributes, 'title') && typeof tree.attributes.title !== 'string') ||
      !isNotePageId(tree.attributes.pageId) || !Array.isArray(tree.content)) fail('tree');
  const withoutIds = (node: FullNoteSeedNode): JsonObject => ({ stype: node.stype,
    ...(node.attributes !== undefined ? { attributes: node.attributes } : {}),
    ...(node.marks !== undefined ? { marks: node.marks } : {}),
    ...(node.text !== undefined ? { text: node.text } : {}),
    ...(node.content !== undefined ? { content: node.content.map(withoutIds) } : {}) });
  // The product reader checks recursive parent-child content models. Its
  // normalized output is discarded: raw canonical fields remain unchanged.
  if ('error' in readNoteSnapshotFile(JSON.stringify({ format: 'barocss-note', version: 1,
    document: withoutIds(tree) }))) fail('tree.product_schema');
  return tree;
}

/** Hash input records Yorkie Text leaf type, all node fields, and ordered marks. */
export function typedFullNoteSeedTree(tree: FullNoteSeedNode): Json {
  const validated = decodeFullNoteSeedTree(tree);
  const visit = (node: FullNoteSeedNode): JsonObject => ({
    id: node.id, stype: node.stype,
    ...(node.attributes !== undefined ? { attributes: node.attributes } : {}),
    ...(node.marks !== undefined ? { marks: node.marks } : {}),
    ...(node.text !== undefined ? { text: { type: 'yorkie.Text', value: node.text } } : {}),
    ...(node.content !== undefined ? { content: node.content.map(visit) } : {})
  });
  return visit(validated);
}

export function canonicalFullNoteSeedHash(tree: FullNoteSeedNode): string {
  return sha256(stable(typedFullNoteSeedTree(tree)));
}

/** Initial root only. An active document appends proofs through authorized edits. */
export function createInitialFullNoteSeedRoot(seed: FullNoteSeed, identity: {
  seedId: string; documentKey: string; providerProject: string;
  providerBuild: string; snapshotRevision: number;
}): FullNoteSeedRoot {
  if (!record(identity)) fail('marker');
  fields(identity as Record<string, unknown>, ['seedId', 'documentKey', 'providerProject',
    'providerBuild', 'snapshotRevision'], 'marker');
  if (Object.keys(identity).length !== 5) fail('marker');
  for (const [key, value] of Object.entries(identity)) {
    if (key === 'snapshotRevision') {
      if (!Number.isSafeInteger(value) || (value as number) < 1) fail(`marker.${key}`);
    } else if (typeof value !== 'string' || !value) fail(`marker.${key}`);
  }
  const tree = decodeFullNoteSeedTree(seed.tree);
  if (seed.version !== NOTE_FULL_SEED_V2 || tree.attributes?.pageId !== seed.pageId ||
      !/^[0-9a-f]{64}$/.test(seed.sourceHash) ||
      canonicalFullNoteSeedHash(tree) !== seed.canonicalTreeHash) fail('seed');
  return { wonfficeSeed: { version: NOTE_FULL_SEED_V2, ...identity,
    pageId: seed.pageId, sourceHash: seed.sourceHash,
    canonicalTreeHash: seed.canonicalTreeHash },
  note: tree, editProofs: [] };
}

/** Validate shape. The seed hash becomes historical after the first live edit. */
export function decodeFullNoteSeedRoot(value: unknown): FullNoteSeedRoot {
  if (!record(value)) fail('root');
  fields(value, ['wonfficeSeed', 'note', 'editProofs'], 'root');
  if (Object.keys(value).length !== 3 || !record(value.wonfficeSeed)) fail('root');
  const marker = value.wonfficeSeed;
  fields(marker, ['version', 'seedId', 'documentKey', 'providerProject', 'providerBuild', 'pageId',
    'snapshotRevision', 'sourceHash', 'canonicalTreeHash'], 'marker');
  if (Object.keys(marker).length !== 9 || marker.version !== NOTE_FULL_SEED_V2 ||
      !['seedId', 'documentKey', 'providerProject', 'providerBuild'].every(key =>
        typeof marker[key] === 'string' && !!marker[key]) ||
      !isNotePageId(marker.pageId) ||
      !Number.isSafeInteger(marker.snapshotRevision) || (marker.snapshotRevision as number) < 1 ||
      !['sourceHash', 'canonicalTreeHash'].every(key =>
        typeof marker[key] === 'string' && /^[0-9a-f]{64}$/.test(marker[key] as string))) fail('marker');
  const note = decodeFullNoteSeedTree(value.note);
  if (note.attributes?.pageId !== marker.pageId) fail('root.page_id');
  if (!Array.isArray(value.editProofs)) fail('root.editProofs');
  const proofInput = json(value.editProofs, 'root.editProofs') as Json[];
  const proofKeys = new Set<string>();
  const editProofs = proofInput.map((entry, index) => {
    if (!record(entry)) fail(`root.editProofs[${index}]`);
    fields(entry, ['actor', 'session', 'editId', 'operationHash'], `root.editProofs[${index}]`);
    if (Object.keys(entry).length !== 4 ||
        !['actor', 'session', 'editId'].every(key => typeof entry[key] === 'string' && !!entry[key]) ||
        typeof entry.operationHash !== 'string' || !/^[0-9a-f]{64}$/.test(entry.operationHash))
      fail(`root.editProofs[${index}]`);
    const key = JSON.stringify([entry.actor, entry.session, entry.editId]);
    if (proofKeys.has(key)) fail(`root.editProofs[${index}]`);
    proofKeys.add(key);
    return entry as unknown as FullNoteEditProof;
  });
  return { wonfficeSeed: marker as unknown as FullNoteSeedMarker, note, editProofs };
}

/** Before promotion, enforce an untouched seed and an empty edit ledger. */
export function decodeInitialFullNoteSeedRoot(value: unknown): FullNoteSeedRoot {
  const root = decodeFullNoteSeedRoot(value);
  if (root.editProofs.length || canonicalFullNoteSeedHash(root.note) !== root.wonfficeSeed.canonicalTreeHash)
    fail('root.initial_seed');
  return root;
}
