import { expect, it } from 'vitest';
import { formatWorkspaceRoute, parseWorkspaceRoute, type WorkspaceRoute } from '../src/routes';
import { productKeys } from '../src/products';

it.each<WorkspaceRoute>([
  { kind: 'workspace', workspaceId: 'workspace 팀' },
  { kind: 'workspace', workspaceId: 'ws', tenantId: 'tenant', view: 'projects' },
  { kind: 'workspace', workspaceId: 'ws', view: 'library' },
  { kind: 'workspace', workspaceId: 'ws', view: 'recent' },
  { kind: 'workspace', workspaceId: 'ws', view: 'favorites' },
  { kind: 'workspace', workspaceId: 'ws', view: 'trash' },
  { kind: 'item', workspaceId: 'ws', itemId: 'original+id', tenantId: 'tenant', projectId: 'project 연구', mode: 'read' },
  { kind: 'item', workspaceId: 'ws', itemId: 'project 1', view: 'projects' },
  { kind: 'item', workspaceId: 'ws', itemId: 'd', mode: 'edit', view: 'library' }
])('retains compact identity and presentation context $kind $view', route => {
  const address = formatWorkspaceRoute(route);
  expect(address).not.toContain('/workspace/'); expect(address).not.toContain('/documents/');
  expect(address).not.toContain('.html'); expect(address).not.toContain('#');
  expect(parseWorkspaceRoute(address)).toEqual({ route, legacy: false });
  expect(parseWorkspaceRoute(new URL(address, 'https://office.example'))).toEqual({ route, legacy: false });
});

it.each(productKeys)('converts legacy %s links while retaining expected native product for authorized resolution', product => {
  const hash = product === 'note' ? 'original%2Bid' : `${product}=original%2Bid`;
  const parsed = parseWorkspaceRoute(`/products/${product}/index.html?workspace=ws&tenant=t&project=p&mode=read#${hash}`);
  const route: WorkspaceRoute = { kind: 'item', workspaceId: 'ws', itemId: 'original+id', tenantId: 't', projectId: 'p', mode: 'read' };
  expect(parsed).toEqual({ route, legacy: true, expected: { kind: 'document', product } });
  expect(formatWorkspaceRoute(route)).toBe('/ws/original%2Bid?tenant=t&project=p&mode=read');
});

it('does not invent a product or project kind for an ambiguous compact item ID', () => {
  expect(parseWorkspaceRoute('/ws/same')).toEqual({ route: { kind: 'item', workspaceId: 'ws', itemId: 'same' }, legacy: false });
  const word = parseWorkspaceRoute('/products/word/index.html?workspace=ws#word=same');
  const slides = parseWorkspaceRoute('/products/slides/index.html?workspace=ws#slides=same');
  expect(word).toEqual({ route: { kind: 'item', workspaceId: 'ws', itemId: 'same' }, legacy: true, expected: { kind: 'document', product: 'word' } });
  expect(slides).toEqual({ route: { kind: 'item', workspaceId: 'ws', itemId: 'same' }, legacy: true, expected: { kind: 'document', product: 'slides' } });
  // The host must resolve exactly one authorized resource before normalizing either link.
});

it.each([
  ['/?workspace=ws&view=library', { route: { kind: 'workspace', workspaceId: 'ws', view: 'library' }, legacy: true }],
  ['/?workspace=ws&view=projects&project=p', { route: { kind: 'item', workspaceId: 'ws', itemId: 'p', view: 'projects' }, legacy: true, expected: { kind: 'project' } }],
  ['/?tenant=t&workspace=ws&project=p', { route: { kind: 'item', workspaceId: 'ws', itemId: 'p', tenantId: 't' }, legacy: true, expected: { kind: 'project' } }],
  ['/?tenant=t&workspace=ws&document=d&product=word&project=p&mode=edit',
    { route: { kind: 'item', tenantId: 't', workspaceId: 'ws', itemId: 'd', projectId: 'p', mode: 'edit' }, legacy: true, expected: { kind: 'document', product: 'word' } }]
])('converts legacy entry %s through the same identity parser', (input, result) => {
  expect(parseWorkspaceRoute(input as string)).toEqual(result);
});

it('leaves the unqualified entry to the application policy instead of selecting a sample', () => {
  expect(parseWorkspaceRoute('/')).toEqual({ route: null, legacy: false });
  expect(parseWorkspaceRoute(new URL('https://office.example/'))).toEqual({ route: null, legacy: false });
});

it.each([
  '/ws/', '/ws/id/', '/ws/id/extra', '/ws//id', '/%2F/id', '/ws/d%2Fother', '/ws/a%5Cb',
  '/%00', '/ws/%7F', '/..', '/%2E%2E', '/ws/../other', '/ws/%E0%A4%A', '/%ZZ',
  '/ws?workspace=foreign', '/ws?workspace=ws', '/ws/d?product=slides', '/ws/d?document=d',
  '/ws/d?mode=read&mode=edit', '/ws?tenant=t&tenant=t', '/?workspace=one&workspace=two',
  '/?workspace=ws&project=a&project=b', '/?workspace=ws&product=word', '/?workspace=ws&document=d',
  '/?tenant=t', '/?workspace=ws&mode=read', '/?workspace=ws&view=library&project=p',
  '/?workspace=ws&view=unknown', '/?workspace=ws&product=word&document=d&view=projects',
  '/?workspace=%E0%A4%A', '/?workspace=ws&project=%2F', '/ws/d?mode=write', '/ws?mode=read', '/ws?project=p',
  '/products/slides/index.html?workspace=ws#word=d', '/products/note/index.html?workspace=ws#note=d',
  '/products/word/index.html?workspace=ws#word=d&word=other', '/products/word/index.html?workspace=ws#word=d&slides=x',
  '/products/unknown/index.html?workspace=ws#unknown=d', '/products/site/index.html?workspace=ws',
  '/products/site/index.html#site=d', '/?workspace=ws#word=d', '/ws/d#word=d',
  '/products/note/index.html?workspace=ws#%2F', '/products/site/index.html?workspace=ws&document=d#site=d',
  '/?workspace=admin', '/admin', '/operator/item', '/design-system', '/products', 'javascript:alert(1)', '/w\n s', ' /ws '
])('refuses ambiguous or invalid address %s without another route or sample', input => {
  const parsed = parseWorkspaceRoute(input); expect(parsed).toHaveProperty('error'); expect(parsed).not.toHaveProperty('route');
});

it.each(['', '.', '..', '/', '\\', '\n', ' padded ', 'a/b'])('formatter refuses invalid original identity %j', itemId => {
  expect(() => formatWorkspaceRoute({ kind: 'item', workspaceId: 'ws', itemId })).toThrow();
});
it.each(['admin', 'operator', 'design-system', 'products'])('does not manufacture a workspace route colliding with %s host entry', workspaceId => {
  expect(() => formatWorkspaceRoute({ kind: 'workspace', workspaceId })).toThrow();
});

it.each([{ projectId: 'p' }, { mode: 'read' }])('formatter refuses item context on a workspace route %j', context => {
  expect(() => formatWorkspaceRoute({ kind: 'workspace', workspaceId: 'ws', ...context } as WorkspaceRoute)).toThrow();
});
