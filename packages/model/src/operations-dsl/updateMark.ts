import { defineOperationDSL } from '../operations/define-operation-dsl';

/**
 * updateMark operation DSL
 *
 * - control(nodeId, [ updateMark(markType, range, newAttrs) ]) → payload: { markType, range, newAttrs }
 * - updateMark(nodeId, markType, range, newAttrs) → payload: { nodeId, markType, range, newAttrs }
 */
export type UpdateMarkOperationPayload =
  | { markType: string; range: [number, number]; newAttrs: Record<string, unknown> }
  | { nodeId: string; markType: string; range: [number, number]; newAttrs: Record<string, unknown> };

export const updateMark = defineOperationDSL(
  (
    ...args:
      | [string, [number, number], Record<string, unknown>]
      | [string, string, [number, number], Record<string, unknown>]
  ) => {
    if (args.length === 3) {
      const [markType, range, newAttrs] = args as [string, [number, number], Record<string, unknown>];
      return { type: 'updateMark', payload: { markType, range, newAttrs } } as { type: 'updateMark'; payload: UpdateMarkOperationPayload };
    }
    const [nodeId, markType, range, newAttrs] = args as [string, string, [number, number], Record<string, unknown>];
    return { type: 'updateMark', payload: { nodeId, markType, range, newAttrs } } as { type: 'updateMark'; payload: UpdateMarkOperationPayload };
  }
);
