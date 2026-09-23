import {
  NOTE_FILE_FORMAT as format,
  NOTE_FILE_VERSION as version,
  copyNoteSnapshotFile as copy,
  readNoteSnapshotFile as read,
  serializeNoteFile as serialize
} from '@barocss/office-note/file';

export const NOTE_FILE_FORMAT = format;
export const NOTE_FILE_VERSION = version;

export interface NoteDocument {
  stype: 'note';
  attributes: { title: string; pageId?: string };
  content: unknown[];
}

export function serializeNoteFile(document: NoteDocument, options?: { savedAt?: string }): string {
  return serialize(document, options);
}

export function readNoteSnapshotFile(text: string): { document: NoteDocument; savedAt?: string } | { error: string } {
  return read(text);
}

export function copyNoteSnapshotFile(sourceText: string, newPageId: string): { snapshotText: string; pageId: string } | { error: string } {
  return copy(sourceText, newPageId);
}
