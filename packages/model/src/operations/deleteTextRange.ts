import { defineOperation } from './define-operation';
import type { TransactionContext } from '../types';

/**
 * deleteTextRange operation (runtime)
 *
 * 목적
 * - 단일 텍스트 노드 내에서 startPosition~endPosition 구간의 텍스트를 삭제한다.
 * - DataStore 연산과 Selection 이동을 일관되게 처리한다.
 *
 * 입력 형태(DSL)
 * - control 체인: control(nodeId, [ deleteTextRange(start, end) ]) → payload: { start, end }
 * - 직접 호출: deleteTextRange(nodeId, start, end) → payload: { nodeId, start, end }
 *   - 빌더는 control(target, …)에서 target을 nodeId로 주입한다.
 *
 * payload 필드 (DSL)
 * - start: number
 * - end: number
 * - nodeId?: string (직접 호출 시 포함)
 */

type DeleteTextRangeOperation = {
  nodeId: string;
  start: number;
  end: number;
};

// 텍스트 노드에서 지정된 범위의 텍스트를 삭제한다.
// DataStore.range.deleteText 호출을 사용하며, 삭제된 텍스트를 반환한다.
defineOperation('deleteTextRange', 
  async (operation: any, context: TransactionContext) => {
    const { nodeId, start, end } = operation.payload as DeleteTextRangeOperation;

    try {
      // Check if node exists
      const node = context.dataStore.getNode(nodeId);
      if (!node) {
        throw new Error(`Node not found: ${nodeId}`);
      }

      // 1) DataStore 업데이트: 단일 노드 내부에서 [startPosition, endPosition) 구간 삭제
      const deletedText = context.dataStore.range.deleteText({
        startNodeId: nodeId,
        startOffset: start,
        endNodeId: nodeId,
        endOffset: end
      });
      
      // 2) Selection 매핑: context.selection.current 직접 갱신
      if (context.selection?.current) {
        const sel = context.selection.current;
        const deleteLength = end - start;
        
        // start 처리
        if (sel.startNodeId === nodeId) {
          if (sel.startOffset >= start && sel.startOffset < end) {
            // 삭제 범위 내 → start로 클램프
            sel.startOffset = start;
          } else if (sel.startOffset === end) {
            // 삭제 범위 끝에 정확히 있음 → 삭제 시작 위치로 이동
            sel.startOffset = start;
          } else if (sel.startOffset > end) {
            // 삭제 범위 이후 → 시프트
            sel.startOffset -= deleteLength;
          }
        }
        
        // end 처리
        if (sel.endNodeId === nodeId) {
          if (sel.endOffset >= start && sel.endOffset < end) {
            // 삭제 범위 내 → start로 클램프
            sel.endOffset = start;
          } else if (sel.endOffset === end) {
            // 삭제 범위 끝에 정확히 있음 → 삭제 시작 위치로 이동
            sel.endOffset = start;
          } else if (sel.endOffset > end) {
            // 삭제 범위 이후 → 시프트
            sel.endOffset -= deleteLength;
          }
        }
        
        // Collapsed 상태 업데이트
        if ('collapsed' in sel) {
          sel.collapsed = sel.startNodeId === sel.endNodeId && 
                          sel.startOffset === sel.endOffset;
        }
      }
      
      // 3) 삭제된 텍스트 반환 + inverse + selection 정보
      return { 
        ok: true, 
        data: deletedText, 
        inverse: { 
          type: 'insertText', 
          payload: { 
            nodeId, 
            pos: start, 
            text: deletedText 
          } 
        },
        selection: context.selection?.current ? {
          startNodeId: context.selection.current.startNodeId,
          startOffset: context.selection.current.startOffset,
          endNodeId: context.selection.current.endNodeId,
          endOffset: context.selection.current.endOffset
        } : null
      };

    } catch (error) {
      throw new Error(`Failed to delete text range for node ${nodeId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
);

/**
 * deleteTextRange operation DSL
 *
 * 지원 형태:
 * - 직접 지정: deleteTextRange(nodeId, start, end) → { type: 'deleteTextRange', payload: { nodeId, start, end } }
 * - control 체인: control(nodeId, [ deleteTextRange(start, end) ]) → { type: 'deleteTextRange', payload: { start, end } }
 */
