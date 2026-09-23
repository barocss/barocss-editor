import { normalizeProseTree } from '@barocss/office-text';
import { documentFileFormat } from '@barocss/shared';
import { createSchema, validateTree } from '@barocss/schema';
import { getNoteSchemaDefinition, isNotePageId } from './note-schema';

export { isNotePageId } from './note-schema';

export interface NoteDocument {
  stype: 'note';
  attributes: { title: string; pageId?: string };
  content: unknown[];
}

export const NOTE_FILE_FORMAT = 'barocss-note';
export const NOTE_FILE_VERSION = 1;

const format = documentFileFormat({
  format: NOTE_FILE_FORMAT, noun: '노트', version: NOTE_FILE_VERSION, extension: '.note.json'
});

/** Serialize a Note file without reading the clock. Call readNoteFile first for input validation. */
export function serializeNoteFile(document: NoteDocument, options: { savedAt?: string } = {}): string {
  if (document.attributes.pageId !== undefined && !isNotePageId(document.attributes.pageId)) throw new Error('이 노트의 페이지 ID가 올바르지 않습니다.');
  const { savedAt } = options;
  if (savedAt !== undefined && (typeof savedAt !== 'string' || savedAt.length === 0)) throw new Error('이 노트의 저장 시각이 올바르지 않습니다.');
  return format.text(document, savedAt);
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
export function readNoteSnapshotFile(text: string): { document: NoteDocument; savedAt?: string } | { error: string } {
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

  const previousPageId = read.document.attributes.pageId;
  if (previousPageId === newPageId) throw new Error('새 노트의 페이지 ID는 원본과 달라야 합니다.');
  const copy = structuredClone(read.document);
  copy.attributes.pageId = newPageId;

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
    snapshotText: serializeNoteFile(copy, { savedAt: read.savedAt }),
    pageId: newPageId
  };
}
