import { documentLibrary } from '@barocss/shared';
import { serializeNoteFile, type NoteDocument } from './note-file-codec';

export { isNotePageId, noteFileName, readNoteFile, serializeNoteFile, type NoteDocument } from './note-file-codec';

export const noteLibrary = documentLibrary({ db: 'barocss-note', store: 'documents' });

export function noteFileText(document: NoteDocument): string {
  return serializeNoteFile(document, { savedAt: new Date().toISOString() });
}
