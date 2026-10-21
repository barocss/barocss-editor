// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { createProjectRecord, createTranslator } from '@barocss/shared';

const transport = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('./auth-client', () => ({ captureAuthorizedFetch: () => transport.fetch, listSnapshotDocuments: vi.fn() }));
import { serverProjectRepository } from './project-client';

beforeEach(() => { vi.stubGlobal('crypto', webcrypto); transport.fetch.mockReset(); });
const id = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const project = (n: number) => ({ tenantId: 'tenant', workspaceId: 'workspace', actor: { kind: 'human', id: 'current-member' },
  project: { revision: 1, record: { ...createProjectRecord(`Project ${n}`, 'Catalog original'), id: id(n) } } });
const reply = (projects: unknown[], nextCursor: unknown) => new Response(JSON.stringify({ projects, nextCursor }));

it.each([42, '', 'not-a-project-id', undefined])('refuses a malformed Project continuation instead of declaring a complete catalog: %s', async cursor => {
  transport.fetch.mockResolvedValueOnce(reply([project(1)], cursor)).mockResolvedValue(reply([], null));
  await expect(serverProjectRepository('tenant', 'workspace', 'viewer').list()).rejects.toThrow();
  expect(transport.fetch).toHaveBeenCalledTimes(1);
});

it('refuses an empty continuing page instead of classifying originals as unlinked', async () => {
  transport.fetch.mockResolvedValueOnce(reply([], id(50))).mockResolvedValue(reply([], null));
  await expect(serverProjectRepository('tenant', 'workspace', 'editor').list()).rejects.toThrow();
  expect(transport.fetch).toHaveBeenCalledTimes(1);
});

it('uses the current catalog language for a malformed Project response', async () => {
  transport.fetch.mockResolvedValue(reply([], 42));
  const t = createTranslator('en');
  await expect(serverProjectRepository('tenant', 'workspace', 'viewer', t).list()).rejects.toThrow(t('workspace.catalog.invalidResponse'));
});

it('reads the actual fifty-row Project page and final page without changing original identities or drafts', async () => {
  const first = Array.from({ length: 50 }, (_, index) => project(index + 1));
  transport.fetch.mockResolvedValueOnce(reply(first, id(50))).mockResolvedValueOnce(reply([project(51)], null));
  const result = await serverProjectRepository('tenant', 'workspace', 'editor').list();
  expect(result.map(one => one.record.id)).toEqual(Array.from({ length: 51 }, (_, index) => id(index + 1)));
  expect(new URL(transport.fetch.mock.calls[1][0]).searchParams.get('after')).toBe(id(50));
  expect(result.every(one => one.revision === 1 && Object.keys(one.record.drafts).length === 0)).toBe(true);
  expect(transport.fetch.mock.calls.every(([, init]) => !init?.method || init.method === 'GET')).toBe(true);
});

it('reports an incomplete catalog at the existing document discovery bound instead of reading indefinitely', async () => {
  transport.fetch.mockImplementation(async () => {
    const page = transport.fetch.mock.calls.length;
    return page <= 100
      ? reply(Array.from({ length: 50 }, (_, index) => project((page - 1) * 50 + index + 1)), id(page * 50))
      : reply([project(5001)], null);
  });
  await expect(serverProjectRepository('tenant', 'workspace', 'editor').list()).rejects.toThrow();
  expect(transport.fetch).toHaveBeenCalledTimes(100);
});

it('refuses a cursor cycle with otherwise new originals before another catalog request', async () => {
  for (let page = 1; page <= 3; page++) transport.fetch.mockResolvedValueOnce(reply(
    Array.from({ length: 50 }, (_, index) => project((page - 1) * 50 + index + 1)), id(page === 3 ? 50 : page * 50)));
  transport.fetch.mockResolvedValueOnce(reply([], null));
  await expect(serverProjectRepository('tenant', 'workspace', 'editor').list()).rejects.toThrow();
  expect(transport.fetch).toHaveBeenCalledTimes(3);
});
