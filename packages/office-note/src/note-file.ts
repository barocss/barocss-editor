import { normalizeProseTree } from '@barocss/office-text';
import { documentFileFormat, documentLibrary } from '@barocss/shared';
import { createSchema, validateTree } from '@barocss/schema';
import { getNoteSchemaDefinition, isNotePageId } from './note-schema';
export { isNotePageId } from './note-schema';

export interface NoteDocument {
  stype: 'note';
  attributes: { title: string; pageId?: string };
  content: unknown[];
}

const format = documentFileFormat({
  format: 'barocss-note', noun: '노트', version: 1, extension: '.note.json'
});

export const noteLibrary = documentLibrary({ db: 'barocss-note', store: 'documents' });
export function noteFileText(document: NoteDocument): string {
  if (document.attributes.pageId !== undefined && !isNotePageId(document.attributes.pageId)) throw new Error('이 노트의 페이지 ID가 올바르지 않습니다.');
  return format.text(document, new Date().toISOString());
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
