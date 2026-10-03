import { describe, expect, it } from 'vitest';
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

describe('the bounded native execution target', () => {
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
