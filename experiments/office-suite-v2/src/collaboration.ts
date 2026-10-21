import * as Y from 'yjs';
import { CORE_LIMITS } from './contracts.ts';
import type { WorkbookContext, WorkbookEvent, WorkbookCommand, WorkbookProjection } from './contracts.ts';
import { createEvent, projectWorkbook, validateEvent } from './workbook.ts';
import type { AuthenticatedSession, Admission, StoreOptions } from './durable-store.ts';

const root = 'native-events-v1';
export const SHEET_UPDATE_BYTES = 1_000_000;

/** Provider encoding only. Core validates/owns the native data and event algebra. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) throw new Error('non-json-event-encoding');
    return encoded;
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(Reflect.get(value, key))}`).join(',')}}`;
}

function readEvent(body: unknown, key: string, context: WorkbookContext): WorkbookEvent {
  if (typeof body !== 'string' || new TextEncoder().encode(body).length > CORE_LIMITS.eventBytes) throw new Error('invalid-event-body');
  const result = validateEvent(JSON.parse(body), context);
  if (!result.ok) throw new Error(`native-event:${result.code}`);
  if (result.event.eventId !== key || canonical(result.event) !== body) throw new Error('event-key-or-encoding');
  return result.event;
}

/** Validate visible AND hidden Yjs items. Plain map projection misses overwritten losers. */
function validateNativeDocument(context: WorkbookContext, candidate: Y.Doc, previous: Y.Doc, update: Uint8Array, authenticated?: AuthenticatedSession): void {
  if (candidate.store.pendingStructs !== null || candidate.store.pendingDs !== null) throw new Error('incomplete-update');
  if ([...candidate.share.keys()].some(key => key !== root)) throw new Error('unknown-sheet-root');
  const admitted = previous.getMap<string>(root);
  const events = candidate.getMap<string>(root);
  if (events.size > CORE_LIMITS.events) throw new Error('native-event-limit');
  for (const [key, body] of admitted) if (events.get(key) !== body) throw new Error('admitted-event-changed');
  const decoded = Y.decodeUpdate(update);
  if (decoded.ds.clients.size !== 0) throw new Error('native-event-deletion');
  for (const item of decoded.structs) {
    const parent: unknown = item instanceof Y.Item ? item.parent : null;
    if (!(item instanceof Y.Item) || item.length !== 1 || item.origin !== null || item.rightOrigin !== null ||
        parent !== root || item.parentSub === null || !(item.content instanceof Y.ContentAny) || item.content.arr.length !== 1) {
      throw new Error('non-append-event-update');
    }
    const key = item.parentSub;
    const body: unknown = item.content.arr[0];
    const event = readEvent(body, key, context);
    if (events.get(key) !== body) throw new Error('hidden-event-collision');
    const old = admitted.get(key);
    if (old !== undefined && old !== body) throw new Error('event-id-collision');
    if (old === undefined && authenticated !== undefined &&
        (event.actorId !== authenticated.actorId || event.sessionId !== authenticated.sessionId)) throw new Error('authenticated-event-identity');
  }
  let items = 0;
  for (const structs of candidate.store.clients.values()) {
    for (const item of structs) {
      if (!(item instanceof Y.Item) || item.deleted || item.parent !== events || item.parentSub === null ||
          item.length !== 1 || !(item.content instanceof Y.ContentAny) || item.content.arr.length !== 1 || events.get(item.parentSub) !== item.content.arr[0]) {
        throw new Error('native-log-not-append-only');
      }
      const event = readEvent(item.content.arr[0], item.parentSub, context);
      if (!admitted.has(event.eventId) && authenticated !== undefined &&
          (event.actorId !== authenticated.actorId || event.sessionId !== authenticated.sessionId)) throw new Error('authenticated-event-identity');
      items++;
    }
  }
  if (items !== events.size) throw new Error('duplicate-native-event-writer');
  // Only Core determines causal ordering, pending/refused outcomes and cell alternatives.
  projectWorkbook(context, [...events].map(([key, body]) => readEvent(body, key, context)));
}

export function sheetAdmission(context: WorkbookContext): Admission {
  return Object.freeze({ documentId: context.documentId, generation: context.generation, engineId: 'sheet-v1', contractVersion: context.contractVersion,
    engineVersion: context.engineVersion, schemaVersion: context.schemaVersion, adapterVersion: context.adapterVersion });
}

export function sheetUpdateValidator(context: WorkbookContext): StoreOptions['validateDocument'] {
  return (candidate, previous, update, authenticated) => validateNativeDocument(context, candidate, previous, update, authenticated);
}

export class SheetReplica {
  readonly context: WorkbookContext;
  readonly identity: AuthenticatedSession;
  #doc: Y.Doc;
  #events: Y.Map<string>;

  constructor(context: WorkbookContext, identity: AuthenticatedSession, initial?: Uint8Array) {
    this.context = Object.freeze({ ...context });
    this.identity = Object.freeze({ ...identity });
    this.#doc = new Y.Doc();
    this.#events = this.#doc.getMap(root);
    try { if (initial !== undefined) this.receive(initial); }
    catch (error) { this.#doc.destroy(); throw error; }
  }

  get events(): readonly WorkbookEvent[] {
    return Object.freeze([...this.#events].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, body]) => readEvent(body, key, this.context)));
  }
  get projection(): WorkbookProjection { return projectWorkbook(this.context, this.events); }

  commit(command: WorkbookCommand, eventId: string = globalThis.crypto.randomUUID()): Readonly<{ event: WorkbookEvent; update: Uint8Array }> {
    if (this.#events.has(eventId)) throw new Error('duplicate-event-id');
    const event = createEvent(this.context, { ...this.identity, eventId }, this.events.map(event => event.eventId), command);
    const before = Y.encodeStateVector(this.#doc);
    this.#doc.transact(() => this.#events.set(event.eventId, canonical(event)), this.identity);
    return Object.freeze({ event, update: Y.encodeStateAsUpdate(this.#doc, before) });
  }

  undo(targetEventId: string, eventId: string = globalThis.crypto.randomUUID()): Readonly<{ event: WorkbookEvent; update: Uint8Array }> {
    return this.commit({ kind: 'undo', targetEventId }, eventId);
  }

  exportUpdate(): Uint8Array { return Y.encodeStateAsUpdate(this.#doc); }
  frontier(): Uint8Array { return Y.encodeStateVector(this.#doc); }

  /** Peer tests use controlled trusted transport. Real writes must pass the durable server validator. */
  receive(update: Uint8Array): void {
    if (!(update instanceof Uint8Array) || update.length === 0 || update.length > SHEET_UPDATE_BYTES) throw new Error('sheet-update-bounds');
    const candidate = new Y.Doc();
    try {
      candidate.getMap(root);
      Y.applyUpdate(candidate, this.exportUpdate());
      Y.applyUpdate(candidate, update);
      validateNativeDocument(this.context, candidate, this.#doc, update);
      Y.applyUpdate(this.#doc, update, 'remote');
    } finally { candidate.destroy(); }
  }

  replaceSnapshot(): never { throw new Error('snapshot-replacement-refused'); }
  destroy(): void { this.#doc.destroy(); }
}
