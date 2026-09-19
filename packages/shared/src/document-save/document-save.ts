import { LibraryRevisionConflict, type documentLibrary, type LibraryEntry } from '../document-library/document-library';

type Store = ReturnType<typeof documentLibrary>;
type Pending = { entry: LibraryEntry; text: string; revision: number | null };
export type DocumentSaveStatus = 'saving' | 'saved' | 'conflict' | 'error';

/** Ordered conditional writes shared by product adapters. A failed write keeps its snapshot. */
export class DocumentSaveQueue {
  private pending = new Map<string, Pending>();
  private revisions = new Map<string, number | null>();
  private conflicts = new Map<string, string>();
  private queue: Promise<void> = Promise.resolve();
  constructor(
    private store: Store,
    private drafts: Store,
    private notify: (id: string, status: DocumentSaveStatus) => void,
  ) {}
  get dirty() { return this.pending.size > 0; }
  adopt(id: string, revision: number | null) {
    this.revisions.set(id, revision);
    this.conflicts.delete(id);
  }
  capture(entry: LibraryEntry, text: string) {
    this.pending.set(entry.name, { entry, text, revision: this.revisions.get(entry.name) ?? null });
    this.notify(entry.name, 'saving');
  }
  async flush(): Promise<boolean> {
    this.queue = this.queue.then(async () => {
      for (const [id, snapshot] of [...this.pending]) {
        try {
          let draft = this.conflicts.get(id);
          if (!draft) {
            try {
              const row = await this.store.keep(snapshot.entry, snapshot.text, { expectedRevision: snapshot.revision });
              this.revisions.set(id, row.revision ?? 0);
              const newer = this.pending.get(id);
              if (newer && newer !== snapshot) newer.revision = row.revision ?? 0;
            } catch (error) {
              if (!(error instanceof LibraryRevisionConflict)) throw error;
              draft = crypto.randomUUID();
              this.conflicts.set(id, draft);
            }
          }
          if (draft) await this.drafts.keep({ ...snapshot.entry, name: draft, metadata: { ...snapshot.entry.metadata, originalId: id } }, snapshot.text);
          if (this.pending.get(id) === snapshot) this.pending.delete(id);
          this.notify(id, this.pending.has(id) ? 'saving' : draft ? 'conflict' : 'saved');
        } catch { this.notify(id, 'error'); }
      }
    });
    await this.queue;
    return !this.dirty;
  }
}
