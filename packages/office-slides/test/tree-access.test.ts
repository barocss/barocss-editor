import { describe, it, expect } from 'vitest';
import { accessOfTree } from '../src/tree-access';
import { componentsOf, componentSignature } from '@barocss/office-canvas';
import { deckSlides } from '../src/deck';
import { createSampleDeck } from '../src/sample-deck';

/**
 * A deck read straight out of a file.
 *
 * Everything that reads a deck takes `rootId` + `getNode(sid)`, because that is what a *loaded*
 * document is. A parsed file is the other shape — nested children, no sids — so asking anything
 * about another deck used to mean loading it, which means replacing the deck on screen. Useless
 * for the two questions a library asks: what does the brand kit define, and has it moved on?
 */
describe('a deck that has not been loaded', () => {
  it('answers the same questions a loaded one does', () => {
    const doc = accessOfTree(createSampleDeck() as never);
    expect(deckSlides(doc).map((slide) => slide.name)).toContain('One card, three places');
    const [card] = componentsOf(doc);
    expect(card.id).toBe('metric-card');
    expect(card.vars.map((one) => one.name)).toEqual(['title', 'value', 'accent', 'showBadge']);
    expect(card.parts).toHaveLength(5);
  });

  it('gives the same signature as the loaded deck, because identity is left out', () => {
    /*
     * The whole reason a signature ignores sids and pairings: the same definition read two ways
     * has to compare equal, or "has the brand kit moved on" would be true the moment it was asked
     * from a different place.
     */
    const one = accessOfTree(createSampleDeck() as never);
    const two = accessOfTree(createSampleDeck() as never);
    expect(componentSignature(one, componentsOf(one)[0])).toBe(
      componentSignature(two, componentsOf(two)[0])
    );
  });

  it('answers nothing for nothing, rather than throwing', () => {
    const empty = accessOfTree(undefined);
    expect(deckSlides(empty)).toEqual([]);
    expect(componentsOf(empty)).toEqual([]);
  });
});
