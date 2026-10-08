import { createNoteNative2Context, openNoteNativeSnapshot, openNoteTree, type NativeNoteSession, type NoteSession } from '@barocss/office-note';
import { native2Equal, requireNative2Writable } from './experimental-native2-preserve';
import { isNative2AdoptConfirmation, type Native2AdoptConfirmation } from './experimental-native2-adopt';
import type { Native2AdoptRecovery } from './experimental-native2-adopt-pending';
import type { ExperimentalNative2Read } from './experimental-native2-reader';

export interface ProtectedNative2Source {
  session: NativeNoteSession; authority: NoteSession; children: () => readonly NoteSession[];
  isCurrent: () => boolean; protect: () => Promise<Native2AdoptRecovery>;
  qualify: (record: Native2AdoptRecovery) => Promise<Native2AdoptConfirmation>;
  retire: () => void;
}
export interface ProtectedNative2Target {
  readonly session: NativeNoteSession; readonly authority: NoteSession; readonly read: ExperimentalNative2Read;
  readonly isCurrent: () => boolean; retire: () => void;
}
export type Native2HandoffState = 'source-active' | 'protecting-source' | 'staged-readonly-target' | 'target-requalifying' |
  'target-active' | 'blocked-source-diverged' | 'blocked-unprotected' | 'blocked-after-retirement-no-editingowner';
const sameRead = (a: ExperimentalNative2Read, b: ExperimentalNative2Read) => native2Equal(a.document, b.document) && a.snapshotText === b.snapshotText && native2Equal(a.file, b.file);
function noDivergence(record: Native2AdoptRecovery, session: NativeNoteSession): void {
  const fixed = record.fixed;
  if (!fixed || record.phase !== 'adoption-fixed-confirmed' || !record.directRequestHash ||
    record.latestSourceDraft.generation !== fixed.generation || record.latestSourceDraft.snapshotText !== fixed.sourceSnapshotText ||
    session.exportSnapshot() !== record.latestSourceDraft.snapshotText) throw new Error('native2_source_diverged_or_unconfirmed');
}

/** Explicit host boundary. Old actual history is parked, never migrated or cleared. No writes/retries here. */
export function createProtectedNative2Handoff({ source, isActorWritableCurrent, readFreshTarget, activate }: {
  source: ProtectedNative2Source; isActorWritableCurrent: () => boolean;
  readFreshTarget: () => Promise<ExperimentalNative2Read>;
  activate?: (target: ProtectedNative2Target) => void;
}) {
  let state: Native2HandoffState = 'source-active', busy = false, retired = false;
  let staged: { session: NativeNoteSession; authority: NoteSession; read: ExperimentalNative2Read } | undefined;
  let target: ProtectedNative2Target | undefined;
  const oldEpoch = source.session.editor.dataStore.getDocumentEpoch(), oldRoot = source.session.rootId, oldSessionId = source.session.session;
  const oldAuthorityRoot = source.authority.rootId, oldAuthoritySession = source.authority.session, oldAuthorityEpoch = source.authority.editor.dataStore.getDocumentEpoch();
  const oldManager = source.session.editor.historyManager;
  let oldHistory = oldManager.getHistory(), oldIndex = oldManager.getCurrentIndex();
  const captureOperations = () => oldHistory.map(entry => ({ operations: entry.operations, inverse: entry.inverseOperations,
    forwardRefs: [...entry.operations], inverseRefs: [...entry.inverseOperations] }));
  let oldOperations = captureOperations();
  let parkedModel: ReturnType<NativeNoteSession['editor']['exportDocument']> | undefined;
  let parkedNative: ReturnType<NativeNoteSession['exportNativeDocument']> | undefined;
  let parkedRaw: string | undefined;
  const currentSource = () => !retired && source.isCurrent() && source.authority.editor.isEditable && source.session.editor.isEditable &&
    source.session.rootId === oldRoot && source.session.session === oldSessionId && source.session.editor.dataStore.getDocumentEpoch() === oldEpoch &&
    source.authority.rootId === oldAuthorityRoot && source.authority.session === oldAuthoritySession && source.authority.editor.dataStore.getDocumentEpoch() === oldAuthorityEpoch;
  const requireSource = () => requireNative2Writable(currentSource);
  const actor = () => requireNative2Writable(isActorWritableCurrent);
  const disposeStaged = () => {
    if (!staged) return; staged.authority.editor.setEditable(false);
    try { staged.session.close(); } finally { staged.authority.close(); staged = undefined; }
  };
  const finish = async (): Promise<ProtectedNative2Target> => {
    actor(); if (!staged || !retired) throw new Error('native2_target_not_staged'); state = 'target-requalifying';
    const read = await readFreshTarget(); actor();
    if (!sameRead(read, staged.read)) throw new Error('native2_target_changed_after_retirement');
    if (source.authority.editor.isEditable || source.session.editor.isEditable || source.children().some(c => c.editor.isEditable)) throw new Error('native2_source_owner_not_retired');
    const held = staged, root = held.session.rootId, epoch = held.session.editor.dataStore.getDocumentEpoch(), sid = held.session.session;
    const authorityRoot = held.authority.rootId, authoritySession = held.authority.session, authorityEpoch = held.authority.editor.dataStore.getDocumentEpoch();
    let active = true;
    const current = () => active && isActorWritableCurrent() && held.authority.editor.isEditable && held.session.editor.isEditable &&
      held.session.rootId === root && held.session.session === sid && held.session.editor.dataStore.getDocumentEpoch() === epoch &&
      held.authority.rootId === authorityRoot && held.authority.session === authoritySession && held.authority.editor.dataStore.getDocumentEpoch() === authorityEpoch;
    const one: ProtectedNative2Target = Object.freeze({ session: held.session, authority: held.authority, read,
      isCurrent: current, retire: () => { active = false; held.authority.editor.setEditable(false); } });
    held.authority.editor.setEditable(true); requireNative2Writable(current);
    try { activate?.(one); requireNative2Writable(current); }
    catch (error) { one.retire(); throw error; }
    target = one; state = 'target-active'; return one;
  };
  const begin = async (): Promise<ProtectedNative2Target> => {
    if (busy || retired || target) throw new Error('native2_handoff_requires_explicit_retry'); busy = true;
    try {
      requireSource(); actor(); state = 'protecting-source';
      const protectedRecord = await source.protect(); requireSource(); actor(); noDivergence(protectedRecord, source.session);
      const proof = await source.qualify(protectedRecord); requireSource(); actor();
      if (!isNative2AdoptConfirmation(proof) || !native2Equal(proof.attempt, protectedRecord.fixed) || proof.receipt.requestHash !== protectedRecord.directRequestHash) throw new Error('native2_adoption_proof_not_current');
      const authority = openNoteTree({ stype: 'note', content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Explicit target authority fixture' }] }] });
      authority.editor.setEditable(false);
      try { staged = { authority, session: openNoteNativeSnapshot(createNoteNative2Context(proof.read.snapshotText), { authority: authority.editor, after: 60000 }), read: proof.read }; }
      catch (error) { authority.close(); throw error; }
      state = 'staged-readonly-target';
      const final = await source.protect(); requireSource(); actor(); noDivergence(final, source.session);
      if (!native2Equal(final.fixed, protectedRecord.fixed) || final.directRequestHash !== protectedRecord.directRequestHash || !isNative2AdoptConfirmation(proof)) throw new Error('native2_source_changed_during_handoff');
      source.session.editor.historyManager.closeGroup(); oldHistory = oldManager.getHistory(); oldIndex = oldManager.getCurrentIndex();
      oldOperations = captureOperations();
      parkedModel = source.session.editor.exportDocument(); parkedNative = source.session.exportNativeDocument(); parkedRaw = source.session.exportSnapshot();
      source.authority.editor.setEditable(false); for (const child of source.children()) child.editor.setEditable(false);
      retired = true; source.retire();
      return await finish();
    } catch (error) {
      if (retired) { staged?.authority.editor.setEditable(false); state = 'blocked-after-retirement-no-editingowner'; }
      else { disposeStaged(); state = error instanceof Error && error.message === 'native2_source_diverged_or_unconfirmed' ? 'blocked-source-diverged' : 'blocked-unprotected'; }
      throw error;
    } finally { busy = false; }
  };
  const retry = async () => {
    if (busy || !retired || !staged || target) throw new Error('native2_handoff_not_retryable'); busy = true;
    try { return await finish(); }
    catch (error) { staged.authority.editor.setEditable(false); state = 'blocked-after-retirement-no-editingowner'; throw error; }
    finally { busy = false; }
  };
  const oldHistoryRetained = () => {
    const now = oldManager.getHistory(); return source.session.editor.historyManager === oldManager && oldIndex === oldManager.getCurrentIndex() &&
      oldHistory.length === now.length && oldHistory.every((entry, i) => {
        const saved = oldOperations[i];
        return entry === now[i] && entry.operations === saved.operations && entry.inverseOperations === saved.inverse &&
          entry.operations.length === saved.forwardRefs.length && entry.operations.every((op, index) => op === saved.forwardRefs[index]) &&
          entry.inverseOperations.length === saved.inverseRefs.length && entry.inverseOperations.every((op, index) => op === saved.inverseRefs[index]);
      });
  };
  return Object.freeze({ begin, retry, get state() { return state; }, get target() { return target; }, get sourceRetired() { return retired; },
    observeParked: () => ({ model: parkedModel, nativeDocument: parkedNative, snapshotText: parkedRaw, context: source.session.context,
      history: oldManager.getStats(), oldHistoryRetained: oldHistoryRetained(), writable: source.session.editor.isEditable }),
    dispose: () => { target?.retire(); disposeStaged(); } });
}
