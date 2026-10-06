export declare const NOTE_FILE_FORMAT: 'barocss-note';
export declare const NOTE_FILE_VERSION: 1;
export declare const NOTE_NATIVE_FILE_VERSION: 2;
export type { RegistryBundle } from '@barocss/schema/registry-contract';
import type { RegistryBundle } from '@barocss/schema/registry-contract';

export interface NoteDocument {
  stype: 'note';
  attributes: { title: string; pageId?: string };
  content: unknown[];
}

export interface NoteNativeDocument {
  stype: 'note'; attributes?: { title?: string; pageId?: string; [key: string]: unknown };
  content: unknown[]; [key: string]: unknown;
}
export interface NoteNativeOptions { fileVersion: number; schemaBundle: unknown; savedAt?: string }
export type NoteSnapshot = { document: NoteDocument; savedAt?: string } |
  { document: NoteNativeDocument; fileVersion: 2; schemaBundle: RegistryBundle; savedAt?: string };

export declare function serializeNoteFile(document: NoteDocument, options?: { savedAt?: string }): string;
export declare function serializeNoteFile(document: unknown, options: NoteNativeOptions): string;
export declare function readNoteSnapshotFile(text: string): NoteSnapshot | { error: string };
export declare function readNoteV1SnapshotFile(text: string): { document: NoteDocument; savedAt?: string } | { error: string };
export declare function copyNoteSnapshotFile(sourceText: string, newPageId: string): { snapshotText: string; pageId: string } | { error: string };
export {
  NOTE_FULL_SEED_V2, parseFullNoteSeedSource, createFullNoteSeed,
  decodeFullNoteSeedTree, typedFullNoteSeedTree, canonicalFullNoteSeedHash,
  createInitialFullNoteSeedRoot, decodeFullNoteSeedRoot,
  decodeInitialFullNoteSeedRoot,
  type FullNoteSeed, type FullNoteSeedNode, type FullNoteSeedSource,
  type FullNoteSeedMarker, type FullNoteEditProof, type FullNoteSeedRoot
} from './src/note-full-seed-v2';
