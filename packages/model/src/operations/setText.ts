import { defineOperationDSL } from './define-operation-dsl';
import { defineOperation } from './define-operation';
import type { TransactionContext } from '../types';

/**
 * setText operation (DSL + runtime)
 *
 * 목적
 * - 단일 텍스트 노드의 전체 텍스트 값을 새로운 값으로 설정한다.
 * - DataStore 업데이트만 수행하며, Selection은 변경하지 않는다.
 *
 * 입력 형태(DSL)
 * - control 체인: control(nodeId, [ setText(text) ]) → payload: { text }
 * - 직접 호출: setText(nodeId, text) → payload: { nodeId, text }
 *   - 빌더는 control(target, …)에서 target을 nodeId로 주입한다.
 *
 * payload 필드 (DSL)
 * - text: string
 * - nodeId?: string (직접 호출 시 포함)
 *
 * DataStore 연동
 * - DataStore.updateNode(nodeId, { text }) 호출
 * - 반환값: 업데이트된 노드(또는 truthy 값)
 *
 * Selection 매핑
 * - setText는 텍스트 전체 교체이며 범위 이동이 필요하지 않다.
 *   Selection은 유지(preserve)한다.
 */

export type SetTextOperation = {
  type: 'setText';
  payload: {
    text: string;
    nodeId?: string;
  };
};

/**
 * setText operation DSL
 * 
 * ```ts
 * setText(target, 'Hello World');
 * control(target, [setText('Hello World')]);
 * ```
 * 
 * @description Set text operation DSL
 * @param args - Text or nodeId and text
 * @returns SetTextOperation
 */
export const setText = defineOperationDSL((...args: [string] | [string, string]) => {
    if (args.length === 1) {
      const [text] = args;
      return { type: 'setText', payload: { text } } as SetTextOperation;
    }
    const [nodeId, text] = args;
    return { type: 'setText', payload: { nodeId, text } } as SetTextOperation;
  },
  { atom: true, category: 'text' }
);

// Runtime operation implementation
defineOperation('setText', async (operation: any, context: TransactionContext) => {
  const { nodeId, text } = operation.payload;
  if (!text) throw new Error('Text is required for setText operation');
  const node = context.dataStore.getNode(nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);
  
  const result = context.dataStore.updateNode(nodeId, { text });
  if (!result || result.valid !== true) {
    const message = result?.errors?.[0] || 'Update failed';
    throw new Error(message);
  }
  
  return {
    ok: true,
    data: context.dataStore.getNode(nodeId),
    inverse: { type: 'setText', payload: { nodeId, text: node.text } }
  };
});


