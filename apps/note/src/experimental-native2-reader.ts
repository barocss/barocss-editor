import { isRegistryUuid, parseRegistryJson, parseRegistryDefinition, validateRegistryBundle } from '@barocss/schema/registry-contract';
import { readNoteSnapshotFile, isNotePageId } from '@barocss/office-note/file';

type NativeFile = Extract<ReturnType<typeof readNoteSnapshotFile>, { fileVersion: 2 }>;
export interface ExperimentalNative2Head {
  documentId: string; tenantId: string; workspaceId: string; product: 'note'; title: string;
  creatorUserId: string | null; metadataRevision: number; mode: 'snapshot'; pageId: string;
  documentKey: string; fileFormat: 'barocss-note'; fileVersion: 2; revision: number; snapshotHash: string;
}
export interface ExperimentalNative2Read {
  readonly document: ExperimentalNative2Head;
  readonly snapshotText: string;
  readonly file: NativeFile;
}
export class ExperimentalNative2ReadError extends Error {
  constructor(public readonly status: number | null, public readonly code: string) { super(code); }
}
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const positive = (value: unknown): value is number => Number.isSafeInteger(value) && typeof value === 'number' && value > 0;
const digest = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
function invalid(): never { throw new ExperimentalNative2ReadError(null, 'invalid_native2_response'); }
function exact(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!record(value) || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) return invalid();
  return value;
}
function equal(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) &&
    a.length === b.length && a.every((value, index) => equal(value, b[index]));
  if (!record(a) || !record(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && equal(a[key], b[key]));
}
function freeze(value: unknown): void {
  if (value !== null && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
}
const headKeys = ['documentId', 'tenantId', 'workspaceId', 'product', 'title', 'creatorUserId', 'metadataRevision',
  'mode', 'pageId', 'documentKey', 'fileFormat', 'fileVersion', 'revision', 'snapshotHash'] as const;
export function decodeExperimentalNative2Head(value: unknown, tenantId: string, workspaceId: string, documentId: string): ExperimentalNative2Head {
  const h = exact(value, headKeys);
  if (h.documentId !== documentId || h.tenantId !== tenantId || h.workspaceId !== workspaceId ||
    h.product !== 'note' || h.mode !== 'snapshot' || h.fileFormat !== 'barocss-note' || h.fileVersion !== 2 ||
    typeof h.title !== 'string' || !h.title.trim() || [...h.title].length > 200 ||
    (h.creatorUserId !== null && !isRegistryUuid(h.creatorUserId)) || !positive(h.metadataRevision) ||
    !positive(h.revision) || !isNotePageId(h.pageId) || !digest(h.snapshotHash) ||
    h.documentKey !== `wonffice-${tenantId}-${documentId}`) return invalid();
  return { documentId, tenantId, workspaceId, product: 'note', title: h.title, creatorUserId: h.creatorUserId,
    metadataRevision: h.metadataRevision, mode: 'snapshot', pageId: h.pageId, documentKey: h.documentKey,
    fileFormat: 'barocss-note', fileVersion: 2, revision: h.revision, snapshotHash: h.snapshotHash };
}

/** Private experiment only. No ordinary workspace registration, writes, retry or rights from JSON. */
export function createExperimentalNative2NoteReader({ tenantId, workspaceId, apiBase, authorizedFetch, isCurrent }: {
  tenantId: string; workspaceId: string; apiBase: string; authorizedFetch: typeof fetch; isCurrent: () => boolean;
}) {
  if (!isRegistryUuid(tenantId) || !isRegistryUuid(workspaceId) || !apiBase ||
    /[?#]/.test(apiBase)) throw new Error('invalid_experimental_native2_context');
  const root = `${apiBase.replace(/\/$/, '')}/v1/tenants/${tenantId}/note-native2`;
  const current = () => {
    let active = false;
    try { active = isCurrent(); } catch { /* A retired host cannot deliver. */ }
    if (!active) throw new ExperimentalNative2ReadError(null, 'stale_native2_context');
  };
  const get = async (path: string): Promise<unknown> => {
    current();
    let response: Response;
    try { response = await authorizedFetch(root + path, { method: 'GET', cache: 'no-store' }); }
    catch (error) {
      current();
      if (record(error) && (error.kind === 'unauthorized' || error.kind === 'forbidden')) {
        throw new ExperimentalNative2ReadError(error.kind === 'unauthorized' ? 401 : 403, error.kind);
      }
      throw new ExperimentalNative2ReadError(null, 'network_error');
    }
    current();
    let text: string;
    try { text = await response.text(); } catch { current(); throw new ExperimentalNative2ReadError(null, 'network_error'); }
    current();
    let value: unknown;
    try { value = parseRegistryJson(text, 1048576); }
    catch {
      if (!response.ok) throw new ExperimentalNative2ReadError(response.status, 'http_error');
      return invalid();
    }
    if (!response.ok) throw new ExperimentalNative2ReadError(response.status,
      record(value) && typeof value.status === 'string' ? value.status : 'http_error');
    return value;
  };
  const open = async (documentId: string): Promise<ExperimentalNative2Read> => {
    current();
    if (!isRegistryUuid(documentId)) throw new Error('invalid_experimental_native2_document');
    const opened = exact(await get(`/documents/${documentId}`), ['document', 'snapshotText']);
    const document = decodeExperimentalNative2Head(opened.document, tenantId, workspaceId, documentId);
    if (typeof opened.snapshotText !== 'string') return invalid();
    const snapshotText = opened.snapshotText;
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(snapshotText));
    current();
    if (Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('') !== document.snapshotHash) return invalid();
    const file = readNoteSnapshotFile(snapshotText);
    if ('error' in file || !('fileVersion' in file) || file.fileVersion !== 2 ||
      file.document.attributes?.pageId !== document.pageId) return invalid();
    for (const entry of file.schemaBundle.definitions) {
      const { definition } = parseRegistryDefinition(entry.definitionText);
      if (definition.scope.tenantId !== tenantId || definition.scope.workspaceId !== workspaceId) return invalid();
    }
    const pinned = exact(await get(`/documents/${documentId}/schema-bundle`),
      ['status', 'documentId', 'documentRevision', 'snapshotHash', 'nativeFormat', 'bundle']);
    const format = exact(pinned.nativeFormat, ['format', 'version']);
    if (pinned.status !== 'pinned' || pinned.documentId !== documentId || pinned.documentRevision !== document.revision ||
      pinned.snapshotHash !== document.snapshotHash || format.format !== 'barocss-note' || format.version !== 2) return invalid();
    try { validateRegistryBundle(pinned.bundle); } catch { return invalid(); }
    if (!equal(pinned.bundle, file.schemaBundle)) return invalid();
    current();
    const result = { document, snapshotText, file };
    freeze(result);
    return result;
  };
  return Object.freeze({ open });
}
