import { defineOperation } from './define-operation';
import type { TransactionContext } from '../types';
import { defineOperationDSL } from './define-operation-dsl';


type AutoMergeTextNodesOperation =
  | { type: 'autoMergeTextNodes'; nodeId: string }
  | { type: 'autoMergeTextNodes' };

export const autoMergeTextNodes = defineOperationDSL(
  (...args: [] | [string]) => {
    if (args.length === 0) {
      return { type: 'autoMergeTextNodes', payload: {} } as unknown as AutoMergeTextNodesOperation;
    }
    const [nodeId] = args as [string];
    return { type: 'autoMergeTextNodes', payload: { nodeId } } as unknown as AutoMergeTextNodesOperation;
  },
  { atom: false, category: 'text' }
);

/**
 * autoMergeTextNodes operation (runtime)
 *
 * 목적
 * - 지정 텍스트 노드를 기준으로 인접 텍스트 노드들과 연속 병합한다.
 *
 * 입력 형태(DSL)
 * - autoMergeTextNodes(nodeId)
 * - control(nodeId, [ autoMergeTextNodes() ]) → payload: {}
 */

defineOperation('autoMergeTextNodes', async (operation: any, context: TransactionContext) => {
  const { nodeId } = operation.payload;
  const node = context.dataStore.getNode(nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);
  /**
   * The runs about to be swallowed, in order, before any of them are.
   *
   * This was the last operation here with no way back, on the grounds that
   * undoing it would mean knowing where each join had been — which is exactly
   * what this records. A split can be given the id its new half is to carry, so
   * the pieces go back with the identities they had and an inverse collected
   * earlier that names one of them still finds it.
   */
  const parentId = (node as any).parentId
    ? context.dataStore.resolveAlias((node as any).parentId)
    : undefined;
  const parent = parentId ? context.dataStore.getNode(parentId) : undefined;
  const siblings = Array.isArray((parent as any)?.content) ? ((parent as any).content as string[]) : [];
  const at = siblings.indexOf(nodeId);

  const attributesOf = (one: any) =>
    JSON.stringify(one?.attributes ?? {}, Object.keys(one?.attributes ?? {}).sort());
  const joinable = (one: any) =>
    one && typeof one.text === 'string' && one.stype === (node as any).stype &&
    attributesOf(one) === attributesOf(node);

  const pieces: { sid: string; length: number }[] = [];
  if (at >= 0) {
    let first = at;
    while (first > 0 && joinable(context.dataStore.getNode(siblings[first - 1]))) first -= 1;
    let last = at;
    while (last + 1 < siblings.length && joinable(context.dataStore.getNode(siblings[last + 1]))) last += 1;
    for (let index = first; index <= last; index += 1) {
      const one = context.dataStore.getNode(siblings[index]) as any;
      pieces.push({ sid: siblings[index], length: (one?.text ?? '').length });
    }
  }

  const mergedId = context.dataStore.splitMerge.autoMergeTextNodes(nodeId);
  return {
    ok: true,
    data: mergedId,
    // Nothing was joined, so there is nothing to take apart.
    ...(pieces.length > 1
      ? { inverse: { type: 'restoreTextNodes', payload: { nodeId: mergedId, pieces } } }
      : {})
  };
});



