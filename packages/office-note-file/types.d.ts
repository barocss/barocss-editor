export declare const NOTE_FILE_FORMAT: 'barocss-note';
export declare const NOTE_FILE_VERSION: 1;

export interface NoteDocument {
  stype: 'note';
  attributes: { title: string; pageId?: string };
  content: unknown[];
}

export declare function serializeNoteFile(document: NoteDocument, options?: { savedAt?: string }): string;
export declare function readNoteSnapshotFile(text: string): { document: NoteDocument; savedAt?: string } | { error: string };
export declare function copyNoteSnapshotFile(sourceText: string, newPageId: string): { snapshotText: string; pageId: string } | { error: string };
export {
  NOTE_FULL_SEED_V2, parseFullNoteSeedSource, createFullNoteSeed,
  decodeFullNoteSeedTree, typedFullNoteSeedTree, canonicalFullNoteSeedHash,
  createInitialFullNoteSeedRoot, decodeFullNoteSeedRoot,
  decodeInitialFullNoteSeedRoot,
  type FullNoteSeed, type FullNoteSeedNode, type FullNoteSeedSource,
  type FullNoteSeedMarker, type FullNoteEditProof, type FullNoteSeedRoot
} from './src/note-full-seed-v2';
