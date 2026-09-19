import type { documentLibrary, LibraryEntry, LibraryRow } from '../document-library/document-library';
import { DocumentSaveQueue } from './document-save';
import { assertProductDocumentOpen, registerProductDocumentHost } from './product-host';

export type DocumentSessionStatus = '불러오는 중' | '저장 중' | '저장됨' | '충돌한 초안 보관됨' | '저장 실패' | '복원 실패';
export interface DocumentSessionOptions {
  key: string;
  documents: ReturnType<typeof documentLibrary>;
  drafts: ReturnType<typeof documentLibrary>;
  snapshot(): { text: string; title: string; count: number };
  replace(text: string): void;
  subscribe(changed: (replaced?: boolean) => void): () => void;
  /** Flush nested editors before storage or navigation. Reject to keep current work. */
  beforeSnapshot?(): Promise<void>;
}

/** Product-neutral local document lifecycle. Runtime editor node IDs never identify a file. */
export class DocumentSession {
  id = crypto.randomUUID() as string;
  private last = '';
  private timer?: ReturnType<typeof setTimeout>;
  private replacing = false;
  private stopped = false;
  private version = 0;
  private opening = 0;
  private pendingInput = false;
  private settled: DocumentSessionStatus = '저장됨';
  private unsubscribe?: () => void;
  private unregisterHost?: () => void;
  private writes: DocumentSaveQueue;
  constructor(readonly options: DocumentSessionOptions, private notify: (status: DocumentSessionStatus) => void) {
    this.writes = new DocumentSaveQueue(options.documents, options.drafts, (id, status) => {
      if (id === this.id && (status === 'saved' || status === 'conflict')) this.settled = status === 'saved' ? '저장됨' : '충돌한 초안 보관됨';
      if (!this.stopped && (id === this.id || status === 'error'))
        notify({ saving: '저장 중', saved: '저장됨', conflict: '충돌한 초안 보관됨', error: '저장 실패' }[status] as DocumentSessionStatus);
    });
  }
  private remember() { history.replaceState(null, '', `${location.pathname}${location.search}#${this.options.key}=${encodeURIComponent(this.id)}`); }
  async start() {
    this.unsubscribe = this.options.subscribe(this.changed);
    window.addEventListener('beforeunload', this.leaving);
    document.addEventListener('visibilitychange', this.visibility);
    const id = new URLSearchParams(location.hash.slice(1)).get(this.options.key);
    if (id) {
      try { await this.open(id); } catch { if (!this.stopped) this.notify('복원 실패'); }
    } else { this.remember(); this.capture(); this.schedule(); }
    if (!this.stopped && ['note', 'word', 'slides', 'site'].includes(this.options.key))
      this.unregisterHost = registerProductDocumentHost({ product: this.options.key as 'note' | 'word' | 'slides' | 'site', id: () => this.id, beforeNavigate: () => this.beforeReplace() });
  }
  private leaving = (event: BeforeUnloadEvent) => {
    if (this.writes.dirty || this.pendingInput) {
      void this.flush(); event.preventDefault(); event.returnValue = '';
    }
  };
  private visibility = () => { if (document.visibilityState === 'hidden') void this.flush(); };
  /** An embedded editor has input that has not yet reached the host model. */
  input() {
    if (this.stopped || this.replacing) return;
    this.pendingInput = true; this.version++; this.notify('저장 중'); this.schedule();
  }
  private schedule() { clearTimeout(this.timer); this.timer = setTimeout(() => { void this.flush(); }, 300); }
  private changed = (replaced = false) => {
    if (this.replacing || this.stopped) return;
    this.version++;
    if (replaced) { this.id = crypto.randomUUID(); this.last = ''; this.settled = '저장됨'; }
    this.remember(); this.capture(); this.schedule();
  };
  private capture() {
    const { text, title, count } = this.options.snapshot();
    if (text === this.last) return;
    this.last = text;
    this.writes.capture({ name: this.id, title, count }, text);
  }
  async flush() {
    clearTimeout(this.timer);
    try {
      await this.options.beforeSnapshot?.();
      const pending = this.pendingInput;
      if (pending) { this.capture(); this.pendingInput = false; }
      const saved = await this.writes.flush();
      if (pending && saved && !this.stopped) this.notify(this.settled);
      return saved;
    } catch { if (!this.stopped) this.notify('저장 실패'); return false; }
  }
  async beforeReplace() {
    // Flushing child input can legitimately change the host revision.
    try { await this.options.beforeSnapshot?.(); }
    catch { this.notify('저장 실패'); return false; }
    const version = this.version;
    return await this.flush() && !this.stopped && this.version === version;
  }
  async open(id: string): Promise<boolean> {
    const ticket = ++this.opening;
    this.notify('불러오는 중');
    if (!await this.beforeReplace()) return false;
    const version = this.version;
    let snapshot;
    try { await assertProductDocumentOpen(this.options.key, id); snapshot = await this.options.documents.read(id); }
    catch (error) { if (!this.stopped) this.notify('복원 실패'); throw error; }
    if (this.stopped || ticket !== this.opening || version !== this.version) return false;
    if (!snapshot) { this.notify('복원 실패'); throw new Error('Missing document'); }
    this.replacing = true;
    try {
      this.options.replace(snapshot.text);
      this.id = id;
      this.settled = '저장됨';
      this.writes.adopt(id, snapshot.row.revision ?? 0);
      this.last = this.options.snapshot().text;
      this.remember(); this.notify('저장됨');
      return true;
    } catch (error) { this.notify('복원 실패'); throw error; }
    finally { this.replacing = false; }
  }
  async recover(row: LibraryRow) {
    if (!await this.beforeReplace()) return false;
    const version = this.version;
    const snapshot = await this.options.drafts.read(row.name);
    if (!snapshot) throw new Error('Missing draft');
    if (version !== this.version || this.stopped) return false;
    const id = crypto.randomUUID();
    const entry: LibraryEntry = { name: id, title: `${row.title || '자료'} (복구)`, count: row.count };
    await this.options.documents.keep(entry, snapshot.text, { expectedRevision: null });
    return this.open(id);
  }
  stop() {
    this.stopped = true; clearTimeout(this.timer); this.unsubscribe?.(); this.unregisterHost?.();
    window.removeEventListener('beforeunload', this.leaving);
    document.removeEventListener('visibilitychange', this.visibility);
    void this.writes.flush();
  }
}
