import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useOfficeLocale } from '@barocss/office-ui';
import { captureProductNavigation, productDocumentHost } from '@barocss/shared';
import { beginWorkspaceNavigation, prepareWorkspaceBeforeLeave } from './workspace-navigation';
import { OfficeWorkspace, readProductDocument, workspaceIdentity, type WorkspaceDocument } from './workspace';
import { buildLocalCatalogTree } from './catalog-tree';
import { documentURL, products, isProduct, referenceKey, type Product } from './products';
import { readLibraryOrigin, saveLibraryOrigin, workspaceReturnURL } from './catalog-origin';
import type { ProjectSnapshot } from '@barocss/shared';
import { WorkspaceFramePresentation, type WorkspaceFrameLabels, type WorkspaceTreeView } from './workspace-frame-presentation';

type Perspective = 'project' | 'my';
type TreeView = WorkspaceTreeView;
const freshView = (): TreeView => ({ query: '', product: 'all', collapsed: [], scroll: 0 });
function readView(workspace: string, perspective: Perspective): TreeView {
  try {
    const value = JSON.parse(sessionStorage.getItem(`wonffice.tree:${workspace}:${perspective}`) ?? 'null');
    if (!value || typeof value !== 'object') return freshView();
    return { query: typeof value.query === 'string' ? value.query : '', product: isProduct(value.product) ? value.product : 'all',
      collapsed: Array.isArray(value.collapsed) ? value.collapsed.filter((id: unknown): id is string => typeof id === 'string') : [],
      scroll: typeof value.scroll === 'number' && Number.isFinite(value.scroll) && value.scroll >= 0 ? value.scroll : 0 };
  } catch { return freshView(); }
}

/** A local catalog surrounds the existing native root, without taking over its editor. */
export function WorkspaceFrame({ children, nativeRoot, expected }: { children?: ReactNode; nativeRoot?: HTMLElement; expected?: { product: Product; id: string } }) {
  const workspace = useMemo(() => new OfficeWorkspace(workspaceIdentity()), []);
  const { t } = useOfficeLocale();
  const [perspective, setPerspective] = useState<Perspective>(() => sessionStorage.getItem(`wonffice.tree-perspective:${workspace.id}`) === 'my' ? 'my' : 'project');
  const [views, setViews] = useState(() => ({ project: readView(workspace.id, 'project'), my: readView(workspace.id, 'my') }));
  const [rows, setRows] = useState<WorkspaceDocument[]>([]), [projects, setProjects] = useState<ProjectSnapshot[]>([]);
  const [ready, setReady] = useState(false), [error, setError] = useState(''), [busy, setBusy] = useState(false), [focused, setFocused] = useState(false);
  const [catalogState, setCatalogState] = useState<'loading' | 'ready' | 'partial' | 'error'>('loading');
  const [entry, setEntry] = useState<'loading' | 'ready' | 'error'>(expected ? 'loading' : 'ready');
  const entered = useRef(!expected);
  const [active, setActive] = useState(() => sessionStorage.getItem(`wonffice.tree-selection:${workspace.id}`) ?? '');
  const tree = useRef<HTMLElement>(null), slot = useRef<HTMLDivElement>(null), lock = useRef(false), generation = useRef(0);
  const view = views[perspective];
  const changeView = (patch: Partial<TreeView>) => setViews(previous => ({ ...previous, [perspective]: { ...previous[perspective], ...patch } }));
  useLayoutEffect(() => { if (nativeRoot && slot.current) slot.current.append(nativeRoot); }, [nativeRoot]);
  useLayoutEffect(() => { if (nativeRoot) nativeRoot.inert = busy || entry !== 'ready'; }, [nativeRoot, busy, entry]);
  useEffect(() => {
    let live = true, request = 0;
    const refresh = async () => {
      const attempt = ++request;
      const current = () => live && attempt === request;
      try {
        const documents = await workspace.list();
        if (!current()) return;
        try {
          const currentProjects = await workspace.projects();
          if (current()) { setRows(documents); setProjects(currentProjects); setReady(true); setCatalogState('ready'); setError(''); }
        } catch { if (current()) { setRows(documents); setProjects([]); setReady(true); setCatalogState('partial'); setError(t('workspace.tree.projectsUnavailable')); } }
      } catch { if (current()) { setReady(true); setCatalogState('error'); setError(t('workspace.tree.unavailable')); } }
    };
    const hostChanged = () => {
      const host = productDocumentHost();
      if (host && expected && !entered.current) {
        if (host.product === expected.product && host.id() === expected.id) { entered.current = true; setEntry('ready'); }
        else setEntry('error');
      }
      if (host) { const key = referenceKey({ product: host.product, id: host.id() }); setActive(key); sessionStorage.setItem(`wonffice.tree-selection:${workspace.id}`, key); }
      generation.current++; void refresh();
    };
    const retry = () => { void refresh(); };
    hostChanged();
    window.addEventListener('wonffice:host-change', hostChanged);
    window.addEventListener('focus', refresh);
    window.addEventListener('wonffice:catalog-refresh', retry);
    return () => { live = false; generation.current++; window.removeEventListener('wonffice:host-change', hostChanged); window.removeEventListener('focus', refresh); window.removeEventListener('wonffice:catalog-refresh', retry); };
  }, [workspace, t, expected?.product, expected?.id]);
  useEffect(() => { sessionStorage.setItem(`wonffice.tree:${workspace.id}:${perspective}`, JSON.stringify(view)); }, [workspace, perspective, view]);
  useLayoutEffect(() => { if (tree.current) tree.current.scrollTop = views[perspective].scroll; }, [perspective, ready]);
  const choose = (next: Perspective) => { setPerspective(next); sessionStorage.setItem(`wonffice.tree-perspective:${workspace.id}`, next); };
  const open = async (row?: WorkspaceDocument, project?: string, destination?: 'projects' | 'recent') => {
    const mounted = productDocumentHost();
    if (row && nativeRoot && mounted?.product === row.product && mounted.id() === row.id) return;
    if (lock.current) return;
    const release = beginWorkspaceNavigation(); if (!release) return;
    lock.current = true; setBusy(true); setError('');
    const intent = ++generation.current, guard = captureProductNavigation();
    const current = () => intent === generation.current && (nativeRoot ? guard?.isCurrent() === true : true);
    try {
      if (nativeRoot) nativeRoot.inert = true;
      if (!await prepareWorkspaceBeforeLeave()) throw new Error(t('workspace.tree.flushFailed'));
      if (nativeRoot && !await guard?.prepare()) throw new Error(t('workspace.tree.flushFailed'));
      if (!current()) throw new Error(t('workspace.tree.changed'));
      if (row) {
        const source = await workspace.require(row.product, row.id);
        if (!current()) throw new Error(t('workspace.tree.changed'));
        await readProductDocument(row.product, source.text);
        if (!current()) throw new Error(t('workspace.tree.changed'));
        if ((await workspace.meta(row.key)).trashedAt !== null) throw new Error(t('workspace.tree.unavailable'));
        if (!current()) throw new Error(t('workspace.tree.changed'));
        await workspace.update(row.key, { openedAt: Date.now() });
      }
      if (!current()) throw new Error(t('workspace.tree.changed'));
      if (destination === 'recent') saveLibraryOrigin(workspace.id, { ...readLibraryOrigin(workspace.id), view: 'recent', product: 'all', query: '', folder: '', scroll: 0 });
      location.assign(row ? documentURL({ workspace: workspace.id, product: row.product, id: row.id, ...(project ? { project } : {}) })
        : destination === 'projects' ? `/?${new URLSearchParams({ workspace: workspace.id, view: 'projects', ...(project ? { project } : {}) })}` : workspaceReturnURL(workspace.id, project));
    } catch (failure) { setError(failure instanceof Error ? failure.message : t('workspace.tree.unavailable')); }
    finally { if (nativeRoot) nativeRoot.inert = entry !== 'ready'; lock.current = false; setBusy(false); release(); }
  };
  const catalog = buildLocalCatalogTree(rows, projects, { perspective: catalogState === 'partial' ? 'my' : perspective, query: view.query, product: view.product });
  const projectContext = new URLSearchParams(location.search).get('project');
  const revealCurrent = () => {
    changeView({ query: '', product: 'all', collapsed: [] });
    requestAnimationFrame(() => tree.current?.querySelector<HTMLElement>('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest' }));
  };
  return <WorkspaceFramePresentation children={children} nativeSlotRef={slot} treeRef={tree}
    groups={catalog.groups.map(group => ({ ...group, title: group.label || null, label: group.label || t(group.kind === 'unlinked' ? 'workspace.tree.unlinked' : 'workspace.tree.files') }))}
    perspectives={[{ id: 'project', label: t('workspace.tree.project') }, { id: 'my', label: t('workspace.tree.my') }]}
    projectPerspective="project" perspective={perspective} views={views}
    productOptions={Object.entries(products).map(([id, product]) => ({ id: id as Product, ...product }))}
    labels={frameLabels(t)} ready={ready} catalogState={catalogState} entry={entry}
    entryReturnHref={workspaceReturnURL(workspace.id)} error={error} busy={busy} focused={focused}
    active={active} projectContext={projectContext} canRevealCurrent={!!nativeRoot && rows.some(row => row.key === active)}
    onViewChange={changeView} onPerspectiveChange={choose} onFocusChange={setFocused}
    onOpen={(row, project) => { void open(row, project); }}
    onNavigate={(destination, project) => { void open(undefined, project, destination === 'library' ? undefined : destination); }}
    onRetry={() => window.dispatchEvent(new Event('wonffice:catalog-refresh'))} onRevealCurrent={revealCurrent} />;
}

/** The local controller supplies all translated labels, including its local-device source. */
function frameLabels(t: ReturnType<typeof useOfficeLocale>['t']): WorkspaceFrameLabels {
  return {
    railNavigation: t('workspace.rail.navigation'),
    home: t('workspace.rail.home'),
    railFiles: t('workspace.rail.files'),
    recent: t('workspace.rail.recent'),
    projects: t('workspace.rail.projects'),
    treeNavigation: t('workspace.tree.navigation'),
    source: t('workspace.tree.local'),
    workspace: t('workspace.tree.localWorkspace'),
    focus: t('workspace.tree.focus'),
    perspective: t('workspace.tree.perspective'),
    search: t('workspace.tree.search'),
    product: t('workspace.tree.product'),
    allProducts: t('workspace.tree.allProducts'),
    files: t('workspace.tree.files'),
    loading: t('workspace.tree.loading'),
    empty: t('workspace.tree.empty'),
    retry: t('workspace.tree.retry'),
    revealCurrent: t('workspace.tree.revealCurrent'),
    library: t('workspace.tree.library'),
    restore: t('workspace.tree.restore'),
    unavailable: t('workspace.tree.unavailable'),
    openProject: title => t('workspace.tree.openProject', { title }),
    openOriginal: title => t('workspace.tree.openOriginal', { title })
  };
}
