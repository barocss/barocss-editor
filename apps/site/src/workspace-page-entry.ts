export interface WorkspaceEntryPage { sid: string; id: string; path: string; }

/** Resolve only current native page identity. A stale remembered page requires the chooser. */
export function resolveWorkspacePageEntry(
  pages: readonly WorkspaceEntryPage[],
  rememberedId: string | null
): string | undefined {
  if (rememberedId !== null) {
    if (!rememberedId.trim()) return undefined;
    const matches = pages.filter(page => page.id === rememberedId);
    return matches.length === 1 ? matches[0].sid : undefined;
  }
  const homes = pages.filter(page => page.path === '/');
  if (homes.length !== 1 || !homes[0].id.trim()) return undefined;
  const home = homes[0];
  return pages.filter(page => page.id === home.id).length === 1 ? home.sid : undefined;
}
