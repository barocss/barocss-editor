import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
const moduleUrl = `/@fs/${fileURLToPath(new URL('../src/document-library/document-library.ts', import.meta.url))}`;

test('bulk restore atomically compares revisions across independent connections and snapshots bytes with metadata', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  const result = await page.evaluate(async url => {
    const { documentLibrary } = await import(/* @vite-ignore */ url);
    const spec = { db: `bulk-${crypto.randomUUID()}`, store: 'notes' }, first = documentLibrary(spec), second = documentLibrary(spec);
    const initial = await first.keepMany([{ entry: { name: 'a', title: 'A' }, text: 'a1', expectedRevision: null }, { entry: { name: 'b' }, text: 'b1', expectedRevision: null }]);
    const races = await Promise.allSettled([
      first.keepMany([{ entry: { name: 'a' }, text: 'a2', expectedRevision: 1 }, { entry: { name: 'c' }, text: 'new-c', expectedRevision: null }]),
      second.keepMany([{ entry: { name: 'a' }, text: 'a3', expectedRevision: 1 }, { entry: { name: 'd' }, text: 'new-d', expectedRevision: null }])
    ]);
    const snapshots = await first.snapshots();
    return { initial, races: races.map(result => result.status), rows: snapshots.map(item => ({ name: item.row.name, revision: item.row.revision, text: item.text })), order: snapshots.map(item => item.row.savedAt) };
  }, moduleUrl);
  expect(result.initial.map((row: any) => [row.name, row.revision])).toEqual([['a', 1], ['b', 1]]);
  expect(result.races.filter((value: string) => value === 'fulfilled')).toHaveLength(1);
  expect(result.rows).toHaveLength(3);
  expect(result.rows.find((row: any) => row.name === 'a')?.revision).toBe(2);
  const winner = result.rows.find((row: any) => row.name === 'a')?.text;
  expect(result.rows.some((row: any) => row.name === (winner === 'a2' ? 'c' : 'd'))).toBe(true);
  expect(result.order).toEqual([...result.order].sort((a: number, b: number) => b - a));
  expect(errors).toEqual([]);
});

test('a put failure rolls back earlier puts, invalid inputs never write, and empty batches are harmless', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  const result = await page.evaluate(async url => {
    const { documentLibrary } = await import(/* @vite-ignore */ url);
    const library = documentLibrary({ db: `rollback-${crypto.randomUUID()}`, store: 'notes' });
    await library.keep({ name: 'a' }, 'original');
    const original = IDBObjectStore.prototype.put;
    let writes = 0, failure = '';
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
      if (++writes === 2) throw new DOMException('Simulated full storage', 'QuotaExceededError');
      return original.apply(this, args);
    };
    try { await library.keepMany([{ entry: { name: 'a' }, text: 'changed', expectedRevision: 1 }, { entry: { name: 'b' }, text: 'new', expectedRevision: null }]); }
    catch (error) { failure = (error as Error).name; }
    finally { IDBObjectStore.prototype.put = original; }
    const rejected = [];
    for (const entries of [
      [{ entry: { name: ' ' }, text: 'bad' }],
      [{ entry: { name: 'b' }, text: 'x' }, { entry: { name: 'b' }, text: 'y' }],
      [{ entry: { name: 'b', metadata: { unsupported: () => {} } }, text: 'bad' }]
    ]) { try { await library.keepMany(entries); rejected.push(false); } catch { rejected.push(true); } }
    return { failure, writes, rejected, empty: await library.keepMany([]), snapshots: await library.snapshots() };
  }, moduleUrl);
  expect(result.failure).toBe('QuotaExceededError'); expect(result.writes).toBe(2);
  expect(result.rejected).toEqual([true, true, true]); expect(result.empty).toEqual([]);
  expect(result.snapshots).toHaveLength(1);
  expect(result.snapshots[0]).toMatchObject({ row: { name: 'a', revision: 1 }, text: 'original' });
  expect(errors).toEqual([]);
});
