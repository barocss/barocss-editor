import { defineOperation } from './define-operation';
import type { TransactionContext } from '../types';

/**
 * 노드 삭제 Operation
 * 
 * DataStore의 새로운 기능을 활용하여:
 * 1. 서브트리 삭제 (자식 노드들도 재귀적으로 삭제)
 * 2. 부모-자식 관계 자동 정리
 * 3. 원자적 Operation 이벤트 발생
 * 4. 루트 노드 관리
 */
defineOperation('delete', 
  async (operation: any, context: TransactionContext) => {
    const { nodeId } = operation.payload as { nodeId: string };
    
    try {
      // 1. DataStore 업데이트
      let nodeToDelete = context.dataStore.getNode(nodeId);
      if (!nodeToDelete) {
        // Fallback: if target equals current root but node lookup fails, adjust root and exit
        const currentRoot = context.dataStore.getRootNodeId?.();
        if (currentRoot === nodeId) {
          // Root node는 삭제할 수 없다 (정책)
          throw new Error('Cannot delete root node');
        }
        throw new Error(`Node with id '${nodeId}' not found`);
      }

      // 정책: 루트 노드는 삭제 불가
      const rootId = context.dataStore.getRootNodeId?.();
      if (rootId && rootId === nodeId) {
        throw new Error('Cannot delete root node');
      }
      
      // 서브트리 삭제 (자식 노드들도 재귀적으로 삭제)
      const descendants = context.dataStore.getAllDescendants(nodeId);
      const descendantIds = descendants.map(node => node.sid!);
      
      // 후손 노드들을 역순으로 삭제 (리프 노드부터)
      for (const descendantId of descendantIds.reverse()) {
        const deleted = context.dataStore.deleteNode(descendantId);
        if (!deleted) {
          console.warn(`Failed to delete descendant node: ${descendantId}`);
        }
      }
      
      // 부모 노드에서 자식 참조 제거
      if (nodeToDelete.parentId) {
        const parent = context.dataStore.getNode(nodeToDelete.parentId);
        if (parent) {
          const removed = context.dataStore.removeChild(nodeToDelete.parentId, nodeId);
          if (!removed) {
            console.warn(`Failed to remove child reference from parent: ${nodeToDelete.parentId}`);
          }
        }
      }
      
      // 선택된 노드 삭제 시 selection 클리어
      if (context.selection?.current) {
        const sel = context.selection.current;
        // 삭제되는 노드에 selection이 걸쳐있으면 클리어
        if (sel.startNodeId === nodeId || sel.endNodeId === nodeId) {
          context.selection.clear();
        }
      }

      // 메인 노드 삭제
      const deleted = context.dataStore.deleteNode(nodeId);
      if (!deleted) {
        throw new Error(`Failed to delete node: ${nodeId}`);
      }
      
      // 루트 노드인 경우 새로운 루트 설정
      const prevRoot = context.dataStore.getRootNodeId?.();
      if (prevRoot === nodeId) {
        const remainingNodes = context.dataStore.getAllNodes();
        const candidate = remainingNodes.find(n => n.sid !== nodeId);
        if (candidate) {
          context.dataStore.setRootNodeId(candidate.sid!);
        } else {
          context.dataStore.setRootNodeId(undefined);
        }
      }
      // Selection 기본 정책: 필요 시 SelectionManager가 클램핑/클리어 처리
      
      return {
        ok: true,
        data: true,
        inverse: { type: 'create', payload: { node: nodeToDelete } }
      };
    } catch (error) {
      throw new Error(`Failed to delete node ${nodeId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
);
