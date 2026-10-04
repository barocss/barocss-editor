import type { Product } from './products';

export type WorkspaceItem = { kind: 'project'; id: string } | { kind: 'document'; id: string; product: Product };
export type ExpectedWorkspaceItem = { kind: 'project' } | { kind: 'document'; product: Product };

/** Call only with a complete, currently accessible catalog. A URL does not grant access. */
export function resolveWorkspaceItem(id: string, candidates: readonly WorkspaceItem[], expected?: ExpectedWorkspaceItem): WorkspaceItem {
  const matches = candidates.filter(candidate => candidate.id === id);
  if (!matches.length) throw new Error('Workspace item not found.');
  if (matches.length !== 1) throw new Error('Workspace item identity is ambiguous.');
  const item = matches[0];
  if (expected && (item.kind !== expected.kind || (expected.kind === 'document' && item.kind === 'document' && item.product !== expected.product)))
    throw new Error('Workspace item does not match the original link.');
  return item;
}
