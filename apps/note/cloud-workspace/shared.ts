/** Native Note bytes and document revisions are independent of Site deployment versions. */
export interface DocumentHead {
  documentId: string;
  revision: number;
  title: string;
  pageId: string;
  snapshotHash: string;
  savedAt: string;
}
export interface SavedDocument extends DocumentHead {
  snapshotText: string;
  requestId: string;
}
export interface SaveAttempt {
  documentId: string;
  baseRevision: number;
  requestId: string;
  snapshotText: string;
}
export const API_ROOT = '/api/workspace';
export const MAX_SNAPSHOT_BYTES = 262144;
export async function snapshotHash(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}
