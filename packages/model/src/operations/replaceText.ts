import { defineOperation } from './define-operation';
import type { TransactionContext } from '../types';

/**
 * replaceText operation (DSL + runtime)
 *
 * 목적
 * - 단일 텍스트 노드의 지정된 범위(start, end)를 새 텍스트(newText)로 교체한다.
 * - 텍스트/마크 업데이트는 DataStore.range.replaceText에 위임한다.
 *
 * 입력 형태(DSL)
 * - control(nodeId, [ replaceText(start, end, newText) ]) → payload: { start, end, newText }
 * - control(nodeId, [ replaceText(startId, startOffset, endId, endOffset, newText) ]) → payload: { range: { startNodeId, startOffset, endNodeId, endOffset }, newText }
 * - replaceText(nodeId, start, end, newText) → payload: { nodeId, start, end, newText }
 * - replaceText(startId, startOffset, endId, endOffset, newText) → payload: { range: { startNodeId, startOffset, endNodeId, endOffset }, newText }
 *   - 빌더는 control(target, …)에서 target을 nodeId로 주입한다.
 *
 * Selection 매핑
 * - 동일 노드 범위 교체 시, 교체 이후 구간의 selection은 길이 변화(newText.length - (end-start))만큼 이동한다.
 * - 이 구현에서는 SelectionManager 연동은 생략하고 DataStore에 책임을 위임한다(필요 시 추후 확장).
 *
 * 예외 처리
 * - DataStore.range.replaceText가 잘못된 범위 등으로 실패하면 빈 문자열을 반환할 수 있다.
 * - 본 구현은 노드 존재 여부를 엄격히 검사하고, 노드 미존재/잘못된 범위에 대해 명확한 예외를 던진다.
 */

type ReplaceTextOperationPayload =
  | {
      type: 'replaceText';
      nodeId: string;
      start: number;
      end: number;
      newText: string;
    }
  | {
      type: 'replaceText';
      range: { startNodeId: string; startOffset: number; endNodeId: string; endOffset: number };
      newText: string;
    };

defineOperation('replaceText', async (operation: any, context: TransactionContext) => {
  try {
    // operation은 { type: 'replaceText', payload: { ... } } 형태
    const payload = operation.payload;
    
    if (!payload) {
      throw new Error('Payload is required for replaceText operation');
    }
    
    if ('range' in payload) {
      const { range, newText } = payload;
      const { startNodeId, endNodeId, startOffset, endOffset } = range;
      const startNode = context.dataStore.getNode(startNodeId);
      const endNode = context.dataStore.getNode(endNodeId);
      if (!startNode) throw new Error(`Node not found: ${startNodeId}`);
      if (!endNode) throw new Error(`Node not found: ${endNodeId}`);
      if (typeof startNode.text !== 'string' || typeof endNode.text !== 'string') {
        throw new Error('Range endpoints must be text nodes');
      }
      if (typeof startOffset !== 'number' || typeof endOffset !== 'number') throw new Error('Invalid range');
      
      // Store the original text for inverse operation
      const originalText = context.dataStore.range.extractText(range);
      
      const deleted = context.dataStore.range.replaceText(range, newText);
      return {
        ok: true,
        data: deleted,
        inverse: { type: 'replaceText', payload: { range: { startNodeId: range.startNodeId, startOffset: range.startOffset, endNodeId: range.endNodeId, endOffset: range.endOffset + newText.length }, newText: originalText } }
      };
    }
    
    const { nodeId, start, end, newText } = payload;
    const node = context.dataStore.getNode(nodeId);
    if (!node) throw new Error(`Node not found: ${nodeId}`);
    if (typeof node.text !== 'string') throw new Error(`Node ${nodeId} is not a text node`);
    if (typeof start !== 'number' || typeof end !== 'number' || start > end || start < 0 || end > (node.text as string).length) {
      throw new Error('Invalid range');
    }
    
    // Store the original text for inverse operation
    const prevText = (node.text as string).substring(start, end);
    
    const deleted = context.dataStore.range.replaceText({
      startNodeId: nodeId,
      startOffset: start,
      endNodeId: nodeId,
      endOffset: end
    }, newText);
    
    return {
      ok: true,
      data: deleted,
      inverse: { type: 'replaceText', payload: { nodeId, start, end: start + newText.length, newText: prevText } }
    };
  } catch (e) {
    console.log('replaceText error:', e);
    throw new Error(`Failed to replace text: ${e instanceof Error ? e.message : 'Unknown error'}`);
  }
});

// DSL 정의는 별도 파일로 분리 예정


