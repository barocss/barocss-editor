/**
 * **Where a reader's documents are kept** — the half the model deliberately does not have.
 *
 * ## Why IndexedDB and not `localStorage`
 *
 * `office-slides` measured this before choosing and the measurement holds for every product: the
 * sample deck is 42KB of JSON and the starter is 8KB, and both are pictureless. A document with
 * two photographs in it is a base64 data URL or two — megabytes — and `localStorage` has about
 * five in total and fails by **throwing in the middle of a save**. A store whose predictable
 * failure is *"the reader loses the document they were saving"* is not one a product should be
 * built on.
 *
 * IndexedDB costs about sixty lines of promise-wrapping, which is most of what follows.
 *
 * ## Why this is here and not in a product
 *
 * It was in `office-slides`, and before that in `apps/slide`. The note there is worth keeping
 * because it is the argument for this move, one layer further out: *"A different host would answer
 * it differently — but there is only ever one answer per host, and the app was not the only
 * host."* The same sentence applies to the product: a different **product** stores different
 * things about a document, but *how bytes are kept* is one answer per host, not one per product.
 *
 * Word had none of this. `apps/word/src/main.tsx` loaded the sample on every reload, so a reader
 * could write a page and it was gone when they came back. The roadmap's own diagram said so —
 * **`[ 서비스 ] 거의 비어 있다`**.
 *
 * ## The boundary this file respects
 *
 * **Nothing here touches a browser at import time.** `indexedDB` is named inside functions, so
 * `@barocss/shared` stays readable from Node — which is why this is not behind a `./ui` door. It
 * needs a browser, not React. A host without IndexedDB — a server, a test — calls none of it.
 */

/** What a product says about one of its documents, for a list to show. */
export interface LibraryEntry {
  /** The durable reference. A document that links to another holds **this**, not a title. */
  name: string;
  title?: string;
  /** Whatever the product counts — slides, pages, words. */
  count?: number;
}

/** One row as a list reads it. */
export interface LibraryRow extends LibraryEntry {
  savedAt: number;
}

/** What is kept: the row a list shows, and the file itself. */
interface Kept extends LibraryRow {
  /** The document as a file — the same text 저장 writes, so the two cannot drift apart. */
  text: string;
}

export interface LibrarySpec {
  /** The IndexedDB database. One per product, so two products cannot collide on a name. */
  db: string;
  /** The object store inside it. */
  store: string;
  version?: number;
}

export function documentLibrary(spec: LibrarySpec) {
  const VERSION = spec.version ?? 1;

  const open = (): Promise<IDBDatabase> =>
    new Promise((resolve, reject) => {
      const request = indexedDB.open(spec.db, VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        /*
         * Keyed by the name, because the name **is** the reference a document holds: two rows with
         * one name would be a link that could go to either.
         */
        if (!db.objectStoreNames.contains(spec.store)) {
          db.createObjectStore(spec.store, { keyPath: 'name' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

  const run = <T>(
    mode: IDBTransactionMode,
    work: (store: IDBObjectStore) => IDBRequest<T>
  ): Promise<T> =>
    open().then(
      (db) =>
        new Promise<T>((resolve, reject) => {
          const transaction = db.transaction(spec.store, mode);
          const request = work(transaction.objectStore(spec.store));
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
          transaction.oncomplete = () => db.close();
        })
    );

  /** Every document the reader has kept, the most recently saved first. */
  const rows = async (): Promise<LibraryRow[]> => {
    const all = (await run<Kept[]>('readonly', (s) => s.getAll() as IDBRequest<Kept[]>)) ?? [];
    return all
      .map(({ name, title, count, savedAt }) => ({ name, title, count, savedAt }))
      .sort((a, b) => b.savedAt - a.savedAt);
  };

  /** One document's file, or nothing when the library does not have that name. */
  const text = async (name: string): Promise<string | undefined> => {
    const kept = await run<Kept | undefined>(
      'readonly',
      (s) => s.get(name) as IDBRequest<Kept | undefined>
    );
    return kept?.text;
  };

  /**
   * Put this document in the library under the name it is given.
   *
   * The **caller** mints the name, because minting it needs to know what the product calls an
   * untitled document and what names are already taken — and because saving 가격표 again is saving
   * the same document. Minting `가격표-2` there would leave every link pointing at the old copy,
   * which is the one thing a durable reference must not do.
   */
  const keep = async (entry: LibraryEntry, source: string): Promise<LibraryRow> => {
    const kept: Kept = { ...entry, text: source, savedAt: Date.now() };
    await run('readwrite', (s) => s.put(kept));
    return { name: kept.name, title: kept.title, count: kept.count, savedAt: kept.savedAt };
  };

  /** Take one out. Documents that pointed at it are not changed: their link now warns, honestly. */
  const drop = async (name: string): Promise<void> => {
    await run('readwrite', (s) => s.delete(name));
  };

  return { rows, text, keep, drop };
}

/**
 * A name nothing else is using, minted from what the document is called.
 *
 * Slugged rather than used raw: the name goes in links and in a URL one day, and a title with a
 * slash in it is a name that cannot be one. An existing name is **kept** by the caller — this only
 * answers *"what shall we call a new one"*.
 */
export function freeLibraryName(taken: Iterable<string>, title: string | undefined, fallback: string): string {
  const used = new Set(taken);
  const base =
    (title ?? '')
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || fallback;

  if (!used.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const next = `${base}-${n}`;
    if (!used.has(next)) return next;
  }
}
