import { defineOperation } from './define-operation';
import { defineOperationDSL } from './define-operation-dsl';
import type { TransactionContext } from '../types';

/**
 * replacePattern operation (DSL + runtime)
 *
 * 목적
 * - 지정 범위의 텍스트에서 패턴(문자열/정규식)을 replacement로 치환한다.
 * - DataStore.range.replace 사용.
 *
 * 입력 형태(DSL)
 * - control(nodeId, [ replacePattern(start, end, pattern, replacement) ])
 *   → payload: { start, end, pattern, replacement }
 * - control(nodeId, [ replacePattern(startId, startOffset, endId, endOffset, pattern, replacement) ])
 *   → payload: { range: { startNodeId, startOffset, endNodeId, endOffset }, pattern, replacement }
 * - replacePattern(nodeId, start, end, pattern, replacement)
 *   → payload: { nodeId, start, end, pattern, replacement }
 * - replacePattern(startId, startOffset, endId, endOffset, pattern, replacement)
 *   → payload: { range, pattern, replacement }
 */

type ReplacePatternOperationPayload =
  | { type: 'replacePattern'; nodeId: string; start: number; end: number; pattern: string | RegExp; replacement: string }
  | { type: 'replacePattern'; range: { startNodeId: string; startOffset: number; endNodeId: string; endOffset: number }; pattern: string | RegExp; replacement: string };

defineOperation('replacePattern', async (operation: ReplacePatternOperationPayload, context: TransactionContext) => {
  try {
    if ('range' in operation) {
      const { range, pattern, replacement } = operation as any;
      const { startNodeId, endNodeId, startOffset, endOffset } = range;
      const s = context.dataStore.getNode(startNodeId);
      const e = context.dataStore.getNode(endNodeId);
      if (!s) throw new Error(`Node not found: ${startNodeId}`);
      if (!e) throw new Error(`Node not found: ${endNodeId}`);
      if (typeof s.text !== 'string' || typeof e.text !== 'string') throw new Error('Range endpoints must be text nodes');
      if (typeof startOffset !== 'number' || typeof endOffset !== 'number') throw new Error('Invalid range');
      // cross-node fast-path: extract → replace (count) → replaceText
      const extracted: string = context.dataStore.range.extractText(range);
      let count = 0;
      let replaced = extracted;
      if (extracted.length > 0) {
        if (pattern instanceof RegExp) {
          const rx = pattern.flags.includes('g') ? pattern : new RegExp(pattern.source, pattern.flags + 'g');
          replaced = extracted.replace(rx, () => { count += 1; return replacement; });
        } else {
          const rx = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
          replaced = extracted.replace(rx, () => { count += 1; return replacement; });
        }
        if (count > 0) {
          context.dataStore.range.replaceText(range, replaced);
        }
      }
      return count;
    }
    const { nodeId, start, end, pattern, replacement } = operation as any;
    const node = context.dataStore.getNode(nodeId);
    if (!node) throw new Error(`Node not found: ${nodeId}`);
    if (typeof node.text !== 'string') throw new Error(`Node ${nodeId} is not a text node`);
    if (typeof start !== 'number' || typeof end !== 'number' || start > end || start < 0 || end > (node.text as string).length) {
      throw new Error('Invalid range');
    }
    // fast-path single-node: compute count directly to avoid iterator/tree dependency
    const original = (node.text as string).substring(start, end);
    let count = 0;
    if (original.length > 0) {
      if (pattern instanceof RegExp) {
        const rx = pattern.flags.includes('g') ? pattern : new RegExp(pattern.source, pattern.flags + 'g');
        original.replace(rx, () => { count += 1; return replacement; });
      } else {
        const rx = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
        original.replace(rx, () => { count += 1; return replacement; });
      }
      if (count > 0) {
        context.dataStore.range.replaceText({ startNodeId: nodeId, startOffset: start, endNodeId: nodeId, endOffset: end }, original.replace(pattern as any, replacement));
      }
    }
    return count;
  } catch (e) {
    throw new Error(`Failed to replace by pattern: ${e instanceof Error ? e.message : 'Unknown error'}`);
  }
});

export const replacePattern = defineOperationDSL(
  (
    ...args:
      | [number, number, (string | RegExp), string]
      | [string, number, number, (string | RegExp), string]
      | [string, number, string, number, (string | RegExp), string]
  ) => {
    // control single-node
    if (args.length === 4 && typeof args[0] === 'number') {
      const [start, end, pattern, replacement] = args as [number, number, (string | RegExp), string];
      return { type: 'replacePattern', payload: { start, end, pattern, replacement } } as unknown as ReplacePatternOperationPayload;
    }
    // cross-node
    if (args.length === 6 && typeof args[0] === 'string' && typeof args[2] === 'string') {
      const [startId, startOffset, endId, endOffset, pattern, replacement] = args as [string, number, string, number, (string | RegExp), string];
      return { type: 'replacePattern', payload: { range: { startNodeId: startId, startOffset, endNodeId: endId, endOffset }, pattern, replacement } } as unknown as ReplacePatternOperationPayload;
    }
    // direct single-node
    const [nodeId, start, end, pattern, replacement] = args as [string, number, number, (string | RegExp), string];
    return { type: 'replacePattern', payload: { nodeId, start, end, pattern, replacement } } as unknown as ReplacePatternOperationPayload;
  },
  { atom: false, category: 'text' }
);


