import { isProduct, type Product } from './products';

export type WorkspaceView = 'projects' | 'library' | 'recent' | 'favorites' | 'trash';
type Context = { workspaceId: string; tenantId?: string };
/** Route labels identify an original; server authority is verified separately. */
export type WorkspaceRoute =
  | Context & { kind: 'workspace'; view?: WorkspaceView }
  | Context & { kind: 'item'; itemId: string; projectId?: string; mode?: 'read' | 'edit'; view?: WorkspaceView };
export type WorkspaceRouteResult = { route: WorkspaceRoute | null; legacy: boolean; expected?: { kind: 'project' } | { kind: 'document'; product: Product } } | { error: string };

const reserved = new Set(['admin', 'operator', 'design-system', 'products']);
const views = new Set<WorkspaceView>(['projects', 'library', 'recent', 'favorites', 'trash']);
const keys = new Set(['workspace', 'tenant', 'project', 'document', 'product', 'mode', 'view']);
const hasControl = (value: string): boolean => [...value].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);
const identity = (value: unknown): value is string => typeof value === 'string' && !!value &&
  value !== '.' && value !== '..' && !value.includes('/') && !value.includes('\\') && !hasControl(value) && value.trim() === value;
const readId = (value: string | null, name: string): string | undefined => {
  if (value === null) return undefined;
  if (!identity(value)) throw new Error(`Invalid ${name} identity`);
  return value;
};
const decode = (value: string): string => decodeURIComponent(value);
const paramsFrom = (raw: string): URLSearchParams => {
  // URLSearchParams tolerates malformed percent/UTF-8 sequences; identities must not.
  for (const field of raw.split('&')) for (const part of field.split('=')) decode(part.replace(/\+/g, ' '));
  const params = new URLSearchParams(raw);
  for (const key of params.keys()) {
    if (!keys.has(key) || params.getAll(key).length !== 1) throw new Error('Unsupported or duplicate route query');
  }
  return params;
};
const assertAbsent = (params: URLSearchParams, names: string[]) => {
  if (names.some(name => params.has(name))) throw new Error('Contradictory or duplicate route identity');
};

export function formatWorkspaceRoute(route: WorkspaceRoute): string {
  if (!identity(route.workspaceId) || reserved.has(route.workspaceId) ||
    route.tenantId !== undefined && !identity(route.tenantId)) throw new Error('Invalid workspace route identity');
  const search = new URLSearchParams();
  if (route.tenantId !== undefined) search.set('tenant', route.tenantId);
  let path = `/${encodeURIComponent(route.workspaceId)}`;
  if (route.kind === 'item') {
    if (!identity(route.itemId)) throw new Error('Invalid item identity');
    path += `/${encodeURIComponent(route.itemId)}`;
    if (route.projectId !== undefined) {
      if (!identity(route.projectId)) throw new Error('Invalid project identity');
      search.set('project', route.projectId);
    }
    if (route.mode !== undefined) {
      if (route.mode !== 'read' && route.mode !== 'edit') throw new Error('Invalid item mode');
      search.set('mode', route.mode);
    }
  } else if (route.kind !== 'workspace') throw new Error('Unsupported route kind');
  else if ('projectId' in route || 'mode' in route) throw new Error('Item context requires an item');
  if (route.view !== undefined) {
    if (!views.has(route.view)) throw new Error('Invalid workspace view');
    search.set('view', route.view);
  }
  return path + (search.size ? `?${search}` : '');
}

export function parseWorkspaceRoute(input: URL | string): WorkspaceRouteResult {
  try {
    if (typeof input === 'string') {
      // Check before URL normalizes dot segments or removes raw control characters.
      if (input.trim() !== input || input.includes('\\') || hasControl(input)) throw new Error('Invalid route characters');
      const raw = input.replace(/^[a-z][a-z\d+.-]*:\/\/[^/?#]*/i, '').split(/[?#]/, 1)[0];
      if (raw.split('/').some(segment => ['.', '..'].includes(decode(segment)))) throw new Error('Invalid route path');
    }
    const url = input instanceof URL ? input : new URL(input, 'http://workspace.local');
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Unsupported route URL');
    const params = paramsFrom(url.search.slice(1));
    const workspaceId = readId(params.get('workspace'), 'workspace');
    if (workspaceId && reserved.has(workspaceId)) throw new Error('Reserved workspace path');
    const tenantId = readId(params.get('tenant'), 'tenant');
    const projectId = readId(params.get('project'), 'project');
    const documentId = readId(params.get('document'), 'document');
    const product = params.get('product');
    const mode = params.get('mode');
    const view = params.get('view');
    if (product !== null && !isProduct(product)) throw new Error('Unsupported product');
    if (mode !== null && mode !== 'read' && mode !== 'edit') throw new Error('Unsupported document mode');
    if (view !== null && !views.has(view as WorkspaceView)) throw new Error('Unsupported workspace view');
    const context = tenantId === undefined ? {} : { tenantId };
    const segments = url.pathname.split('/').slice(1).map(decode);
    if (url.pathname === '/') {
      if (url.hash) throw new Error('Unqualified document hash');
      if (!params.size) return { route: null, legacy: false };
      if (!workspaceId) throw new Error('Missing workspace identity');
      if (documentId || product !== null) {
        if (!documentId || !isProduct(product) || view) throw new Error('Incomplete or contradictory document identity');
        return { route: { kind: 'item', workspaceId, itemId: documentId, ...context,
          ...(projectId ? { projectId } : {}), ...(mode ? { mode } : {}) }, legacy: true, expected: { kind: 'document', product } };
      }
      if (mode) throw new Error('Document mode requires a document');
      if (projectId) {
        if (view && view !== 'projects') throw new Error('Project conflicts with workspace view');
        return { route: { kind: 'item', workspaceId, itemId: projectId, ...context, ...(view ? { view: view as WorkspaceView } : {}) }, legacy: true, expected: { kind: 'project' } };
      }
      return { route: { kind: 'workspace', workspaceId, ...context, ...(view ? { view: view as WorkspaceView } : {}) }, legacy: true };
    }
    if (segments.length === 3 && segments[0] === 'products' && isProduct(segments[1]) && segments[2] === 'index.html') {
      assertAbsent(params, ['document', 'product', 'view']);
      if (!workspaceId || !url.hash) throw new Error('Missing legacy document identity');
      const legacyProduct = segments[1], hash = url.hash.slice(1);
      let id: string;
      if (legacyProduct === 'note') {
        if (hash.includes('=') || hash.includes('&')) throw new Error('Invalid Note hash');
        id = decode(hash);
      } else {
        for (const field of hash.split('&')) for (const part of field.split('=')) decode(part.replace(/\+/g, ' '));
        const hashParams = new URLSearchParams(hash);
        if ([...hashParams.keys()].some(key => key !== legacyProduct) || hashParams.getAll(legacyProduct).length !== 1) throw new Error('Invalid product hash');
        id = hashParams.get(legacyProduct)!;
      }
      return { route: { kind: 'item', workspaceId, itemId: readId(id, 'document')!, ...context,
        ...(projectId ? { projectId } : {}), ...(mode ? { mode } : {}) }, legacy: true, expected: { kind: 'document', product: legacyProduct } };
    }
    if (segments.length !== 1 && segments.length !== 2 || reserved.has(segments[0])) throw new Error('Unsupported route path');
    if (url.hash) throw new Error('Compact routes do not use a document hash');
    assertAbsent(params, ['workspace', 'document', 'product']);
    const id = readId(segments[0], 'workspace')!;
    if (segments.length === 1) {
      assertAbsent(params, ['project', 'mode']);
      return { route: { kind: 'workspace', workspaceId: id, ...context, ...(view ? { view: view as WorkspaceView } : {}) }, legacy: false };
    }
    return { route: { kind: 'item', workspaceId: id, itemId: readId(segments[1], 'item')!, ...context,
      ...(projectId ? { projectId } : {}), ...(mode ? { mode } : {}), ...(view ? { view: view as WorkspaceView } : {}) }, legacy: false };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Invalid workspace route' };
  }
}
