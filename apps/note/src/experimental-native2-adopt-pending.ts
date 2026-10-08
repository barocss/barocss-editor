import type { PendingNoteScope } from './server-pending';
import { isRegistryUuid, parseRegistryJson } from '@barocss/schema/registry-contract';
import { freezeNative2Value, native2Equal, native2Exact, native2Digest, validateNative2Base, validateNative2Draft,
  validateNative2Scope, requireNative2Writable, type Native2PreserveBase } from './experimental-native2-preserve';
import { recoverNative2AdoptAttempt, isNative2AdoptDirect, isNative2AdoptConfirmation,
  type Native2AdoptAttempt, type Native2AdoptReceipt, type Native2AdoptConfirmation } from './experimental-native2-adopt';

export interface Native2AdoptDraft { readonly generation: number; readonly snapshotText: string }
export interface Native2AdoptRecovery {
  readonly version: 1; readonly kind: 'experimental-native2-adopt'; readonly scope: PendingNoteScope & { documentId: string };
  readonly base: Native2PreserveBase; readonly latestSourceDraft: Native2AdoptDraft;
  readonly phase: 'draft' | 'pending' | 'unknown' | 'adoption-fixed-confirmed';
  readonly fixed?: Native2AdoptAttempt; readonly directRequestHash?: string;
}
const positive = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;

/** Recovery bytes only. Account-scoped prefix does not provide confidentiality or canonical content storage. */
export function createExperimentalNative2AdoptJournal({ scope: supplied, documentId, storage: suppliedStorage, isWritableCurrent }: {
  scope: PendingNoteScope; documentId: string; storage?: Storage; isWritableCurrent: () => boolean;
}) {
  validateNative2Scope(supplied); if (!isRegistryUuid(documentId)) throw new Error('invalid_native2_adopt_journal_identity');
  const scope = freezeNative2Value({ ...supplied }), owned = freezeNative2Value({ ...scope, documentId });
  const key = 'wonffice.note.experimental-native2-adopt.v1:' + encodeURIComponent(JSON.stringify([scope.issuer, scope.subject, scope.tenantId, scope.workspaceId, documentId]));
  const storage = () => suppliedStorage ?? window.localStorage, current = () => requireNative2Writable(isWritableCurrent);
  const decode = async (raw: string): Promise<Native2AdoptRecovery> => {
    current();
    try {
      const v = native2Exact(parseRegistryJson(raw, 1048576), ['version', 'kind', 'scope', 'base', 'latestSourceDraft', 'phase'], ['fixed', 'directRequestHash']);
      if (v.version !== 1 || v.kind !== 'experimental-native2-adopt' || !native2Equal(v.scope, owned) ||
        typeof v.phase !== 'string' || !['draft', 'pending', 'unknown', 'adoption-fixed-confirmed'].includes(v.phase)) throw new Error('Invalid adoption journal');
      const base = await validateNative2Base(v.base, scope, isWritableCurrent); current();
      if (base.document.documentId !== documentId) throw new Error('Foreign adoption');
      const draft = native2Exact(v.latestSourceDraft, ['generation', 'snapshotText']);
      if (!positive(draft.generation) || typeof draft.snapshotText !== 'string') throw new Error('Invalid source draft');
      validateNative2Draft(base, draft.snapshotText, scope);
      const fixed = v.fixed === undefined ? undefined : await recoverNative2AdoptAttempt(v.fixed, scope, isWritableCurrent); current();
      if ((v.phase === 'draft') === !!fixed || fixed && (!native2Equal(fixed.base, base) || !native2Equal(fixed.scope, owned) ||
        fixed.generation > draft.generation || fixed.generation === draft.generation && fixed.sourceSnapshotText !== draft.snapshotText)) throw new Error('Invalid adoption lineage');
      if (v.directRequestHash !== undefined && (!fixed || !native2Digest(v.directRequestHash)) || v.phase === 'adoption-fixed-confirmed' && !native2Digest(v.directRequestHash)) throw new Error('Invalid adoption receipt');
      return freezeNative2Value({ version: 1, kind: 'experimental-native2-adopt', scope: owned, base,
        latestSourceDraft: { generation: draft.generation, snapshotText: draft.snapshotText }, phase: v.phase as Native2AdoptRecovery['phase'],
        ...(fixed ? { fixed } : {}), ...(v.directRequestHash !== undefined ? { directRequestHash: v.directRequestHash } : {}) });
    } catch { current(); throw new Error('corrupt_native2_adopt_record'); }
  };
  const captured = async () => {
    current(); const raw = storage().getItem(key); current(); const record = raw === null ? undefined : await decode(raw); current();
    if (storage().getItem(key) !== raw) throw new Error('native2_adopt_changed_during_read'); return { raw, record };
  };
  const write = async (record: Native2AdoptRecovery, previous: string | null, origin: () => boolean = () => true) => {
    const check = () => { current(); if (!origin()) throw new Error('native2_adopt_origin_retired'); };
    check(); const raw = JSON.stringify(record), result = await decode(raw); check();
    const one = storage(); if (one.getItem(key) !== previous) throw new Error('native2_adopt_changed_before_write');
    check(); one.setItem(key, raw); check();
    if (one.getItem(key) !== raw) throw new Error('native2_adopt_write_not_verified'); check(); return result;
  };
  const read = async () => (await captured()).record;
  const writeDraft = async (baseValue: Native2PreserveBase, draft: Native2AdoptDraft) => {
    current(); const old = await captured(), base = await validateNative2Base(baseValue, scope, isWritableCurrent); current();
    if (base.document.documentId !== documentId || !positive(draft.generation) || typeof draft.snapshotText !== 'string') throw new Error('invalid_native2_adopt_draft');
    validateNative2Draft(base, draft.snapshotText, scope);
    if (old.record && !native2Equal(old.record.base, base)) throw new Error('native2_adopt_base_cannot_advance');
    if (old.record && (draft.generation < old.record.latestSourceDraft.generation || draft.generation === old.record.latestSourceDraft.generation && draft.snapshotText !== old.record.latestSourceDraft.snapshotText)) throw new Error('native2_adopt_source_generation_conflict');
    return write({ ...(old.record ?? { version: 1, kind: 'experimental-native2-adopt', scope: owned, phase: 'draft' }), base,
      latestSourceDraft: { generation: draft.generation, snapshotText: draft.snapshotText } }, old.raw);
  };
  const fix = async (value: Native2AdoptAttempt) => {
    current(); const old = await captured(), fixed = await recoverNative2AdoptAttempt(value, scope, isWritableCurrent); current();
    if (!old.record || !native2Equal(fixed.base, old.record.base) || !native2Equal(fixed.scope, owned) ||
      fixed.generation !== old.record.latestSourceDraft.generation || fixed.sourceSnapshotText !== old.record.latestSourceDraft.snapshotText) throw new Error('native2_adopt_source_not_protected');
    if (old.record.fixed && !native2Equal(old.record.fixed, fixed)) throw new Error('fixed_native2_adoption_cannot_be_replaced');
    return write({ ...old.record, fixed, phase: old.record.fixed ? old.record.phase : 'pending' }, old.raw);
  };
  const transition = async (attempt: Native2AdoptAttempt, change: (record: Native2AdoptRecovery) => Native2AdoptRecovery, origin?: () => boolean) => {
    current(); const old = await captured();
    if (!old.record?.fixed || !native2Equal(old.record.fixed, attempt)) throw new Error('native2_adopt_fixed_conflict');
    return write(change(old.record), old.raw, origin);
  };
  const markUnknown = (attempt: Native2AdoptAttempt) => transition(attempt, record => {
    if (record.phase === 'adoption-fixed-confirmed') throw new Error('native2_adopt_confirmation_cannot_regress'); return { ...record, phase: 'unknown' };
  });
  const observeDirect = (attempt: Native2AdoptAttempt, receipt: Native2AdoptReceipt) => transition(attempt, record => {
    if (!isNative2AdoptDirect(receipt, attempt) || record.directRequestHash !== undefined && record.directRequestHash !== receipt.requestHash) throw new Error('native2_adopt_receipt_not_correlated');
    return { ...record, directRequestHash: receipt.requestHash };
  }, () => isNative2AdoptDirect(receipt, attempt));
  const confirmFixed = (proof: Native2AdoptConfirmation) => {
    current(); if (!isNative2AdoptConfirmation(proof)) throw new Error('native2_adopt_confirmation_not_verified');
    return transition(proof.attempt, record => {
      if (record.directRequestHash !== proof.receipt.requestHash) throw new Error('native2_adopt_receipt_not_durable');
      return { ...record, phase: 'adoption-fixed-confirmed' };
    }, () => isNative2AdoptConfirmation(proof));
  };
  return Object.freeze({ key, read, writeDraft, fix, markUnknown, observeDirect, confirmFixed });
}
