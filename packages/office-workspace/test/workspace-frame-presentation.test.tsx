import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceFramePresentation, type WorkspaceFrameLabels, type WorkspaceFramePresentationProps, type WorkspaceFrameRow } from '../src/workspace-frame-presentation';

const labels: WorkspaceFrameLabels = {
  railNavigation: 'Workspace navigation', home: 'Home', railFiles: 'Files', recent: 'Recent', projects: 'Projects',
  treeNavigation: 'Source navigation', source: 'Authorized sources', workspace: 'Server workspace', focus: 'Focus',
  perspective: 'Perspective', search: 'Search', product: 'Product', allProducts: 'All products', files: 'Sources',
  loading: 'Loading', empty: 'Empty', retry: 'Retry', revealCurrent: 'Reveal current', library: 'Library',
  restore: 'Restore', unavailable: 'Unavailable', openProject: title => `Project ${title}`, openOriginal: title => `Open ${title}`
};
const original: WorkspaceFrameRow = { key: 'scope:word:original', title: 'Authorized title', product: 'word' };
function props(): WorkspaceFramePresentationProps<WorkspaceFrameRow, 'projects' | 'sources'> {
  const view = { query: '', product: 'all' as const, collapsed: [], scroll: 0 };
  return {
    groups: ['one', 'two'].map(id => ({ id, label: `Project ${id}`, projectId: id,
      entries: [{ id: `placement:${id}`, row: original, projectId: id }] })),
    perspectives: [{ id: 'projects', label: 'Projects' }, { id: 'sources', label: 'Sources' }],
    projectPerspective: 'projects', perspective: 'projects', views: { projects: view, sources: view },
    productOptions: [{ id: 'word', label: 'Word', icon: 'product-word' }], labels,
    ready: true, catalogState: 'ready', entry: 'ready', error: '', busy: false, focused: false,
    active: original.key, projectContext: 'two', canRevealCurrent: true,
    onViewChange: vi.fn(), onPerspectiveChange: vi.fn(), onFocusChange: vi.fn(), onOpen: vi.fn(),
    onNavigate: vi.fn(), onRetry: vi.fn(), onRevealCurrent: vi.fn()
  };
}
// Inspect supplied control props without mounting a browser or introducing another navigation owner.
function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...elements(node.props.children as ReactNode)];
}
const controls = (input: ReturnType<typeof props>) => elements(WorkspaceFramePresentation(input));
afterEach(() => vi.unstubAllGlobals());

describe('controlled Workspace frame presentation', () => {
  it('renders supplied source labels and native children without browser storage or location', () => {
    vi.stubGlobal('sessionStorage', { getItem: () => { throw new Error('Unexpected local storage read'); }, setItem: () => { throw new Error('Unexpected local storage write'); } });
    vi.stubGlobal('location', { get search() { throw new Error('Unexpected location read'); }, assign: () => { throw new Error('Unexpected navigation'); } });
    const input = props();
    input.children = createElement('article', { 'data-native': true }, 'Native editor');
    const html = renderToStaticMarkup(WorkspaceFramePresentation(input));
    expect(html).toContain('Server workspace');
    expect(html).toContain('Authorized sources');
    expect(html).toContain('Native editor');
    expect(html).not.toContain('My');
    expect(html.match(/data-original="scope:word:original"/g)).toHaveLength(2);
  });
  it('selects both aliases by canonical original and delegates each placement without copying it', () => {
    const input = props();
    const rows = controls(input).filter(element => element.props['data-original'] === original.key);
    expect(rows).toHaveLength(2);
    expect(rows.every(element => element.props.pressed === true)).toBe(true);
    rows.forEach(element => (element.props.onClick as () => void)());
    expect(input.onOpen).toHaveBeenNthCalledWith(1, original, 'one');
    expect(input.onOpen).toHaveBeenNthCalledWith(2, original, 'two');
    expect(input.onNavigate).not.toHaveBeenCalled();
  });
  it('keeps perspective and collapsed state controlled by the host', () => {
    const input = props();
    const before = JSON.stringify(input.views);
    const all = controls(input);
    (all.find(element => element.props.children === 'Sources')!.props.onClick as () => void)();
    (all.find(element => element.props.className === 'ow-tree-group')!.props.onClick as () => void)();
    expect(input.onPerspectiveChange).toHaveBeenCalledWith('sources');
    expect(input.onViewChange).toHaveBeenCalledWith({ collapsed: ['one'] });
    expect(JSON.stringify(input.views)).toBe(before);
    input.views.projects = { ...input.views.projects, collapsed: ['one'] };
    expect(controls(input).filter(element => element.props['data-original'] === original.key)).toHaveLength(1);
  });
  it('disables originals during busy/error states and for unavailable product entries', () => {
    const input = props();
    for (const state of [{ busy: true }, { catalogState: 'error' as const }, { capabilities: { openOriginal: false } }]) {
      const rows = controls({ ...input, ...state }).filter(element => element.props['data-original'] === original.key);
      expect(rows.every(element => element.props.disabled === true)).toBe(true);
    }
    input.groups = [{ id: 'site', label: 'Sources', entries: [{ id: 'unavailable', row: original, disabled: true }] }];
    expect(controls(input).find(element => element.props['data-original'] === original.key)!.props.disabled).toBe(true);
  });
  it('keeps the same native slot, ref and child contract across tree presentation changes', () => {
    const input = props();
    const ref = { current: null };
    const child = createElement('article', { 'data-native': true }, 'Native editor');
    input.nativeSlotRef = ref;
    input.children = child;
    const before = controls(input).find(element => element.props.className === 'ow-native-slot')!;
    input.perspective = 'sources';
    input.focused = true;
    const after = controls(input).find(element => element.props.className === 'ow-native-slot')!;
    expect(after.type).toBe(before.type);
    expect(after.key).toBe(before.key);
    expect(after.props.ref).toBe(ref);
    expect((after.props.children as ReactNode[])[0]).toBe(child);
  });
  it('provides a keyboard accessible entry return action without a local URL', () => {
    const input = props();
    input.entry = 'error';
    input.onEntryReturn = vi.fn();
    const status = controls(input).find(element => element.props.className === 'ow-entry-status')!;
    const action = elements(status).find(element => element.props.onClick === input.onEntryReturn)!;
    expect(action).toBeDefined();
    expect(action.props.disabled).toBe(false);
    (action.props.onClick as () => void)();
    expect(input.onEntryReturn).toHaveBeenCalledOnce();
    input.entryReturnHref = '/?workspace=local';
    expect(renderToStaticMarkup(WorkspaceFramePresentation(input))).toContain('href="/?workspace=local"');
  });
  it('shows supplied loading and failure states without inventing successful empty results', () => {
    const input = props();
    input.groups = [];
    input.ready = false;
    input.entry = 'loading';
    expect(renderToStaticMarkup(WorkspaceFramePresentation(input))).toContain('Loading');
    input.ready = true;
    input.catalogState = 'error';
    input.entry = 'error';
    input.error = 'Catalog read failed';
    const html = renderToStaticMarkup(WorkspaceFramePresentation(input));
    expect(html).toContain('Catalog read failed');
    expect(html).toContain('Unavailable');
    expect(html).not.toContain('ow-tree-empty');
  });
});
