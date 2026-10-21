import type { INode, IMark } from '@barocss/datastore';
import { describe, expect, it } from 'vitest';
import { createStarterDocument, createSampleDocument, wordFileText } from '@barocss/office-word';
import { readServerWordFile, serverWordFileText, stableWordSnapshotText } from '../src/server-file';

describe('strict server Word native snapshots', () => {
  it('preserves all native attributes, resource/reference IDs and original metadata', () => {
    const native = createSampleDocument();
    native.metadata = { loadedAt: 'original-native-value', author: 'synthetic-owner' };
    const text = serverWordFileText(native, '2026-10-01T00:00:00.000Z');
    const read = readServerWordFile(text);
    expect(read).toEqual({ document: JSON.parse(wordFileText(native)).document, version: 1 });
    expect(stableWordSnapshotText(text)).toBe(stableWordSnapshotText(serverWordFileText(native)));
    expect(stableWordSnapshotText(text)).not.toBe(stableWordSnapshotText(
      serverWordFileText({ ...native, metadata: { ...native.metadata, loadedAt: 'changed-native-value' } })));
  });

  it('does not treat native object property order as an edit, but preserves array order and durable metadata', () => {
    const native = createSampleDocument();
    const reorder = (value: unknown): unknown => Array.isArray(value) ? value.map(reorder)
      : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).reverse().map(([key, child]) => [key, reorder(child)])) : value;
    const source = serverWordFileText(native, 'original-envelope-timestamp');
    expect(stableWordSnapshotText(serverWordFileText(reorder(native)))).toBe(stableWordSnapshotText(source));
    const changed = structuredClone(native);
    const surface = changed.content?.find((node): node is INode => typeof node !== 'string' && node.stype === 'surface');
    if (!surface || !surface.content || surface.content.length < 2) throw new Error('Missing native paragraph fixture');
    surface.content.reverse();
    expect(stableWordSnapshotText(serverWordFileText(changed))).not.toBe(stableWordSnapshotText(source));
  });

  it('refuses malformed and newer files without replacing them with a starter document', () => {
    const document = createStarterDocument();
    for (const value of [null, {}, { format: 'barocss-word', version: 2, document },
      { format: 'barocss-word', version: 1, document: { stype: 'document', content: [null] } },
      { format: 'barocss-word', version: 1, document: { stype: 'document', content: [{ stype: 'unsupported' }] } },
      { format: 'barocss-word', version: 1, document: { ...document, sid: 'session:1' } },
      { format: 'barocss-word', version: 1, document: { ...document, parentId: 'session:1' } }]) {
      expect(readServerWordFile(JSON.stringify(value))).toHaveProperty('error');
    }
  });

  it('refuses unsupported marks, broken ranges and excessive native tree depth', () => {
    const invalidMarks: IMark[] = [{ stype: 'unknown', range: [0, 1] }, { stype: 'bold', range: [0, 5] }];
    for (const mark of invalidMarks) {
      const native = createStarterDocument();
      const surface = native.content?.find((node): node is INode => typeof node !== 'string' && node.stype === 'surface');
      if (!surface) throw new Error('Missing fixture surface');
      surface.content = [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: 'x', marks: [mark] }] }];
      expect(readServerWordFile(wordFileText(native))).toHaveProperty('error');
    }
    let deep: unknown = { stype: 'inline-text', text: 'deep' };
    for (let index = 0; index < 102; index++) deep = { stype: 'paragraph', content: [deep] };
    expect(readServerWordFile(JSON.stringify({ format: 'barocss-word', version: 1,
      document: { stype: 'document', content: [deep] } }))).toHaveProperty('error');
  });
  it('refuses native files outside the existing service byte and metadata traversal limits', () => {
    const native = createStarterDocument();
    native.metadata = { oversized: 'x'.repeat(524289) };
    expect(readServerWordFile(wordFileText(native))).toHaveProperty('error');
    native.metadata = { values: Array.from({ length: 10000 }, () => 1) };
    expect(readServerWordFile(wordFileText(native))).toHaveProperty('error');
  });

});
