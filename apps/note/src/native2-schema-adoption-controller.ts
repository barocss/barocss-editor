import type { createAuthenticatedNative2Mutation, Native2MutationAttempt, Native2Validation } from '../../office/src/native2-authenticated-mutation';
import { captureNative2StageSource, type Native2StageSource, type Native2ReadonlyStage } from './experimental-native2-authenticated-stage';
import { createNative2SchemaAdoptionPreview } from './native2-schema-adoption-preview';
import { native2Equal } from './experimental-native2-preserve';

type Factory = ReturnType<typeof createAuthenticatedNative2Mutation>;
type Context = Awaited<ReturnType<Factory['open']>>;
export interface Native2AdoptionAdvisory {
  readonly status: 'structurally_valid'; readonly advisory: true;
  readonly sourceValidation: Native2Validation; readonly candidateValidation: Native2Validation;
  readonly isCurrent: () => boolean;
}
export interface Native2AdoptionProposal {
  readonly view: ReturnType<typeof createNative2SchemaAdoptionPreview>;
  readonly isCurrent: () => boolean; readonly dispose: () => void;
  readonly validate: () => Promise<Native2AdoptionAdvisory>;
}
const retired = (): never => { throw new Error('native2_adoption_preview_retired'); };

/** Independent readonly/advisory consumer. No update, confirmation, save, recovery or writer grant. */
export function createNative2SchemaAdoptionController({ source, stage, createMutationLease }: {
  source: Native2StageSource; stage: Native2ReadonlyStage; createMutationLease: () => Promise<Factory>;
}) {
  const sourceCurrent = captureNative2StageSource(source);
  let disposed = false, generation = 0, active: Native2AdoptionProposal | undefined;
  let stopSource: (() => void) | undefined;
  const dispose = () => {
    if (disposed) return;
    disposed = true; generation++;
    const previous = active; active = undefined; previous?.dispose();
    const stop = stopSource; stopSource = undefined; stop?.();
  };
  const current = () => {
    try { return !disposed && sourceCurrent() && stage.isCurrent(); } catch { return false; }
  };
  stopSource = source.subscribeAuthority(dispose);
  if (disposed) { stopSource(); stopSource = undefined; }
  const preview = (input: { snapshotText: string; datasetPath: readonly number[]; idempotencyKey: string }): Native2AdoptionProposal => {
    if (!current()) return retired();
    if (stage.read.document.documentId !== source.scope.documentId || stage.read.document.tenantId !== source.scope.tenantId ||
      stage.read.document.workspaceId !== source.scope.workspaceId) throw new Error('native2_adoption_source_changed');
    const { snapshotText, idempotencyKey } = input, path = [...input.datasetPath];
    if (typeof idempotencyKey !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(idempotencyKey)) throw new Error('invalid_native2_adoption_key');
    active?.dispose();
    const own = ++generation;
    const view = createNative2SchemaAdoptionPreview(stage.read.snapshotText, snapshotText, path);
    let closed = false, ticket = 0;
    let factory: Factory | undefined, context: Context | undefined;
    const stops = new Set<() => void>();
    const release = () => {
      const subscriptions = [...stops]; stops.clear(); subscriptions.forEach(stop => stop());
      const one = context, parent = factory; context = undefined; factory = undefined;
      one?.retire(); parent?.retire();
    };
    const close = () => {
      if (closed) return;
      closed = true; ticket++; release(); view.dispose();
    };
    const isCurrent = () => {
      if (closed) return false;
      if (!current() || generation !== own || view.session.editor.isEditable) { close(); return false; }
      return true;
    };
    const subscribe = (lifetime: Pick<Factory, 'subscribeRetirement'>) => {
      const stop = lifetime.subscribeRetirement(close);
      if (closed) stop(); else stops.add(stop);
    };
    const validate = async (): Promise<Native2AdoptionAdvisory> => {
      if (!isCurrent()) return retired();
      const attemptTicket = ++ticket;
      release();
      const check = () => {
        if (!isCurrent() || ticket !== attemptTicket || factory && !factory.isCurrent() || context && !context.isCurrent()) return retired();
      };
      try {
        const obtained = await createMutationLease();
        if (!isCurrent() || ticket !== attemptTicket) { obtained.retire(); return retired(); }
        factory = obtained; subscribe(factory); check();
        const opened = await factory.open({ tenantId: source.scope.tenantId, workspaceId: source.scope.workspaceId, documentId: source.scope.documentId });
        if (!isCurrent() || ticket !== attemptTicket) { opened.retire(); return retired(); }
        context = opened; subscribe(context); check();
        if (context.source.snapshotText !== stage.read.snapshotText || !native2Equal(context.source.document, stage.read.document) ||
          !native2Equal(context.source.file, stage.read.file)) throw new Error('native2_adoption_source_changed');
        const attempt: Native2MutationAttempt = await context.prepare({ snapshotText, schemaAction: 'adopt', idempotencyKey });
        check();
        const sourceValidation = await context.validateSource(); check();
        const candidateValidation = await context.validate(attempt); check();
        // Actual private methods qualify structure/current source. This remains advisory data, never a later write grant.
        return Object.freeze({ status: 'structurally_valid', advisory: true, sourceValidation, candidateValidation,
          isCurrent: () => { try { check(); return true; } catch { return false; } } });
      } catch (error) {
        if (!isCurrent() || ticket !== attemptTicket) return retired();
        close(); throw error;
      }
    };
    const proposal: Native2AdoptionProposal = Object.freeze({ view, isCurrent, dispose: close, validate });
    active = proposal;
    return proposal;
  };
  return Object.freeze({ preview, dispose });
}
