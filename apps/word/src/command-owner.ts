import type { WordRuntime } from './runtime';
import {
  captureWordSelectionOwner, createWordSelectionLifetime, ownsWordSelection, trackWordSelectionLifetime
} from '../../../packages/office-word/src/selection-owner';

/** A search action owns the native document and input that opened the dialog. */
export function createWordCommandOwner(runtime: WordRuntime, isCurrent: () => boolean) {
  const editor = runtime.editor, lifetime = createWordSelectionLifetime(editor);
  let active = false;
  return {
    track() {
      active = true;
      const stop = trackWordSelectionLifetime(lifetime);
      return () => { active = false; stop(); };
    },
    capture() {
      const rootId = editor.getRootId(), input = runtime.captureInputIntent({ selection: 'gesture' });
      if (!active || !isCurrent() || !runtime.view.container.isConnected || runtime.view.hasFailedInputDelivery || !rootId || !input) return undefined;
      const root = editor.dataStore.getNode(rootId), epoch = editor.dataStore.getDocumentEpoch();
      const version = editor.dataStore.getVersion(), generation = lifetime.generation, editable = editor.isEditable;
      const selection = structuredClone(editor.selection), range = captureWordSelectionOwner(editor, selection, lifetime);
      const owns = () => active && isCurrent() && runtime.view.container.isConnected && !runtime.view.hasFailedInputDelivery && input() &&
        editor.getRootId() === rootId && editor.dataStore.getNode(rootId) === root &&
        editor.dataStore.getDocumentEpoch() === epoch && editor.dataStore.getVersion() === version &&
        lifetime.generation === generation && editor.isEditable === editable &&
        JSON.stringify(editor.selection) === JSON.stringify(selection) && (!editable || !selection || ownsWordSelection(editor, range));
      return {
        isCurrent: owns,
        restore() {
          if (!owns()) return false;
          runtime.view.contentEditableElement.focus({ preventScroll: true });
          if (!owns()) return false;
          if (selection) editor.updateSelection({ selection: structuredClone(selection), applySelectionToView: true });
          return owns();
        }
      };
    }
  };
}

export type WordCommandTarget = NonNullable<ReturnType<ReturnType<typeof createWordCommandOwner>['capture']>>;
