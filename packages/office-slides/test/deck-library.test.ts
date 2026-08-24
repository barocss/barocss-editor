import { describe, it, expect } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import { createSlidesEditor } from '../src/slides-kit';
import { getSlidesSchemaDefinition } from '../src/slides-schema';
import { createSampleDeck } from '../src/sample-deck';
import { isLibraryName, libraryEntry, libraryName } from '../src/deck-library';
import type { DeckAccess } from '../src/deck';

/**
 * A reader's own decks, by name.
 *
 * The naming half, which is the only half that is a question about documents — where they are kept
 * is the app's, because a browser has IndexedDB and another host would have a directory. What is
 * here is the part with rules, and every rule is a reference that would otherwise break: a name has
 * to be durable (a `goToDeck` written today finds the same deck tomorrow), unique (two decks called
 * 가격표 make a reference nothing can follow), and derived from what the deck *is* (so a person
 * reading the file can tell what a button points at).
 */
describe('naming a deck in the library', () => {
  it('derives the name from what the deck is called', () => {
    expect(libraryName([], '가격표')).toBe('가격표');
    expect(libraryName([], 'One engine, two products')).toBe('one-engine-two-products');
  });

  it('takes the punctuation out, because the name is a reference', () => {
    // A name goes into a document and into places that read strings by their shape; a name with a
    // slash in it is a name something will mis-read.
    expect(libraryName([], 'Q3 / 2026: 가격 (안)')).toBe('q3-2026-가격-안');
  });

  it('never hands out one the library is using', () => {
    expect(libraryName(['가격표'], '가격표')).toBe('가격표-2');
    expect(libraryName(['가격표', '가격표-2'], '가격표')).toBe('가격표-3');
  });

  it('names a deck with nothing to go on', () => {
    // A deck whose first page has no words is still a deck a reader can point at.
    expect(libraryName([], undefined)).toBe('deck');
    expect(libraryName(['deck'], '')).toBe('deck-2');
  });

  it('tells a name from an address by what a name may be', () => {
    /*
     * Not by guessing whether a string looks like a URL: `libraryName` strips every character that
     * could make one, so anything with a slash, a dot, a colon or a space is an address. The rule
     * is about what a name is allowed to be, which stays true when addresses change shape.
     */
    expect(isLibraryName('가격표')).toBe(true);
    expect(isLibraryName('one-engine-two-products')).toBe(true);
    expect(isLibraryName('/decks/pricing.slides.json')).toBe(false);
    expect(isLibraryName('https://x.example/deck')).toBe(false);
    expect(isLibraryName('my deck')).toBe(false);
    expect(isLibraryName(undefined)).toBe(false);
  });
});

describe('what a library row says about a deck', () => {
  it('reads the title and the page count from the document itself', () => {
    const schema = createSchema('slides', getSlidesSchemaDefinition());
    const store = new DataStore(undefined, schema);
    const editor = createSlidesEditor({ editable: true, schema, dataStore: store });
    editor.loadDocument(createSampleDeck() as never, 'slides');
    const doc: DeckAccess = {
      rootId: (editor as never as { getRootId: () => string }).getRootId(),
      getNode: (sid: string) => store.getNode(sid) as never
    };

    // The words on the opening page — what a reader would have typed into a save dialog — and how
    // many pages it has, which is the one fact that says how big a thing this is.
    expect(libraryEntry(doc, 'sample')).toEqual({
      name: 'sample',
      title: 'One engine, two products',
      pages: 6
    });
  });
});
