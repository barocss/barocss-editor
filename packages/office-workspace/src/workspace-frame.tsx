import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button, Icon, TextField, useOfficeLocale } from '@barocss/office-ui';
import { captureProductNavigation, productDocumentHost } from '@barocss/shared';
import { beginWorkspaceNavigation, prepareWorkspaceBeforeLeave } from './workspace-navigation';
import { OfficeWorkspace, readProductDocument, workspaceIdentity, type WorkspaceDocument } from './workspace';
import { buildLocalCatalogTree } from './catalog-tree';
import { documentURL, products, isProduct, referenceKey, type Product } from './products';
import { readLibraryOrigin, saveLibraryOrigin, workspaceReturnURL } from './catalog-origin';
import type { ProjectSnapshot } from '@barocss/shared';
import './workspace-frame.css';

type Perspective = 'project' | 'my';
interface TreeView { query: string; product: Product | 'all'; collapsed: string[]; scroll: number; }
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
  return <div className="ow-workspace-frame" data-workspace-frame data-focus-mode={focused || undefined}>
    <nav className="ow-workspace-rail" aria-label={t('workspace.rail.navigation')}>
      <Button square tone="quiet" ariaLabel={t('workspace.rail.home')} title={t('workspace.rail.home')} disabled={busy} onClick={() => void open(undefined, undefined, 'projects')}><Icon name="workspace-home" size={20} /></Button>
      <Button square tone="quiet" ariaLabel={t('workspace.rail.files')} title={t('workspace.rail.files')} disabled={busy} onClick={() => void open()}><Icon name="workspace-files" size={20} /></Button>
      <Button square tone="quiet" ariaLabel={t('workspace.rail.recent')} title={t('workspace.rail.recent')} disabled={busy} onClick={() => void open(undefined, undefined, 'recent')}><Icon name="recent-documents" size={20} /></Button>
      <hr />
      <Button square tone="quiet" ariaLabel={t('workspace.rail.projects')} title={t('workspace.rail.projects')} pressed={perspective === 'project' && !focused} onClick={() => { choose('project'); setFocused(false); }}><Icon name="workspace-projects" size={20} /></Button>
    </nav>
    <aside className="ow-file-navigation" aria-label={t('workspace.tree.navigation')} hidden={focused}>
      <div className="ow-tree-header"><strong title={t('workspace.tree.local')}>{t('workspace.tree.localWorkspace')}</strong><Button tone="quiet" ariaLabel={t('workspace.tree.focus')} onClick={() => setFocused(true)}><Icon name="close" /></Button></div>
      <div className="ow-tree-perspectives" aria-label={t('workspace.tree.perspective')}>
        <Button pressed={perspective === 'project'} onClick={() => choose('project')}>{t('workspace.tree.project')}</Button>
        <Button pressed={perspective === 'my'} onClick={() => choose('my')}>{t('workspace.tree.my')}</Button>
      </div>
      <p className="ow-tree-source">{t('workspace.tree.local')}</p>
      <TextField ariaLabel={t('workspace.tree.search')} placeholder={t('workspace.tree.search')} value={view.query} onChange={query => changeView({ query })} />
      <select aria-label={t('workspace.tree.product')} value={view.product} onChange={event => changeView({ product: isProduct(event.target.value) ? event.target.value : 'all' })}>
        <option value="all">{t('workspace.tree.allProducts')}</option>{Object.entries(products).map(([id, product]) => <option key={id} value={id}>{product.label}</option>)}
      </select>
      <nav ref={tree} className="ow-file-tree" aria-label={t('workspace.tree.files')} onScroll={event => changeView({ scroll: event.currentTarget.scrollTop })}>
        {!ready && <p role="status">{t('workspace.tree.loading')}</p>}
        {ready && catalogState !== 'error' && !catalog.groups.some(group => group.entries.length) && <p className="ow-tree-empty">{t('workspace.tree.empty')}</p>}
        {catalog.groups.map(group => <section key={group.id} data-tree-group={group.id}>
          <div className="ow-tree-group-heading"><Button className="ow-tree-group" tone="quiet" aria-expanded={!view.collapsed.includes(group.id)} onClick={() => changeView({ collapsed: view.collapsed.includes(group.id) ? view.collapsed.filter(id => id !== group.id) : [...view.collapsed, group.id] })}>
            <Icon name="disclosed" /><span>{group.label || t(group.kind === 'unlinked' ? 'workspace.tree.unlinked' : 'workspace.tree.files')}</span>
          </Button>{group.projectId && <Button square tone="quiet" ariaLabel={t('workspace.tree.openProject', { title: group.label ?? '' })} title={t('workspace.tree.openProject', { title: group.label ?? '' })} aria-current={projectContext === group.projectId ? 'page' : undefined} disabled={busy} onClick={() => void open(undefined, group.projectId, 'projects')}><Icon name="dialog-launch" size={15} /></Button>}</div>
          {!view.collapsed.includes(group.id) && group.entries.map(entry => <Button key={entry.id} className="ow-tree-file" tone="quiet" ariaLabel={t('workspace.tree.openOriginal', { title: entry.row.title })} pressed={active === entry.row.key} disabled={busy || catalogState === 'error'} onMouseDown={event => event.preventDefault()} onClick={() => void open(entry.row, entry.projectId)} data-original={entry.row.key}>
            <span className="ow-tree-product" aria-hidden>{products[entry.row.product].label[0]}</span><span>{entry.row.title}</span>
          </Button>)}
        </section>)}
      </nav>
      {error && <div className="ow-tree-error"><p role="alert">{error}</p><Button onClick={() => window.dispatchEvent(new Event('wonffice:catalog-refresh'))}>{t('workspace.tree.retry')}</Button></div>}
      <div className="ow-tree-footer">{nativeRoot && rows.some(row => row.key === active) && <Button tone="quiet" disabled={busy} onClick={revealCurrent}>{t('workspace.tree.revealCurrent')}</Button>}<Button disabled={busy} onClick={() => void open()}>{t('workspace.tree.library')}</Button></div>
    </aside>
    {focused && <Button className="ow-tree-restore" ariaLabel={t('workspace.tree.restore')} onClick={() => setFocused(false)}><Icon name="disclosed" /></Button>}
    <div className="ow-native-slot" ref={slot}>{children}{entry !== 'ready' && <div className="ow-entry-status" role={entry === 'error' ? 'alert' : 'status'}><p>{t(entry === 'error' ? 'workspace.tree.unavailable' : 'workspace.tree.loading')}</p><a href={workspaceReturnURL(workspace.id)}>{t('workspace.tree.library')}</a></div>}</div>
  </div>;
}
