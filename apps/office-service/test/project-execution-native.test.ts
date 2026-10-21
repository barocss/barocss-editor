import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { captureExecutionTarget, expectedExecutionSnapshot } from '../src/project-execution-native.js';

const target = { kind: 'word-comment' as const, id: 'stable-thread', quote: 'Original guide' };
const run = () => ({ stype: 'inline-text', attributes: {}, text: target.quote,
  marks: [{ stype: 'commentRef', attrs: { id: target.id }, range: [0, target.quote.length] }] });
interface FixtureNode { stype: string; metadata?: Record<string, unknown>; attributes?: Record<string, unknown>;
  text?: string; marks?: Array<{ stype: string; attrs: { id: string }; range: number[] }>; content?: FixtureNode[] }
const documentFixture = (): FixtureNode => ({ stype: 'document', metadata: { untouched: '원본' }, content: [
  { stype: 'section', attributes: { pageWidth: 11906 }, content: [
    { stype: 'paragraph', attributes: { styleId: 'body' }, content: [run()] },
    { stype: 'paragraph', attributes: {}, content: [{ stype: 'inline-text', attributes: {}, text: 'Untouched sibling' }] }
  ] },
  { stype: 'resources', attributes: {}, content: [
    { stype: 'commentThread', attributes: { id: target.id, author: 'Original author' }, content: [] }
  ] }
] });
const encode = (document: unknown) => `${JSON.stringify({ format: 'barocss-word', version: 1, document }, null, 2)}\n`;
const linkedPointFixture = () => {
  const linked = JSON.parse(readFileSync(new URL('./fixtures/criterion-confirmation-word.json', import.meta.url), 'utf8')) as { document: FixtureNode };
  const original = linked.document;
  const paragraph = original.content![0].content![1];
  const text = paragraph.content![1];
  text.marks = [{ stype: 'commentRef', attrs: { id: target.id }, range: [0, text.text!.length] }];
  original.content!.push({ stype: 'resources', content: [
    { stype: 'commentThread', attributes: { id: target.id, author: 'Original author' }, content: [] }
  ] });
  return { original, paragraph, actualTarget: { ...target, quote: text.text! } };
};

describe('the bounded native execution target', () => {
  it('changes only the full marked run beside a pinned point bookmark', () => {
    const { original, paragraph, actualTarget } = linkedPointFixture();
    const bookmark = structuredClone(paragraph.content![0]);
    const source = encode(original), expected = structuredClone(original);
    const expectedText = expected.content![0].content![1].content![1];
    expectedText.text = 'Store the reviewed decision.';
    expectedText.marks![0].range = [0, expectedText.text.length];
    expect(captureExecutionTarget(source, actualTarget)).toEqual({ nodeId: target.id, text: actualTarget.quote,
      from: 0, to: actualTarget.quote.length, path: [0, 1, 1] });
    expect(expectedExecutionSnapshot(source, actualTarget, expectedText.text)).toBe(encode(expected));
    expect(paragraph.content![0]).toEqual(bookmark);
    expect(encode(original)).toBe(source);
  });
  it.each(['duplicate-bookmark', 'third-child', 'reversed', 'extra-bookmark-field', 'marked-bookmark', 'locked-bookmark', 'partial-comment'])(
    'refuses an unsafe point bookmark shape: %s', change => {
      const { original, paragraph, actualTarget } = linkedPointFixture();
      const bookmark = paragraph.content![0], run = paragraph.content![1];
      if (change === 'duplicate-bookmark') original.content![0].content!.push({ stype: 'paragraph', content: [structuredClone(bookmark)] });
      if (change === 'third-child') paragraph.content!.push({ stype: 'inline-text', text: 'unselected' });
      if (change === 'reversed') paragraph.content!.reverse();
      if (change === 'extra-bookmark-field') bookmark.attributes!.title = 'not a plain point';
      if (change === 'marked-bookmark') bookmark.marks = [];
      if (change === 'locked-bookmark') bookmark.attributes!.locked = true;
      if (change === 'partial-comment') run.marks![0].range[1]--;
      const source = encode(original);
      expect(() => captureExecutionTarget(source, actualTarget)).toThrow(change === 'duplicate-bookmark' ? 'target_conflict' : 'unsupported_target');
      expect(encode(original)).toBe(source);
    });
  it('captures the unique full run through native comment identity, never a session ID', () => {
    const text = encode(documentFixture());
    expect(captureExecutionTarget(text, target)).toEqual({ nodeId: target.id, text: target.quote,
      from: 0, to: target.quote.length, path: [0, 0, 0] });
    expect(text).toBe(encode(documentFixture()));
  });
  it('derives exact expected bytes from pre-call original with only one text and comment range delta', () => {
    const original = documentFixture(), text = encode(original), expected = structuredClone(original);
    const changed = expected.content![0].content![0].content![0] as ReturnType<typeof run>;
    changed.text = '새 고객 안내'; changed.marks[0].range[1] = changed.text.length;
    expect(expectedExecutionSnapshot(text, target, changed.text)).toBe(encode(expected));
    expect(original).toEqual(documentFixture());
  });
  it.each(['partial', 'other-mark', 'duplicate-anchor', 'missing-thread', 'duplicate-thread', 'sibling-run', 'wrong-quote'])(
    'refuses %s without guessing another target', change => {
      const doc = documentFixture();
      const paragraph = doc.content![0].content![0];
      const leaf = paragraph.content![0] as ReturnType<typeof run>;
      if (change === 'partial') leaf.marks[0].range[1] -= 1;
      if (change === 'other-mark') leaf.marks.push({ stype: 'bold', attrs: { id: 'unused' }, range: [0, leaf.text.length] });
      if (change === 'duplicate-anchor') doc.content![0].content!.push(structuredClone(paragraph));
      if (change === 'missing-thread') doc.content![1].content = [];
      if (change === 'duplicate-thread') doc.content![1].content!.push(structuredClone(doc.content![1].content![0]));
      if (change === 'sibling-run') paragraph.content!.push({ stype: 'inline-text', attributes: {}, text: 'unselected' });
      const snapshot = encode(doc);
      expect(() => captureExecutionTarget(snapshot, change === 'wrong-quote' ? { ...target, quote: 'guess' } : target)).toThrow();
      expect(encode(doc)).toBe(snapshot);
    });
  it.each(['root', 'section', 'paragraph', 'leaf', 'contentControl', 'commentThread'])('refuses a protected %s target', scope => {
    const doc = documentFixture();
    const section = doc.content![0], paragraph = section.content![0], leaf = paragraph.content![0];
    if (scope === 'root') doc.attributes = { locked: true };
    if (scope === 'section') section.attributes = { ...section.attributes, locked: true };
    if (scope === 'paragraph') paragraph.attributes = { ...paragraph.attributes, locked: true };
    if (scope === 'leaf') leaf.attributes = { locked: true };
    if (scope === 'contentControl' || scope === 'commentThread') section.stype = scope;
    expect(() => captureExecutionTarget(encode(doc), target)).toThrow('unsupported_target');
  });
  it('refuses invalid envelopes, session identities, empty or control-containing proposed text', () => {
    const snapshot = encode(documentFixture());
    for (const replacement of ['', 'A\u0000B']) expect(() => expectedExecutionSnapshot(snapshot, target, replacement)).toThrow();
    expect(() => captureExecutionTarget(snapshot.replace('barocss-word', 'barocss-site'), target)).toThrow();
    const doc = documentFixture(); Object.assign(doc.content![0], { sid: 'runtime:1' });
    expect(() => captureExecutionTarget(encode(doc), target)).toThrow();
  });
});

// Actual native Note bytes; independently authored whole-document delta.
const noteTarget = { kind: 'note-paragraph' as const, id: '11111111-1111-4111-8111-111111111111', quote: 'Original paragraph',
  selector: { version: 1 as const, pageId: '22222222-2222-4222-8222-222222222222', paragraphIndex: 1 } };
interface NoteFixtureBlock {
  stype: string;
  attributes?: Record<string, unknown>;
  content: Array<{ stype: string; text: string; marks?: Array<{ stype: string; range: number[] }>;
    metadata?: Record<string, unknown> }>;
}
const noteFixture = (explicitMarks = false): { stype: string; attributes: Record<string, unknown>; content: NoteFixtureBlock[] } => ({ stype: 'note', attributes: { title: 'Fictional task', pageId: noteTarget.selector.pageId }, content: [
  { stype: 'paragraph', content: [{ stype: 'inline-text', text: noteTarget.quote }] },
  { stype: 'paragraph', attributes: { custom: 'preserved' }, content: [{ stype: 'inline-text', text: noteTarget.quote,
    ...(explicitMarks ? { marks: [] } : {}), metadata: { loadedAt: 17, custom: 'retained' } }] },
  { stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Unrelated rich sibling', marks: [{ stype: 'bold', range: [0, 9] }] }] },
  { stype: 'resources', content: [] }
] });
const noteEncode = (document: unknown) => `${JSON.stringify({ format: 'barocss-note', version: 1, document }, null, 2)}\n`;
describe('Note task exact pinned coordinate', () => {
  it.each([false, true])('captures and changes only the pinned paragraph, preserving authored marks shape (%s)', explicit => {
    const original = noteFixture(explicit), bytes = noteEncode(original), expected = structuredClone(original);
    expected.content[1].content[0].text = 'Reviewed paragraph';
    expect(captureExecutionTarget(bytes, noteTarget)).toEqual({ nodeId: noteTarget.id, text: noteTarget.quote, from: 0, to: noteTarget.quote.length, path: [1, 0] });
    const actual = expectedExecutionSnapshot(bytes, noteTarget, 'Reviewed paragraph');
    expect(JSON.parse(actual)).toEqual(JSON.parse(noteEncode(expected)));
    expect(noteEncode(original)).toBe(bytes);
    expect(Object.hasOwn(JSON.parse(actual).document.content[1].content[0], 'marks')).toBe(explicit);
  });
  it.each(['page', 'quote', 'index', 'runtime', 'nested', 'heading', 'multirun', 'marked', 'locked', 'normalization', 'unknown-root'])(
    'refuses %s instead of guessing equal text or pruning source', change => {
      const doc = noteFixture(), target = structuredClone(noteTarget);
      if (change === 'page') target.selector.pageId = '33333333-3333-4333-8333-333333333333';
      if (change === 'quote') target.quote = 'Other';
      if (change === 'index') target.selector.paragraphIndex = 999;
      if (change === 'runtime') Object.assign(doc.content[1], { sid: 'runtime-only' });
      if (change === 'nested') Object.assign(doc.content[1], { stype: 'blockquote', content: [structuredClone(doc.content[1])] });
      if (change === 'heading') doc.content[1].stype = 'heading';
      if (change === 'multirun') doc.content[1].content.push({ stype: 'inline-text', text: 'Other' });
      if (change === 'marked') Object.assign(doc.content[1].content[0], { marks: [{ stype: 'bold', range: [0, 4] }] });
      if (change === 'locked') Object.assign(doc.content[1].attributes!, { locked: true });
      if (change === 'normalization') doc.content[1].content[0].text = 'First\nSecond';
      if (change === 'unknown-root') Object.assign(doc, { unknownRootField: 'must not disappear' });
      const bytes = noteEncode(doc);
      expect(() => captureExecutionTarget(bytes, target)).toThrow();
      expect(noteEncode(doc)).toBe(bytes);
    });
  it.each(['Original paragraph', 'First\nSecond', 'First\rSecond', 'A\u0000B'])('refuses no-op or non-paragraph proposal %j before acceptance', replacement => {
    expect(() => expectedExecutionSnapshot(noteEncode(noteFixture()), noteTarget, replacement)).toThrow();
  });
});
