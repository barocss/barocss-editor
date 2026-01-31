import type { TransactionContext } from '../types';
import type { INode } from '@barocss/datastore';

/** Result shape when operation returns { ok, data?, inverse?, selectionAfter? }. */
export type OperationResult = void | INode | { ok?: boolean; data?: unknown; inverse?: unknown; selectionAfter?: { nodeId: string; offset: number } };

// Operation definition interface
export interface OperationDefinition {
  name: string;
  execute: <T extends any>(operation: T, context: TransactionContext) => Promise<OperationResult>;
  mapSelection?: <T extends any>(operation: T, context: TransactionContext) => any;
}

// Global Operation Registry
class GlobalOperationRegistry {
  private operations = new Map<string, OperationDefinition>();

  register(name: string, definition: OperationDefinition): void {
    this.operations.set(name, definition);
  }

  get(name: string): OperationDefinition | undefined {
    return this.operations.get(name);
  }

  getAll(): Map<string, OperationDefinition> {
    return new Map(this.operations);
  }

  clear(): void {
    this.operations.clear();
  }
}

export const globalOperationRegistry = new GlobalOperationRegistry();

// Operation definition function
export function defineOperation<T extends any>(
  name: string, 
  executor: (operation: T, context: TransactionContext) => Promise<OperationResult>,
  selectionMapper?: (operation: T, context: TransactionContext) => any
): void {
  globalOperationRegistry.register(name, { 
    name, 
    execute: executor as any,
    mapSelection: selectionMapper as any
  });
}
