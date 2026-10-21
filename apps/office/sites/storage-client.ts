import { indexedDBDocumentLibrary, LibraryRevisionConflict, type LibraryEntry, type LibraryKeepItem, type LibraryKeepOptions,
  type LibrarySnapshot, type LibrarySpec } from '@barocss/shared';
import { STORAGE_ROOT, MAX_COMMIT_BYTES, storageHash, type StorageSession, type StoreKind, type StorageItem, type StorageReceipt } from './storage-protocol';

type Store = ReturnType<typeof indexedDBDocumentLibrary>;
export class OfficeStorageError extends Error {
  constructor(readonly status: number | null, readonly code: string) { super(code); }
}
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
function checkedSnapshot(value: unknown): LibrarySnapshot {
  if (!object(value) || typeof value.text !== 'string' || !object(value.row) || typeof value.row.name !== 'string' ||
    !Number.isSafeInteger(value.row.revision) || Number(value.row.revision) < 1 || !Number.isFinite(value.row.savedAt)) throw new OfficeStorageError(null, 'invalid_receipt');
  return value as unknown as LibrarySnapshot;
}
export async function discoverOfficeSession(request: typeof fetch = fetch): Promise<StorageSession> {
  const response = await request(`${STORAGE_ROOT}/session`, { cache: 'no-store', credentials: 'same-origin', signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new OfficeStorageError(response.status, response.status === 401 ? 'authentication_required' : 'storage_unavailable');
  const value = await response.json();
  if (!object(value) || typeof value.userScope !== 'string' || !value.userScope ||
    response.headers.get('X-Office-User-Scope') !== value.userScope || typeof value.workspaceId !== 'string' ||
    !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value.workspaceId)) throw new OfficeStorageError(null, 'invalid_session');
  return value as unknown as StorageSession;
}

export function createOfficeStorageHost(session: StorageSession, retire: () => void, request: typeof fetch = fetch) {
  let active = true;
  const stores = new Map<StoreKind, Store>();
  const check = () => { if (!active) throw new OfficeStorageError(401, 'session_retired'); };
  const failIdentity = () => { if (active) { active = false; retire(); } throw new OfficeStorageError(401, 'session_retired'); };
  const send = async (path: string, init?: RequestInit) => {
    check();
    const response = await request(`${STORAGE_ROOT}/${session.workspaceId}/${path}`, { ...init, signal: AbortSignal.timeout(15000), credentials: 'same-origin', cache: 'no-store',
      headers: { ...init?.headers, 'X-Office-Expected-Scope': session.userScope } });
    check();
    if (response.status === 401 || response.status === 403 || response.headers.get('X-Office-User-Scope') !== session.userScope) return failIdentity();
    const value: unknown = await response.json(); check();
    if (!response.ok) {
      if (response.status === 409 && object(value) && value.code === 'revision_conflict') {
        throw new LibraryRevisionConflict(null, value.latest ? checkedSnapshot(value.latest) : undefined);
      }
      throw new OfficeStorageError(response.status, object(value) && typeof value.code === 'string' ? value.code : 'storage_unavailable');
    }
    if (!object(value)) throw new OfficeStorageError(null, 'invalid_receipt');
    if (value.workspaceId !== session.workspaceId) return failIdentity();
    return value;
  };
  const localRecovery = (product: string) => indexedDBDocumentLibrary({ db: `barocss-${product}-recovery-sites-${session.workspaceId}`, store: 'drafts' });
  function store(kind: StoreKind): Store {
    const existing = stores.get(kind); if (existing) return existing;
    const observed = new Map<string, number | null>();
    let queue: Promise<unknown> = Promise.resolve();
    let pending: { requestId: string; items: StorageItem[]; requestHash: string; signature: string } | undefined;
    const read = async (name: string) => {
      try {
        const value = await send(`${kind}/item?name=${encodeURIComponent(name)}`);
        const result = checkedSnapshot(value.snapshot);
        if (result.row.name !== name) throw new OfficeStorageError(null, 'invalid_receipt');
        observed.set(name, result.row.revision!); return result;
      } catch (cause) {
        if (cause instanceof OfficeStorageError && cause.status === 404) { observed.set(name, null); return undefined; }
        throw cause;
      }
    };
    const snapshots = async () => {
      const result: LibrarySnapshot[] = [], names = new Set<string>(); let after = '';
      for (;;) {
        const value = await send(`${kind}/snapshots${after ? `?after=${encodeURIComponent(after)}` : ''}`);
        if (!Array.isArray(value.snapshots) || value.nextCursor !== null && typeof value.nextCursor !== 'string') throw new OfficeStorageError(null, 'invalid_receipt');
        for (const raw of value.snapshots) {
          const row = checkedSnapshot(raw); if (names.has(row.row.name)) throw new OfficeStorageError(null, 'invalid_receipt');
          names.add(row.row.name); observed.set(row.row.name, row.row.revision!); result.push(row);
        }
        if (value.nextCursor === null) break;
        if (!value.nextCursor || value.nextCursor <= after) throw new OfficeStorageError(null, 'invalid_receipt');
        after = value.nextCursor;
      }
      return result.sort((a, b) => b.row.savedAt - a.row.savedAt);
    };
    const transmit = async (held: NonNullable<typeof pending>): Promise<LibrarySnapshot[]> => {
      const value = await send(`${kind}/commit`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: held.requestId, items: held.items }) });
      if (value.requestId !== held.requestId || value.requestHash !== held.requestHash || !Array.isArray(value.snapshots) || value.snapshots.length !== held.items.length) throw new OfficeStorageError(null, 'invalid_receipt');
      const receipt = value as unknown as StorageReceipt;
      return receipt.snapshots.map((raw, index) => {
        const saved = checkedSnapshot(raw), expected = held.items[index];
        const { revision, savedAt, ...entry } = saved.row;
        void savedAt;
        if (saved.text !== expected.text || JSON.stringify(entry) !== JSON.stringify(expected.entry) || revision! <= (expected.expectedRevision ?? 0)) throw new OfficeStorageError(null, 'invalid_receipt');
        observed.set(saved.row.name, revision!); return saved;
      });
    };
    const mutate = (input: StorageItem[]) => {
      const proposed = structuredClone(input);
      const work = async () => {
        check();
        const signature = JSON.stringify(proposed);
        if (pending) {
          const held = pending, recovered = await transmit(held); pending = undefined;
          if (signature === held.signature) return recovered;
          // Only advance through this transport's own confirmed request. A foreign/latest head
          // must still match the exact own receipt before a newer draft can use its revision.
          for (const item of proposed) {
            const index = held.items.findIndex(previous => previous.entry.name === item.entry.name);
            if (index < 0) throw new OfficeStorageError(null, 'previous_save_recovered_reload');
            const previous = (JSON.parse(held.signature) as StorageItem[])[index], saved = recovered[index];
            if (item.expectedRevision !== previous.expectedRevision || item.expectedRevision === null) throw new OfficeStorageError(null, 'previous_save_recovered_reload');
            const current = await read(item.entry.name);
            if (!current || current.row.revision !== saved.row.revision || current.text !== saved.text) throw new LibraryRevisionConflict(item.expectedRevision, current);
            item.expectedRevision = saved.row.revision!;
          }
        }
        if (new TextEncoder().encode(JSON.stringify(proposed)).length > MAX_COMMIT_BYTES - 200) throw new OfficeStorageError(413, 'document_too_large');
        pending = { requestId: crypto.randomUUID(), items: proposed, requestHash: await storageHash(JSON.stringify([kind, proposed])), signature };
        try { const result = await transmit(pending); pending = undefined; return result; }
        catch (cause) {
          if (cause instanceof LibraryRevisionConflict || cause instanceof OfficeStorageError && cause.status !== null && cause.status >= 400 && cause.status < 500) pending = undefined;
          // Recovery is an explicit local draft, never a successful document save/fallback.
          if (!(cause instanceof LibraryRevisionConflict) && ['note', 'word', 'slides', 'site'].includes(kind)) {
            for (const item of input) if (!item.deleted) {
              await localRecovery(kind).keep({ ...item.entry, name: `server-${item.entry.name}`, metadata: { ...item.entry.metadata, originalId: item.entry.name } }, item.text).catch(() => {});
            }
          }
          throw cause;
        }
      };
      const result = queue.then(work); queue = result.catch(() => {}); return result;
    };
    const expected = async (name: string, revision: number | null | undefined) => {
      if (revision !== undefined) return revision;
      if (!observed.has(name)) await read(name);
      return observed.get(name) ?? null;
    };
    const keep = async (entry: LibraryEntry, text: string, options: LibraryKeepOptions = {}) => {
      const frozen = structuredClone({ entry, text, options });
      return (await mutate([{ entry: frozen.entry, text: frozen.text,
        expectedRevision: await expected(frozen.entry.name, frozen.options.expectedRevision) }]))[0].row;
    };
    const keepMany = async (items: readonly LibraryKeepItem[]) => {
      if (!items.length) return [];
      const frozen = structuredClone(items);
      const proposed = await Promise.all(frozen.map(async item => ({ entry: item.entry, text: item.text,
        expectedRevision: await expected(item.entry.name, item.expectedRevision) })));
      return (await mutate(proposed)).map(row => row.row);
    };
    const drop = async (name: string) => {
      const revision = await expected(name, undefined); if (revision === null) return;
      await mutate([{ entry: { name }, text: '', expectedRevision: revision, deleted: true }]); observed.set(name, null);
    };
    const result = { rows: async () => (await snapshots()).map(row => row.row), snapshots, read,
      text: async (name: string) => (await read(name))?.text, keep, keepMany, drop };
    stores.set(kind, result); return result;
  }
  return {
    workspaceId: session.workspaceId, label: '서버 작업 공간',
    retire: () => { active = false; },
    checkSession: async () => {
      const current = await discoverOfficeSession(request);
      if (current.userScope !== session.userScope || current.workspaceId !== session.workspaceId) failIdentity();
    },
    library(spec: LibrarySpec): Store {
      if (spec.store === 'drafts') return indexedDBDocumentLibrary({ ...spec, db: `${spec.db}-sites-${session.workspaceId}` });
      if (spec.store === 'catalog') {
        if (spec.db !== `wonffice-workspace-${session.workspaceId}`) throw new OfficeStorageError(403, 'workspace_unavailable');
        return store('catalog');
      }
      const mapping: Record<string, StoreKind> = { 'barocss-note/documents': 'note', 'barocss-word/documents': 'word',
        'barocss-slides-workspace/documents': 'slides', 'barocss-site-workspace/documents': 'site',
        'barocss-slides/decks': 'slides-library', 'barocss-site/sites': 'site-library' };
      const kind = mapping[`${spec.db}/${spec.store}`];
      if (!kind) throw new OfficeStorageError(null, 'unsupported_storage');
      return store(kind);
    }
  };
}
