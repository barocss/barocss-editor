import { describe, it, expect } from 'vitest';
import {
  caretRunOf,
  enclosingMath,
  nextSlot,
  slotOf,
  slotsOf
} from '../src/math-navigation';
import type { DocumentAccess, DocumentNode } from '../src/document-access';

/**
 * Tab through an equation.
 *
 * This is how an equation gets written: make a fraction, type the numerator,
 * Tab, type the denominator. Without it the slots are places only the mouse can
 * reach, which is not how anybody writes mathematics.
 */
const build = (root: DocumentNode): DocumentAccess => {
  const byId: Record<string, DocumentNode> = {};
  const index = (node: DocumentNode, parentId?: string) => {
    node.parentId = parentId;
    byId[node.sid!] = node;
    for (const child of node.content ?? []) {
      if (typeof child !== 'string') index(child as DocumentNode, node.sid);
    }
  };
  index(root);
  return { getNode: (id) => byId[id], rootId: root.sid! };
};

const run = (sid: string, text: string): DocumentNode => ({
  sid,
  stype: 'mathRun',
  content: [{ sid: `${sid}-t`, stype: 'inline-text', text }]
});

const slot = (sid: string, stype: string, content: DocumentNode[] = []): DocumentNode => ({
  sid,
  stype,
  content
});

/** x = (a + b) / c, with a square root over the numerator. */
const fractionDoc = () =>
  build({
    sid: 'p',
    stype: 'paragraph',
    content: [
      { sid: 'lead', stype: 'inline-text', text: 'so ' },
      {
        sid: 'm',
        stype: 'oMath',
        content: [
          run('r0', 'x'),
          {
            sid: 'f',
            stype: 'mathFraction',
            content: [
              slot('num', 'mathNum', [
                {
                  sid: 'rad',
                  stype: 'mathRadical',
                  content: [slot('deg', 'mathDeg'), slot('body', 'mathElement', [run('r1', 'a')])]
                }
              ]),
              slot('den', 'mathDen', [run('r2', 'c')])
            ]
          }
        ]
      }
    ]
  });

describe('finding where you are', () => {
  it('knows the equation a run is in, and that ordinary text is not in one', () => {
    const doc = fractionDoc();
    expect(enclosingMath(doc, 'r1-t')?.sid).toBe('m');
    expect(enclosingMath(doc, 'lead')).toBeUndefined();
  });

  it('knows the slot, which is the nearest one above', () => {
    const doc = fractionDoc();
    expect(slotOf(doc, 'r1-t')?.sid).toBe('body');
    // A run at the top of the equation is in no slot; the equation is not one.
    expect(slotOf(doc, 'r0-t')).toBeUndefined();
  });

  it('reads the slots in the order they are met', () => {
    // Numerator before denominator, and the radical's degree before its body —
    // which is the order OMML stores them in, so a walk gives Word's order with
    // no table of exceptions.
    expect(slotsOf(doc0(), undefined)).toEqual([]);
    const doc = fractionDoc();
    expect(slotsOf(doc, doc.getNode('m')).map((each) => each.sid)).toEqual([
      'num',
      'deg',
      'body',
      'den'
    ]);
  });
});

const doc0 = () => build({ sid: 'x', stype: 'paragraph', content: [] });

describe('where Tab goes', () => {
  it('steps forward through the slots', () => {
    const doc = fractionDoc();
    expect(nextSlot(doc, 'r1-t', 1)?.sid).toBe('den');
  });

  it('steps back', () => {
    const doc = fractionDoc();
    expect(nextSlot(doc, 'r2-t', -1)?.sid).toBe('body');
  });

  it('leaves the equation rather than wrapping', () => {
    // An author who has filled the last slot is done with it. A Tab that put
    // them back at the numerator is a trap they can only escape with the mouse.
    const doc = fractionDoc();
    expect(nextSlot(doc, 'r2-t', 1)).toBeNull();
    expect(nextSlot(doc, 'r0-t', -1)?.sid).toBe('den');
  });

  it('enters at the first slot from the equation’s own level', () => {
    const doc = fractionDoc();
    expect(nextSlot(doc, 'r0-t', 1)?.sid).toBe('num');
  });

  it('has nothing to say about text outside an equation', () => {
    const doc = fractionDoc();
    expect(nextSlot(doc, 'lead', 1)).toBeNull();
  });
});

describe('landing in a slot', () => {
  it('finds the run to put the caret in', () => {
    const doc = fractionDoc();
    expect(caretRunOf(doc, doc.getNode('den'))?.sid).toBe('r2-t');
  });

  it('says so when a slot has nothing to put it in', () => {
    // An empty slot has no text node and a caret needs one, so the caller has
    // to make one. Silence here would be a Tab that appears to do nothing.
    const doc = fractionDoc();
    expect(caretRunOf(doc, doc.getNode('deg'))).toBeUndefined();
  });
});
