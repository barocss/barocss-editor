import { API_ROOT, snapshotHash, type DocumentHead, type SaveAttempt, type SavedDocument } from './shared';

export class WorkspaceError extends Error {
  constructor(public readonly code: string, public readonly status: number | null = null) { super(code); }
}
export interface WorkspaceSession {
  authenticated: true; userScope: string; storageAvailable: boolean;
  ai: { available: false; code: 'runtime_not_configured' };
}
export async function getWorkspaceSession(send: typeof fetch = fetch): Promise<WorkspaceSession> {
  const response = await send(`${API_ROOT}/session`, { cache: 'no-store' });
  if (!response.ok) throw new WorkspaceError('authentication_required', response.status);
  const result: WorkspaceSession = await response.json();
  if (typeof result.userScope !== 'string' || !result.userScope ||
      response.headers.get('X-Workspace-User-Scope') !== result.userScope ||
      result.ai?.available !== false || typeof result.storageAvailable !== 'boolean') throw new WorkspaceError('invalid_response');
  return result;
}
export function createWorkspaceClient(scope: string, send: typeof fetch = fetch) {
  const request = async (path: string, method = 'GET', body?: unknown) => {
    let response: Response;
    try { response = await send(`${API_ROOT}${path}`, { method, cache: 'no-store',
      headers: { 'X-Workspace-Expected-Scope': scope, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); }
    catch { throw new WorkspaceError('network_error'); }
    if (response.status === 401 || response.status === 403 || response.headers.get('X-Workspace-User-Scope') !== scope) {
      throw new WorkspaceError('identity_changed', 401);
    }
    const result = await response.json().catch(() => { throw new WorkspaceError('invalid_response'); });
    if (!response.ok) throw new WorkspaceError(typeof result.code === 'string' ? result.code : 'save_unconfirmed', response.status);
    return result;
  };
  const open = async (id: string): Promise<SavedDocument> => {
    const saved: SavedDocument = await request(`/documents/${encodeURIComponent(id)}`);
    if (saved.documentId !== id || !Number.isSafeInteger(saved.revision) || saved.revision < 1 ||
        typeof saved.snapshotText !== 'string' || await snapshotHash(saved.snapshotText) !== saved.snapshotHash) throw new WorkspaceError('invalid_response');
    return saved;
  };
  return {
    open,
    async list(): Promise<DocumentHead[]> {
      const rows: DocumentHead[] = [], cursors = new Set<string>();
      let cursor: string | null = null;
      do {
        const result: { documents: DocumentHead[]; nextCursor: string | null } = await request(`/documents${cursor ? `?after=${encodeURIComponent(cursor)}` : ''}`);
        if (!Array.isArray(result.documents) || result.documents.length > 50 ||
          (result.nextCursor !== null && (typeof result.nextCursor !== 'string' || !result.documents.length || result.nextCursor !== result.documents.at(-1)?.documentId || cursors.has(result.nextCursor)))) throw new WorkspaceError('invalid_response');
        rows.push(...result.documents); cursor = result.nextCursor;
        if (cursor) cursors.add(cursor);
      } while (cursor);
      return rows.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
    },
    async save(attempt: Readonly<SaveAttempt>): Promise<SavedDocument> {
      const saved: SavedDocument = await request(attempt.baseRevision === 0 ? '/documents' : `/documents/${encodeURIComponent(attempt.documentId)}`,
        attempt.baseRevision === 0 ? 'POST' : 'PUT', attempt);
      if (saved.documentId !== attempt.documentId || saved.requestId !== attempt.requestId ||
        saved.revision !== attempt.baseRevision + 1 || saved.snapshotText !== attempt.snapshotText ||
        saved.snapshotHash !== await snapshotHash(attempt.snapshotText)) throw new WorkspaceError('invalid_receipt');
      const confirmed = await open(attempt.documentId);
      if (confirmed.revision !== saved.revision || confirmed.snapshotText !== saved.snapshotText) throw new WorkspaceError('revision_conflict', 409);
      return saved;
    }
  };
}
export type WorkspaceClient = ReturnType<typeof createWorkspaceClient>;
