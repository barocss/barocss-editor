import { readWordFile, wordFileText, getWordSchemaDefinition, WORD_FORMAT, WORD_FILE_VERSION } from '@barocss/office-word';
import { createSchema, validateTree } from '@barocss/schema';

export { WORD_FORMAT, WORD_FILE_VERSION };
export interface WordDocument {
  stype: 'document';
  content?: unknown[];
  attributes?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}
const schema = createSchema('server-word', getWordSchemaDefinition());
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/** Check the native tree before the local loader can normalize or replace it. */
function supportedDocument(value: unknown): value is WordDocument {
  if (!record(value) || value.stype !== 'document' || !Array.isArray(value.content)) return false;
  let count = 0;
  const walk = (node: unknown, depth: number): boolean => {
    if (!record(node) || depth > 100 || ++count > 100_000 || typeof node.stype !== 'string' ||
      !schema.hasNodeType(node.stype) || Object.hasOwn(node, 'sid') || Object.hasOwn(node, 'parentId') ||
      (node.attributes !== undefined && !record(node.attributes)) ||
      (node.metadata !== undefined && !record(node.metadata)) ||
      (node.text !== undefined && typeof node.text !== 'string') ||
      (node.content !== undefined && !Array.isArray(node.content))) return false;
    // Native Word uses fontSize:number and bookmark:name. The generic mark attribute
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
  return walk(value, 0) && validateTree(schema, value).length === 0;
}

export function readServerWordFile(text: string): { document: WordDocument; version: 1 } | { error: string } {
  try {
    // Match office-service's existing snapshot byte and full JSON traversal limits.
    if (new TextEncoder().encode(text).byteLength > 524288) return { error: 'word_snapshot_too_large' };
    const envelope: unknown = JSON.parse(text);
    if (!record(envelope) || Object.keys(envelope).some(key => !['format', 'version', 'savedAt', 'document'].includes(key)) || envelope.format !== WORD_FORMAT || envelope.version !== WORD_FILE_VERSION ||
      (envelope.savedAt !== undefined && typeof envelope.savedAt !== 'string') ||
      !supportedDocument(envelope.document)) return { error: 'invalid_word_snapshot' };
    let visited = 0;
    const withinServiceLimits = (value: unknown, depth: number): boolean => {
      if (++visited > 10000 || depth > 100) return false;
      if (Array.isArray(value)) return value.every(child => withinServiceLimits(child, depth + 1));
      return !record(value) || Object.values(value).every(child => withinServiceLimits(child, depth + 1));
    };
    if (!withinServiceLimits(envelope.document, 0)) return { error: 'invalid_word_snapshot' };
    const read = readWordFile(text);
    if ('error' in read) return read;
    return { document: envelope.document, version: 1 };
  } catch { return { error: 'invalid_word_snapshot' }; }
}

/** The sanctioned file codec removes only session identifiers, preserving native metadata. */
export function serverWordFileText(document: unknown, savedAt?: string): string {
  const text = wordFileText(document, savedAt);
  if ('error' in readServerWordFile(text)) throw new Error('invalid_word_snapshot');
  return text;
}

/** Dirty comparison ignores the envelope export timestamp; native metadata is never ignored. */
export function stableWordSnapshotText(text: string): string {
  const read = readServerWordFile(text);
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
