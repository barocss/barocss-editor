/* 자기 배럴을 거치지 않는다 — 심볼이 사는 모듈에서 곧장. */
import { libraryEntry, libraryName, type LibraryEntry } from './deck-library';
import type { DeckAccess } from './deck';

/**
 * Where a reader's decks are **kept** — the half the model deliberately does not have.
 *
 * ## Why IndexedDB and not `localStorage`
 *
 * Measured before choosing: the sample deck is 42KB of JSON and the starter is 8KB, and both are
 * pictureless. A deck with two photographs in it is a base64 data URL or two — megabytes — and
 * `localStorage` has about five in total and fails by **throwing in the middle of a save**. A
 * store whose predictable failure is "the reader loses the deck they were saving" is not a store
 * this product should be built on.
 *
 * IndexedDB costs about sixty lines of promise-wrapping, which is the whole of what follows.
 *
 * ## Why this is here and not in the app — and what changed
 *
 * It was in the app, and the reason written here was that `office-slides` has no DOM in it: a
 * library's *naming* is a question about documents and lives in `deck-library.ts`, while where
 * the bytes are is a question about the host.
 *
 * That reason was half right and the half that was wrong is the one that matters. **A different
 * host would answer it differently — but there is only ever one answer per host, and the app was
 * not the only host.** Left in the app it would have been re-written by the second thing that
 * wanted a deck back: the presenter's window, a server-side render, the next product's importer.
 * That is the shape this repository finds every round — *있는데 못 닿는다*.
 *
 * What is still true is the boundary this file respects: **nothing here touches the DOM at import
 * time.** `indexedDB` is named inside functions, so the root entry point stays readable from Node
 * — which is exactly why this is not in `./ui`. It needs a browser, not React.
 *
 * A host without IndexedDB — a server, a test — calls none of this, and the naming half
 * (`deck-library.ts`) stays usable there on its own.
 */

const DB = 'barocss-slides';
const STORE = 'decks';
const VERSION = 1;

/** What is kept for one deck: the entry a list shows, and the file itself. */
interface Kept extends LibraryEntry {
  /** The deck as a file — the same text 저장 writes, so the two cannot drift apart. */
  text: string;
  /** When it was put here, so a list can order by what a reader touched last. */
  savedAt: number;
}

export interface LibraryRow extends LibraryEntry {
  savedAt: number;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      // Keyed by the name, because the name *is* the reference a document holds: two rows with one
      // name would be a `goToDeck` that could go to either.
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'name' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const request = work(transaction.objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        transaction.oncomplete = () => db.close();
      })
  );
}

/** Every deck the reader has kept, the most recently saved first. */
export async function libraryRows(): Promise<LibraryRow[]> {
  const all = (await run<Kept[]>('readonly', (store) => store.getAll() as IDBRequest<Kept[]>)) ?? [];
  return all
    .map(({ name, title, pages, savedAt }) => ({ name, title, pages, savedAt }))
    .sort((a, b) => b.savedAt - a.savedAt);
}

/** One deck's file, or nothing when the library does not have that name. */
export async function libraryDeck(name: string): Promise<string | undefined> {
  const kept = await run<Kept | undefined>(
    'readonly',
    (store) => store.get(name) as IDBRequest<Kept | undefined>
  );
  return kept?.text;
}

/**
 * Put this deck in the library, under a name nothing else is using.
 *
 * The name is minted from the deck's own title (`libraryName`), and an existing name is **kept**:
 * saving 가격표 again is saving the same deck, and minting `가격표-2` would leave every button
 * pointing at the old copy — which is the one thing a durable reference must not do.
 */
export async function keepInLibrary(
  doc: DeckAccess,
  text: string,
  /** The name to overwrite, when a reader is saving one they already have. */
  under?: string
): Promise<LibraryRow> {
  const rows = await libraryRows();
  const entry = libraryEntry(
    doc,
    under ?? libraryName(rows.map((row) => row.name), libraryEntry(doc, '').title)
  );
  const kept: Kept = { ...entry, text, savedAt: Date.now() };
  await run('readwrite', (store) => store.put(kept));
  return { name: kept.name, title: kept.title, pages: kept.pages, savedAt: kept.savedAt };
}

/** Take one out. The decks that pointed at it are not changed: their button now warns, honestly. */
export async function dropFromLibrary(name: string): Promise<void> {
  await run('readwrite', (store) => store.delete(name));
}
