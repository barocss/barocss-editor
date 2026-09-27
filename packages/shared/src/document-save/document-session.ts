import type { documentLibrary, LibraryEntry, LibraryRow } from '../document-library/document-library';
import { DocumentSaveQueue } from './document-save';
import { assertProductDocumentOpen, registerProductDocumentHost } from './product-host';

export type DocumentSessionStatus = '불러오는 중' | '저장 중' | '저장됨' | '충돌한 초안 보관됨' | '저장 실패' | '복원 실패' | '복구 필요';
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

/** These three local codecs use documentFileFormat. Its loader refreshes node timestamps and
 * may add or omit empty node fields; those differences do not change saved content. */
function sameSavedText(saved: string, loaded: string): boolean {
  if (saved === loaded) return true;
  let original: unknown;
  let current: unknown;
  try { original = JSON.parse(saved); current = JSON.parse(loaded); }
  catch { return false; }
  const file = (value: unknown): value is { format: string; version: number; document: object } =>
    !!value && typeof value === 'object' && !Array.isArray(value)
    && typeof (value as { format?: unknown }).format === 'string'
    && typeof (value as { version?: unknown }).version === 'number'
    && !!(value as { document?: unknown }).document && typeof (value as { document?: unknown }).document === 'object';
  if (!file(original) || !file(current) || original.format !== current.format || original.version !== current.version
    || !['barocss-word', 'barocss-slides', 'barocss-site'].includes(original.format)) return false;
  const normalize = (value: unknown, inNode = false, inMetadata = false): unknown => {
    if (Array.isArray(value)) return value.map(child => normalize(child, inNode));
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).flatMap(([key, child]) => {
      if (inMetadata && key === 'loadedAt') return [];
      const normalized = normalize(child, key === 'document' || (inNode && key === 'content'), inNode && key === 'metadata');
      if (inNode && ((key === 'content' && Array.isArray(normalized) && normalized.length === 0)
        || ((key === 'metadata' || key === 'attributes') && normalized && typeof normalized === 'object' && Object.keys(normalized).length === 0))) return [];
      return [[key, normalized]];
    }));
  };
  const same = (left: unknown, right: unknown): boolean => {
    if (Object.is(left, right)) return true;
    if (Array.isArray(left) || Array.isArray(right))
      return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => same(value, right[index]));
    if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
    const leftEntries = Object.entries(left), rightEntries = Object.entries(right);
    return leftEntries.length === rightEntries.length && leftEntries.every(([key, value]) =>
      Object.prototype.hasOwnProperty.call(right, key) && same(value, (right as Record<string, unknown>)[key]));
  };
  return same(normalize(original), normalize(current));
}

/** Product-neutral local document lifecycle. Runtime editor node IDs never identify a file. */
export class DocumentSession {
  id = crypto.randomUUID() as string;
  private last = '';
  private timer?: ReturnType<typeof setTimeout>;
  private replacing = false;
  private quarantined = false;
  private hasCurrentDocument = false;
  private recoveryId?: string;
  private stopped = false;
  private version = 0;
  private opening = 0;
  private pendingInput = false;
  private settled: DocumentSessionStatus = '저장됨';
  private unsubscribe?: () => void;
  private unregisterHost?: () => void;
  private writes: DocumentSaveQueue;
  get recoveryRequired() { return this.quarantined; }
  constructor(readonly options: DocumentSessionOptions, private notify: (status: DocumentSessionStatus) => void) {
    this.writes = new DocumentSaveQueue(options.documents, options.drafts, (id, status) => {
      if (!this.quarantined && id === this.id && (status === 'saved' || status === 'conflict')) this.settled = status === 'saved' ? '저장됨' : '충돌한 초안 보관됨';
      if (!this.stopped && !this.quarantined && (id === this.id || status === 'error'))
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
      try { await this.open(id); } catch { if (!this.stopped) this.notify(this.quarantined ? '복구 필요' : '복원 실패'); }
    } else { this.hasCurrentDocument = true; this.remember(); this.capture(); this.schedule(); }
    if (!this.stopped && ['note', 'word', 'slides', 'site'].includes(this.options.key))
      this.unregisterHost = registerProductDocumentHost({ product: this.options.key as 'note' | 'word' | 'slides' | 'site', id: () => this.id, beforeNavigate: () => this.beforeReplace() });
  }
  private leaving = (event: BeforeUnloadEvent) => {
    if (this.quarantined) {
      event.preventDefault(); event.returnValue = '';
    } else if (this.writes.dirty || this.pendingInput) {
      void this.flush(); event.preventDefault(); event.returnValue = '';
    }
  };
  private visibility = () => { if (document.visibilityState === 'hidden') void this.flush(); };
  /** An embedded editor has input that has not yet reached the host model. */
  input() {
    if (this.stopped || this.replacing || this.quarantined) return;
    this.pendingInput = true; this.version++; this.notify('저장 중'); this.schedule();
  }
  private schedule() { clearTimeout(this.timer); this.timer = setTimeout(() => { void this.flush(); }, 300); }
  private changed = (replaced = false) => {
    if (this.replacing || this.stopped || this.quarantined) return;
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
    if (this.replacing || this.quarantined) return false;
    try {
      await this.options.beforeSnapshot?.();
      if (this.replacing || this.quarantined) return false;
      const pending = this.pendingInput;
      if (pending) { this.capture(); this.pendingInput = false; }
      const saved = await this.writes.flush();
      if (pending && saved && !this.stopped) this.notify(this.settled);
      return saved;
    } catch { if (!this.stopped) this.notify('저장 실패'); return false; }
  }
  async beforeReplace() {
    if (this.replacing || this.quarantined) return false;
    // Flushing child input can legitimately change the host revision.
    try { await this.options.beforeSnapshot?.(); }
    catch { this.notify('저장 실패'); return false; }
    const version = this.version;
    return await this.flush() && !this.stopped && this.version === version;
  }
  async open(id: string, preserveCurrentOnFailure = false): Promise<boolean> {
    const ticket = ++this.opening;
    const wasQuarantined = this.quarantined;
    if (wasQuarantined && id !== this.recoveryId) {
      this.notify('복구 필요');
      throw new Error('Reopen the current saved document before switching documents');
    }
    if (!wasQuarantined && !await this.beforeReplace()) return false;
    this.notify('불러오는 중');
    const version = this.version;
    let snapshot;
    try { await assertProductDocumentOpen(this.options.key, id); snapshot = await this.options.documents.read(id); }
    catch (error) { if (!this.stopped) this.notify(wasQuarantined ? '복구 필요' : preserveCurrentOnFailure ? this.settled : '복원 실패'); throw error; }
    if (this.stopped || ticket !== this.opening || version !== this.version) return false;
    if (!snapshot) { this.notify(wasQuarantined ? '복구 필요' : preserveCurrentOnFailure ? this.settled : '복원 실패'); throw new Error('Missing document'); }
    this.replacing = true;
    let loadedText: string;
    try {
      this.options.replace(snapshot.text);
      loadedText = this.options.snapshot().text;
      if (!sameSavedText(snapshot.text, loadedText)) throw new Error('Opened document does not match the saved copy');
    } catch (error) {
      if (!wasQuarantined) this.recoveryId = this.hasCurrentDocument ? this.id : id;
      this.quarantined = true;
      clearTimeout(this.timer);
      this.notify('복구 필요');
      throw error;
    }
    finally { this.replacing = false; }
    this.writes.adopt(id, snapshot.row.revision ?? 0);
    this.id = id;
    this.last = loadedText;
    this.settled = '저장됨';
    this.quarantined = false;
    this.recoveryId = undefined;
    this.hasCurrentDocument = true;
    this.remember(); this.notify('저장됨');
    return true;
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
    if (!this.quarantined) void this.writes.flush();
  }
}
