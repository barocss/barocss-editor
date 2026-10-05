import type { SiteDocument } from './server-file';
import { readServerSiteFile, SITE_FORMAT, SITE_FILE_VERSION } from './server-file';
export type ServerDocumentMode = 'snapshot' | 'initializing' | 'collaborative';
export type SaveOperation = 'create' | 'update';

export interface ServerSiteHead {
  documentId: string;
  tenantId: string;
  workspaceId: string;
  product: 'site';
  title: string;
  metadataRevision: number;
  mode: ServerDocumentMode;
  pageId: null;
  documentKey: string;
  fileFormat: typeof SITE_FORMAT;
  fileVersion: typeof SITE_FILE_VERSION;
  revision: number;
  snapshotHash: string;
}

export interface ServerSiteReceipt {
  operation: SaveOperation;
  idempotencyKey: string;
  requestHash: string;
  document: ServerSiteHead;
  snapshotText: string;
}

export type SiteSaveAttempt =
  | { operation: 'create'; workspaceId: string; title: string; snapshotText: string; idempotencyKey: string }
  | { operation: 'update'; documentId: string; expectedRevision: number; snapshotText: string; idempotencyKey: string };

export type OpenServerSite =
  | { mode: 'snapshot'; document: ServerSiteHead; snapshotText: string; site: SiteDocument }
  | { mode: 'initializing' | 'collaborative'; document: ServerSiteHead };

export interface ServerSiteTransport {
  /** The Office host supplies a memory-only authenticated fetch and handles token refresh. */
  authorizedFetch: typeof fetch;
  tenantId: string;
  workspaceId: string;
  apiBase?: string;
}

export class ServerSiteError extends Error {
  constructor(public readonly status: number | null, public readonly code: string) {
    super(code);
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const protocolError = (): never => { throw new ServerSiteError(null, 'invalid_server_response'); };

const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

function siteHead(value: unknown, tenantId: string, workspaceId: string): ServerSiteHead {
  if (!isRecord(value) || value.tenantId !== tenantId || value.workspaceId !== workspaceId ||
    value.product !== 'site' || !isUuid(value.documentId) ||
    typeof value.title !== 'string' || typeof value.documentKey !== 'string' ||
    !Number.isSafeInteger(value.metadataRevision) || (value.metadataRevision as number) < 1 ||
    !['snapshot', 'initializing', 'collaborative'].includes(value.mode as string) ||
    value.pageId !== null || value.fileFormat !== SITE_FORMAT ||
    value.fileVersion !== SITE_FILE_VERSION || !Number.isSafeInteger(value.revision) ||
    (value.revision as number) < 1 || typeof value.snapshotHash !== 'string' ||
    !/^[0-9a-f]{64}$/.test(value.snapshotHash)) return protocolError();
  return value as unknown as ServerSiteHead;
}

async function sha256(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

function requestParts(attempt: SiteSaveAttempt): unknown[] {
  return attempt.operation === 'create'
    ? ['create', attempt.workspaceId, 'site', attempt.title, SITE_FORMAT, SITE_FILE_VERSION,
      null, attempt.snapshotText]
    : ['update', attempt.documentId, attempt.expectedRevision, attempt.snapshotText];
}

/** A fixed attempt keeps the exact bytes and key for receipt lookup or safe retry. */
export function siteSaveAttempt(attempt: SiteSaveAttempt): Readonly<SiteSaveAttempt> {
  if (!['create', 'update'].includes(attempt.operation) || typeof attempt.idempotencyKey !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(attempt.idempotencyKey) ||
    (attempt.operation === 'create' ? !isUuid(attempt.workspaceId) || typeof attempt.title !== 'string' || !attempt.title.trim() :
      !isUuid(attempt.documentId) || !Number.isSafeInteger(attempt.expectedRevision) || attempt.expectedRevision < 1) ||
    typeof attempt.snapshotText !== 'string' || 'error' in readServerSiteFile(attempt.snapshotText)) {
    throw new Error('저장 요청을 고정할 수 없습니다.');
  }
  return Object.freeze({ ...attempt });
}

export function createServerSiteClient({ authorizedFetch, tenantId, workspaceId, apiBase = '/api' }: ServerSiteTransport) {
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
      if (isRecord(error) && error.kind === 'unauthorized') throw new ServerSiteError(401, 'unauthorized');
      if (isRecord(error) && error.kind === 'forbidden') throw new ServerSiteError(403, 'forbidden');
      throw new ServerSiteError(null, 'network_error');
    }
    let result: unknown;
    try { result = await response.json(); }
    catch {
      if (!response.ok) throw new ServerSiteError(response.status, 'http_error');
      return protocolError();
    }
    if (!response.ok) {
      throw new ServerSiteError(response.status,
        isRecord(result) && typeof result.status === 'string' ? result.status : 'http_error');
    }
    return result;
  };

  const receipt = async (operation: SaveOperation, idempotencyKey: string): Promise<ServerSiteReceipt> => {
    const result = await send(`/receipts/${operation}/${encodeURIComponent(idempotencyKey)}`);
    return parseReceipt(result, operation, idempotencyKey);
  };

  const parseReceipt = (value: unknown, operation: SaveOperation, idempotencyKey: string): ServerSiteReceipt => {
    if (!isRecord(value) || value.operation !== operation || value.idempotencyKey !== idempotencyKey ||
      typeof value.requestHash !== 'string' || !/^[0-9a-f]{64}$/.test(value.requestHash) ||
      typeof value.snapshotText !== 'string') return protocolError();
    return { operation, idempotencyKey, requestHash: value.requestHash,
      document: siteHead(value.document, tenantId, workspaceId), snapshotText: value.snapshotText };
  };

  const verifySnapshot = async (document: ServerSiteHead, snapshotText: string): Promise<SiteDocument> => {
    if (await sha256(snapshotText) !== document.snapshotHash) return protocolError();
    const read = readServerSiteFile(snapshotText);
    if ('error' in read) return protocolError();
    return read.document;
  };

  const open = async (documentId: string): Promise<OpenServerSite> => {
    if (!isUuid(documentId)) return protocolError();
    const result = await send(`/documents/${encodeURIComponent(documentId)}`);
    if (!isRecord(result)) return protocolError();
    const document = siteHead(result.document, tenantId, workspaceId);
    if (document.documentId !== documentId) return protocolError();
    if (document.mode !== 'snapshot') {
      if (Object.hasOwn(result, 'snapshotText')) return protocolError();
      return { mode: document.mode, document };
    }
    if (typeof result.snapshotText !== 'string') return protocolError();
    const site = await verifySnapshot(document, result.snapshotText);
    return { mode: 'snapshot', document, snapshotText: result.snapshotText, site };
  };

  const save = async (attempt: Readonly<SiteSaveAttempt>): Promise<ServerSiteReceipt> => {
    siteSaveAttempt(attempt);
    if (attempt.operation === 'create' && attempt.workspaceId !== workspaceId) return protocolError();
    const result = attempt.operation === 'create'
      ? await send('/documents', 'POST', {
        workspaceId: attempt.workspaceId, product: 'site', title: attempt.title,
        fileFormat: SITE_FORMAT, fileVersion: SITE_FILE_VERSION,
        snapshotText: attempt.snapshotText, idempotencyKey: attempt.idempotencyKey
      })
      : await send(`/documents/${encodeURIComponent(attempt.documentId)}/snapshot`, 'PUT', {
        expectedRevision: attempt.expectedRevision, snapshotText: attempt.snapshotText,
        idempotencyKey: attempt.idempotencyKey
      });
    return parseReceipt(result, attempt.operation, attempt.idempotencyKey);
  };

  /** Confirm the fixed request and the same-account GET before showing server-saved state. */
  const confirm = async (attempt: Readonly<SiteSaveAttempt>, saved: ServerSiteReceipt): Promise<OpenServerSite & { mode: 'snapshot' }> => {
    siteSaveAttempt(attempt);
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

  const list = async (): Promise<ServerSiteHead[]> => {
    const documents: ServerSiteHead[] = [];
    const visited = new Set<string>();
    const ids = new Set<string>();
    let after: string | null = null;
    do {
      const query = new URLSearchParams({ product: 'site', workspaceId,
        ...(after ? { after } : {}) });
      const result = await send(`/documents?${query}`);
      if (!isRecord(result) || !Array.isArray(result.documents) ||
        result.documents.length > 50 || (result.nextCursor !== null && !isUuid(result.nextCursor)) ||
        (result.nextCursor !== null && result.documents.length === 0)) return protocolError();
      for (const value of result.documents) {
        const document = siteHead(value, tenantId, workspaceId);
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
