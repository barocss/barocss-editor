import { describe, it, expect } from 'vitest';
import { copyOf } from '../src/canvas-access';
import type { CanvasAccess } from '../src/canvas-access';

/**
 * A subtree copied, and what "copied" has to mean.
 *
 * Five things in this suite copy a tree with this — duplicating a slide, pasting cards, taking the
 * placeholders out of a layout, and **making a component out of a block a reader has already built**
 * — and every one of them promises the same thing: what comes back is the same thing, somewhere
 * else. Until this test existed, none of them kept the **marks**.
 *
 * That fault is worth restating because of how it hid rather than because of what it was. The words
 * all survived; only what covered them did not. A slide duplicated from a bold title came back with
 * the title, in the wrong weight, and nothing in the suite could have failed: every check compares
 * nodes or text, and a mark is neither.
 */
describe('copying a subtree', () => {
  const doc = (nodes: Record<string, any>): CanvasAccess & { rootId: string } => ({
    rootId: 'root',
    getNode: (sid: string) => nodes[sid]
  });

  it('keeps what covers the characters, not only the characters', () => {
    const marks = [{ stype: 'bold', attributes: {} }, { stype: 'link', attributes: { href: 'page:home', range: [0, 2] } }];
    const copy = copyOf(
      doc({
        root: { sid: 'root', stype: 'paragraph', content: ['run'] },
        run: { sid: 'run', stype: 'inline-text', text: '표지', marks }
      }),
      'root'
    ) as any;

    expect(copy.content[0].text).toBe('표지');
    expect(copy.content[0].marks).toEqual(marks);
  });

  it('copies the marks rather than sharing them', () => {
    const nodes = {
      root: { sid: 'root', stype: 'paragraph', content: ['run'] },
      run: { sid: 'run', stype: 'inline-text', text: '표지', marks: [{ stype: 'link', attributes: { range: [0, 2] } }] }
    };
    const copy = copyOf(doc(nodes), 'root') as any;

    // A mark holds a range, and two nodes sharing one array is one of them changing when the other
    // is edited — the kind of copy that is correct at the instant it is made and wrong afterwards.
    (copy.content[0].marks[0].attributes.range as number[])[1] = 99;
    expect(nodes.run.marks[0].attributes.range).toEqual([0, 2]);
  });

  it('leaves a node with no marks without an empty list', () => {
    const copy = copyOf(
      doc({ root: { sid: 'root', stype: 'inline-text', text: '표지', marks: [] } }),
      'root'
    ) as any;
    // An empty array where there was nothing is a difference a file would carry and a comparison
    // would notice, for no gain.
    expect('marks' in copy).toBe(false);
  });

  it('drops the identity, which is the other half of what a copy is', () => {
    const copy = copyOf(
      doc({
        root: { sid: 'root', stype: 'frame', attributes: { name: '카드' }, content: ['run'] },
        run: { sid: 'run', stype: 'inline-text', text: '표지' }
      }),
      'root'
    ) as any;

    expect(copy.sid).toBeUndefined();
    expect(copy.content[0].sid).toBeUndefined();
    expect(copy.attributes.name).toBe('카드');
  });
});
