import { describe, it, expect } from 'vitest';
import { deckSlides, noteFor, type DeckAccess, type DeckNode } from '../src/deck';

/**
 * Reading a deck, with no DOM and no editor — which is the point of it living
 * in the package rather than in the app that draws the rail.
 */
describe('reading a deck', () => {
  /** A document held the way a loaded one is: children are sids. */
  const docOf = (nodes: Record<string, DeckNode>, rootId = 'doc'): DeckAccess => ({
    rootId,
    getNode: (sid) => nodes[sid]
  });

  const deck = () =>
    docOf({
      doc: { stype: 'document', content: ['meta', 's1', 's2', 's3', 'res'] },
      meta: { stype: 'docMeta', content: [] },

      // Named by the author.
      s1: { stype: 'surface', attributes: { name: 'Title', layoutId: 'layout-title' }, content: ['t1'] },
      t1: { stype: 'textFrame', attributes: { role: 'title' }, content: ['p1'] },
      p1: { stype: 'paragraph', content: ['x1'] },
      x1: { stype: 'inline-text', text: 'Never read, the author named this one' },

      // Named by its title placeholder.
      s2: { stype: 'surface', attributes: { noteId: 'n-2' }, content: ['body2', 't2'] },
      // A body frame first, to prove the title is found by role and not by order.
      body2: { stype: 'textFrame', attributes: { role: 'body' }, content: ['p3'] },
      p3: { stype: 'paragraph', content: ['x3'] },
      x3: { stype: 'inline-text', text: 'Bullets nobody should name a slide after' },
      t2: { stype: 'textFrame', attributes: { role: 'title' }, content: ['p2'] },
      p2: { stype: 'paragraph', content: ['x2a', 'x2b'] },
      x2a: { stype: 'inline-text', text: 'What the ' },
      x2b: { stype: 'inline-text', text: 'second product cost' },

      // Nothing to name it with, and hidden.
      s3: { stype: 'surface', attributes: { hidden: true }, content: [] },

      res: { stype: 'resources', content: ['note1', 'layout1'] },
      note1: { stype: 'surfaceNote', attributes: { id: 'n-2' }, content: ['p4'] },
      p4: { stype: 'paragraph', content: [] },
      // A layout is full of textFrames and is not a slide.
      layout1: { stype: 'slideLayout', attributes: { id: 'layout-title' }, content: ['t9'] },
      t9: { stype: 'textFrame', attributes: { role: 'title' }, content: [] }
    });

  it('finds the slides and numbers them from one', () => {
    const slides = deckSlides(deck());
    expect(slides.map((s) => s.sid)).toEqual(['s1', 's2', 's3']);
    expect(slides.map((s) => s.number)).toEqual([1, 2, 3]);
  });

  it('skips resources, so a layout never turns up in the rail', () => {
    // A `slideLayout` holds `textFrame`s and looks exactly like a slide to a
    // walk that only asks what a node contains.
    expect(deckSlides(deck()).some((s) => s.sid === 'layout1')).toBe(false);
  });

  it('skips anything that is not a surface, so docMeta is not slide one', () => {
    expect(deckSlides(deck()).some((s) => s.sid === 'meta')).toBe(false);
  });

  describe('what to call a slide', () => {
    it('uses the author’s name when there is one', () => {
      expect(deckSlides(deck())[0].name).toBe('Title');
    });

    it('uses the title placeholder otherwise, across runs and by role', () => {
      expect(deckSlides(deck())[1].name).toBe('What the second product cost');
    });

    it('invents nothing when there is nothing', () => {
      // A name made up here would be indistinguishable from one the author
      // chose. The caller draws "Slide 3".
      expect(deckSlides(deck())[2].name).toBe('');
    });
  });

  it('reports a hidden slide as hidden and still lists it', () => {
    const slides = deckSlides(deck());
    expect(slides.map((s) => s.hidden)).toEqual([false, false, true]);
  });

  it('carries the layout a slide follows', () => {
    expect(deckSlides(deck())[0].layoutId).toBe('layout-title');
    expect(deckSlides(deck())[1].layoutId).toBeUndefined();
  });

  describe('the note a slide shows its presenter', () => {
    it('is found through the slide’s noteId', () => {
      // The sid, not the text: a note is editable content, and a string would
      // have thrown away the marks and the caret.
      expect(noteFor(deck(), 's2')).toBe('note1');
    });

    it('is absent for a slide nobody wrote one for', () => {
      expect(noteFor(deck(), 's1')).toBeUndefined();
    });
  });

  it('survives a document that is not there', () => {
    expect(deckSlides(docOf({}))).toEqual([]);
    expect(noteFor(docOf({}), 's1')).toBeUndefined();
  });

  it('does not hang on a document that points at itself', () => {
    // This walks an author's document, and a malformed one must not take the
    // chrome down with it.
    const looped = docOf({
      doc: { stype: 'document', content: ['s1'] },
      s1: { stype: 'surface', attributes: {}, content: ['t1'] },
      t1: { stype: 'textFrame', attributes: { role: 'title' }, content: ['t1'] }
    });
    expect(deckSlides(looped)[0].name).toBe('');
  });
});
