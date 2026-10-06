import type { documentLibrary, LibraryEntry, LibraryRow } from '../document-library/document-library';
import { DocumentSaveQueue } from './document-save';
import { assertProductDocumentOpen, captureProductReplacementPreparation, registerProductDocumentHost, type ProductReplacementPreparation } from './product-host';
import { captureDocumentLocation, documentLocationId, documentLocationURL } from './document-location';

/** Product state is independent of the display language. Translate only in UI. */
export type DocumentSessionStatus = 'loading' | 'saving' | 'saved' | 'conflict' | 'save-error' | 'restore-error' | 'recovery-required';
export type DocumentSessionStatusCode = DocumentSessionStatus;
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
  private navigationEpoch = 0;
  private pendingInput = false;
  private settled: DocumentSessionStatusCode = 'saved';
  private unsubscribe?: () => void;
  private unregisterHost?: () => void;
  private writes: DocumentSaveQueue;
  get recoveryRequired() { return this.quarantined; }
  constructor(
    readonly options: DocumentSessionOptions,
    private notify: (status: DocumentSessionStatus) => void = () => {}
  ) {
    this.writes = new DocumentSaveQueue(options.documents, options.drafts, (id, status) => {
      if (!this.quarantined && id === this.id && (status === 'saved' || status === 'conflict')) this.settled = status;
      if (!this.stopped && !this.quarantined && (id === this.id || status === 'error'))
        this.notify(status === 'error' ? 'save-error' : status);
    });
  }
  private remember() { history.replaceState(history.state, '', documentLocationURL(this.options.key, this.id)); }
  private exposeHost() {
    if (!this.stopped && ['note', 'word', 'slides', 'site'].includes(this.options.key))
      this.unregisterHost = registerProductDocumentHost({ product: this.options.key as 'note' | 'word' | 'slides' | 'site', id: () => this.id, identityEpoch: () => this.navigationEpoch, beforeNavigate: () => this.hasCurrentDocument ? this.beforeReplace() : Promise.resolve(false),
        ...(this.options.key === 'word' ? { saveCurrentSnapshot: (isCurrent: () => boolean) => this.saveCurrentSnapshot(isCurrent) } : {}) });
  }
  async start() {
    let id: string | undefined;
    const ownsLocation = captureDocumentLocation(this.options.key);
    try { id = documentLocationId(this.options.key); }
    catch { this.notify('restore-error'); this.exposeHost(); return; }
    this.unsubscribe = this.options.subscribe(this.changed);
    window.addEventListener('beforeunload', this.leaving);
    document.addEventListener('visibilitychange', this.visibility);
    if (id) {
      try { await this.open(id, false, ownsLocation); } catch { if (!this.stopped) this.notify(this.quarantined ? 'recovery-required' : 'restore-error'); }
    } else { this.remember(); this.capture(); this.schedule(); }
    this.exposeHost();
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
    this.pendingInput = true; this.version++; this.notify('saving'); this.schedule();
  }
  private schedule() { clearTimeout(this.timer); this.timer = setTimeout(() => { void this.flush(); }, 300); }
  private changed = (replaced = false) => {
    if (this.replacing || this.stopped || this.quarantined) return;
    this.version++;
    if (replaced) { this.navigationEpoch++; this.id = crypto.randomUUID(); this.last = ''; this.settled = 'saved'; }
    this.remember(); this.capture(); this.schedule();
    if (replaced && this.unregisterHost) window.dispatchEvent(new Event('wonffice:host-change'));
  };
  private capture() {
    const { text, title, count } = this.options.snapshot();
    if (text === this.last) return;
    this.last = text;
    this.writes.capture({ name: this.id, title, count }, text);
    this.hasCurrentDocument = true;
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
    } catch { if (!this.stopped) this.notify('save-error'); return false; }
  }
  /** A submitted comment is a current native write, not permission to leave its composer. */
  private async saveCurrentSnapshot(isCurrent: () => boolean): Promise<boolean> {
    const id = this.id, epoch = this.navigationEpoch;
    const owns = () => isCurrent() && !this.stopped && !this.replacing && !this.quarantined &&
      this.hasCurrentDocument && this.id === id && this.navigationEpoch === epoch;
    if (!owns()) return false;
    clearTimeout(this.timer);
    try {
      await this.options.beforeSnapshot?.();
      if (!owns()) return false;
      const version = this.version, pending = this.pendingInput;
      this.capture();
      if (!owns() || this.version !== version) return false;
      this.pendingInput = false;
      const saved = await this.writes.flush();
      if (!owns() || this.version !== version || this.pendingInput || this.settled === 'conflict') return false;
      if (pending && saved) this.notify(this.settled);
      return saved;
    } catch { if (owns()) this.notify('save-error'); return false; }
  }
  private async prepareReplacement(preparation: ProductReplacementPreparation) {
    if (this.stopped || this.replacing || this.quarantined) return false;
    const id = this.id, epoch = this.navigationEpoch;
    const owns = () => !this.stopped && this.id === id && this.navigationEpoch === epoch;
    try {
      if (!await preparation.prepare() || !owns() || this.replacing || this.quarantined || !preparation.isPrepared()) return false;
      // Flushing child input can legitimately change the host revision.
      await this.options.beforeSnapshot?.();
    }
    catch { this.notify('save-error'); return false; }
    if (!owns() || !preparation.isPrepared()) return false;
    const version = this.version;
    return await this.flush() && owns() && this.version === version && preparation.isPrepared();
  }
  async beforeReplace() {
    return this.prepareReplacement(captureProductReplacementPreparation());
  }
  async open(id: string, preserveCurrentOnFailure = false, ownsLocation: () => boolean = () => true): Promise<boolean> {
    const ticket = ++this.opening;
    this.navigationEpoch++;
    const wasQuarantined = this.quarantined;
    if (wasQuarantined && id !== this.recoveryId) {
      this.notify('recovery-required');
      throw new Error('Reopen the current saved document before switching documents');
    }
    const preparation = captureProductReplacementPreparation();
    if (wasQuarantined) {
      // Recovery must not flush a partially replaced native model.
      if (!await preparation.prepare() || this.stopped || !preparation.isPrepared()) return false;
    } else if (!await this.prepareReplacement(preparation)) return false;
    this.notify('loading');
    const version = this.version;
    let snapshot;
    try { await assertProductDocumentOpen(this.options.key, id); snapshot = await this.options.documents.read(id); }
    catch (error) { if (!this.stopped) this.notify(wasQuarantined ? 'recovery-required' : preserveCurrentOnFailure ? this.settled : 'restore-error'); throw error; }
    if (this.stopped || ticket !== this.opening || version !== this.version) return false;
    if (!ownsLocation()) { this.notify('restore-error'); return false; }
    if (!snapshot) { this.notify(wasQuarantined ? 'recovery-required' : preserveCurrentOnFailure ? this.settled : 'restore-error'); throw new Error('Missing document'); }
    if (!preparation.isPrepared()) { this.notify(wasQuarantined ? 'recovery-required' : this.settled); return false; }
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
      this.notify('recovery-required');
      throw error;
    }
    finally { this.replacing = false; }
    this.writes.adopt(id, snapshot.row.revision ?? 0);
    this.id = id;
    this.last = loadedText;
    this.settled = 'saved';
    this.quarantined = false;
    this.recoveryId = undefined;
    this.hasCurrentDocument = true;
    this.remember(); this.notify('saved');
    if (this.unregisterHost) window.dispatchEvent(new Event('wonffice:host-change'));
    return true;
  }
  async recover(row: LibraryRow) {
    const preparation = captureProductReplacementPreparation();
    if (!await this.prepareReplacement(preparation)) return false;
    const version = this.version;
    const snapshot = await this.options.drafts.read(row.name);
    if (!snapshot) throw new Error('Missing draft');
    if (version !== this.version || this.stopped || !preparation.isPrepared()) return false;
    const id = crypto.randomUUID();
    const entry: LibraryEntry = { name: id, title: `${row.title || '자료'} (복구)`, count: row.count };
    await this.options.documents.keep(entry, snapshot.text, { expectedRevision: null });
    if (version !== this.version || this.stopped || !preparation.isPrepared()) return false;
    return this.open(id);
  }
  stop() {
    this.stopped = true; clearTimeout(this.timer); this.unsubscribe?.(); this.unregisterHost?.();
    window.removeEventListener('beforeunload', this.leaving);
    document.removeEventListener('visibilitychange', this.visibility);
    if (!this.quarantined) void this.writes.flush();
  }
}
