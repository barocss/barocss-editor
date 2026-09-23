import { copyNoteSnapshotFile, isNotePageId, NOTE_FILE_FORMAT, NOTE_FILE_VERSION,
  readNoteSnapshotFile, type NoteDocument } from '@barocss/office-note/file';

export type ServerDocumentMode = 'snapshot' | 'initializing' | 'collaborative';
export type SaveOperation = 'create' | 'update';

export interface ServerNoteHead {
  documentId: string;
  tenantId: string;
  workspaceId: string;
  product: 'note';
  title: string;
  metadataRevision: number;
  mode: ServerDocumentMode;
  pageId: string;
  documentKey: string;
  fileFormat: typeof NOTE_FILE_FORMAT;
  fileVersion: typeof NOTE_FILE_VERSION;
  revision: number;
  snapshotHash: string;
}

export interface ServerNoteReceipt {
  operation: SaveOperation;
  idempotencyKey: string;
  requestHash: string;
  document: ServerNoteHead;
  snapshotText: string;
}

export type NoteSaveAttempt =
  | { operation: 'create'; workspaceId: string; title: string; snapshotText: string; idempotencyKey: string }
  | { operation: 'update'; documentId: string; expectedRevision: number; snapshotText: string; idempotencyKey: string };

export type OpenServerNote =
  | { mode: 'snapshot'; document: ServerNoteHead; snapshotText: string; note: NoteDocument }
  | { mode: 'initializing' | 'collaborative'; document: ServerNoteHead };

export interface ServerNoteTransport {
  /** The Office host supplies a memory-only authenticated fetch and handles token refresh. */
  authorizedFetch: typeof fetch;
  tenantId: string;
  apiBase?: string;
}

export class ServerNoteError extends Error {
  constructor(public readonly status: number | null, public readonly code: string) {
    super(code);
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const protocolError = (): never => { throw new ServerNoteError(null, 'invalid_server_response'); };

function noteHead(value: unknown, tenantId: string): ServerNoteHead {
  if (!isRecord(value) || value.tenantId !== tenantId || value.product !== 'note' ||
    typeof value.documentId !== 'string' || typeof value.workspaceId !== 'string' ||
    typeof value.title !== 'string' || typeof value.documentKey !== 'string' ||
    !Number.isSafeInteger(value.metadataRevision) || (value.metadataRevision as number) < 1 ||
    !['snapshot', 'initializing', 'collaborative'].includes(value.mode as string) ||
    !isNotePageId(value.pageId) || value.fileFormat !== NOTE_FILE_FORMAT ||
    value.fileVersion !== NOTE_FILE_VERSION || !Number.isSafeInteger(value.revision) ||
    (value.revision as number) < 1 || typeof value.snapshotHash !== 'string' ||
    !/^[0-9a-f]{64}$/.test(value.snapshotHash)) return protocolError();
  return value as unknown as ServerNoteHead;
}

async function sha256(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

function requestParts(attempt: NoteSaveAttempt): unknown[] {
  return attempt.operation === 'create'
    ? ['create', attempt.workspaceId, 'note', attempt.title, NOTE_FILE_FORMAT, NOTE_FILE_VERSION,
      'new-page-copy', attempt.snapshotText]
    : ['update', attempt.documentId, attempt.expectedRevision, attempt.snapshotText];
}

/** A fixed attempt keeps the exact bytes and key for receipt lookup or safe retry. */
export function noteSaveAttempt(attempt: NoteSaveAttempt): Readonly<NoteSaveAttempt> {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(attempt.idempotencyKey) ||
    'error' in readNoteSnapshotFile(attempt.snapshotText)) {
    throw new Error('저장 요청을 고정할 수 없습니다.');
  }
  return Object.freeze({ ...attempt });
}

export function createServerNoteClient({ authorizedFetch, tenantId, apiBase = '/api' }: ServerNoteTransport) {
  const root = `${apiBase.replace(/\/$/, '')}/v1/tenants/${encodeURIComponent(tenantId)}`;
  const send = async (path: string, method = 'GET', body?: unknown): Promise<unknown> => {
    let response: Response;
    try {
      response = await authorizedFetch(`${root}${path}`, {
        method,
        ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      });
    } catch {
      throw new ServerNoteError(null, 'network_error');
    }
    let result: unknown;
    try { result = await response.json(); }
    catch {
      if (!response.ok) throw new ServerNoteError(response.status, 'http_error');
      return protocolError();
    }
    if (!response.ok) {
      throw new ServerNoteError(response.status,
        isRecord(result) && typeof result.status === 'string' ? result.status : 'http_error');
    }
    return result;
  };

  const receipt = async (operation: SaveOperation, idempotencyKey: string): Promise<ServerNoteReceipt> => {
    const result = await send(`/receipts/${operation}/${encodeURIComponent(idempotencyKey)}`);
    return parseReceipt(result, operation, idempotencyKey);
  };

  const parseReceipt = (value: unknown, operation: SaveOperation, idempotencyKey: string): ServerNoteReceipt => {
    if (!isRecord(value) || value.operation !== operation || value.idempotencyKey !== idempotencyKey ||
      typeof value.requestHash !== 'string' || !/^[0-9a-f]{64}$/.test(value.requestHash) ||
      typeof value.snapshotText !== 'string') return protocolError();
    return { operation, idempotencyKey, requestHash: value.requestHash,
      document: noteHead(value.document, tenantId), snapshotText: value.snapshotText };
  };

  const verifySnapshot = async (document: ServerNoteHead, snapshotText: string): Promise<NoteDocument> => {
    if (await sha256(snapshotText) !== document.snapshotHash) return protocolError();
    const read = readNoteSnapshotFile(snapshotText);
    if ('error' in read || read.document.attributes.pageId !== document.pageId) return protocolError();
    return read.document;
  };

  const open = async (documentId: string): Promise<OpenServerNote> => {
    const result = await send(`/documents/${encodeURIComponent(documentId)}`);
    if (!isRecord(result)) return protocolError();
    const document = noteHead(result.document, tenantId);
    if (document.documentId !== documentId) return protocolError();
    if (document.mode !== 'snapshot') {
      if (Object.hasOwn(result, 'snapshotText')) return protocolError();
      return { mode: document.mode, document };
    }
    if (typeof result.snapshotText !== 'string') return protocolError();
    const note = await verifySnapshot(document, result.snapshotText);
    return { mode: 'snapshot', document, snapshotText: result.snapshotText, note };
  };

  const save = async (attempt: Readonly<NoteSaveAttempt>): Promise<ServerNoteReceipt> => {
    const result = attempt.operation === 'create'
      ? await send('/documents', 'POST', {
        workspaceId: attempt.workspaceId, product: 'note', title: attempt.title,
        fileFormat: NOTE_FILE_FORMAT, fileVersion: NOTE_FILE_VERSION,
        snapshotText: attempt.snapshotText, idempotencyKey: attempt.idempotencyKey,
        importMode: 'new-page-copy'
      })
      : await send(`/documents/${encodeURIComponent(attempt.documentId)}/snapshot`, 'PUT', {
        expectedRevision: attempt.expectedRevision, snapshotText: attempt.snapshotText,
        idempotencyKey: attempt.idempotencyKey
      });
    return parseReceipt(result, attempt.operation, attempt.idempotencyKey);
  };

  /** Confirm the fixed request and the same-account GET before showing server-saved state. */
  const confirm = async (attempt: Readonly<NoteSaveAttempt>, saved: ServerNoteReceipt): Promise<OpenServerNote & { mode: 'snapshot' }> => {
    const receipt = parseReceipt(saved, attempt.operation, attempt.idempotencyKey);
    let expectedCopy: ReturnType<typeof copyNoteSnapshotFile> | null = null;
    if (attempt.operation === 'create') {
      try { expectedCopy = copyNoteSnapshotFile(attempt.snapshotText, receipt.document.pageId); }
      catch { return protocolError(); }
    }
    if (receipt.requestHash !== await sha256(JSON.stringify(requestParts(attempt))) ||
      receipt.document.mode !== 'snapshot' ||
      (attempt.operation === 'create'
        ? receipt.document.workspaceId !== attempt.workspaceId || receipt.document.revision !== 1 ||
          expectedCopy === null || 'error' in expectedCopy ||
          receipt.snapshotText !== expectedCopy.snapshotText
        : receipt.document.documentId !== attempt.documentId ||
          receipt.document.revision !== attempt.expectedRevision + 1 ||
          receipt.snapshotText !== attempt.snapshotText)) return protocolError();
    await verifySnapshot(receipt.document, receipt.snapshotText);
    const reopened = await open(receipt.document.documentId);
    if (reopened.mode !== 'snapshot' || reopened.document.revision !== receipt.document.revision ||
      reopened.document.pageId !== receipt.document.pageId ||
      reopened.document.snapshotHash !== receipt.document.snapshotHash ||
      reopened.snapshotText !== receipt.snapshotText) return protocolError();
    return reopened;
  };

  const list = async (workspaceId?: string): Promise<ServerNoteHead[]> => {
    const documents: ServerNoteHead[] = [];
    const visited = new Set<string>();
    let after: string | null = null;
    do {
      const query = new URLSearchParams({ product: 'note', ...(workspaceId ? { workspaceId } : {}),
        ...(after ? { after } : {}) });
      const result = await send(`/documents?${query}`);
      if (!isRecord(result) || !Array.isArray(result.documents) ||
        (result.nextCursor !== null && typeof result.nextCursor !== 'string')) return protocolError();
      documents.push(...result.documents.map(value => noteHead(value, tenantId)));
      after = result.nextCursor as string | null;
      if (after && visited.has(after)) return protocolError();
      if (after) visited.add(after);
    } while (after);
    return documents;
  };

  return { list, open, save, receipt, confirm };
}
