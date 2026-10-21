import { readDeckFile, deckFileText, getSlidesSchemaDefinition, assertSlidesNativeReferences, DECK_FORMAT, DECK_FILE_VERSION } from '@barocss/office-slides';
import { createSchema, validateTree } from '@barocss/schema';

export { DECK_FORMAT, DECK_FILE_VERSION };
export interface SlidesDocument {
  stype: 'document';
  content?: unknown[];
  attributes?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}
const schema = createSchema('server-slides', getSlidesSchemaDefinition());
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/** Check the native tree before the local loader can normalize or replace it. */
function supportedDocument(value: unknown): value is SlidesDocument {
  if (!record(value) || value.stype !== 'document' || !Array.isArray(value.content)) return false;
  let count = 0;
  const walk = (node: unknown, depth: number): boolean => {
    if (!record(node) || Object.keys(node).some(key => !['stype', 'attributes', 'metadata', 'text', 'marks', 'content'].includes(key)) || depth > 100 || ++count > 10000 || typeof node.stype !== 'string' ||
      !schema.hasNodeType(node.stype) || Object.hasOwn(node, 'sid') || Object.hasOwn(node, 'parentId') ||
      (node.attributes !== undefined && !record(node.attributes)) ||
      (node.metadata !== undefined && !record(node.metadata)) ||
      (node.text !== undefined && typeof node.text !== 'string') ||
      (node.content !== undefined && !Array.isArray(node.content))) return false;
    // Native Slides uses fontSize:number and bookmark:name. The generic mark attribute
    // validator disagrees with those established fields, so validate their native shape here.
    if (node.marks !== undefined) {
      if (!Array.isArray(node.marks) || !node.marks.every(mark => record(mark) &&
        typeof mark.stype === 'string' && schema.getMarkType(mark.stype) &&
        (mark.attrs === undefined || record(mark.attrs)) && (mark.range === undefined || (Array.isArray(mark.range) &&
        mark.range.length === 2 && mark.range.every(Number.isSafeInteger) &&
        mark.range[0] >= 0 && mark.range[1] >= mark.range[0] &&
        typeof node.text === 'string' && mark.range[1] <= node.text.length)))) return false;
    }
    return !Array.isArray(node.content) || node.content.every(child => walk(child, depth + 1));
  };
  return walk(value, 0) && validateTree(schema, value).length === 0 && supportedReferences(value as SlidesDocument);
}

/** Resolve durable references in their native resource and container scopes. */
function supportedReferences(document: SlidesDocument): boolean {
  type Node = Record<string, unknown> & { stype: string; attributes?: Record<string, unknown>; content?: Node[] };
  const nodes: Node[] = [];
  const collect = (node: Node) => { nodes.push(node); node.content?.forEach(collect); };
  collect(document as Node);
  const definitions = new Map<string, Map<string, Node>>();
  for (const node of nodes) {
    const id = node.attributes?.id;
    if (id !== undefined) {
      if (typeof id !== 'string' || !id) return false;
      const group = definitions.get(node.stype) ?? new Map<string, Node>();
      if (group.has(id)) return false;
      group.set(id, node);
      definitions.set(node.stype, group);
    }
  }
  const referenceTypes: Record<string, string> = { layoutId: 'slideLayout', masterId: 'slideMaster',
    themeId: 'theme', trackId: 'motionTrack', noteId: 'surfaceNote', headerId: 'docHeader',
    footerId: 'docFooter', componentId: 'component' };
  for (const node of nodes) {
    const attrs = node.attributes ?? {};
    // Wire references use document-owned object IDs, never live session endpoints.
    if (node.stype === 'connector' && ((attrs.startNodeId !== undefined && attrs.startNodeId !== '') || (attrs.endNodeId !== undefined && attrs.endNodeId !== ''))) return false;
    for (const [key, stype] of Object.entries(referenceTypes)) {
      if (attrs[key] !== undefined && (typeof attrs[key] !== 'string' || !definitions.get(stype)?.has(attrs[key] as string))) return false;
    }
    if (attrs.goToKind !== undefined && !['page', 'back', 'next', 'previous', 'first', 'last'].includes(attrs.goToKind as string)) return false;
    // A cross-deck jump is an external intent. Its target cannot be resolved in this deck.
    if (attrs.goTo !== undefined && !attrs.goToDeck &&
      (attrs.goToKind === undefined || attrs.goToKind === 'page') &&
      !definitions.get('surface')?.has(attrs.goTo as string)) return false;
  }
  for (const container of nodes.filter(node => node.stype === 'surface' || node.stype === 'component')) {
    const shapes: Node[] = [];
    const visit = (node: Node) => { shapes.push(node); node.content?.forEach(visit); };
    container.content?.forEach(visit);
    const names = new Set<string>();
    for (const node of shapes) {
      const name = node.attributes?.name;
      if (name !== undefined && (node.stype === 'frame' || schema.getNodeType(node.stype)?.group === 'scene')) {
        if (typeof name !== 'string' || !name) return false;
        names.add(name);
      }
    }
    if (container.stype === 'component') {
      const parts = new Map<string, Node>();
      const variables = new Set<string>();
      for (const node of shapes) {
        const part = node.attributes?.partId;
        if (part !== undefined) {
          if (typeof part !== 'string' || !part || parts.has(part)) return false;
          parts.set(part, node);
        }
        if (node.stype === 'componentVar') {
          const name = node.attributes?.name;
          if (typeof name !== 'string' || !name || variables.has(name)) return false;
          variables.add(name);
        }
      }
      for (const node of shapes.filter(node => node.stype === 'componentBind')) {
        const attrs = node.attributes ?? {};
        const part = parts.get(attrs.part as string);
        if (!part || !variables.has(attrs.var as string) ||
          (attrs.attr !== 'text' && !schema.getNodeType(part.stype)?.attrs?.[attrs.attr as string])) return false;
      }
      for (const instance of nodes.filter(node => node.stype === 'instance' && node.attributes?.componentId === container.attributes?.id)) {
        if (instance.content?.some(node => node.stype === 'componentValue' && !variables.has(node.attributes?.name as string))) return false;
      }
    }
    const track = definitions.get('motionTrack')?.get(container.attributes?.trackId as string);
    for (const step of track?.content ?? []) {
      const attrs = step.attributes ?? {};
      if (attrs.target !== undefined && !names.has(attrs.target as string)) return false;
      if (attrs.on !== undefined && !names.has(attrs.on as string)) return false;
    }
  }
  return true;
}

export function readServerSlidesFile(text: string): { document: SlidesDocument; version: 1 | typeof DECK_FILE_VERSION } | { error: string } {
  try {
    // Match office-service's existing snapshot byte and full JSON traversal limits.
    if (new TextEncoder().encode(text).byteLength > 524288) return { error: 'slides_snapshot_too_large' };
    const envelope: unknown = JSON.parse(text);
    if (!record(envelope) || Object.keys(envelope).some(key => !['format', 'version', 'savedAt', 'document'].includes(key)) || envelope.format !== DECK_FORMAT || (envelope.version !== 1 && envelope.version !== DECK_FILE_VERSION) ||
      (envelope.savedAt !== undefined && typeof envelope.savedAt !== 'string') ||
      !supportedDocument(envelope.document)) return { error: 'invalid_slides_snapshot' };
    let visited = 0;
    const withinServiceLimits = (value: unknown, depth: number): boolean => {
      if (++visited > 10000 || depth > 100) return false;
      if (Array.isArray(value)) return value.every(child => withinServiceLimits(child, depth + 1));
      return !record(value) || Object.values(value).every(child => withinServiceLimits(child, depth + 1));
    };
    if (!withinServiceLimits(envelope.document, 0)) return { error: 'invalid_slides_snapshot' };
    assertSlidesNativeReferences(envelope.document);
    const read = readDeckFile(text);
    if ('error' in read) return read;
    return { document: envelope.document, version: envelope.version as 1 | typeof DECK_FILE_VERSION };
  } catch { return { error: 'invalid_slides_snapshot' }; }
}

/** The sanctioned file codec removes only session identifiers, preserving native metadata. */
export function serverSlidesFileText(document: unknown, savedAt?: string): string {
  const text = deckFileText(document, savedAt);
  if ('error' in readServerSlidesFile(text)) throw new Error('invalid_slides_snapshot');
  return text;
}

/** Dirty comparison ignores the envelope export timestamp; native metadata is never ignored. */
export function stableSlidesSnapshotText(text: string): string {
  const read = readServerSlidesFile(text);
  if ('error' in read) throw new Error(read.error);
  const ordered = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(ordered);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => [key, ordered(child)]));
    return value;
  };
  // Compare native values, while fixed requests retain their original serialized bytes.
  return JSON.stringify(ordered(read.document));
}
