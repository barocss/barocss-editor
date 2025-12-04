import { defineOperation } from './define-operation';
import type { TransactionContext } from '../types';

/**
 * insertText operation (runtime)
 *
 * 목적
 * - 단일 텍스트 노드 내 임의 위치(pos)에 문자열(text)을 삽입한다.
 * - DataStore 연산과 Selection 이동을 일관되게 처리한다.
 *
 * 입력 형태(DSL)
 * - control 체인: control(nodeId, [ insertText(pos, text) ]) → payload: { pos, text }
 * - 직접 호출: insertText(nodeId, pos, text) → payload: { nodeId, pos, text }
 *   - 빌더는 control(target, …)에서 target을 nodeId로 주입한다.
 *
 * payload 필드
 * - pos: number (테스트 스펙에서 position이 아닌 pos 키를 사용하므로 'pos'로 유지)
 * - text: string (삽입할 문자열)
 * - nodeId?: string (직접 호출 시 포함, control 체인 시 빌더가 주입)
 *
 * DataStore 연동
 * - DataStore.range.insertText(range, text)를 호출한다.
 *   - range: { startNodeId, startOffset, endNodeId, endOffset } (단일 노드 내부 삽입은 start=end=pos)
 *   - 반환값: 삽입된 문자열(테스트는 이 반환값을 검증함)
 * - 삽입 후 DataStore의 해당 노드 텍스트가 즉시 반영되는 것을 전제로 한다.
 *
 * Selection 매핑
 * - 동일 노드의 삽입 위치(pos) 이후의 selection anchor/focus를 삽입 길이만큼 앞으로 이동한다.
 * - 다른 노드 selection에는 영향이 없다.
 *
 * 반환값(runtime)
 * - 삽입된 문자열(테스트에서 result를 직접 비교함)
 */

type InsertTextOperationPayload = {
  nodeId: string;
  pos: number;
  text: string;
};

// 텍스트 노드의 지정된 위치에 텍스트를 삽입한다.
// DataStore.range.insertText 호출을 사용하며, 삽입된 문자열을 반환한다.
defineOperation('insertText', 
  async (operation: any, context: TransactionContext) => {
    const { nodeId, pos, text } = operation.payload as InsertTextOperationPayload;

    try {
      // Check if node exists
      const node = context.dataStore.getNode(nodeId);
      if (!node) {
        throw new Error(`Node not found: ${nodeId}`);
      }

      // 1) DataStore 업데이트: 단일 노드 내부에서 pos 위치로 삽입
      //    start=end=pos 형태로 range를 구성하여 DataStore.range.insertText 호출
      const insertedText = context.dataStore.range.insertText({
        startNodeId: nodeId,
        startOffset: pos,
        endNodeId: nodeId,
        endOffset: pos
      }, text);
      
      // 2) Selection 매핑: context.selection.current 직접 갱신
      if (context.selection?.current) {
        const sel = context.selection.current;
        const textLength = text.length;
        
        // start 처리
        if (sel.startNodeId === nodeId && sel.startOffset >= pos) {
          sel.startOffset += textLength;
        }
        
        // end 처리
        if (sel.endNodeId === nodeId && sel.endOffset >= pos) {
          sel.endOffset += textLength;
        }
        
        // Collapsed 상태는 변경되지 않음 (offset만 이동)
      }
      
      // 3) 삽입된 텍스트 반환 + inverse
      return { ok: true, data: insertedText, inverse: { type: 'deleteTextRange', payload: { nodeId, startPosition: pos, endPosition: pos + text.length } } };

    } catch (error) {
      throw new Error(`Failed to insert text into node ${nodeId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
);

/**
 * insertText operation DSL
 *
 * 지원 형태:
 * - 직접 지정: insertText(nodeId, pos, text) → { type: 'insertText', payload: { nodeId, pos, text } }
 * - control 체인: control(nodeId, [ insertText(pos, text) ]) → { type: 'insertText', payload: { pos, text } }
 *
 * 주의
 * - 키 이름은 pos를 사용한다(테스트 스펙 일치).
 * - control 체인에서는 nodeId를 주입하지 않는다(빌더가 주입).
 */
