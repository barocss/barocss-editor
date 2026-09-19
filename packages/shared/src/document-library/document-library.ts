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
  /** Product-owned library state, kept atomically with the document bytes. */
  metadata?: Record<string, unknown>;
}

/** One row as a list reads it. */
export interface LibraryRow extends LibraryEntry {
  savedAt: number;
  /** Monotonic per-document storage revision; legacy rows read as zero. */
  revision?: number;
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

export interface LibrarySnapshot { row: LibraryRow; text: string; }
export interface LibraryKeepOptions {
  /** Omit for legacy unconditional writes; null requires a new identity, zero matches a legacy row. */
  expectedRevision?: number | null;
}
export interface LibraryKeepItem extends LibraryKeepOptions { entry: LibraryEntry; text: string; }
export class LibraryRevisionConflict extends Error {
  constructor(readonly expectedRevision: number | null, readonly latest: LibrarySnapshot | undefined) {
    super('The document was changed in another writer.');
    this.name = 'LibraryRevisionConflict';
  }
}
const revisionOf = (row: { revision?: number }) => Number.isSafeInteger(row.revision) && Number(row.revision) >= 0 ? Number(row.revision) : 0;
const snapshotOf = ({ text, ...row }: Kept): LibrarySnapshot => ({ row: { ...row, revision: revisionOf(row) }, text });

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
          const fail = (error: unknown) => {
            db.close();
            reject(error ?? new Error('Document storage transaction failed'));
          };
          try {
            const transaction = db.transaction(spec.store, mode);
            transaction.onabort = () => fail(transaction.error);
            transaction.onerror = () => fail(transaction.error);
            const request = work(transaction.objectStore(spec.store));
            request.onerror = () => fail(request.error);
            // A successful request can still be rolled back by the transaction.
            transaction.oncomplete = () => {
              db.close();
              resolve(request.result);
            };
          } catch (error) {
            fail(error);
          }
        })
    );

  /** Every document the reader has kept, the most recently saved first. */
  const rows = async (): Promise<LibraryRow[]> => {
    const all = (await run<Kept[]>('readonly', (s) => s.getAll() as IDBRequest<Kept[]>)) ?? [];
    return all
      .map(({ name, title, count, savedAt, metadata, revision }) => ({ name, title, count, savedAt, revision: revisionOf({ revision }), ...(metadata ? { metadata } : {}) }))
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
  const keep = async (entry: LibraryEntry, source: string, options: LibraryKeepOptions = {}): Promise<LibraryRow> => {
    const expected = options.expectedRevision;
    if (expected !== undefined && expected !== null && (!Number.isSafeInteger(expected) || expected < 0)) throw new Error('Invalid expected document revision.');
    const db = await open();
    return new Promise<LibraryRow>((resolve, reject) => {
      let failure: unknown;
      let kept: Kept | undefined;
      const fail = (error: unknown) => { failure = error; };
      try {
        // Read and compare inside the same readwrite transaction as put. Other connections wait.
        const tx = db.transaction(spec.store, 'readwrite');
        tx.onabort = () => { db.close(); reject(failure ?? tx.error ?? new Error('Document storage transaction aborted')); };
        tx.onerror = () => { fail(tx.error); };
        tx.oncomplete = () => {
          db.close();
          if (failure || !kept) reject(failure ?? new Error('Document was not saved'));
          else resolve(snapshotOf(kept).row);
        };
        const store = tx.objectStore(spec.store);
        const read = store.get(entry.name) as IDBRequest<Kept | undefined>;
        read.onerror = () => { fail(read.error); tx.abort(); };
        read.onsuccess = () => {
          try {
            const current = read.result;
            const actual = current ? revisionOf(current) : null;
            if (expected !== undefined && actual !== expected) {
              fail(new LibraryRevisionConflict(expected, current ? snapshotOf(current) : undefined));
              tx.abort(); return;
            }
            const revision = (actual ?? 0) + 1;
            if (!Number.isSafeInteger(revision)) { fail(new Error('Document revision limit reached')); tx.abort(); return; }
            kept = { ...entry, text: source, savedAt: Date.now(), revision };
            const write = store.put(kept);
            write.onerror = () => { fail(write.error); tx.abort(); };
          } catch (error) { fail(error); tx.abort(); }
        };
      } catch (error) { db.close(); reject(error); }
    });
  };

  /** Read bytes and revision from one snapshot, avoiding a rows()/text() race. */
  const read = async (name: string): Promise<LibrarySnapshot | undefined> => {
    const kept = await run<Kept | undefined>('readonly', store => store.get(name));
    return kept ? snapshotOf(kept) : undefined;
  };

  /** Bytes and list metadata from a single consistent readonly transaction. */
  const snapshots = async (): Promise<LibrarySnapshot[]> => {
    const all = (await run<Kept[]>('readonly', store => store.getAll())) ?? [];
    return all.map(snapshotOf).sort((a, b) => b.row.savedAt - a.row.savedAt);
  };

  /** Compare every revision before writing, then commit all records or none. */
  const keepMany = async (items: readonly LibraryKeepItem[]): Promise<LibraryRow[]> => {
    const names = new Set<string>();
    for (const item of items) {
      const name = item?.entry?.name, expected = item?.expectedRevision;
      if (typeof name !== 'string' || !name.trim() || names.has(name)) throw new Error('Document names must be nonempty and unique.');
      if (typeof item.text !== 'string') throw new Error('Document text must be a string.');
      if (expected !== undefined && expected !== null && (!Number.isSafeInteger(expected) || expected < 0)) throw new Error('Invalid expected document revision.');
      names.add(name);
    }
    if (!items.length) return [];
    // Freeze the caller's proposed restore while IndexedDB waits for another writer.
    const proposed = structuredClone(items);
    const db = await open();
    return new Promise<LibraryRow[]>((resolve, reject) => {
      let failure: unknown;
      try {
        const tx = db.transaction(spec.store, 'readwrite');
        let aborted = false;
        const abort = (error: unknown) => {
          if (aborted) return;
          aborted = true; failure = error ?? new Error('Document storage transaction failed');
          tx.abort();
        };
        const kept: Kept[] = new Array(proposed.length);
        tx.onabort = () => { db.close(); reject(failure ?? tx.error ?? new Error('Document storage transaction aborted')); };
        tx.onerror = () => { failure ??= tx.error; };
        tx.oncomplete = () => { db.close(); failure ? reject(failure) : resolve(kept.map(value => snapshotOf(value).row)); };
        const store = tx.objectStore(spec.store);
        let remaining = proposed.length;
        proposed.forEach((item, index) => {
          const request = store.get(item.entry.name) as IDBRequest<Kept | undefined>;
          request.onerror = () => abort(request.error);
          request.onsuccess = () => {
            if (failure) return;
            try {
              const current = request.result, actual = current ? revisionOf(current) : null;
              if (item.expectedRevision !== undefined && item.expectedRevision !== actual) {
                abort(new LibraryRevisionConflict(item.expectedRevision, current ? snapshotOf(current) : undefined)); return;
              }
              const revision = (actual ?? 0) + 1;
              if (!Number.isSafeInteger(revision)) { abort(new Error('Document revision limit reached')); return; }
              kept[index] = { ...item.entry, text: item.text, revision, savedAt: Date.now() };
              if (--remaining) return;
              for (const value of kept) {
                const write = store.put(value);
                write.onerror = () => abort(write.error);
              }
            } catch (error) { abort(error); }
          };
        });
      } catch (error) { db.close(); reject(error); }
    });
  };

  /** Take one out. Documents that pointed at it are not changed: their link now warns, honestly. */
  const drop = async (name: string): Promise<void> => {
    await run('readwrite', (s) => s.delete(name));
  };

  return { rows, text, read, keep, drop, snapshots, keepMany };
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
