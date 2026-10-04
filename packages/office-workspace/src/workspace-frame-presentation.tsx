import type { ComponentProps, ReactNode, Ref } from 'react';
import { Button, Icon, TextField } from '@barocss/office-ui';
import type { Product } from './products';
import './workspace-frame.css';

/** Original identity is independent of a Project placement. No storage or ownership fields. */
export interface WorkspaceFrameRow { key: string; title: string; product: Product; }
export interface WorkspaceFrameEntry<Row extends WorkspaceFrameRow> {
  id: string;
  row: Row;
  projectId?: string;
  disabled?: boolean;
}
export interface WorkspaceFrameGroup<Row extends WorkspaceFrameRow> {
  id: string;
  label: string;
  /** null suppresses the tooltip when the host supplies a translated fallback label. */
  title?: string | null;
  projectId?: string;
  entries: readonly WorkspaceFrameEntry<Row>[];
}
export interface WorkspaceTreeView { query: string; product: Product | 'all'; collapsed: string[]; scroll: number; }
export interface WorkspaceFrameLabels {
  railNavigation: string; home: string; railFiles: string; recent: string; projects: string;
  treeNavigation: string; source: string; workspace: string; focus: string; perspective: string;
  search: string; product: string; allProducts: string; files: string; loading: string; empty: string;
  retry: string; revealCurrent: string; library: string; restore: string; unavailable: string;
  openProject: (title: string) => string;
  openOriginal: (title: string) => string;
}
export interface WorkspaceFramePresentationProps<Row extends WorkspaceFrameRow, Perspective extends string = string> {
  children?: ReactNode;
  /** Optional host-owned account/navigation controls; no authorization logic here. */
  railFooter?: ReactNode;
  nativeSlotRef?: Ref<HTMLDivElement>;
  treeRef?: Ref<HTMLElement>;
  groups: readonly WorkspaceFrameGroup<Row>[];
  perspectives: readonly { id: Perspective; label: string }[];
  projectPerspective: Perspective;
  perspective: Perspective;
  views: Record<Perspective, WorkspaceTreeView>;
  productOptions: readonly { id: Product; label: string; icon: ComponentProps<typeof Icon>['name'] }[];
  labels: WorkspaceFrameLabels;
  ready: boolean;
  catalogState: 'loading' | 'ready' | 'partial' | 'error';
  entry: 'loading' | 'ready' | 'error';
  entryReturnHref?: string;
  onEntryReturn?: () => void;
  error: string;
  busy: boolean;
  focused: boolean;
  active: string;
  projectContext?: string | null;
  canRevealCurrent: boolean;
  capabilities?: { projects?: boolean; library?: boolean; recent?: boolean; openOriginal?: boolean };
  onViewChange: (patch: Partial<WorkspaceTreeView>) => void;
  onPerspectiveChange: (perspective: Perspective) => void;
  onFocusChange: (focused: boolean) => void;
  /** The host owns authorization, lifetime guards, flush and navigation. */
  onOpen: (row: Row, projectId?: string) => void;
  onNavigate: (destination: 'projects' | 'library' | 'recent', projectId?: string) => void;
  onRetry: () => void;
  onRevealCurrent: () => void;
}

/** Controlled presentation only. The host owns catalog authority and native-root lifetime. */
export function WorkspaceFramePresentation<Row extends WorkspaceFrameRow, Perspective extends string>(props: WorkspaceFramePresentationProps<Row, Perspective>) {
  const { children, nativeSlotRef, treeRef, groups, perspectives, projectPerspective, perspective, views,
    productOptions, labels, ready, catalogState, entry, entryReturnHref, onEntryReturn, error, busy, focused,
    active, projectContext, canRevealCurrent, capabilities = {}, onViewChange: changeView,
    onPerspectiveChange, onFocusChange, onOpen, onNavigate, onRetry, onRevealCurrent } = props;
  const view = views[perspective];
  return <div className="ow-workspace-frame" data-workspace-frame data-focus-mode={focused || undefined}>
    <nav className="ow-workspace-rail" aria-label={labels.railNavigation}>
      <Button square tone="quiet" ariaLabel={labels.home} title={labels.home} disabled={busy || capabilities.projects === false} onClick={() => onNavigate('projects')}><Icon name="workspace-home" size={20} /></Button>
      <Button square tone="quiet" ariaLabel={labels.railFiles} title={labels.railFiles} disabled={busy || capabilities.library === false} onClick={() => onNavigate('library')}><Icon name="workspace-files" size={20} /></Button>
      <Button square tone="quiet" ariaLabel={labels.recent} title={labels.recent} disabled={busy || capabilities.recent === false} onClick={() => onNavigate('recent')}><Icon name="recent-documents" size={20} /></Button>
      <hr />
      <Button square tone="quiet" ariaLabel={labels.projects} title={labels.projects} pressed={perspective === projectPerspective && !focused} onClick={() => { onPerspectiveChange(projectPerspective); onFocusChange(false); }}><Icon name="workspace-projects" size={20} /></Button>
      {props.railFooter && <div className="ow-workspace-rail-footer">{props.railFooter}</div>}
    </nav>
    <aside className="ow-file-navigation" aria-label={labels.treeNavigation} hidden={focused}>
      <div className="ow-tree-header"><strong title={labels.source}>{labels.workspace}</strong><Button tone="quiet" ariaLabel={labels.focus} onClick={() => onFocusChange(true)}><Icon name="close" /></Button></div>
      <div className="ow-tree-perspectives" aria-label={labels.perspective}>
        {perspectives.map(option => <Button key={option.id} pressed={perspective === option.id} onClick={() => onPerspectiveChange(option.id)}>{option.label}</Button>)}
      </div>
      <p className="ow-tree-source">{labels.source}</p>
      <TextField ariaLabel={labels.search} placeholder={labels.search} value={view.query} onChange={query => changeView({ query })} />
      <select aria-label={labels.product} value={view.product} onChange={event => changeView({ product: productOptions.some(option => option.id === event.target.value) ? event.target.value as Product : 'all' })}>
        <option value="all">{labels.allProducts}</option>{productOptions.map(product => <option key={product.id} value={product.id}>{product.label}</option>)}
      </select>
      <nav ref={treeRef} className="ow-file-tree" aria-label={labels.files} onScroll={event => changeView({ scroll: event.currentTarget.scrollTop })}>
        {!ready && <p role="status">{labels.loading}</p>}
        {ready && catalogState !== 'error' && !groups.some(group => group.entries.length) && <p className="ow-tree-empty">{labels.empty}</p>}
        {groups.map(group => <section key={group.id} data-tree-group={group.id}>
          <div className="ow-tree-group-heading"><Button className="ow-tree-group" tone="quiet" title={group.title === null ? undefined : (group.title ?? group.label) || undefined} aria-expanded={!view.collapsed.includes(group.id)} onClick={() => changeView({ collapsed: view.collapsed.includes(group.id) ? view.collapsed.filter(id => id !== group.id) : [...view.collapsed, group.id] })}>
            <Icon name="disclosed" /><Icon name={group.projectId ? 'workspace-projects' : 'workspace-files'} /><span>{group.label || labels.files}</span>
          </Button>{group.projectId && <Button square tone="quiet" ariaLabel={labels.openProject(group.title === null ? '' : group.title ?? group.label)} title={labels.openProject(group.title === null ? '' : group.title ?? group.label)} aria-current={projectContext === group.projectId ? 'page' : undefined} disabled={busy || capabilities.projects === false} onClick={() => onNavigate('projects', group.projectId)}><Icon name="dialog-launch" size={15} /></Button>}</div>
          {!view.collapsed.includes(group.id) && <ul className="ow-tree-children">{group.entries.map(entry => <li key={entry.id}><Button className="ow-tree-file" tone="quiet" ariaLabel={labels.openOriginal(entry.row.title)} title={entry.row.title} pressed={active === entry.row.key} disabled={busy || catalogState === 'error' || capabilities.openOriginal === false || entry.disabled === true} onMouseDown={event => event.preventDefault()} onClick={() => onOpen(entry.row, entry.projectId)} data-original={entry.row.key}>
            <span className="ow-tree-product" aria-hidden><Icon name={productOptions.find(option => option.id === entry.row.product)?.icon ?? 'workspace-files'} /></span><span>{entry.row.title}</span>
          </Button></li>)}</ul>}
        </section>)}
      </nav>
      {error && <div className="ow-tree-error"><p role="alert">{error}</p><Button onClick={onRetry}>{labels.retry}</Button></div>}
      <div className="ow-tree-footer">{canRevealCurrent && <Button tone="quiet" disabled={busy} onClick={onRevealCurrent}>{labels.revealCurrent}</Button>}<Button disabled={busy || capabilities.library === false} onClick={() => onNavigate('library')}>{labels.library}</Button></div>
    </aside>
    {focused && <Button className="ow-tree-restore" ariaLabel={labels.restore} onClick={() => onFocusChange(false)}><Icon name="disclosed" /></Button>}
    <div className="ow-native-slot" ref={nativeSlotRef}>{children}{entry !== 'ready' && <div className="ow-entry-status" role={entry === 'error' ? 'alert' : 'status'}><p>{entry === 'error' ? labels.unavailable : labels.loading}</p>{entryReturnHref ? <a href={entryReturnHref} onClick={onEntryReturn ? event => { event.preventDefault(); onEntryReturn(); } : undefined}>{labels.library}</a> : <Button disabled={!onEntryReturn || busy} onClick={onEntryReturn}>{labels.library}</Button>}</div>}</div>
  </div>;
}
