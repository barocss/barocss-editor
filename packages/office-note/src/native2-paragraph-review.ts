import { registrySha256 } from '../../schema/src/registry-sha256';
import type { RegistryBundle } from './note-file-codec';
import { assertSupportedNativeNoteDocument, createNoteNative2Context } from './native2-context';

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
export class Native2ParagraphReviewError extends Error {
  constructor(public readonly code: 'native2_paragraph_review_invalid_target' | 'native2_paragraph_review_too_large') { super(code); }
}
const invalid = (): never => { throw new Native2ParagraphReviewError('native2_paragraph_review_invalid_target'); };
function json(value: unknown): value is Native2ReviewValue {
  if (value === null || ['string', 'boolean'].includes(typeof value)) return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(json);
  return !!value && typeof value === 'object' && Object.values(value).every(json);
}
function object(value: unknown): value is Native2ReviewObject {
  return !!value && typeof value === 'object' && !Array.isArray(value) && json(value);
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function hash(text: string): string {
  try { return registrySha256(text); }
  catch { throw new Native2ParagraphReviewError('native2_paragraph_review_too_large'); }
}

/** Pure whole-source intrinsic admission and witness data. No model, grant, write or Apply capability. */
export function captureNative2ParagraphReview(snapshotText: string, paragraphIndex: number): Native2ParagraphReviewWitness {
  const context = createNoteNative2Context(snapshotText);
  assertSupportedNativeNoteDocument(context.document);
  if (!Number.isSafeInteger(paragraphIndex) || paragraphIndex < 0) return invalid();
  const pageId = context.document.attributes?.pageId;
  const paragraph = context.document.content[paragraphIndex];
  if (typeof pageId !== 'string' || !object(paragraph) || paragraph.stype !== 'paragraph' ||
    !Array.isArray(paragraph.content) || !paragraph.content.length) return invalid();
  let hasText = false;
  const segments: Native2ParagraphReviewSegment[] = paragraph.content.map((child, index) => {
    if (!object(child)) return invalid();
    if (child.stype === 'inline-text' && typeof child.text === 'string') {
      if (child.text.trim()) hasText = true;
      return { index, kind: 'inline-text', native: child };
    }
    if (child.stype === 'pageReference') return { index, kind: 'page-reference', native: child };
    return invalid();
  });
  if (!hasText) return invalid();
  const nativePath: [number] = [paragraphIndex];
  const paragraphJSON = JSON.stringify(paragraph);
  return freeze({ version: 1, kind: 'note-native2-paragraph-review', pageId, paragraphIndex, nativePath,
    snapshotText, snapshotHash: hash(snapshotText), schemaBundle: context.schemaBundle,
    bundleHash: hash(JSON.stringify(['wonffice.note.paragraph.review.bundle.v1', context.schemaBundle])),
    paragraph, paragraphJSON,
    witnessHash: hash(JSON.stringify(['wonffice.note.paragraph.review.witness.v1', pageId, nativePath, paragraphJSON])), segments });
}
