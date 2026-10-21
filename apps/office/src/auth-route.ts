import { formatWorkspaceRoute, parseWorkspaceRoute, resolveWorkspaceItem, type WorkspaceRouteResult, type WorkspaceRoute } from '@barocss/office-workspace';
import type { AuthorizedWorkspaceCatalog } from './server-catalog';
import type { SnapshotIntent } from './auth-client';
import { AuthError, readCatalogHead } from './auth-client';
import { readProjectRecord } from '@barocss/shared';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type AuthRouteRequest = Extract<WorkspaceRouteResult, { route: WorkspaceRoute | null }> & { route: WorkspaceRoute };
/** Route identities are requests. The server still verifies principal, tenant and current access. */
export function authRouteRequest(input: string): AuthRouteRequest | null {
  const url = new URL(input, location.origin);
  if (['/auth/callback', '/admin', '/operator'].includes(url.pathname)) return null;
  const result = parseWorkspaceRoute(input);
  if ('error' in result) throw new Error(result.error);
  if (!result.route) return null;
  const route = result.route;
  if (![route.workspaceId, ...(route.tenantId ? [route.tenantId] : []), ...(route.kind === 'item' ? [route.itemId, ...(route.projectId ? [route.projectId] : [])] : [])].every(id => uuid.test(id)))
    throw new Error('Invalid authenticated workspace identity.');
  return { ...result, route };
}
export function authenticatedItem(request: AuthRouteRequest, catalog: AuthorizedWorkspaceCatalog) {
  const route = request.route;
  if (route.kind !== 'item' || catalog.state !== 'ready' || catalog.workspaceId !== route.workspaceId ||
    (route.tenantId && catalog.tenantId !== route.tenantId)) throw new Error('Complete current workspace metadata is required.');
  const item = resolveWorkspaceItem(route.itemId, [
    ...catalog.projects.map(project => ({ kind: 'project' as const, id: project.record.id })),
    ...catalog.documents.map(document => ({ kind: 'document' as const, id: document.documentId, product: document.product }))
  ], request.expected);
  if (item.kind === 'project' && (route.projectId || route.mode)) throw new Error('Project address has conflicting document context.');
  if (route.projectId && !catalog.projects.some(project => project.record.id === route.projectId)) throw new Error('Project context is unavailable.');
  return item;
}
export function snapshotIntentURL(intent: SnapshotIntent): string {
  return formatWorkspaceRoute({ kind: 'item', tenantId: intent.tenantId, workspaceId: intent.workspaceId, itemId: intent.documentId,
    ...(intent.projectId ? { projectId: intent.projectId } : {}), ...(intent.mode ? { mode: intent.mode } : {}) });
}

/** Exact authorized reads establish both namespaces without depending on unrelated tree pages. */
export async function resolveAuthenticatedRouteItem(request: AuthRouteRequest, tenantId: string, requestFetch: typeof fetch, isCurrent: () => boolean) {
  const route = request.route;
  if (route.kind !== 'item' || !uuid.test(tenantId) || (route.tenantId && route.tenantId !== tenantId)) throw new AuthError('forbidden', '자료 주소의 회사가 일치하지 않습니다.');
  const check = () => { if (!isCurrent()) throw new AuthError('cancelled', '자료 접근 상태가 바뀌었습니다.'); };
  const read = async (path: string): Promise<Record<string, unknown> | null> => {
    check(); const response = await requestFetch(path); check();
    if (response.status === 404) return null;
    if (response.status === 401 || response.status === 403) throw new AuthError(response.status === 401 ? 'unauthorized' : 'forbidden', '자료 접근 권한이 없습니다.');
    if (!response.ok) throw new AuthError('unavailable', '자료 종류를 확인하지 못했습니다.');
    const value: unknown = await response.json(); check();
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AuthError('unavailable', '자료 응답을 확인하지 못했습니다.');
    return value as Record<string, unknown>;
  };
  const base = `/api/v1/tenants/${tenantId}`;
  const [document, project] = await Promise.all([read(`${base}/documents/${route.itemId}`), read(`${base}/projects/${route.itemId}`)]);
  check();
  const candidates: Parameters<typeof resolveWorkspaceItem>[1][number][] = [];
  if (document) {
    const raw = document.document as { product?: unknown } | undefined;
    if (request.expected?.kind === 'document' && raw?.product !== request.expected.product) throw new AuthError('forbidden', '선택한 문서의 회사, 자료함 또는 제품이 일치하지 않습니다.');
    const head = readCatalogHead(document.document, tenantId, route.workspaceId);
    if (head.documentId !== route.itemId) throw new AuthError('forbidden', '원본 문서 식별자가 일치하지 않습니다.');
    candidates.push({ kind: 'document', id: head.documentId, product: head.product });
  }
  const projectRecord = (response: Record<string, unknown>, expectedId: string) => {
    const value = response.project as { record?: unknown; revision?: unknown } | undefined;
    const actor = response.actor as { kind?: unknown; id?: unknown } | undefined;
    if (response.tenantId !== tenantId || response.workspaceId !== route.workspaceId || actor?.kind !== 'human' || typeof actor.id !== 'string' || !actor.id ||
      !Number.isSafeInteger(value?.revision) || Number(value?.revision) < 1) throw new AuthError('unavailable', '프로젝트 응답을 확인하지 못했습니다.');
    const record = readProjectRecord(value!.record);
    if (record.id !== expectedId) throw new AuthError('forbidden', '프로젝트 식별자가 일치하지 않습니다.');
    return record;
  };
  if (project) candidates.push({ kind: 'project', id: projectRecord(project, route.itemId).id });
  let item: ReturnType<typeof resolveWorkspaceItem>;
  try { item = resolveWorkspaceItem(route.itemId, candidates, request.expected); }
  catch (error) { throw new AuthError('configuration', error instanceof Error ? error.message : 'Unable to identify the original.'); }
  if (item.kind === 'project' && (route.projectId || route.mode)) throw new AuthError('configuration', '프로젝트 주소에 문서 맥락이 있습니다.');
  if (route.projectId) {
    const context = await read(`${base}/projects/${route.projectId}`); check();
    if (!context) throw new AuthError('forbidden', '프로젝트 맥락을 확인할 수 없습니다.');
    projectRecord(context, route.projectId);
  }
  return item;
}
