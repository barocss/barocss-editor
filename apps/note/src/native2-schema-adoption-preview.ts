import { createNoteNative2Context, openNoteNativeSnapshot } from '@barocss/office-note';
import { parseRegistryDefinition } from '@barocss/schema/registry-contract';
import { planNative2OwnerDeclaration } from './experimental-native2-adopt';
import { native2Equal } from './experimental-native2-preserve';

const refuse = (code: string): never => { throw new Error(code); };

/** Data/model preview only. Registry admission, current authority and mutation remain with Office. */
export function createNative2SchemaAdoptionPreview(sourceSnapshotText: string, candidateSnapshotText: string,
  datasetPath: readonly number[]) {
  const source = createNoteNative2Context(sourceSnapshotText);
  const candidate = createNoteNative2Context(candidateSnapshotText);
  if (source.savedAt !== candidate.savedAt || source.schemaBundle.selected.length !== 1 ||
    candidate.schemaBundle.selected.length !== 1) return refuse('native2_preview_unsupported_transition');
  const prior = source.schemaBundle.selected[0], next = candidate.schemaBundle.selected[0];
  const priorEntry = source.schemaBundle.definitions.find(entry => native2Equal(entry.reference, prior));
  const nextEntry = candidate.schemaBundle.definitions.find(entry => native2Equal(entry.reference, next));
  if (!priorEntry || !nextEntry) return refuse('native2_preview_missing_definition');
  // Preserve full original definition texts, including their exact whitespace.
  if (source.schemaBundle.definitions.some((entry, index) => {
    const one = candidate.schemaBundle.definitions[index];
    return !one || !native2Equal(entry.reference, one.reference) || entry.definitionText !== one.definitionText;
  }))
    return refuse('native2_preview_original_definition_changed');
  const original = parseRegistryDefinition(priorEntry.definitionText).definition;
  const target = parseRegistryDefinition(nextEntry.definitionText).definition;
  const planned = planNative2OwnerDeclaration(source.document, prior, original, target, datasetPath);
  if (!native2Equal(planned, candidate.document)) return refuse('native2_preview_unrelated_native_change');
  const session = openNoteNativeSnapshot(candidate);
  try {
    if (session.editor.isEditable || session.exportSnapshot() !== candidateSnapshotText ||
      !native2Equal(session.exportNativeDocument(), candidate.document))
      return refuse('native2_preview_model_mismatch');
    let disposed = false;
    return Object.freeze({ status: 'preview_only' as const, sourceSnapshotText, candidateSnapshotText,
      datasetPath: Object.freeze([...datasetPath]), prior, next, session,
      dispose: () => { if (disposed) return; disposed = true; session.close(); } });
  } catch (error) { session.close(); throw error; }
}
