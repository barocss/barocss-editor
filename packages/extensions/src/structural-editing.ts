import type { Editor } from '@barocss/editor-core';
import { FragmentEditor, type StructuralRequest, type EditingDecision } from '@barocss/model';
import { standardClipboardPolicy } from './standard-clipboard';

/** Standard input adapters reuse the product's existing policy owner. */
export function structuralEditing(editor: Editor): FragmentEditor | undefined {
  const schema = editor.dataStore?.getActiveSchema?.();
  return schema && typeof editor.dataStore.getEditRevision === 'function'
    ? FragmentEditor.forEditor(editor, standardClipboardPolicy(type => schema.hasNodeType(type))) : undefined;
}
export async function applyStructure(editor: Editor, request: StructuralRequest): Promise<boolean> {
  const editing = structuralEditing(editor);
  if (!editing) return false;
  const decision: EditingDecision = await editing.planStructure(request);
  editor.emit('editor:structure.plan', decision);
  return decision.ok && (await editing.apply(decision.plan)).success;
}
