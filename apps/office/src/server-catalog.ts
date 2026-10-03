import { createTranslator, type ProjectSnapshot, type Translator } from '@barocss/shared';
import type { WorkspaceFrameGroup, WorkspaceFrameRow } from '@barocss/office-workspace/host';
import { AuthError, readDocumentCatalog, type CatalogDocumentHead } from './auth-client';

export type ServerCatalogPerspective = 'project' | 'sources';
export interface ServerCatalogRow extends WorkspaceFrameRow {
  documentId: string;
  mode: CatalogDocumentHead['mode'];
  revision: number;
  /** Discovery is not permission to open a native renderer. */
  nativeOpenSupported: boolean;
}
export interface AuthorizedWorkspaceCatalog {
  source: 'server';
  tenantId: string;
  workspaceId: string;
  capabilities: { stableFolders: false; ownershipClassification: false };
  documents: CatalogDocumentHead[];
  projects: ProjectSnapshot[];
  state: 'ready' | 'partial';
}

/** Both readers belong to the same current authorized session. No cached/local fallback. */
export async function readAuthorizedWorkspaceCatalog({ tenantId, workspaceId, requestFetch, readProjects, isCurrent, t = createTranslator('ko') }: {
  tenantId: string; workspaceId: string; requestFetch: typeof fetch;
  readProjects: () => Promise<ProjectSnapshot[]>;
  isCurrent: () => boolean; t?: Translator;
}): Promise<AuthorizedWorkspaceCatalog> {
  const check = () => { if (!isCurrent()) throw new AuthError('cancelled', t('workspace.catalog.changed')); };
  check();
  const documents = await readDocumentCatalog(tenantId, workspaceId, requestFetch, t);
  check();
  let projects: ProjectSnapshot[], state: 'ready' | 'partial' = 'ready';
  try { projects = await readProjects(); check(); }
  catch (error) {
    // A current 401 retires the login before throwing. Preserve its access-error kind.
    // The parent scope still rejects errors from older transitions.
    // Revocation or retired login must clear the entire previous projection.
    if (error instanceof AuthError && ['cancelled', 'unauthorized', 'forbidden'].includes(error.kind)) {
      const key = error.kind === 'cancelled' ? 'workspace.catalog.changed' : error.kind === 'unauthorized' ? 'workspace.catalog.expiredLogin' : 'workspace.catalog.denied';
      throw new AuthError(error.kind, t(key));
    }
    check();
    projects = []; state = 'partial';
  }
  return { source: 'server', tenantId, workspaceId, capabilities: { stableFolders: false, ownershipClassification: false }, documents, projects, state };
}

/** Project placements use authorized original titles. Pins/bodies/missing counts never enter the tree. */
export function serverCatalogGroups(catalog: AuthorizedWorkspaceCatalog, options: {
  perspective: ServerCatalogPerspective; product: WorkspaceFrameRow['product'] | 'all'; query: string;
  sourcesLabel: string;
}): WorkspaceFrameGroup<ServerCatalogRow>[] {
  const needle = options.query.trim().normalize('NFC').toLocaleLowerCase();
  const rows = catalog.documents.map(head => ({
    key: JSON.stringify([head.tenantId, head.workspaceId, head.product, head.documentId]),
    documentId: head.documentId, title: head.title, product: head.product, mode: head.mode, revision: head.revision,
    nativeOpenSupported: head.product !== 'site' && head.mode === 'snapshot'
  }));
  const visible = rows.filter(row => (options.product === 'all' || row.product === options.product) &&
    (!needle || row.title.normalize('NFC').toLocaleLowerCase().includes(needle)));
  const scopeKey = [catalog.tenantId, catalog.workspaceId];
  const sources = (): WorkspaceFrameGroup<ServerCatalogRow> => ({
    id: JSON.stringify([...scopeKey, 'sources']), label: options.sourcesLabel,
    entries: visible.map(row => ({ id: JSON.stringify(['source', row.key]), row, disabled: !row.nativeOpenSupported }))
  });
  // An incomplete Project read cannot establish that an original is unlinked.
  if (options.perspective === 'sources' || catalog.state === 'partial') return [sources()];
  const originals = new Map(rows.map(row => [`${row.product}:${row.documentId}`, row]));
  const shown = new Set(visible.map(row => row.key));
  const groups = catalog.projects.map(({ record }) => ({
    id: JSON.stringify([...scopeKey, 'project', record.id]), label: record.title, projectId: record.id,
    entries: record.results.flatMap(result => {
      const row = originals.get(`${result.document.product}:${result.document.id}`);
      return row && shown.has(row.key) ? [{ id: JSON.stringify([...scopeKey, record.id, result.id]), row,
        projectId: record.id, disabled: !row.nativeOpenSupported }] : [];
    })
  }));
  // All authorized originals remain reachable, whether or not a Project contains them.
  return [...groups, sources()];
}
