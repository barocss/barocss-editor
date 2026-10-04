import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { products } from '@barocss/office-workspace';
import { WorkspaceFramePresentation, type WorkspaceFrameLabels, type WorkspaceTreeView } from '@barocss/office-workspace/host';
import { registerEditorNavigation, useOfficeLocale } from '@barocss/office-ui';
import { AuthError, captureAuthorizedSession, type TenantRole } from './auth-client';
import { serverProjectRepository } from './project-client';
import { readAuthorizedWorkspaceCatalog, serverCatalogGroups, type AuthorizedWorkspaceCatalog, type ServerCatalogRow, type ServerCatalogPerspective } from './server-catalog';

const emptyView = (): WorkspaceTreeView => ({ query: '', product: 'all', collapsed: [], scroll: 0 });

/** The authenticated host supplies authority and transitions; the tree never opens local storage. */
export function AuthenticatedWorkspaceFrame({ children, railFooter, tenantId, workspaceId, workspaceName, role, authorityEpoch, authorized,
  active, projectId, busy, error, onOpen, onNavigate, onAccessFailure }: {
  children: ReactNode; railFooter?: ReactNode; tenantId: string; workspaceId: string; workspaceName: string; role: TenantRole;
  authorityEpoch: number; authorized: boolean; active: string; projectId?: string; busy: boolean; error: string;
  onOpen: (row: ServerCatalogRow, projectId?: string) => void;
  onNavigate: (destination: 'projects' | 'library', projectId?: string) => void;
  onAccessFailure: (error: AuthError) => void;
}) {
  const { t } = useOfficeLocale();
  const scopeKey = JSON.stringify([tenantId, workspaceId, role, authorityEpoch]);
  const [catalog, setCatalog] = useState<{ value: AuthorizedWorkspaceCatalog; scopeKey: string; isCurrent: () => boolean }>();
  const [failure, setFailure] = useState('');
  const [reload, setReload] = useState(0);
  const [focused, setFocused] = useState(false);
  const [perspective, setPerspective] = useState<ServerCatalogPerspective>('project');
  const [views, setViews] = useState<Record<ServerCatalogPerspective, WorkspaceTreeView>>({ project: emptyView(), sources: emptyView() });
  const tree = useRef<HTMLElement>(null);
  const current = useRef({ authorityEpoch, authorized, onAccessFailure });
  current.current = { authorityEpoch, authorized, onAccessFailure };
  useEffect(() => {
    let alive = true;
    setCatalog(undefined); setFailure('');
    if (!authorized) return;
    const session = captureAuthorizedSession();
    const ownsScope = () => alive && current.current.authorized && current.current.authorityEpoch === authorityEpoch;
    const isCurrent = () => ownsScope() && session.isCurrent();
    const repository = serverProjectRepository(tenantId, workspaceId, role);
    void readAuthorizedWorkspaceCatalog({ tenantId, workspaceId, requestFetch: session.requestFetch, readProjects: () => repository.list(), isCurrent, t })
      .then(value => { if (isCurrent()) setCatalog({ value, scopeKey, isCurrent }); })
      .catch(cause => {
        if (!ownsScope()) return;
        // A current 401 clears the session before it rejects. Do not hide that access failure.
        if (cause instanceof AuthError && ['unauthorized', 'forbidden'].includes(cause.kind)) {
          current.current.onAccessFailure(cause); return;
        }
        if (!session.isCurrent()) return;
        setFailure(cause instanceof Error ? cause.message : t('workspace.catalog.invalidResponse'));
      });
    return () => { alive = false; };
  }, [tenantId, workspaceId, role, authorityEpoch, authorized, reload, t, scopeKey]);
  useEffect(() => {
    const refresh = () => setReload(value => value + 1);
    window.addEventListener('wonffice:catalog-refresh', refresh);
    return () => window.removeEventListener('wonffice:catalog-refresh', refresh);
  }, []);
  const shown = authorized && catalog?.scopeKey === scopeKey && catalog.isCurrent() ? catalog.value : undefined;
  const Location = useMemo(() => function AuthorizedOriginalLocation() {
    const document = authorized ? shown?.documents.find(head => JSON.stringify([head.tenantId, head.workspaceId, head.product, head.documentId]) === active) : undefined;
    return authorized ? <span title={document ? `${workspaceName} / ${document.title}` : workspaceName}>{document ? `${workspaceName} / ${document.title}` : workspaceName}</span> : null;
  }, [shown, active, workspaceName, authorized]);
  useLayoutEffect(() => registerEditorNavigation(undefined, Location), [Location]);
  const groups = useMemo(() => shown ? serverCatalogGroups(shown, { perspective, ...views[perspective], sourcesLabel: t('workspace.tree.sources') }) : [], [shown, perspective, views, t]);
  const labels: WorkspaceFrameLabels = {
    railNavigation: t('workspace.rail.navigation'), home: t('workspace.rail.home'), railFiles: t('workspace.rail.files'),
    recent: t('workspace.rail.recent'), projects: t('workspace.rail.projects'), treeNavigation: t('workspace.tree.navigation'),
    source: t('workspace.tree.server'), workspace: authorized ? workspaceName : t('workspace.tree.workspace'), focus: t('workspace.tree.focus'), perspective: t('workspace.tree.perspective'),
    search: t('workspace.tree.search'), product: t('workspace.tree.product'), allProducts: t('workspace.tree.allProducts'),
    files: t('workspace.tree.files'), loading: t('workspace.tree.loading'), empty: t('workspace.tree.empty'), retry: t('workspace.tree.retry'),
    revealCurrent: t('workspace.tree.revealCurrent'), library: t('workspace.tree.library'), restore: t('workspace.tree.restore'),
    unavailable: t('workspace.tree.unavailable'), openProject: title => t('workspace.tree.openProject', { title }),
    openOriginal: title => t('workspace.tree.openOriginal', { title })
  };
  const viewChange = (patch: Partial<WorkspaceTreeView>) => setViews(previous => ({ ...previous, [perspective]: { ...previous[perspective], ...patch } }));
  return <WorkspaceFramePresentation treeRef={tree} groups={groups} labels={labels} railFooter={railFooter}
    productOptions={Object.entries(products).map(([id, value]) => ({ id: id as ServerCatalogRow['product'], ...value }))}
    perspectives={[{ id: 'project', label: t('workspace.tree.project') }, { id: 'sources', label: t('workspace.tree.sources') }]}
    projectPerspective="project" perspective={perspective} views={authorized ? views : { project: emptyView(), sources: emptyView() }}
    ready={!!shown || !!failure} catalogState={failure ? 'error' : shown?.state ?? 'loading'} entry="ready"
    focused={focused} busy={busy || !authorized} active={authorized ? active : ''} projectContext={authorized ? projectId : undefined}
    canRevealCurrent={!!shown?.documents.some(head => JSON.stringify([head.tenantId, head.workspaceId, head.product, head.documentId]) === active)}
    capabilities={{ recent: false, openOriginal: authorized && !!shown, projects: authorized, library: authorized }}
    error={error || failure || (shown?.state === 'partial' ? t('workspace.tree.serverProjectsUnavailable') : '')}
    onViewChange={viewChange} onFocusChange={setFocused} onPerspectiveChange={setPerspective} onOpen={onOpen}
    onNavigate={(destination, project) => { if (destination !== 'recent') onNavigate(destination, project); }}
    onRetry={() => setReload(value => value + 1)} onRevealCurrent={() => {
      viewChange({ query: '', product: 'all', collapsed: [] });
      requestAnimationFrame(() => tree.current?.querySelector<HTMLElement>('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest' }));
    }}>{children}</WorkspaceFramePresentation>;
}
