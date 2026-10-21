import * as Y from 'yjs';

/** A deliberately bounded paragraph experiment, not a Note block codec. */
export const PROSE_LIMITS = Object.freeze({ text: 100_000, paragraphs: 512, updateBytes: 1_000_000 });
export type ProseMark = 'bold' | 'italic' | 'underline';
export type ProseRun = Readonly<{ insert: string; attributes?: Readonly<Partial<Record<ProseMark, true>>> }>;
const root = 'prose-v1';
const marks = new Set<string>(['bold', 'italic', 'underline']);

export function validateProseDocument(doc: Y.Doc): void {
  if (doc.store.pendingStructs !== null || doc.store.pendingDs !== null) throw new Error('incomplete-update');
  if ([...doc.share.keys()].some(key => key !== root)) throw new Error('unknown-prose-root');
  const text = doc.getText(root);
  if (text.length > PROSE_LIMITS.text) throw new Error('prose-text-limit');
  if (text.toString().includes('\r') || text.toString().split('\n').length > PROSE_LIMITS.paragraphs) {
    throw new Error('prose-paragraph-limit');
  }
  for (const run of text.toDelta()) {
    if (typeof run.insert !== 'string') throw new Error('prose-embed-refused');
    if (run.attributes !== undefined) {
      for (const [key, value] of Object.entries(run.attributes)) {
        if (!marks.has(key) || value !== true) throw new Error('prose-mark-refused');
      }
    }
  }
}

export class ProseReplica {
  readonly sessionId: string;
  #doc: Y.Doc;
  #text: Y.Text;
  #origin = Object.freeze({ local: true });
  #undo: Y.UndoManager;

  constructor(sessionId: string, initial?: Uint8Array) {
    if (!sessionId || sessionId.length > 200) throw new Error('invalid-session');
    this.sessionId = sessionId;
    this.#doc = new Y.Doc();
    this.#text = this.#doc.getText(root);
    try { if (initial !== undefined) this.receive(initial); }
    catch (error) { this.#doc.destroy(); throw error; }
    this.#undo = new Y.UndoManager(this.#text, { captureTimeout: 0, trackedOrigins: new Set([this.#origin]) });
  }

  get text(): string { return this.#text.toString(); }
  get paragraphs(): readonly string[] { return Object.freeze(this.text.split('\n')); }
  get runs(): readonly ProseRun[] {
    validateProseDocument(this.#doc);
    return Object.freeze(this.#text.toDelta().map((run: ProseRun) => Object.freeze(structuredClone(run))));
  }

  #range(index: number, length = 0): void {
    if (!Number.isSafeInteger(index) || !Number.isSafeInteger(length) || index < 0 || length < 0 || index + length > this.#text.length) {
      throw new Error('invalid-text-range');
    }
  }

  #change(change: () => void): Uint8Array {
    const before = Y.encodeStateVector(this.#doc);
    this.#doc.transact(change, this.#origin);
    return Y.encodeStateAsUpdate(this.#doc, before);
  }

  insert(index: number, value: string): Uint8Array {
    this.#range(index);
    if (typeof value !== 'string' || value.includes('\r') || this.#text.length + value.length > PROSE_LIMITS.text ||
        this.paragraphs.length + value.split('\n').length - 1 > PROSE_LIMITS.paragraphs) throw new Error('prose-input-limit');
    return this.#change(() => this.#text.insert(index, value));
  }

  deleteText(index: number, length: number): Uint8Array {
    this.#range(index, length);
    if (this.text.slice(index, index + length).includes('\n')) throw new Error('use-explicit-join');
    return this.#change(() => this.#text.delete(index, length));
  }

  mark(index: number, length: number, mark: ProseMark, enabled: boolean): Uint8Array {
    this.#range(index, length);
    if (!marks.has(mark) || typeof enabled !== 'boolean') throw new Error('prose-mark-refused');
    return this.#change(() => this.#text.format(index, length, { [mark]: enabled ? true : null }));
  }

  split(index: number): Uint8Array { return this.insert(index, '\n'); }
  join(boundaryIndex: number): Uint8Array {
    this.#range(boundaryIndex, 1);
    if (this.text[boundaryIndex] !== '\n') throw new Error('not-paragraph-boundary');
    return this.#change(() => this.#text.delete(boundaryIndex, 1));
  }

  moveParagraph(): never { throw new Error('paragraph-move-unsupported'); }
  deleteParagraph(): never { throw new Error('paragraph-delete-unsupported'); }

  anchor(index: number, assoc = 0): Uint8Array {
    this.#range(index);
    return Y.encodeRelativePosition(Y.createRelativePositionFromTypeIndex(this.#text, index, assoc));
  }

  resolve(anchor: Uint8Array): number | null {
    if (anchor.length > 1024) throw new Error('anchor-limit');
    const position = Y.createAbsolutePositionFromRelativePosition(Y.decodeRelativePosition(anchor), this.#doc);
    return position?.type === this.#text ? position.index : null;
  }

  #historyCapacity(): void {
    // Conservative bound: any subset of retained text can be restored by undo.
    // Refuse before mutation if that superset would exceed the admitted profile.
    let text = 0, paragraphs = 1;
    for (const structs of this.#doc.store.clients.values()) for (const item of structs) {
      if (item instanceof Y.Item && item.content instanceof Y.ContentString) {
        text += item.content.str.length;
        paragraphs += item.content.str.split('\n').length - 1;
      }
    }
    if (text > PROSE_LIMITS.text || paragraphs > PROSE_LIMITS.paragraphs) throw new Error('prose-history-capacity-refused');
  }
  undo(): boolean { this.#historyCapacity(); return this.#undo.undo() !== null; }
  redo(): boolean { this.#historyCapacity(); return this.#undo.redo() !== null; }
  exportUpdate(): Uint8Array { return Y.encodeStateAsUpdate(this.#doc); }
  frontier(): Uint8Array { return Y.encodeStateVector(this.#doc); }

  receive(update: Uint8Array): void {
    if (!(update instanceof Uint8Array) || update.length === 0 || update.length > PROSE_LIMITS.updateBytes) throw new Error('update-size');
    const trial = new Y.Doc();
    try {
      trial.getText(root);
      Y.applyUpdate(trial, this.exportUpdate());
      Y.applyUpdate(trial, update);
      validateProseDocument(trial);
      Y.applyUpdate(this.#doc, update, 'remote');
    } finally { trial.destroy(); }
  }

  destroy(): void { this.#undo.destroy(); this.#doc.destroy(); }
}
