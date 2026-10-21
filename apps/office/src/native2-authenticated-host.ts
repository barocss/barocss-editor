import type { NativeEntryBinding } from './auth-app';
import type { Native2ReadScope } from './native2-authenticated-reader';
import type { createAuthenticatedNative2Mutation } from './native2-authenticated-mutation';
import type { createAuthenticatedNative2ReceiptRecovery } from './native2-authenticated-receipt-recovery';

type Mutation = ReturnType<typeof createAuthenticatedNative2Mutation>;
type Recovery = ReturnType<typeof createAuthenticatedNative2ReceiptRecovery>;
type Lifetime = Pick<Mutation, 'isCurrent' | 'retire' | 'subscribeRetirement'>;
export class Native2HostError extends Error {
  constructor(readonly code: 'host_retired' | 'scope_forbidden') { super(code); }
}
function unavailable(): never { throw new Native2HostError('host_retired'); }
function forbidden(): never { throw new Native2HostError('scope_forbidden'); }

/** Internal producer loading only. No caller fetcher, principal, role or grant. */
async function bindHost<F extends Lifetime>(binding: NativeEntryBinding | undefined, load: () => Promise<() => F>) {
  const isAuthorized = binding?.isAuthorized, subscribeAuthority = binding?.subscribeAuthority;
  if (!isAuthorized || !subscribeAuthority || !isAuthorized()) return unavailable();
  const create = await load();
  if (!isAuthorized()) return unavailable();
  const factory = create();
  let retired = false;
  let stopHost: (() => void) | undefined, stopProducer: (() => void) | undefined;
  const retire = () => {
    const host = stopHost, producer = stopProducer;
    stopHost = undefined; stopProducer = undefined;
    if (!retired) { retired = true; factory.retire(); }
    host?.(); producer?.();
  };
  const isCurrent = () => {
    if (retired) return false;
    if (!isAuthorized() || !factory.isCurrent()) { retire(); return false; }
    return true;
  };
  try {
    stopProducer = factory.subscribeRetirement(retire);
    if (!retired) stopHost = subscribeAuthority(retire);
  } catch (error) { retire(); throw error; }
  if (retired) retire(); // A synchronous terminal subscription can return cleanup after notification.
  if (!isCurrent()) { retire(); return unavailable(); }
  return { factory, isCurrent, retire, subscribeRetirement: factory.subscribeRetirement };
}
function scopeCopy(scope: Native2ReadScope, tenantId: string, workspaceId: string): Native2ReadScope {
  if (!scope || typeof scope !== 'object' || Array.isArray(scope)) return forbidden();
  const copy = { ...scope };
  if (Object.keys(copy).length !== 3 || copy.tenantId !== tenantId || copy.workspaceId !== workspaceId ||
    typeof copy.documentId !== 'string') return forbidden();
  return Object.freeze(copy);
}

/** Capture an Office Note host. Creation itself performs no read, validation or write. */
export function noteMutationLeaseFactory(tenantId: string, workspaceId: string, binding?: NativeEntryBinding): () => Promise<Mutation> {
  return async () => {
    const host = await bindHost(binding, async () => (await import('./native2-authenticated-mutation')).createAuthenticatedNative2Mutation);
    return Object.freeze({ isCurrent: host.isCurrent, retire: host.retire, subscribeRetirement: host.subscribeRetirement,
      open: async (scope: Native2ReadScope) => {
        if (!host.isCurrent()) return unavailable();
        const fixed = scopeCopy(scope, tenantId, workspaceId);
        let context: Awaited<ReturnType<Mutation['open']>>;
        try { context = await host.factory.open(fixed); }
        catch (error) { if (!host.isCurrent()) return unavailable(); throw error; }
        if (!host.isCurrent()) { context.retire(); return unavailable(); }
        const isCurrent = () => {
          if (!host.isCurrent() || !context.isCurrent()) { context.retire(); return false; }
          return true;
        };
        const call = async <T>(operation: () => Promise<T>): Promise<T> => {
          if (!isCurrent()) return unavailable();
          let value: T;
          try { value = await operation(); }
          catch (error) { if (!isCurrent()) return unavailable(); throw error; }
          if (!isCurrent()) return unavailable();
          return value;
        };
        return Object.freeze({ ...context, isCurrent,
          prepare: (input: Parameters<typeof context.prepare>[0]) => call(() => context.prepare(input)),
          validateSource: () => call(context.validateSource),
          validate: (attempt: Parameters<typeof context.validate>[0]) => call(() => context.validate(attempt)),
          update: (attempt: Parameters<typeof context.update>[0]) => call(() => context.update(attempt)),
          recover: (attempt: Parameters<typeof context.recover>[0]) => call(() => context.recover(attempt)),
        });
      },
    });
  };
}

/** The original serialized operation remains data. No writer attempt is restored. */
export function noteReceiptRecoveryLeaseFactory(tenantId: string, workspaceId: string, binding?: NativeEntryBinding): () => Promise<Recovery> {
  return async () => {
    const host = await bindHost(binding, async () => (await import('./native2-authenticated-receipt-recovery')).createAuthenticatedNative2ReceiptRecovery);
    return Object.freeze({ isCurrent: host.isCurrent, retire: host.retire, subscribeRetirement: host.subscribeRetirement,
      recover: async (input: unknown) => {
        if (!host.isCurrent()) return unavailable();
        if (!input || typeof input !== 'object' || Array.isArray(input)) return forbidden();
        // Copy all original fields once; getters/later drafts cannot change the checked host scope.
        const fixed = Object.freeze({ ...input });
        if (!('tenantId' in fixed) || !('workspaceId' in fixed) || fixed.tenantId !== tenantId || fixed.workspaceId !== workspaceId) return forbidden();
        let result: Awaited<ReturnType<Recovery['recover']>>;
        try { result = await host.factory.recover(fixed); }
        catch (error) { if (!host.isCurrent()) return unavailable(); throw error; }
        if (!host.isCurrent()) { result.retire(); return unavailable(); }
        return Object.freeze({ ...result, isCurrent: () => {
          if (!host.isCurrent() || !result.isCurrent()) { result.retire(); return false; }
          return true;
        } });
      },
    });
  };
}
