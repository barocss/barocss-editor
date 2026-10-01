import type { Editor, ModelSelection } from '@barocss/editor-core';

export function createWordSelectionLifetime(editor: Editor) {
  return { editor, generation: 0 };
}

/** Own the event subscription explicitly; cleanup also retires pending work. */
export function trackWordSelectionLifetime(lifetime: ReturnType<typeof createWordSelectionLifetime>) {
  const editor = lifetime.editor;
  let selection = JSON.stringify(editor.selection);
  const changedSelection = () => {
    const next = JSON.stringify(editor.selection);
    if (next !== selection) { selection = next; lifetime.generation += 1; }
  };
  const retire = () => { lifetime.generation += 1; };
  editor.on('editor:selection.model', changedSelection);
  editor.on('selection.change', changedSelection);
  editor.on('editor:content.change', retire);
  editor.on('editor:editable.change', retire);
  return () => {
    retire();
    editor.off('editor:selection.model', changedSelection);
    editor.off('selection.change', changedSelection);
    editor.off('editor:content.change', retire);
    editor.off('editor:editable.change', retire);
  };
}

/** A command belongs to the exact native root and range that opened its tools. */
export function captureWordSelectionOwner(editor: Editor, selection: ModelSelection | null | undefined, lifetime: ReturnType<typeof createWordSelectionLifetime>) {
  const rootId = editor.getRootId();
  if (!rootId || !selection) return null;
  return { lifetime, generation: lifetime.generation, version: editor.dataStore.getVersion(), rootId, root: editor.dataStore.getNode(rootId), selection: structuredClone(selection) };
}

export function ownsWordSelection(editor: Editor, owner: ReturnType<typeof captureWordSelectionOwner>) {
  if (!owner || owner.lifetime.editor !== editor || owner.lifetime.generation !== owner.generation || editor.dataStore.getVersion() !== owner.version || !editor.isEditable || editor.getRootId() !== owner.rootId || editor.dataStore.getNode(owner.rootId) !== owner.root ||
      JSON.stringify(editor.selection) !== JSON.stringify(owner.selection)) return false;
  const attached = (id: string) => {
    let node = editor.dataStore.getNode(id);
    const seen = new Set<string>();
    while (node?.sid && !seen.has(node.sid)) {
      if (node.sid === owner.rootId) return true;
      seen.add(node.sid);
      node = node.parentId ? editor.dataStore.getNode(node.parentId) : undefined;
    }
    return false;
  };
  return attached(owner.selection.startNodeId) && attached(owner.selection.endNodeId);
}
