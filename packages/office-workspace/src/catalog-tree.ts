import type { ProjectSnapshot } from '@barocss/shared';
import type { Product } from './products';
import type { WorkspaceDocument } from './workspace';

export interface LocalCatalogEntry {
  /** Presentation placement identity. The original identity remains row.key. */
  id: string;
  row: WorkspaceDocument;
  projectId?: string;
}
export interface LocalCatalogGroup {
  id: string;
  kind: 'project' | 'folder' | 'unlinked';
  /** Missing labels belong to the host's translated presentation. */
  label?: string;
  projectId?: string;
  entries: LocalCatalogEntry[];
}
export interface LocalCatalogTree {
  source: 'local';
  capabilities: { stableFolders: false; ownershipClassification: false };
  groups: LocalCatalogGroup[];
}
export interface LocalCatalogOptions {
  perspective: 'project' | 'my';
  query: string;
  product: Product | 'all';
}

/** Read-only projections of local-device originals. No ownership, ACL or nested folder inference. */
export function buildLocalCatalogTree(
  rows: readonly WorkspaceDocument[],
  projects: readonly ProjectSnapshot[],
  options: LocalCatalogOptions
): LocalCatalogTree {
  const needle = options.query.trim().toLowerCase();
  const current = rows.filter(row => row.trashedAt === null);
  const visible = current.filter(row => (options.product === 'all' || row.product === options.product)
    && (!needle || `${row.title}\n${row.searchText}`.toLowerCase().includes(needle)));
  const groups: LocalCatalogGroup[] = [];
  const entry = (row: WorkspaceDocument, groupId: string, projectId?: string): LocalCatalogEntry => ({
    id: JSON.stringify(['placement', groupId, row.key]), row,
    ...(projectId === undefined ? {} : { projectId })
  });
  if (options.perspective === 'my') {
    const folders = new Map<string, LocalCatalogGroup>();
    for (const row of visible) {
      let group = folders.get(row.folder);
      if (!group) {
        // The complete legacy folder string is opaque; '/' does not declare a parent.
        group = { id: JSON.stringify(['folder', row.folder]), kind: 'folder',
          ...(row.folder ? { label: row.folder } : {}), entries: [] };
        folders.set(row.folder, group);
        groups.push(group);
      }
      group.entries.push(entry(row, group.id));
    }
  } else {
    const linked = new Set<string>();
    const available = new Map(current.map(row => [row.key, row]));
    for (const { record } of projects) {
      const members = new Set<string>();
      for (const result of record.results) {
        const key = `${result.document.product}:${result.document.id}`;
        if (available.has(key)) { members.add(key); linked.add(key); }
      }
      const id = JSON.stringify(['project', record.id]);
      // Result names and missing-reference counts never enter this catalog projection.
      groups.push({ id, kind: 'project', label: record.title, projectId: record.id,
        entries: visible.filter(row => members.has(row.key)).map(row => entry(row, id, record.id)) });
    }
    const unlinked = visible.filter(row => !linked.has(row.key));
    if (unlinked.length) {
      const id = JSON.stringify(['unlinked']);
      groups.push({ id, kind: 'unlinked', entries: unlinked.map(row => entry(row, id)) });
    }
  }
  return { source: 'local', capabilities: { stableFolders: false, ownershipClassification: false }, groups };
}
