import { createHash } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { NATIVE_NOTE_FIXTURES } from '../../../apps/note/src/native2-scenario-fixtures';

// The data capture must not load the old model/session entry to admit a source.
vi.mock('../src/session', () => { throw new Error('review_capture_loaded_session'); });
vi.mock('../src/native-session', () => { throw new Error('review_capture_loaded_native_model'); });
import { captureNative2ParagraphReview } from '../src/native2-paragraph-review';

const hash = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const plain = (value: unknown): unknown => JSON.parse(JSON.stringify(value));
const raw = (value: unknown) => JSON.stringify(value, null, 2) + '\n';

it.each([['SOURCE_A', 1], ['TARGET_A2', 1], ['SOURCE_B', 0]] as const)('captures the complete %s source, selected paragraph and ordered native segments without a model', (name, paragraphIndex) => {
  const file = NATIVE_NOTE_FIXTURES[name], snapshotText = raw(file), before = raw(NATIVE_NOTE_FIXTURES);
  const paragraph = file.document.content[paragraphIndex];
  const paragraphJSON = JSON.stringify(paragraph), path = [paragraphIndex];
  const value = captureNative2ParagraphReview(snapshotText, paragraphIndex);
  expect(value.version).toBe(1);
  expect(value.kind).toBe('note-native2-paragraph-review');
  expect(value.pageId).toBe(file.document.attributes.pageId);
  expect(value.paragraphIndex).toBe(paragraphIndex);
  expect(value.nativePath).toStrictEqual(path);
  expect(value.snapshotText).toBe(snapshotText);
  expect(value.snapshotHash).toBe(hash(snapshotText));
  expect(plain(value.schemaBundle)).toStrictEqual(file.schemaBundle);
  expect(value.bundleHash).toBe(hash(JSON.stringify(['wonffice.note.paragraph.review.bundle.v1', file.schemaBundle])));
  expect(plain(value.paragraph)).toStrictEqual(paragraph);
  expect(value.paragraphJSON).toBe(paragraphJSON);
  expect(value.witnessHash).toBe(hash(JSON.stringify(['wonffice.note.paragraph.review.witness.v1', file.document.attributes.pageId, path, paragraphJSON])));
  expect(plain(value.segments)).toStrictEqual(paragraph.content.map((native, index) => ({ index,
    kind: native.stype === 'inline-text' ? 'inline-text' : 'page-reference', native })));
  expect(raw(NATIVE_NOTE_FIXTURES)).toBe(before);
  expect(Object.isFrozen(value)).toBe(true);
  expect(Object.isFrozen(value.schemaBundle.definitions)).toBe(true);
  expect(Object.isFrozen(value.paragraph)).toBe(true);
  expect(Object.isFrozen(value.segments)).toBe(true);
  expect('apply' in value).toBe(false);
  expect('session' in value).toBe(false);
});

it('retains two text runs, their mark omission and both complete page references rather than flattening', () => {
  const value = captureNative2ParagraphReview(raw(NATIVE_NOTE_FIXTURES.SOURCE_A), 1);
  expect(value.segments.map(segment => segment.kind)).toStrictEqual(['inline-text', 'inline-text', 'page-reference', 'page-reference']);
  expect(value.segments[0].native.marks).toEqual([{ stype: 'italic', range: [0, 5] }]);
  expect(Object.hasOwn(value.segments[1].native, 'marks')).toBe(false);
  expect(value.segments[2].native.attributes).toEqual({ pageId: 'native2-note-A', title: 'A 내부' });
  expect(value.segments[3].native.attributes).toEqual({ pageId: 'external-note-A', title: 'A 외부' });
  expect(value.paragraphJSON).toContain('pageReference');
});

it.each([-1, 0, 1.5, Number.MAX_SAFE_INTEGER, NaN])('refuses invalid or nonparagraph index %s with all raw data retained', index => {
  const snapshotText = raw(NATIVE_NOTE_FIXTURES.SOURCE_A);
  expect(() => captureNative2ParagraphReview(snapshotText, index)).toThrow('native2_paragraph_review_invalid_target');
  expect(snapshotText).toBe(raw(NATIVE_NOTE_FIXTURES.SOURCE_A));
});

it('refuses an empty or all-reference paragraph, not the whole source representation', () => {
  for (const content of [[], [{ stype: 'pageReference', attributes: { pageId: 'external-note-A', title: 'ref' } }]]) {
    const original = NATIVE_NOTE_FIXTURES.SOURCE_A;
    const file = { ...original, document: { ...original.document,
      content: original.document.content.map((node, index) => index === 1 ? { stype: 'paragraph', content } : node) } };
    const snapshotText = raw(file);
    expect(() => captureNative2ParagraphReview(snapshotText, 1)).toThrow('native2_paragraph_review_invalid_target');
    expect(raw(file)).toBe(snapshotText);
  }
});

it('admits or refuses the whole file before extracting the selected paragraph and never crops an unsupported sibling', () => {
  const original = NATIVE_NOTE_FIXTURES.SOURCE_A;
  const file = { ...original, document: { ...original.document,
    content: [...original.document.content, { stype: 'mathBlock', attributes: { tex: 'x' }, content: [] }] } };
  const snapshotText = raw(file);
  expect(() => captureNative2ParagraphReview(snapshotText, 1)).toThrow();
  expect(raw(file)).toBe(snapshotText);
});

it('preserves fixed SHA input limits and refuses a complete oversized source rather than slicing it', () => {
  const file = structuredClone(NATIVE_NOTE_FIXTURES.SOURCE_A);
  file.document.metadata.labels = ['x'.repeat(65536)];
  const snapshotText = raw(file);
  expect(() => captureNative2ParagraphReview(snapshotText, 1)).toThrow('native2_paragraph_review_too_large');
  expect(raw(file)).toBe(snapshotText);
});

it('hashes the exact original bytes and raw parse order rather than normalizing them through JSONB', () => {
  const file = NATIVE_NOTE_FIXTURES.SOURCE_A;
  const compact = JSON.stringify(file), spaced = raw(file);
  const one = captureNative2ParagraphReview(compact, 1), two = captureNative2ParagraphReview(spaced, 1);
  expect(one.snapshotHash).not.toBe(two.snapshotHash);
  expect(one.witnessHash).toBe(two.witnessHash);
  const reordered = { ...file, document: { ...file.document, content: file.document.content.map((paragraph, index) =>
    index === 1 ? { content: paragraph.content, stype: paragraph.stype, attributes: 'attributes' in paragraph ? paragraph.attributes : undefined,
      metadata: 'metadata' in paragraph ? paragraph.metadata : undefined } : paragraph) } };
  const next = captureNative2ParagraphReview(JSON.stringify(reordered), 1);
  expect(next.witnessHash).not.toBe(one.witnessHash);
  expect(next.paragraphJSON).not.toBe(one.paragraphJSON);
});
