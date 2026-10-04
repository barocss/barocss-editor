import { OfficeWorkspace, parseWorkspaceRoute, productKeys, productStore, resolveWorkspaceItem, workspaceIdentity, type WorkspaceRoute } from '@barocss/office-workspace';

/** Read every identity source before choosing a native renderer. No partial-catalog fallback. */
export async function resolveLocalEntry(input: string) {
  const parsed = parseWorkspaceRoute(input);
  if ('error' in parsed) throw new Error(parsed.error);
  const workspaceId = workspaceIdentity();
  const route: WorkspaceRoute = parsed.route ?? { kind: 'workspace', workspaceId };
  if (route.workspaceId !== workspaceId || route.tenantId) throw new Error('다른 작업 공간의 주소입니다. 자료함에서 자료를 다시 여세요.');
  if (route.kind === 'workspace') return { route, item: null };
  const workspace = new OfficeWorkspace(workspaceId);
  const [project, documents] = await Promise.all([
    workspace.project(route.itemId),
    Promise.all(productKeys.map(async product => await productStore(product).read(route.itemId) ? { kind: 'document' as const, id: route.itemId, product } : null))
  ]);
  const item = resolveWorkspaceItem(route.itemId, [...(project ? [{ kind: 'project' as const, id: project.record.id }] : []), ...documents.filter(value => value !== null)], parsed.expected);
  if (item.kind === 'project' && (route.projectId || route.mode)) throw new Error('Project address has conflicting document context.');
  if (route.projectId && !await workspace.project(route.projectId)) throw new Error('Project context is unavailable.');
  return { route, item };
}
