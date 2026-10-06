import { normalizeProseTree } from '@barocss/office-text';
import { documentFileFormat } from '@barocss/shared';
import { createSchema, validateTree, Validator } from '@barocss/schema';
import { getNoteSchemaDefinition, isNotePageId } from './note-schema';

import { parseNativeJson, nativeJsonData, validateRegistryBundle, canonicalRegistryJson, SchemaContractError,
  type RegistryBundle, type RegistryDefinition } from '@barocss/schema/registry-contract';

export { isNotePageId } from './note-schema';

export interface NoteDocument {
  stype: 'note';
  attributes: { title: string; pageId?: string };
  content: unknown[];
}

export const NOTE_FILE_FORMAT = 'barocss-note';
export const NOTE_FILE_VERSION = 1;
export const NOTE_NATIVE_FILE_VERSION = 2;
export type { RegistryBundle } from '@barocss/schema/registry-contract';

/** Validated raw native data: omitted title/attributes remain omitted. */
export interface NoteNativeDocument {
  stype: 'note';
  attributes?: { title?: string; pageId?: string; [key: string]: unknown };
  content: unknown[];
  [key: string]: unknown;
}
export interface NoteNativeOptions { fileVersion: number; schemaBundle: unknown; savedAt?: string }
export type NoteSnapshot = { document: NoteDocument; savedAt?: string } |
  { document: NoteNativeDocument; fileVersion: 2; schemaBundle: RegistryBundle; savedAt?: string };


const format = documentFileFormat({
  format: NOTE_FILE_FORMAT, noun: '노트', version: NOTE_FILE_VERSION, extension: '.note.json'
});

/** Serialize a Note file without reading the clock. Call readNoteFile first for input validation. */
export function serializeNoteFile(document: NoteDocument, options?: { savedAt?: string }): string;
export function serializeNoteFile(document: unknown, options: NoteNativeOptions): string;
export function serializeNoteFile(document: unknown, options: { savedAt?: string; fileVersion?: number; schemaBundle?: unknown } = {}): string {
  const explicit = 'fileVersion' in options || 'schemaBundle' in options;
  const checked = explicit ? nativeJsonData(options) : options, context = record(checked, 'invalid_native_context');
  if (explicit && Object.keys(context).some(k => !['savedAt', 'fileVersion', 'schemaBundle'].includes(k))) nativeFail('invalid_native_context');
  if (Object.hasOwn(context, 'fileVersion') || Object.hasOwn(context, 'schemaBundle')) {
    if (context.fileVersion !== 2 || !Object.hasOwn(context, 'schemaBundle')) nativeFail('invalid_native_context');
    const copy = nativeJsonData(document);
    stripNodeSessionFields(copy);
    const envelope = { format: NOTE_FILE_FORMAT, version: 2, schemaBundle: context.schemaBundle, document: copy,
      ...(Object.hasOwn(context, 'savedAt') ? { savedAt: context.savedAt } : {}) };
    const text = JSON.stringify(envelope, null, 2) + '\n';
    decodeNative2(text);
    return text;
  }
  // Keep the legacy writer and messages. Schema-aware callers must supply explicit context.
  const legacy = document as NoteDocument;
  if (legacy.attributes.pageId !== undefined && !isNotePageId(legacy.attributes.pageId)) throw new Error('이 노트의 페이지 ID가 올바르지 않습니다.');
  const { savedAt } = options;
  if (savedAt !== undefined && (typeof savedAt !== 'string' || savedAt.length === 0)) throw new Error('이 노트의 저장 시각이 올바르지 않습니다.');
  return format.text(legacy, savedAt);
}

export const noteFileName = (title: string) => format.fileName(title, '새 노트');

function isTree(value: unknown, depth = 0): boolean {
  if (!value || typeof value !== 'object' || depth > 100) return false;
  const node = value as { stype?: unknown; content?: unknown; text?: unknown };
  return typeof node.stype === 'string'
    && (node.text === undefined || typeof node.text === 'string')
    && (node.content === undefined || (Array.isArray(node.content) && node.content.every(child => isTree(child, depth + 1))));
}

export function readNoteFile(text: string): { document: NoteDocument } | { error: string } {
  const read = format.read(text);
  if ('error' in read) return read;
  const envelope = JSON.parse(text) as Record<string, unknown>;
  const raw = read.document as { attributes?: unknown };
  const attributes = raw.attributes;
  if (read.version === 1 && (Object.hasOwn(envelope, 'schemaLock') || Object.hasOwn(envelope, 'schemaBundle') ||
    attributes !== null && typeof attributes === 'object' && !Array.isArray(attributes) && Object.hasOwn(attributes, 'schemaRef'))) {
    return { error: '이 노트 파일 버전은 스키마 고정을 지원하지 않습니다.' };
  }
  const doc = normalizeProseTree(read.document) as Partial<NoteDocument>;
  if (doc.stype !== 'note' || !Array.isArray(doc.content) || !isTree(doc)) {
    return { error: '이 파일에는 올바른 노트 본문이 없습니다.' };
  }
  const pageId = doc.attributes?.pageId;
  if (pageId !== undefined && !isNotePageId(pageId)) return { error: '이 파일의 페이지 ID가 올바르지 않습니다.' };
  const findings = validateTree(createSchema('note-file', getNoteSchemaDefinition()), doc);
  if (findings.length) return { error: `이 파일에는 지원하지 않거나 올바르지 않은 블록이 있습니다: ${findings[0].path}` };
  return { document: { stype: 'note', attributes: { title: typeof doc.attributes?.title === 'string' ? doc.attributes.title : '새 노트', ...(pageId !== undefined ? { pageId } : {}) }, content: doc.content } };
}

/** Read a server migration input without losing its optional savedAt field. A nonempty string is kept verbatim; its date syntax is not checked. */
export function readNoteV1SnapshotFile(text: string): { document: NoteDocument; savedAt?: string } | { error: string } {
  const read = readNoteFile(text);
  if ('error' in read) return read;
  const envelope = JSON.parse(text) as Record<string, unknown>;
  if (!Object.hasOwn(envelope, 'savedAt')) return read;
  if (typeof envelope.savedAt !== 'string' || envelope.savedAt.length === 0) {
    return { error: '이 파일의 저장 시각이 올바르지 않습니다.' };
  }
  return { ...read, savedAt: envelope.savedAt };
}

/** Build the Note C copy after the server has minted a new page ID. Malformed input returns an error; an invalid or unchanged server ID throws. */
export function copyNoteSnapshotFile(sourceText: string, newPageId: string): { snapshotText: string; pageId: string } | { error: string } {
  if (!isNotePageId(newPageId)) throw new Error('새 노트의 페이지 ID가 올바르지 않습니다.');
  const read = readNoteSnapshotFile(sourceText);
  if ('error' in read) return read;

  const previousPageId = read.document.attributes?.pageId;
  if (previousPageId === newPageId) throw new Error('새 노트의 페이지 ID는 원본과 달라야 합니다.');
  const copy = structuredClone(read.document);
  copy.attributes = { ...copy.attributes, pageId: newPageId };

  if (previousPageId) {
    const remap = (value: unknown): void => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return;
      const node = value as { stype?: string; attributes?: Record<string, unknown>; content?: unknown[] };
      if (node.stype === 'pageReference' && node.attributes?.pageId === previousPageId) node.attributes.pageId = newPageId;
      node.content?.forEach(remap);
    };
    remap(copy);
  }

  return {
    snapshotText: 'fileVersion' in read
      ? serializeNoteFile(copy, { fileVersion: 2, schemaBundle: read.schemaBundle,
        ...(read.savedAt !== undefined ? { savedAt: read.savedAt } : {}) })
      : serializeNoteFile(copy as NoteDocument, { savedAt: read.savedAt }),
    pageId: newPageId
  };
}


function nativeFail(reason: string): never { throw new SchemaContractError(reason); }
function record(value: unknown, reason: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return nativeFail(reason);
  return value as Record<string, unknown>;
}
function stripNodeSessionFields(value: unknown): void {
  const node = record(value, 'invalid_native_node');
  delete node.sid; delete node.parentId;
  if (Array.isArray(node.content)) node.content.forEach(stripNodeSessionFields);
}
function validateDataset(attributes: Record<string, unknown>, selected: readonly RegistryDefinition[]): void {
  if (attributes.kind !== undefined && attributes.kind !== 'inline') nativeFail('unsupported_native_dataset');
  if (!Array.isArray(attributes.fields) || !attributes.fields.length || attributes.fields.length > 128) nativeFail('invalid_native_dataset');
  const fields = new Map<string, Record<string, unknown>>();
  for (const item of attributes.fields) {
    const field = record(item, 'invalid_native_field');
    if (typeof field.name !== 'string' || !field.name || fields.has(field.name)) nativeFail('invalid_native_field');
    if (!['text', 'number', 'boolean', 'choice'].includes(String(field.kind))) nativeFail('unsupported_field_kind');
    if (field.kind === 'choice' && (!Array.isArray(field.options) || !field.options.length ||
      field.options.some(option => typeof option !== 'string' || !option) || new Set(field.options).size !== field.options.length)) nativeFail('invalid_choice');
    if (field.kind !== 'choice' && Object.hasOwn(field, 'options')) nativeFail('invalid_native_field');
    fields.set(field.name, field);
  }
  // Same-name declarations must agree. A name is not a schema-to-node identity binding.
  const named = selected.filter(d => d.dataset.name === attributes.name);
  if (named.some(d => canonicalRegistryJson(d.dataset.fields) !== canonicalRegistryJson(attributes.fields))) nativeFail('native_dataset_schema_mismatch');
  if (Object.hasOwn(attributes, 'rowIds')) {
    if (!Array.isArray(attributes.rowIds) || attributes.rowIds.some(id => typeof id !== 'string' || !id) ||
      new Set(attributes.rowIds).size !== attributes.rowIds.length) nativeFail('invalid_native_row_ids');
  }
  if (Object.hasOwn(attributes, 'records')) {
    if (!Array.isArray(attributes.records)) nativeFail('invalid_native_records');
    if (Array.isArray(attributes.rowIds) && attributes.rowIds.length !== attributes.records.length) nativeFail('invalid_native_row_ids');
    for (const value of attributes.records) {
      const row = record(value, 'invalid_native_record');
      for (const [name, cell] of Object.entries(row)) {
        const field = fields.get(name);
        if (!field) nativeFail('unknown_native_field');
        if (field.kind === 'text' && typeof cell !== 'string' || field.kind === 'number' && typeof cell !== 'number' ||
          field.kind === 'boolean' && typeof cell !== 'boolean' || field.kind === 'choice' &&
          !(field.options as unknown[]).includes(cell)) nativeFail('invalid_native_field_value');
      }
    }
  }
}
function validateNativeDocument(value: unknown, selected: readonly RegistryDefinition[]): asserts value is NoteNativeDocument {
  const root = record(value, 'invalid_native_document');
  if (root.stype !== 'note' || !Array.isArray(root.content)) nativeFail('invalid_native_document');
  const schema = createSchema('note-native-file', getNoteSchemaDefinition());
  const walk = (value: unknown): void => {
    const node = record(value, 'invalid_native_node');
    if (typeof node.stype !== 'string' || !schema.hasNodeType(node.stype)) nativeFail('unsupported_native_node');
    if (Object.hasOwn(node, 'sid') || Object.hasOwn(node, 'parentId')) nativeFail('session_native_field');
    if (Object.hasOwn(node, 'attrs')) nativeFail('ambiguous_native_attributes');
    const attributes = Object.hasOwn(node, 'attributes') ? record(node.attributes, 'invalid_native_attributes') : {};
    if (node === root && Object.hasOwn(attributes, 'schemaRef')) nativeFail('ambiguous_schema_pin');
    const definition = schema.getNodeType(node.stype)!;
    if (Object.entries(definition.attrs ?? {}).some(([key]) => Object.hasOwn(attributes, key) && attributes[key] === null)) nativeFail('invalid_native_attribute');
    if (Object.hasOwn(node, 'metadata') && node.metadata !== null) record(node.metadata, 'invalid_native_metadata');
    if (Object.hasOwn(node, 'text') && (node.stype !== 'inline-text' || typeof node.text !== 'string')) nativeFail('invalid_native_text');
    if (node.stype === 'inline-text' && typeof node.text !== 'string') nativeFail('invalid_native_text');
    if (Object.hasOwn(node, 'content') && !Array.isArray(node.content)) nativeFail('invalid_native_content');
    if (Object.hasOwn(node, 'marks')) {
      if (!Array.isArray(node.marks) || node.stype !== 'inline-text') nativeFail('invalid_native_marks');
      for (const item of node.marks) {
        const mark = record(item, 'invalid_native_mark');
        if (typeof mark.stype !== 'string') nativeFail('invalid_native_mark');
        if (Object.keys(mark).some(key => !['stype', 'attributes', 'range'].includes(key))) nativeFail('unsupported_native_mark_member');
        // Native2 codec syntax only: preserve 'strike' verbatim, without installing a renderer or schema.
        const declared = schema.getMarkType(mark.stype === 'strike' ? 'strikethrough' : mark.stype);
        if (!declared) nativeFail('unsupported_native_mark');
        const attrs = Object.hasOwn(mark, 'attributes') ? record(mark.attributes, 'invalid_native_mark_attributes') : {};
        if (Object.hasOwn(mark, 'attrs')) nativeFail('ambiguous_native_attributes');
        if (Object.entries(declared.attrs ?? {}).some(([key]) => Object.hasOwn(attrs, key) && attrs[key] === null) ||
          !Validator.validateAttributes(declared.attrs ?? {}, attrs).valid) nativeFail('invalid_native_mark_attributes');
        if (Object.hasOwn(mark, 'range')) {
          const range = mark.range;
          if (!Array.isArray(range) || range.length !== 2 || !range.every(Number.isSafeInteger) ||
            range[0] < 0 || range[1] < range[0] || range[1] > (node.text as string).length) nativeFail('invalid_native_mark_range');
        }
      }
    }
    if (node.stype === 'dataset') validateDataset(attributes, selected);
    if (Array.isArray(node.content)) node.content.forEach(walk);
  };
  walk(root);
  if (validateTree(schema, root).length) nativeFail('invalid_native_tree');
}
function decodeNative2(text: string): Extract<NoteSnapshot, { fileVersion: 2 }> {
  const envelope = record(parseNativeJson(text), 'invalid_native_envelope');
  if (Object.keys(envelope).some(k => !['format', 'version', 'schemaBundle', 'document', 'savedAt'].includes(k)) ||
    !['format', 'version', 'schemaBundle', 'document'].every(k => Object.hasOwn(envelope, k))) nativeFail('invalid_native_envelope');
  if (envelope.format !== NOTE_FILE_FORMAT || envelope.version !== 2) nativeFail('unsupported_native_version');
  if (Object.hasOwn(envelope, 'savedAt') && (typeof envelope.savedAt !== 'string' || !envelope.savedAt.length)) nativeFail('invalid_native_saved_at');
  const validated = validateRegistryBundle(envelope.schemaBundle);
  validateNativeDocument(envelope.document, validated.selectedDefinitions);
  return { document: envelope.document, fileVersion: 2, schemaBundle: validated.bundle,
    ...(typeof envelope.savedAt === 'string' ? { savedAt: envelope.savedAt } : {}) };
}
/** Schema context is explicit on native2 successes; legacy callers use the v1-only reader. */
export function readNoteSnapshotFile(text: string): NoteSnapshot | { error: string } {
  // Dispatch only; strict native parsing below checks duplicate decoded keys before admission.
  let envelope: unknown;
  try { parseNativeJson(text); } catch (error) {
    if (error instanceof Error && error.message === 'duplicate_definition_key') return { error: error.message };
  }
  try { envelope = JSON.parse(text); } catch { return readNoteV1SnapshotFile(text); }
  if (envelope && typeof envelope === 'object' && !Array.isArray(envelope) &&
    (envelope as Record<string, unknown>).version === 2) {
    try { return decodeNative2(text); }
    catch (error) { return { error: error instanceof Error ? error.message : 'invalid_native_file' }; }
  }
  return readNoteV1SnapshotFile(text);
}
