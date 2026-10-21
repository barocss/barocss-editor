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

export type Native2ReviewValue = null | boolean | number | string | readonly Native2ReviewValue[] | Native2ReviewObject;
export interface Native2ReviewObject { readonly [key: string]: Native2ReviewValue }
export interface Native2ParagraphReviewSegment {
  readonly index: number;
  readonly kind: 'inline-text' | 'page-reference';
  readonly native: Native2ReviewObject;
}
export interface Native2ParagraphReviewWitness {
  readonly version: 1;
  readonly kind: 'note-native2-paragraph-review';
  readonly pageId: string;
  readonly paragraphIndex: number;
  readonly nativePath: readonly [number];
  readonly snapshotText: string;
  readonly snapshotHash: string;
  readonly schemaBundle: RegistryBundle;
  readonly bundleHash: string;
  readonly paragraph: Native2ReviewObject;
  readonly paragraphJSON: string;
  readonly witnessHash: string;
  readonly segments: readonly Native2ParagraphReviewSegment[];
}
export declare class Native2ParagraphReviewError extends Error {
  readonly code: 'native2_paragraph_review_invalid_target' | 'native2_paragraph_review_too_large';
  constructor(code: 'native2_paragraph_review_invalid_target' | 'native2_paragraph_review_too_large');
}
export declare function captureNative2ParagraphReview(snapshotText: string, paragraphIndex: number): Native2ParagraphReviewWitness;
