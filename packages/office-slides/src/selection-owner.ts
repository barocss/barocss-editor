import type { Editor, ModelSelection } from '@barocss/editor-core';

export type SlidesRegion = 'canvas' | 'notes';
export function createSlidesSelectionLifetime(editor: Editor, slide?: string) {
  return { editor, slide, region: 'canvas' as SlidesRegion, generation: 0 };
}
export type SlidesSelectionLifetime = ReturnType<typeof createSlidesSelectionLifetime>;
export function changeSlidesSelectionContext(lifetime: SlidesSelectionLifetime, slide: string | undefined, region: SlidesRegion) {
  if (lifetime.slide !== slide || lifetime.region !== region) lifetime.generation += 1;
  lifetime.slide = slide; lifetime.region = region;
}
export function trackSlidesSelectionLifetime(lifetime: SlidesSelectionLifetime) {
  const editor = lifetime.editor;
  let selection = JSON.stringify(editor.selection);
  const changed = () => {
    const next = JSON.stringify(editor.selection);
    if (next !== selection) { selection = next; lifetime.generation += 1; }
  };
  const retire = () => { lifetime.generation += 1; };
  editor.on('editor:selection.model', changed);
  editor.on('editor:selection.change', changed);
  editor.on('editor:content.change', retire);
  editor.on('editor:editable.change', retire);
  return () => {
    retire(); editor.off('editor:selection.model', changed); editor.off('editor:selection.change', changed);
    editor.off('editor:content.change', retire); editor.off('editor:editable.change', retire);
  };
}
export function captureSlidesSelectionOwner(lifetime: SlidesSelectionLifetime, selection: ModelSelection | null | undefined = lifetime.editor.selection) {
  const editor = lifetime.editor, rootId = editor.getRootId();
  if (!rootId) return null;
  return { lifetime, generation: lifetime.generation, version: editor.dataStore.getVersion(), rootId,
    root: editor.dataStore.getNode(rootId), slide: lifetime.slide, region: lifetime.region,
    selection: selection ? structuredClone(selection) : null };
}
export function ownsSlidesSelection(owner: ReturnType<typeof captureSlidesSelectionOwner>) {
  if (!owner) return false;
  const { lifetime } = owner, editor = lifetime.editor;
  if (!editor.isEditable || lifetime.generation !== owner.generation || lifetime.slide !== owner.slide || lifetime.region !== owner.region ||
    editor.getRootId() !== owner.rootId || editor.dataStore.getNode(owner.rootId) !== owner.root || editor.dataStore.getVersion() !== owner.version ||
    JSON.stringify(editor.selection) !== JSON.stringify(owner.selection)) return false;
  if (!owner.selection) return true;
  return [owner.selection.startNodeId, owner.selection.endNodeId, ...(owner.selection.nodeIds ?? [])].every(id => {
    let node = editor.dataStore.getNode(id); const seen = new Set<string>();
    while (node?.sid && !seen.has(node.sid)) { if (node.sid === owner.rootId) return true; seen.add(node.sid); node = node.parentId ? editor.dataStore.getNode(node.parentId) : undefined; }
    return false;
  });
}

/** Native Slides tables reuse the rich-text bTable subtree. */
export function selectedSlidesTable(editor: Editor) {
  let node = editor.selection?.startNodeId ? editor.dataStore.getNode(editor.selection.startNodeId) : undefined;
  const seen = new Set<string>();
  while (node?.sid && !seen.has(node.sid)) {
    if (node.stype === 'bTable' || node.stype === 'table') return node.sid;
    seen.add(node.sid); node = node.parentId ? editor.dataStore.getNode(node.parentId) : undefined;
  }
}
