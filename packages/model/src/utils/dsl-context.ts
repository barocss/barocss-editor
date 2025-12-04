import type { ModelContext } from '../operation-dsl';
import type { DataStore, INode } from '@barocss/datastore';
import type { Schema } from '@barocss/schema';
import { buildINodeFromSchema } from '../utils/schema-node';
import { PositionCalculator } from '../position';
import type { PositionMapping } from '../transaction';
// no-op

export function makeModelContext(store: DataStore, opts?: { schema?: Schema }): ModelContext {
  // Prefer explicitly provided schema; avoid coupling to document attributes
  const schema: Schema | undefined = opts?.schema as Schema | undefined;
  const newId = (prefix: string = 'node') => {
    const s = store as unknown as { generateIdForType?: (p: string) => string; generateId?: () => string };
    if (typeof s.generateIdForType === 'function') {
      return s.generateIdForType(prefix);
    }
    if (typeof s.generateId === 'function') {
      const id: string = s.generateId();
      return prefix ? `${prefix}-${id}` : id;
    }
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  };
  // PositionTracker reserved for future use (lifecycle managed elsewhere)
  // const tracker = new PositionTracker(store as any);
  const calculator = new PositionCalculator(store);
  let currentSelection: { start: { nodeId: string; offset: number }; end: { nodeId: string; offset: number } } | null = null;

  const ctxObj: Partial<ModelContext> & { [k: string]: unknown } = {
    getNode: (nodeId: string): INode | undefined => store.getNode(nodeId),
    schema,
    createNode: (stype: string, attrs?: Record<string, any>, content?: any[], base?: { sid: string; parentId?: string; text?: string }): INode =>
      buildINodeFromSchema(schema, stype, attrs || {}, content || [], base || { sid: newId(stype) }),
    newId,
  };

  const _selectRangeNormalized = (anchor: number, head: number) => {
      const a = calculator.findNodeByAbsolutePosition(anchor);
      const b = calculator.findNodeByAbsolutePosition(head);
      if (!a || !b) throw new Error('absolute position out of bounds');
      // normalize by numeric comparison of incoming absolutes
      const start = anchor <= head ? a : b;
      const end = anchor <= head ? b : a;
      currentSelection = { start: { nodeId: start.nodeId, offset: start.offset }, end: { nodeId: end.nodeId, offset: end.offset } };
  };

  // Selection API (Absolute-only canonical)
  ctxObj.selectAbsoluteRange = (anchor: number, head: number) => _selectRangeNormalized(anchor, head);

  // No operation-generating helpers in context. Consumers should use applyOperation directly.

  ctxObj.resolveAbsolute = (abs: number) => {
      const r = calculator.findNodeByAbsolutePosition(abs);
      if (!r) return null;
      return { nodeId: r.nodeId, offset: r.offset };
    };

  // Internal: allow transaction to remap selection after commit
  (ctxObj as any).__remapSelection = (mapping: PositionMapping) => {
    if (!currentSelection) return;
    const startAbs = calculator.calculateAbsolutePosition(currentSelection.start.nodeId, currentSelection.start.offset);
    const endAbs = calculator.calculateAbsolutePosition(currentSelection.end.nodeId, currentSelection.end.offset);
    const [nextStart, nextEnd] = mapping.mapRange(startAbs, endAbs);
    const s = calculator.findNodeByAbsolutePosition(nextStart);
    const e = calculator.findNodeByAbsolutePosition(nextEnd);
    if (s && e) {
      currentSelection = { start: { nodeId: s.nodeId, offset: s.offset }, end: { nodeId: e.nodeId, offset: e.offset } };
    }
  };

  return ctxObj as ModelContext;
}

// Helper: wire selection mapping with TransactionManager (noop mapping by default)
export function wireSelectionMapping(transactionManager: any, ctx: ModelContext): void {
  // Let TransactionManager provide its default StepMap; only register remapper here
  if (typeof transactionManager.setSelectionRemapper === 'function') {
    transactionManager.setSelectionRemapper((mapping: PositionMapping) => {
      (ctx as any).__remapSelection?.(mapping);
    });
  }
}


