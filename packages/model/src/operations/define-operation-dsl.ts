// Lightweight DSL operation factory used to create control-scoped action creators.
// These creators return a simple { type, payload } object which the control()
// function will later decorate with a target to form a TransactionOperation.

export type DSLOperationPayload = Record<string, unknown> | undefined;

export interface DSLOperationDescriptor<P extends DSLOperationPayload = any> {
  type: string;
  payload?: P;
}

export interface DefineOperationDSLOptions {
  atom?: boolean;
  category?: string;
}

type BuilderFn<Args extends any[], P extends DSLOperationPayload> = (
  ...args: Args
) => DSLOperationDescriptor<P>;

// Optional in-memory registry for introspection/auto-import tooling
const dslRegistry = new Map<string, { options?: DefineOperationDSLOptions }>();

export function defineOperationDSL<Args extends any[], P extends DSLOperationPayload = any>(
  builder: BuilderFn<Args, P>,
  options?: DefineOperationDSLOptions
) {
  return (...args: Args): DSLOperationDescriptor<P> => {
    const desc = builder(...args);
    if (!desc || typeof desc.type !== 'string') {
      throw new Error('defineOperationDSL builder must return { type, payload? }');
    }
    if (!dslRegistry.has(desc.type)) {
      dslRegistry.set(desc.type, { options });
    }
    return desc;
  };
}

export function getDefinedDSLOperations(): ReadonlyMap<string, { options?: DefineOperationDSLOptions }> {
  return dslRegistry;
}


