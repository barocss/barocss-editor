import { describe, expect, it } from 'vitest';
import type { ProjectSnapshot } from '@barocss/shared';
import type { WorkspaceDocument } from '../src/workspace';
import { buildLocalCatalogTree } from '../src/catalog-tree';

function row(product: WorkspaceDocument['product'], id: string, folder = ''): WorkspaceDocument {
  return { product, id, key: `${product}:${id}`, title: `Title ${id}`, searchText: `Body ${id}`,
    folder, favorite: false, trashedAt: null, openedAt: 0, references: [], savedAt: 1 };
}
function project(id: string, docs: WorkspaceDocument[]): ProjectSnapshot {
  return { revision: 1, record: { id, title: `Project ${id}`, goal: '', archived: false,
    results: docs.map((doc, index) => ({ id: `${id}-${index}`, name: `Private result ${index}`,
      document: { product: doc.product, id: doc.id }, inputs: [] })), comments: [], works: [], activities: [], drafts: {} } };
}
const options = { perspective: 'project' as const, query: '', product: 'all' as const };

describe('local catalog projections', () => {
  it('keeps one original in two projects, deduplicates each placement and includes every unlinked product', () => {
    const rows = [row('word', 'shared'), row('note', 'note'), row('slides', 'deck'), row('site', 'website')];
    const projects = [project('one', [rows[0], rows[0]]), project('two', [rows[0]])];
    const before = JSON.stringify({ rows, projects });
    const tree = buildLocalCatalogTree(rows, projects, options);
    expect(tree.source).toBe('local');
    expect(tree.capabilities).toEqual({ stableFolders: false, ownershipClassification: false });
    expect(tree.groups.map(group => [group.kind, group.projectId, group.entries.map(entry => entry.row.key)])).toEqual([
      ['project', 'one', ['word:shared']], ['project', 'two', ['word:shared']],
      ['unlinked', undefined, ['note:note', 'slides:deck', 'site:website']]
    ]);
    expect(tree.groups[0].entries[0].row).toBe(rows[0]);
    expect(tree.groups[1].entries[0].row).toBe(rows[0]);
    expect(tree.groups[0].entries[0].id).not.toBe(tree.groups[1].entries[0].id);
    expect(JSON.stringify({ rows, projects })).toBe(before);
  });

  it('never publishes missing or trashed project reference names or counts', () => {
    const visible = row('word', 'visible');
    const hidden = { ...row('note', 'hidden'), trashedAt: 1 };
    const projects = [project('p', [row('word', 'missing'), hidden, visible])];
    const tree = buildLocalCatalogTree([visible, hidden], projects, options);
    expect(tree.groups.flatMap(group => group.entries.map(entry => entry.row.key))).toEqual(['word:visible']);
    expect(JSON.stringify(tree)).not.toContain('Private result');
    expect(JSON.stringify(tree)).not.toContain('missing');
    expect(JSON.stringify(tree)).not.toContain('hidden');
  });

  it('shows all files without projects and ignores file-to-file references as project membership', () => {
    const first = { ...row('site', 'site'), references: ['word:doc'] };
    const rows = [first, row('word', 'doc')];
    const tree = buildLocalCatalogTree(rows, [], options);
    expect(tree.groups).toHaveLength(1);
    expect(tree.groups[0].kind).toBe('unlinked');
    expect(tree.groups[0].label).toBeUndefined();
    expect(tree.groups[0].entries.map(entry => entry.row)).toEqual(rows);
  });

  it('uses entire opaque folder labels and stable IDs independent of display titles', () => {
    const rows = [row('site', 'a', 'Team/Reports'), row('word', 'b', 'Team'), row('note', 'c', ''), row('slides', 'd', 'Team/Reports')];
    const tree = buildLocalCatalogTree(rows, [], { ...options, perspective: 'my' });
    expect(tree.groups.map(group => [group.label, group.entries.map(entry => entry.row.key)])).toEqual([
      ['Team/Reports', ['site:a', 'slides:d']], ['Team', ['word:b']], [undefined, ['note:c']]
    ]);
    const changed = buildLocalCatalogTree(rows.map(item => ({ ...item, title: 'Renamed' })), [], { ...options, perspective: 'my' });
    expect(changed.groups.map(group => group.id)).toEqual(tree.groups.map(group => group.id));
    expect(new Set(tree.groups.map(group => group.id)).size).toBe(3);
  });

  it('filters titles and native search text without changing canonical membership or keys', () => {
    const rows = [row('word', 'alpha'), row('site', 'beta'), row('slides', 'gamma')];
    const projects = [project('p', [rows[0]])];
    const body = buildLocalCatalogTree(rows, projects, { ...options, query: '  BODY ALPHA  ' });
    expect(body.groups.flatMap(group => group.entries.map(entry => entry.row.key))).toEqual(['word:alpha']);
    const site = buildLocalCatalogTree(rows, projects, { ...options, query: 'Title beta', product: 'site' });
    expect(site.groups.flatMap(group => group.entries.map(entry => entry.row.key))).toEqual(['site:beta']);
    expect(site.groups.at(-1)?.kind).toBe('unlinked');
    expect(buildLocalCatalogTree(rows, projects, { ...options, query: 'absent' }).groups.flatMap(group => group.entries)).toEqual([]);
  });

  it.each(
    (['project', 'my'] as const).flatMap(perspective =>
      (['title', 'searchText'] as const).flatMap(field =>
        (['NFC', 'NFD'] as const).map(storedForm => ({ perspective, field, storedForm }))
      )
    )
  )('matches Korean $field in $perspective with $storedForm storage and the other input form', ({ perspective, field, storedForm }) => {
    const phrase = '분기 보고서';
    const typedForm = storedForm === 'NFC' ? 'NFD' : 'NFC';
    const target = { ...row('word', 'korean', '업무/문서'), [field]: phrase.normalize(storedForm) };
    const other = row('site', 'other');
    const rows = [target, other];
    const projects = [project('one', [target]), project('two', [target])];
    const before = JSON.stringify({ rows, projects });
    const matched = (query: string) => buildLocalCatalogTree(rows, projects, { ...options, perspective, query });
    const same = matched(phrase.normalize(storedForm));
    const equivalent = matched(`  ${phrase.normalize(typedForm)}  `);
    const entries = equivalent.groups.flatMap(group => group.entries);
    expect(entries.map(entry => entry.row.key)).toEqual(perspective === 'project' ? ['word:korean', 'word:korean'] : ['word:korean']);
    expect(entries.every(entry => entry.row === target)).toBe(true);
    expect(equivalent).toEqual(same);
    expect(matched('찾을 수 없는 내용').groups.flatMap(group => group.entries)).toEqual([]);
    expect(JSON.stringify({ rows, projects })).toBe(before);
    expect(target[field]).toBe(phrase.normalize(storedForm));
  });

});
