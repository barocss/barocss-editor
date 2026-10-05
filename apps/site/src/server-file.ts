import { readSiteFile, siteFileText, getSiteSchemaDefinition, createSiteEditor, refsIn, refFaults, SITE_FORMAT, SITE_FILE_VERSION } from '@barocss/office-site';
import { createSchema, validateTree } from '@barocss/schema';

export { SITE_FORMAT, SITE_FILE_VERSION };
export interface SiteDocument {
  stype: 'document';
  content?: unknown[];
  attributes?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}
const schema = createSchema('server-site', getSiteSchemaDefinition());
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/** Direct root resources resolve by type and exact durable name, never by row or session ID. */
export function hasUniqueSiteResourceIdentities(value: unknown): boolean {
  if (!record(value) || value.stype !== 'document' || !Array.isArray(value.content)) return false;
  const richTextIds = new Set<string>(), datasetNames = new Set<string>();
  for (const box of value.content) {
    if (!record(box) || box.stype !== 'resources' || !Array.isArray(box.content)) continue;
    for (const resource of box.content) {
      if (!record(resource) || !record(resource.attributes)) continue;
      const identities = resource.stype === 'richText' ? richTextIds : resource.stype === 'dataset' ? datasetNames : undefined;
      const identity = resource.stype === 'richText' ? resource.attributes.id : resource.attributes.name;
      if (!identities || typeof identity !== 'string' || !identity) continue;
      if (identities.has(identity)) return false;
      identities.add(identity);
    }
  }
  return true;
}

/** Check the native tree before the local loader can normalize or replace it. */
function supportedDocument(value: unknown): value is SiteDocument {
  if (!record(value) || value.stype !== 'document' || !Array.isArray(value.content)) return false;
  let count = 0;
  const walk = (node: unknown, depth: number): boolean => {
    if (!record(node) || Object.keys(node).some(key => !['stype', 'attributes', 'metadata', 'text', 'marks', 'content'].includes(key)) || depth > 100 || ++count > 10000 || typeof node.stype !== 'string' ||
      !schema.hasNodeType(node.stype) || Object.hasOwn(node, 'sid') || Object.hasOwn(node, 'parentId') ||
      (node.attributes !== undefined && !record(node.attributes)) ||
      (node.metadata !== undefined && !record(node.metadata)) ||
      (node.text !== undefined && typeof node.text !== 'string') ||
      (node.content !== undefined && !Array.isArray(node.content))) return false;
    // Keep Site's existing inline mark payloads intact. The shared native mark
    // shape supports fields the generic attribute validator does not describe.
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
  return walk(value, 0) && validateTree(schema, value).length === 0;
}

export function readServerSiteFile(text: string): { document: SiteDocument; version: 1 } | { error: string } {
  try {
    // Match office-service's existing snapshot byte and full JSON traversal limits.
    if (new TextEncoder().encode(text).byteLength > 524288) return { error: 'site_snapshot_too_large' };
    const envelope: unknown = JSON.parse(text);
    if (!record(envelope) || Object.keys(envelope).some(key => !['format', 'version', 'savedAt', 'document'].includes(key)) || envelope.format !== SITE_FORMAT || envelope.version !== SITE_FILE_VERSION ||
      (envelope.savedAt !== undefined && typeof envelope.savedAt !== 'string') ||
      !supportedDocument(envelope.document)) return { error: 'invalid_site_snapshot' };
    let visited = 0;
    const withinServiceLimits = (value: unknown, depth: number): boolean => {
      if (++visited > 10000 || depth > 100) return false;
      if (Array.isArray(value)) return value.every(child => withinServiceLimits(child, depth + 1));
      return !record(value) || Object.values(value).every(child => withinServiceLimits(child, depth + 1));
    };
    if (!withinServiceLimits(envelope.document, 0)) return { error: 'invalid_site_snapshot' };
    if (!hasUniqueSiteResourceIdentities(envelope.document)) return { error: 'duplicate_site_resource_identity' };
    const read = readSiteFile(text);
    if ('error' in read) return read;
    // Resolve through Site's existing native index before any live host loads it.
    // Unreferenced resources remain valid native data; unresolved targets do not.
    const native = createSiteEditor({ kit: [], schema });
    try {
      native.loadDocument(structuredClone(envelope.document));
      const access = { rootId: native.getRootId()!, getNode: (sid: string) => native.dataStore.getNode(sid) };
      if (refFaults(access, refsIn(access)).some(fault => fault.kind !== 'orphan')) return { error: 'unresolved_site_reference' };
    } finally { native.destroy(); }
    return { document: envelope.document, version: 1 };
  } catch { return { error: 'invalid_site_snapshot' }; }
}

/** The sanctioned file codec removes only session identifiers, preserving native metadata. */
export function serverSiteFileText(document: unknown, savedAt?: string): string {
  const text = siteFileText(document, savedAt);
  if ('error' in readServerSiteFile(text)) throw new Error('invalid_site_snapshot');
  return text;
}

/** Dirty comparison ignores the envelope export timestamp; native metadata is never ignored. */
export function stableSiteSnapshotText(text: string): string {
  const read = readServerSiteFile(text);
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
