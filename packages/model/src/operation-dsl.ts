import type { ValidationResult, INode } from '@barocss/datastore';
import type { Schema } from '@barocss/schema';

type ValidateFn<P> = (payload: P, ctx: ModelContext) => ValidationResult;
type TranslateFn<P> = (payload: P, ctx: ModelContext) => any[];

export interface DSLLibraryEntry<P = any> {
  validate: ValidateFn<P>;
  translate: TranslateFn<P>;
}

export interface ModelContext {
  getNode(nodeId: string): INode | undefined;
  schema?: Schema;
  createNode: (
    stype: string,
    attrs: Record<string, any> | undefined,
    content: any[] | undefined,
    base: { sid: string; parentId?: string; text?: string }
  ) => INode;
  newId: (prefix?: string) => string;
  // Selection/Position APIs (Absolute-only canonical)
  selectAbsoluteRange?: (anchor: number, head: number) => void;
  resolveAbsolute?: (abs: number) => { nodeId: string; offset: number } | null;
  // Internal hook for selection remap after commit (structural typing to avoid import cycle)
  __remapSelection?: (mapping: { mapPos: (pos: number) => number; mapRange: (s: number, e: number) => [number, number] }) => void;
}

const registry = new Map<string, DSLLibraryEntry<any>>();

export function defineOperation<P = any>(type: string, impl: DSLLibraryEntry<P>): void {
  registry.set(type, impl);
}

export function applyOperation<P = any>(type: string, payload: P, ctx: ModelContext) {
  const entry = registry.get(type);
  if (!entry) throw new Error(`Operation DSL not found: ${type}`);
  // REMOVED: Legacy fallback code - ModelContext should always provide required methods
  const v = entry.validate(payload, ctx);
  if (!v.valid) throw new Error(`Operation '${type}' validation failed: ${v.errors.join(', ')}`);
  const ops = entry.translate(payload, ctx);
  return { valid: true, errors: [], ops } as ValidationResult & { ops: any[] };
}

