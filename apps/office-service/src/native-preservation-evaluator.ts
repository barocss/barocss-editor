import { createHash } from 'node:crypto';
import { compareCriterionContext, type CriterionContext } from '@barocss/office-word/criterion-confirmation';

export const NATIVE_PRESERVATION_EVALUATOR: Readonly<{ id: 'word-paragraph-preserved'; version: 1; definition: string }> = Object.freeze({
  id: 'word-paragraph-preserved', version: 1,
  definition: 'Only the exact authored requirement sentence "Preserve the linked decision paragraph exactly as pinned." declares this condition. Compare the complete uniquely bookmarked native decision paragraph with its confirmed pinned Word reference. Require the same business pair and resolved native context for a pass. Missing or ambiguous coverage never passes.'
});
export const NATIVE_PRESERVATION_SENTENCE = 'Preserve the linked decision paragraph exactly as pinned.';

export type NativePreservationEvaluation =
  | { status: 'passed' | 'failed'; referenceParagraphText: string; resultParagraphText: string;
      referenceParagraphHash: string; resultParagraphHash: string }
  | { status: 'unsupported'; reason: string };

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const hash = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (object(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
}
function nativeFile(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(text);
    if (!object(parsed) || parsed.format !== 'barocss-word' || parsed.version !== 1 || !object(parsed.document)
      || parsed.document.stype !== 'document' || !Array.isArray(parsed.document.content)) return null;
    return parsed.document;
  } catch { return null; }
}
function paragraph(document: Record<string, unknown>, bookmarkId: string): { status: 'found'; text: string } | { status: 'unsupported'; reason: string } {
  const matches: Record<string, unknown>[] = [];
  let malformed = false;
  const visit = (value: unknown, owner?: Record<string, unknown>): void => {
    if (!object(value) || typeof value.stype !== 'string' || value.content !== undefined && !Array.isArray(value.content)) { malformed = true; return; }
    const current = value.stype === 'paragraph' ? value : owner;
    if (value.stype === 'bookmarkAnchor' && object(value.attributes) && value.attributes.id === bookmarkId) {
      if (!current) malformed = true; else matches.push(current);
    }
    if (Array.isArray(value.content)) value.content.forEach(child => visit(child, current));
  };
  visit(document);
  if (malformed) return { status: 'unsupported', reason: 'invalid_native_tree' };
  if (matches.length !== 1) return { status: 'unsupported', reason: matches.length ? 'ambiguous_paragraph' : 'missing_paragraph' };
  return { status: 'found', text: JSON.stringify(stable(matches[0])) };
}
// These visible text styles are declared in Word's inherited Office marks.
// Annotation, revision, hidden-text and unknown marks do not establish an authored condition.
const formatMarkAttrs: Record<string, readonly string[]> = {
  bold: ['weight'], italic: ['style'], underline: ['style'], strikethrough: ['style'], code: ['language']
};
function ordinaryFormatting(marks: unknown, textLength: number): boolean {
  if (marks === undefined) return true;
  if (!Array.isArray(marks)) return false;
  return marks.every(mark => {
    if (!object(mark) || typeof mark.stype !== 'string' || !Object.hasOwn(formatMarkAttrs, mark.stype)
      || Object.keys(mark).some(key => !['stype', 'range', 'attrs'].includes(key))
      || !Array.isArray(mark.range) || mark.range.length !== 2) return false;
    const [start, end]: unknown[] = mark.range;
    if (typeof start !== 'number' || typeof end !== 'number' || !Number.isInteger(start) || !Number.isInteger(end)
      || start < 0 || end > textLength || start >= end) return false;
    if (mark.attrs === undefined) return true;
    const allowedAttrs = formatMarkAttrs[mark.stype];
    return object(mark.attrs) && Object.entries(mark.attrs).every(([key, value]) =>
      allowedAttrs.includes(key) && typeof value === 'string');
  });
}
function authoredCondition(paragraphText: string): boolean {
  const parsed: unknown = JSON.parse(paragraphText);
  if (!object(parsed) || !Array.isArray(parsed.content)) return false;
  let sentence = '', anchors = 0;
  for (const child of parsed.content) {
    if (!object(child)) return false;
    if (child.stype === 'bookmarkAnchor') { anchors++; continue; }
    if (child.stype !== 'inline-text' || typeof child.text !== 'string' || child.content !== undefined
      || child.attributes !== undefined || !ordinaryFormatting(child.marks, child.text.length)) return false;
    sentence += child.text;
  }
  return anchors === 1 && sentence === NATIVE_PRESERVATION_SENTENCE;
}

/** This pure comparison does not accept a model verdict or choose a newer reference. */
export function evaluateNativePreservation(context: CriterionContext, sourceSnapshotText: string,
  resultSnapshotText: string): NativePreservationEvaluation {
  const unsupported = (reason: string): NativePreservationEvaluation => ({ status: 'unsupported', reason });
  if (!compareCriterionContext(sourceSnapshotText, context)) return unsupported('criterion_source_mismatch');
  const requirement = nativeFile(context.requirement.snapshotText), reference = nativeFile(context.decision.snapshotText);
  const source = nativeFile(sourceSnapshotText), result = nativeFile(resultSnapshotText);
  if (!requirement || !reference || !source || !result) return unsupported('invalid_native_file');
  const condition = paragraph(requirement, context.requirement.locator.bookmarkId);
  if (condition.status === 'unsupported') return condition;
  if (!authoredCondition(condition.text)) return unsupported('unregistered_preservation_condition');
  const sourcePair = object(source.metadata) ? source.metadata.wonfficeBusinessPair : undefined;
  const resultPair = object(result.metadata) ? result.metadata.wonfficeBusinessPair : undefined;
  if (!sourcePair || JSON.stringify(stable(sourcePair)) !== JSON.stringify(stable(resultPair))) return unsupported('business_identity_changed');
  const bookmarkId = context.decision.locator.bookmarkId;
  const before = paragraph(reference, bookmarkId), after = paragraph(result, bookmarkId);
  if (before.status === 'unsupported') return before;
  if (after.status === 'unsupported') return after;
  const comparison = { referenceParagraphText: before.text, resultParagraphText: after.text,
    referenceParagraphHash: hash(before.text), resultParagraphHash: hash(after.text) };
  if (before.text !== after.text) return { status: 'failed', ...comparison };
  // The existing Word pair reader checks full native references, resources,
  // inherited paragraph format and unique locators against the exact pin.
  if (!compareCriterionContext(resultSnapshotText, context)) return unsupported('native_context_changed');
  return { status: 'passed', ...comparison };
}
