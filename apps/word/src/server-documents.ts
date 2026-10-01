import type { WordDocument } from './server-file';
import { readServerWordFile, WORD_FORMAT, WORD_FILE_VERSION } from './server-file';
export type ServerDocumentMode = 'snapshot' | 'initializing' | 'collaborative';
export type SaveOperation = 'create' | 'update';

export interface ServerWordHead {
  documentId: string;
  tenantId: string;
  workspaceId: string;
  product: 'word';
  title: string;
  metadataRevision: number;
  mode: ServerDocumentMode;
  pageId: null;
  documentKey: string;
  fileFormat: typeof WORD_FORMAT;
  fileVersion: typeof WORD_FILE_VERSION;
  revision: number;
  snapshotHash: string;
}

export interface ServerWordReceipt {
  operation: SaveOperation;
  idempotencyKey: string;
  requestHash: string;
  document: ServerWordHead;
  snapshotText: string;
}

export type WordSaveAttempt =
  | { operation: 'create'; workspaceId: string; title: string; snapshotText: string; idempotencyKey: string }
  | { operation: 'update'; documentId: string; expectedRevision: number; snapshotText: string; idempotencyKey: string };

export type OpenServerWord =
  | { mode: 'snapshot'; document: ServerWordHead; snapshotText: string; word: WordDocument }
  | { mode: 'initializing' | 'collaborative'; document: ServerWordHead };

export interface ServerWordTransport {
  /** The Office host supplies a memory-only authenticated fetch and handles token refresh. */
  authorizedFetch: typeof fetch;
  tenantId: string;
  workspaceId: string;
  apiBase?: string;
}

export class ServerWordError extends Error {
  constructor(public readonly status: number | null, public readonly code: string) {
    super(code);
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const protocolError = (): never => { throw new ServerWordError(null, 'invalid_server_response'); };

const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

function wordHead(value: unknown, tenantId: string, workspaceId: string): ServerWordHead {
  if (!isRecord(value) || value.tenantId !== tenantId || value.workspaceId !== workspaceId ||
    value.product !== 'word' || !isUuid(value.documentId) ||
    typeof value.title !== 'string' || typeof value.documentKey !== 'string' ||
    !Number.isSafeInteger(value.metadataRevision) || (value.metadataRevision as number) < 1 ||
    !['snapshot', 'initializing', 'collaborative'].includes(value.mode as string) ||
    value.pageId !== null || value.fileFormat !== WORD_FORMAT ||
    value.fileVersion !== WORD_FILE_VERSION || !Number.isSafeInteger(value.revision) ||
    (value.revision as number) < 1 || typeof value.snapshotHash !== 'string' ||
    !/^[0-9a-f]{64}$/.test(value.snapshotHash)) return protocolError();
  return value as unknown as ServerWordHead;
}

async function sha256(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

function requestParts(attempt: WordSaveAttempt): unknown[] {
  return attempt.operation === 'create'
    ? ['create', attempt.workspaceId, 'word', attempt.title, WORD_FORMAT, WORD_FILE_VERSION,
      null, attempt.snapshotText]
    : ['update', attempt.documentId, attempt.expectedRevision, attempt.snapshotText];
}

/** A fixed attempt keeps the exact bytes and key for receipt lookup or safe retry. */
export function wordSaveAttempt(attempt: WordSaveAttempt): Readonly<WordSaveAttempt> {
  if (!['create', 'update'].includes(attempt.operation) || typeof attempt.idempotencyKey !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(attempt.idempotencyKey) ||
    (attempt.operation === 'create' ? !isUuid(attempt.workspaceId) || typeof attempt.title !== 'string' || !attempt.title.trim() :
      !isUuid(attempt.documentId) || !Number.isSafeInteger(attempt.expectedRevision) || attempt.expectedRevision < 1) ||
    typeof attempt.snapshotText !== 'string' || 'error' in readServerWordFile(attempt.snapshotText)) {
    throw new Error('저장 요청을 고정할 수 없습니다.');
  }
  return Object.freeze({ ...attempt });
}

export function createServerWordClient({ authorizedFetch, tenantId, workspaceId, apiBase = '/api' }: ServerWordTransport) {
  if (!isUuid(tenantId) || !isUuid(workspaceId)) throw new Error('invalid_server_context');
  const root = `${apiBase.replace(/\/$/, '')}/v1/tenants/${encodeURIComponent(tenantId)}`;
  const send = async (path: string, method = 'GET', body?: unknown): Promise<unknown> => {
    let response: Response;
    try {
      response = await authorizedFetch(`${root}${path}`, {
        method,
        ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      });
    } catch (error) {
      if (isRecord(error) && error.kind === 'unauthorized') throw new ServerWordError(401, 'unauthorized');
      if (isRecord(error) && error.kind === 'forbidden') throw new ServerWordError(403, 'forbidden');
      throw new ServerWordError(null, 'network_error');
    }
    let result: unknown;
    try { result = await response.json(); }
    catch {
      if (!response.ok) throw new ServerWordError(response.status, 'http_error');
      return protocolError();
    }
    if (!response.ok) {
      throw new ServerWordError(response.status,
        isRecord(result) && typeof result.status === 'string' ? result.status : 'http_error');
    }
    return result;
  };

  const receipt = async (operation: SaveOperation, idempotencyKey: string): Promise<ServerWordReceipt> => {
    const result = await send(`/receipts/${operation}/${encodeURIComponent(idempotencyKey)}`);
    return parseReceipt(result, operation, idempotencyKey);
  };

  const parseReceipt = (value: unknown, operation: SaveOperation, idempotencyKey: string): ServerWordReceipt => {
    if (!isRecord(value) || value.operation !== operation || value.idempotencyKey !== idempotencyKey ||
      typeof value.requestHash !== 'string' || !/^[0-9a-f]{64}$/.test(value.requestHash) ||
      typeof value.snapshotText !== 'string') return protocolError();
    return { operation, idempotencyKey, requestHash: value.requestHash,
      document: wordHead(value.document, tenantId, workspaceId), snapshotText: value.snapshotText };
  };

  const verifySnapshot = async (document: ServerWordHead, snapshotText: string): Promise<WordDocument> => {
    if (await sha256(snapshotText) !== document.snapshotHash) return protocolError();
    const read = readServerWordFile(snapshotText);
    if ('error' in read) return protocolError();
    return read.document;
  };

  const open = async (documentId: string): Promise<OpenServerWord> => {
    if (!isUuid(documentId)) return protocolError();
    const result = await send(`/documents/${encodeURIComponent(documentId)}`);
    if (!isRecord(result)) return protocolError();
    const document = wordHead(result.document, tenantId, workspaceId);
    if (document.documentId !== documentId) return protocolError();
    if (document.mode !== 'snapshot') {
      if (Object.hasOwn(result, 'snapshotText')) return protocolError();
      return { mode: document.mode, document };
    }
    if (typeof result.snapshotText !== 'string') return protocolError();
    const word = await verifySnapshot(document, result.snapshotText);
    return { mode: 'snapshot', document, snapshotText: result.snapshotText, word };
  };

  const save = async (attempt: Readonly<WordSaveAttempt>): Promise<ServerWordReceipt> => {
    wordSaveAttempt(attempt);
    if (attempt.operation === 'create' && attempt.workspaceId !== workspaceId) return protocolError();
    const result = attempt.operation === 'create'
      ? await send('/documents', 'POST', {
        workspaceId: attempt.workspaceId, product: 'word', title: attempt.title,
        fileFormat: WORD_FORMAT, fileVersion: WORD_FILE_VERSION,
        snapshotText: attempt.snapshotText, idempotencyKey: attempt.idempotencyKey
      })
      : await send(`/documents/${encodeURIComponent(attempt.documentId)}/snapshot`, 'PUT', {
        expectedRevision: attempt.expectedRevision, snapshotText: attempt.snapshotText,
        idempotencyKey: attempt.idempotencyKey
      });
    return parseReceipt(result, attempt.operation, attempt.idempotencyKey);
  };

  /** Confirm the fixed request and the same-account GET before showing server-saved state. */
  const confirm = async (attempt: Readonly<WordSaveAttempt>, saved: ServerWordReceipt): Promise<OpenServerWord & { mode: 'snapshot' }> => {
    wordSaveAttempt(attempt);
    const receipt = parseReceipt(saved, attempt.operation, attempt.idempotencyKey);
    if (receipt.requestHash !== await sha256(JSON.stringify(requestParts(attempt))) ||
      receipt.document.mode !== 'snapshot' ||
      (attempt.operation === 'create'
        ? receipt.document.workspaceId !== attempt.workspaceId || receipt.document.revision !== 1 ||
          receipt.document.title !== attempt.title || receipt.snapshotText !== attempt.snapshotText
        : receipt.document.documentId !== attempt.documentId ||
          receipt.document.revision !== attempt.expectedRevision + 1 ||
          receipt.snapshotText !== attempt.snapshotText)) return protocolError();
    await verifySnapshot(receipt.document, receipt.snapshotText);
    const reopened = await open(receipt.document.documentId);
    if (reopened.mode !== 'snapshot' || reopened.document.revision !== receipt.document.revision ||
      reopened.document.pageId !== receipt.document.pageId ||
      reopened.document.title !== receipt.document.title ||
      reopened.document.metadataRevision !== receipt.document.metadataRevision ||
      reopened.document.documentKey !== receipt.document.documentKey ||
      reopened.document.snapshotHash !== receipt.document.snapshotHash ||
      reopened.snapshotText !== receipt.snapshotText) return protocolError();
    return reopened;
  };

  const list = async (): Promise<ServerWordHead[]> => {
    const documents: ServerWordHead[] = [];
    const visited = new Set<string>();
    const ids = new Set<string>();
    let after: string | null = null;
    do {
      const query = new URLSearchParams({ product: 'word', workspaceId,
        ...(after ? { after } : {}) });
      const result = await send(`/documents?${query}`);
      if (!isRecord(result) || !Array.isArray(result.documents) ||
        result.documents.length > 50 || (result.nextCursor !== null && !isUuid(result.nextCursor)) ||
        (result.nextCursor !== null && result.documents.length === 0)) return protocolError();
      for (const value of result.documents) {
        const document = wordHead(value, tenantId, workspaceId);
        if (ids.has(document.documentId)) return protocolError();
        ids.add(document.documentId);
        documents.push(document);
      }
      after = result.nextCursor as string | null;
      if (after && after !== documents.at(-1)?.documentId) return protocolError();
      if (after && visited.has(after)) return protocolError();
      if (after) visited.add(after);
    } while (after);
    return documents;
  };

  return { list, open, save, receipt, confirm };
}
