import { describe, expect, it } from 'vitest';
import { createSchema, validateTree } from '@barocss/schema';
import type { INode } from '@barocss/datastore';
import { BUSINESS_PAIR_KEY, createBusinessPair, readBusinessPair } from '../src/business-pair';
import { getWordSchemaDefinition } from '../src/word-schema';
import { wordFileText } from '../src/word-file';

const schema = createSchema('business-reference-ambiguity', getWordSchemaDefinition());
function fixture(): INode {
  return { stype: 'document', metadata: { retained: 'fictional source' }, content: [{ stype: 'surface', content: [
    { stype: 'paragraph', content: [{ stype: 'bookmarkAnchor', attributes: { id: 'requirement' } },
      { stype: 'inline-text', text: 'Use the external policy: ' },
      { stype: 'fieldRef', attributes: { targetId: 'policy', targetKind: 'bookmark', format: 'text' } }] },
    { stype: 'paragraph', content: [{ stype: 'bookmarkAnchor', attributes: { id: 'decision' } },
      { stype: 'inline-text', text: 'Keep exact native evidence.' }] },
    { stype: 'paragraph', content: [{ stype: 'bookmarkAnchor', attributes: { id: 'policy' } },
      { stype: 'inline-text', text: 'Original policy source.' }] },
  ] }] };
}
const blocks = (document: INode) => (document.content![0] as INode).content!;
function validNative(document: INode) {
  // Neither schema validity nor a well-formed field proves unique source identity.
  expect(validateTree(schema, document as never)).toStrictEqual([]);
}

describe('business pair native reference ambiguity', () => {
  it.each(['two-points', 'point-and-range'] as const)('refuses an external %s collision without changing the complete original', collision => {
    const document = fixture();
    blocks(document).push({ stype: 'paragraph', content: collision === 'two-points'
      ? [{ stype: 'bookmarkAnchor', attributes: { id: 'policy' } }, { stype: 'inline-text', text: 'Another policy source.' }]
      : [{ stype: 'inline-text', text: 'Another policy source.', marks: [{ stype: 'bookmark', attrs: { name: 'policy' }, range: [0, 22] }] }],
    });
    validNative(document);
    const before = wordFileText(document, '');
    expect(() => createBusinessPair(document, 'requirement', 'decision')).toThrow();
    expect(wordFileText(document, '')).toBe(before);
  });

  it.each(['two-points', 'point-and-range'] as const)('keeps historical pins but requires review after a new external %s collision', collision => {
    const document = fixture(); validNative(document);
    const payload = createBusinessPair(document, 'requirement', 'decision');
    document.metadata![BUSINESS_PAIR_KEY] = payload;
    const initial = readBusinessPair(document);
    expect(initial).toMatchObject({ status: 'valid', review: 'current' });
    blocks(document).push({ stype: 'paragraph', content: collision === 'two-points'
      ? [{ stype: 'bookmarkAnchor', attributes: { id: 'policy' } }, { stype: 'inline-text', text: 'Another policy source.' }]
      : [{ stype: 'inline-text', text: 'Another policy source.', marks: [{ stype: 'bookmark', attrs: { name: 'policy' }, range: [0, 22] }] }],
    });
    validNative(document);
    const before = wordFileText(document, '');
    const read = readBusinessPair(document);
    expect(read).toMatchObject({ status: 'valid', review: 'needed' });
    if (read.status !== 'valid') throw new Error('Historical valid pair was discarded');
    expect(read.payload).toStrictEqual(payload);
    expect(read.items.find(entry => entry.item.kind === 'requirement')?.state).toBe('unavailable');
    expect(wordFileText(document, '')).toBe(before);
  });

  it('accepts fragments of one named range bookmark and retains both fragments in the full historical pin', () => {
    const document = fixture();
    blocks(document)[2] = { stype: 'paragraph', content: [
      { stype: 'inline-text', text: 'First ', marks: [{ stype: 'bookmark', attrs: { name: 'policy' }, range: [0, 6] }] },
      { stype: 'inline-text', text: 'second.', marks: [{ stype: 'bookmark', attrs: { name: 'policy' }, range: [0, 7] }] },
    ] };
    validNative(document);
    const before = wordFileText(document, ''), payload = createBusinessPair(document, 'requirement', 'decision');
    expect(payload.items[0].versions[0].snapshotText).toBe(before);
    expect(payload.items[1].versions[0].snapshotText).toBe(before);
    document.metadata![BUSINESS_PAIR_KEY] = payload;
    expect(readBusinessPair(document)).toMatchObject({ status: 'valid', review: 'current' });
  });
});
