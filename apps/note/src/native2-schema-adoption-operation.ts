import { Native2MutationError, verifyNative2UpdateReceipt, type createAuthenticatedNative2Mutation } from '../../office/src/native2-authenticated-mutation';
import type { createAuthenticatedNative2ReceiptRecovery, Native2OriginalUpdate } from '../../office/src/native2-authenticated-receipt-recovery';
import { createExperimentalNative2ReadStage, captureNative2StageSource, type Native2StageSource,
  type Native2ReadonlyStage, type Native2StageReadFactory } from './experimental-native2-authenticated-stage';
import { createNative2SchemaAdoptionController } from './native2-schema-adoption-controller';
import type { createExperimentalNative2AdoptJournal, Native2OfficeAdoptFixed } from './experimental-native2-adopt-pending';
import { native2Equal } from './experimental-native2-preserve';

type Factory = ReturnType<typeof createAuthenticatedNative2Mutation>;
type Context = Awaited<ReturnType<Factory['open']>>;
type Journal = ReturnType<typeof createExperimentalNative2AdoptJournal>['office'];
type Recovery = ReturnType<typeof createAuthenticatedNative2ReceiptRecovery>;

/** Private host consumer. A returned readonly A2 is current read evidence, never a writer grant. */
export function createNative2SchemaAdoptionOperation({ source, stage, journal, createMutationLease,
  createReadLease, createReceiptRecoveryLease }: {
  source: Native2StageSource; stage: Native2ReadonlyStage; journal: Journal;
  createMutationLease: () => Promise<Factory>; createReadLease: () => Promise<Native2StageReadFactory>;
  createReceiptRecoveryLease: () => Promise<Recovery>;
}) {
  const sourceCurrent = captureNative2StageSource(source);
  const identity = Object.freeze({ ...source.scope });
  const scope = Object.freeze({ tenantId: identity.tenantId, workspaceId: identity.workspaceId, documentId: identity.documentId });
  const controller = createNative2SchemaAdoptionController({ source, stage, createMutationLease });
  const owned = new Set<() => void>();
  let disposed = false, busy = false, chosen: ReturnType<typeof controller.preview> | undefined;
  let candidate: { snapshotText: string; datasetPath: readonly number[]; idempotencyKey: string } | undefined;
  let fixed: Native2OfficeAdoptFixed | undefined, stopSource: (() => void) | undefined;
  const dispose = () => {
    if (disposed) return;
    disposed = true; controller.dispose();
    const stops = [...owned]; owned.clear(); stops.forEach(stop => stop());
    const stop = stopSource; stopSource = undefined; stop?.();
  };
  const isCurrent = () => {
    try { return !disposed && native2Equal(source.scope, identity) && sourceCurrent() && stage.isCurrent(); } catch { return false; }
  };
  const check = () => { if (!isCurrent()) { dispose(); throw Error('native2_adoption_operation_retired'); } };
  stopSource = source.subscribeAuthority(dispose);
  if (disposed) { stopSource(); stopSource = undefined; }
  const attach = (lease: Pick<Factory, 'retire' | 'subscribeRetirement'>) => {
    const release = () => { owned.delete(release); stop(); lease.retire(); };
    const stop = lease.subscribeRetirement(dispose);
    if (disposed) { stop(); lease.retire(); } else owned.add(release);
    return release;
  };
  const preview = (input: { snapshotText: string; datasetPath: readonly number[]; idempotencyKey: string }) => {
    check(); if (busy || fixed) throw Error('native2_adoption_operation_fixed');
    const value = controller.preview(input);
    candidate = Object.freeze({ ...input, datasetPath: Object.freeze([...input.datasetPath]) }); chosen = value;
    return value;
  };
  const recordCandidate = async (snapshotText: string) => {
    check(); const previous = await journal.read(); check();
    const generation = (previous?.latestCandidate.generation ?? 0) + 1;
    if (!Number.isSafeInteger(generation)) throw Error('native2_adoption_generation_exhausted');
    const record = await journal.writeCandidate({ document: stage.read.document, snapshotText: stage.read.snapshotText }, { snapshotText, generation }, isCurrent); check();
    return record;
  };
  const reread = async (receipt: ReturnType<typeof verifyNative2UpdateReceipt>) => {
    check(); const factory = await createReadLease();
    if (!isCurrent()) { factory.retire(); check(); }
    const release = attach(factory); check();
    const reader = createExperimentalNative2ReadStage({ source, readFresh: () => factory.open(scope), onRetire: dispose });
    owned.add(reader.dispose);
    try {
      const result = await reader.stage(); check();
      if (!native2Equal(result.read.document, receipt.document) || result.read.snapshotText !== receipt.snapshotText)
        throw Error('native2_adoption_receipt_head_changed');
      return Object.freeze({ status: 'receipt-current-read' as const, stage: result,
        isCurrent: () => isCurrent() && result.isCurrent(), dispose: () => { reader.dispose(); release(); } });
    } catch (error) { reader.dispose(); release(); throw error; }
  };
  // Explicit human action. Advisory validation does not carry an attempt across this boundary.
  const confirm = async () => {
    check(); if (busy || fixed || !candidate || !chosen?.isCurrent()) throw Error('native2_adoption_confirmation_unavailable');
    busy = true;
    const input = candidate;
    let context: Context | undefined, releaseFactory: (() => void) | undefined, releaseContext: (() => void) | undefined;
    let sent = false;
    try {
      const before = await journal.read(); check();
      if (before?.fixed) throw Error('native2_adoption_operation_fixed');
      const generation = (before?.latestCandidate.generation ?? 0) + 1;
      if (!Number.isSafeInteger(generation)) throw Error('native2_adoption_generation_exhausted');
      const factory = await createMutationLease();
      if (!isCurrent()) { factory.retire(); check(); }
      releaseFactory = attach(factory); check();
      context = await factory.open(scope);
      if (!isCurrent()) { context.retire(); check(); }
      releaseContext = attach(context); check();
      if (!native2Equal(context.source.document, stage.read.document) || context.source.snapshotText !== stage.read.snapshotText ||
        !native2Equal(context.source.file, stage.read.file)) throw Error('native2_adoption_source_changed');
      const attempt = await context.prepare({ snapshotText: input.snapshotText, schemaAction: 'adopt', idempotencyKey: input.idempotencyKey });
      const current = () => { check(); if (!factory.isCurrent() || !context?.isCurrent() || !chosen?.isCurrent()) throw Error('native2_adoption_operation_retired'); };
      current(); await context.validateSource(); current(); await context.validate(attempt); current();
      const old = await journal.read(); current();
      if (old?.fixed) throw Error('native2_adoption_operation_fixed');
      if (!native2Equal(old?.latestCandidate, before?.latestCandidate)) throw Error('native2_adoption_candidate_changed');
      const record = await journal.writeCandidate({ document: stage.read.document, snapshotText: stage.read.snapshotText },
        { snapshotText: input.snapshotText, generation }, isCurrent); current();
      const original: Native2OriginalUpdate = { tenantId: source.scope.tenantId, workspaceId: source.scope.workspaceId,
        documentId: source.scope.documentId, expectedRevision: attempt.expectedRevision, expectedSnapshotHash: attempt.expectedSnapshotHash,
        expectedPriorPinDigest: attempt.expectedPriorPinDigest, snapshotText: attempt.snapshotText,
        schemaAction: 'adopt', idempotencyKey: attempt.idempotencyKey };
      const durable = await journal.fix(original, input.datasetPath, record.latestCandidate.generation, isCurrent); current();
      if (!durable.fixed || durable.fixed.requestHash !== attempt.requestHash || durable.fixed.candidateSnapshotHash !== attempt.candidateSnapshotHash)
        throw Error('native2_adoption_fixed_hash_changed');
      fixed = durable.fixed;
      // No network PUT may precede the durable full original operation and its checked hashes.
      sent = true;
      const value = await context.update(attempt); current();
      const receipt = verifyNative2UpdateReceipt({ operation: value.operation, idempotencyKey: value.idempotencyKey,
        requestHash: value.requestHash, document: value.document, snapshotText: value.snapshotText },
      { ...original, pageId: stage.read.document.pageId, requestHash: fixed.requestHash, candidateSnapshotHash: fixed.candidateSnapshotHash });
      return await reread(receipt);
    } catch (error) {
      if (sent && fixed) {
        // A retired host may refuse even this data transition. The durable pending bytes still survive.
        try { await journal.markUnknown(fixed); } catch { /* Preserve original failure and fixed pending record. */ }
      }
      throw error;
    } finally { busy = false; releaseContext?.(); releaseFactory?.(); }
  };
  const recoverHistorical = async () => {
    check(); if (busy) throw Error('native2_adoption_operation_busy'); busy = true;
    let release: (() => void) | undefined;
    try {
      const record = await journal.read(); check();
      if (!record?.fixed) throw Error('native2_adoption_no_fixed_operation');
      const original = record.fixed;
      const factory = await createReceiptRecoveryLease();
      if (!isCurrent()) { factory.retire(); check(); }
      release = attach(factory); check();
      const acknowledgment = await factory.recover(original.original); check();
      const releaseAcknowledgment = attach(acknowledgment);
      try { await journal.observeHistorical(original, acknowledgment); check(); }
      finally { releaseAcknowledgment(); }
      fixed = original;
      return Object.freeze({ status: 'historical-acknowledgment' as const, original });
    } finally { busy = false; release?.(); }
  };
  // A separate human action requalifies the original request; later drafts are never substituted.
  const retryFixed = async () => {
    check(); if (busy) throw Error('native2_adoption_operation_busy'); busy = true;
    let original: Native2OfficeAdoptFixed | undefined, sent = false;
    let releaseRecovery: (() => void) | undefined, releaseFactory: (() => void) | undefined, releaseContext: (() => void) | undefined;
    try {
      const record = await journal.read(); check();
      if (!record?.fixed) throw Error('native2_adoption_no_fixed_operation');
      if (record.phase === 'historical-acknowledgment') throw Error('native2_adoption_receipt_already_exists');
      original = record.fixed;
      const recovery = await createReceiptRecoveryLease();
      if (!isCurrent()) { recovery.retire(); check(); }
      releaseRecovery = attach(recovery); check();
      try {
        const acknowledgment = await recovery.recover(original.original);
        acknowledgment.retire(); check();
        throw Error('native2_adoption_receipt_already_exists');
      } catch (error) {
        check();
        if (!recovery.isCurrent() || !(error instanceof Native2MutationError) || error.code !== 'not_found' || error.status !== 404) throw error;
      }
      releaseRecovery(); releaseRecovery = undefined;
      const factory = await createMutationLease();
      if (!isCurrent()) { factory.retire(); check(); }
      releaseFactory = attach(factory); check();
      const context = await factory.open(scope);
      if (!isCurrent()) { context.retire(); check(); }
      releaseContext = attach(context);
      const current = () => { check(); if (!factory.isCurrent() || !context.isCurrent()) throw Error('native2_adoption_operation_retired'); };
      current();
      if (!native2Equal(context.source.document, stage.read.document) || context.source.snapshotText !== stage.read.snapshotText ||
        !native2Equal(context.source.file, stage.read.file) || !native2Equal(record.base,
          { document: stage.read.document, snapshotText: stage.read.snapshotText })) throw Error('native2_adoption_source_changed');
      const old = original.original;
      const attempt = await context.prepare({ snapshotText: old.snapshotText, schemaAction: old.schemaAction, idempotencyKey: old.idempotencyKey });
      current();
      const qualified: Native2OriginalUpdate = { ...scope, expectedRevision: attempt.expectedRevision,
        expectedSnapshotHash: attempt.expectedSnapshotHash, expectedPriorPinDigest: attempt.expectedPriorPinDigest,
        snapshotText: attempt.snapshotText, schemaAction: attempt.schemaAction, idempotencyKey: attempt.idempotencyKey };
      if (!native2Equal(qualified, old) || attempt.requestHash !== original.requestHash ||
        attempt.candidateSnapshotHash !== original.candidateSnapshotHash) throw Error('native2_adoption_fixed_hash_changed');
      await context.validateSource(); current(); await context.validate(attempt); current();
      const durable = await journal.read(); current();
      if (!native2Equal(durable?.fixed, original) || durable?.phase === 'historical-acknowledgment')
        throw Error('native2_adoption_fixed_changed');
      // The original durable request and the live private attempt are exact. No draft/fixed write occurs here.
      fixed = original; sent = true;
      const value = await context.update(attempt); current();
      const receipt = verifyNative2UpdateReceipt({ operation: value.operation, idempotencyKey: value.idempotencyKey,
        requestHash: value.requestHash, document: value.document, snapshotText: value.snapshotText },
      { ...old, pageId: stage.read.document.pageId, requestHash: original.requestHash, candidateSnapshotHash: original.candidateSnapshotHash });
      return await reread(receipt);
    } catch (error) {
      if (sent && original) { try { await journal.markUnknown(original); } catch { /* Retain durable pending/unknown bytes and original error. */ } }
      throw error;
    } finally { busy = false; releaseContext?.(); releaseFactory?.(); releaseRecovery?.(); }
  };
  return Object.freeze({ preview, confirm, recordCandidate, recoverHistorical, retryFixed, isCurrent, dispose });
}
