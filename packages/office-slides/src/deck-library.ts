import { deckSlides, type DeckAccess } from './deck';
import { deckTitle } from './deck-file';

/**
 * A reader's own **decks, by name** — the naming half of it, which is the only half that is a
 * question about documents.
 *
 * ## Why a library at all, and why now
 *
 * Two features asked for the same thing. A button into another deck can only point at *a source
 * the product can fetch* (canvas-model §11h), so a reader's own deck has no name to be pointed at
 * by — and a shared component library (§10) is the same want from the other side: definitions that
 * live in a document other than this one. Neither is possible while "the decks I have" is not a
 * thing this product can say.
 *
 * ## What is here, and what deliberately is not
 *
 * Here: what an entry **is** — a name, and the facts about the document worth showing in a list.
 * Not here: where it is kept. Storage is the app's (a browser has IndexedDB; another host would
 * have a directory or a server), and this package has no DOM in it by design. Which also keeps the
 * naming testable in milliseconds, and it is the part with rules:
 *
 * - A name is **durable**, because a `goToDeck` written today has to find the same deck tomorrow.
 * - A name is **unique**, because two decks called 가격표 make a reference that cannot be followed.
 * - A name is derived from what the deck *is* (its title), because a person reading a file should
 *   be able to tell what a button points at — the same argument `deckFileName` and a component's
 *   part ids already make.
 */

/** One deck in the library, as a list needs it. */
export interface LibraryEntry {
  /** The durable name a `goToDeck` holds. */
  name: string;
  /** What the deck is called, for a reader — from its first page's words. */
  title: string;
  /** How many pages it has, which is the one fact that says how big a thing this is. */
  pages: number;
}

/**
 * A name for a deck that nothing in the library is using.
 *
 * Derived from the title and then made unique, in that order: `가격표`, `가격표-2`. Punctuation
 * out, because the name goes in a document and into a URL-ish place and a name with a slash in it
 * is a name something will mis-read.
 */
export function libraryName(taken: Iterable<string>, title: string | undefined): string {
  const already = new Set(taken);
  const base =
    (title ?? '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9가-힣]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'deck';

  if (!already.has(base)) return base;
  let next = 2;
  while (already.has(`${base}-${next}`)) next += 1;
  return `${base}-${next}`;
}

/** What one document would be in the library, under this name. */
export function libraryEntry(doc: DeckAccess, name: string): LibraryEntry {
  return {
    name,
    // The words on the opening page, which is what a reader would have typed into a save dialog —
    // the same answer the file name uses, for the same reason.
    title: deckTitle(doc) ?? '',
    pages: deckSlides(doc).length
  };
}

/**
 * Whether this is a **name** in a library or an **address** to fetch.
 *
 * One attribute holds both (`goToDeck`), and the app resolves it: a name it has, or a source it
 * can fetch. Which is honest about what a reference is here — until a reader has put a deck in
 * their library, an address is the only thing that can be followed, and after they have, a name is
 * the thing that survives being moved.
 *
 * The test is *not* "does it look like a URL": a library name cannot contain a slash, a dot or a
 * colon (`libraryName` strips them), so anything with one is an address. Which means the rule is
 * about what a name is allowed to be rather than about guessing at a string — and it stays true
 * when the addresses change shape.
 */
export function isLibraryName(source: string | undefined): boolean {
  if (!source) return false;
  return !/[/.:?#\s]/.test(source);
}
