import { describe, it, expect, beforeEach } from 'vitest';
import { HistoryManager, HistoryEntry } from '../src/history-manager';

describe('HistoryManager', () => {
  let historyManager: HistoryManager;

  beforeEach(() => {
    historyManager = new HistoryManager({
      maxSize: 5
    });
  });

  describe('기본 기능', () => {
    it('새 엔트리 추가', () => {
      const entry = {
        operations: [{ type: 'create', payload: { node: { type: 'text', text: 'Hello' } } }],
        inverseOperations: [{ type: 'delete', payload: { nodeId: 'node-1' } }],
        description: 'Create text node'
      };

      historyManager.push(entry);

      expect(historyManager.getHistory()).toHaveLength(1);
      expect(historyManager.canUndo()).toBe(true);
      expect(historyManager.canRedo()).toBe(false);
    });

    it('실행 취소', () => {
      const entry = {
        operations: [{ type: 'create', payload: { node: { type: 'text', text: 'Hello' } } }],
        inverseOperations: [{ type: 'delete', payload: { nodeId: 'node-1' } }],
        description: 'Create text node'
      };

      historyManager.push(entry);
      const undoneEntry = historyManager.undo();

      expect(undoneEntry).toBeTruthy();
      expect(undoneEntry?.description).toBe('Create text node');
      expect(historyManager.canUndo()).toBe(false);
      expect(historyManager.canRedo()).toBe(true);
    });

    it('다시 실행', () => {
      const entry = {
        operations: [{ type: 'create', payload: { node: { type: 'text', text: 'Hello' } } }],
        inverseOperations: [{ type: 'delete', payload: { nodeId: 'node-1' } }],
        description: 'Create text node'
      };

      historyManager.push(entry);
      historyManager.undo();
      const redoneEntry = historyManager.redo();

      expect(redoneEntry).toBeTruthy();
      expect(redoneEntry?.description).toBe('Create text node');
      expect(historyManager.canUndo()).toBe(true);
      expect(historyManager.canRedo()).toBe(false);
    });
  });

  describe('크기 제한', () => {
    it('최대 크기 제한', () => {
      // 6개의 엔트리 추가 (maxSize: 5)
      for (let i = 0; i < 6; i++) {
        historyManager.push({
          operations: [{ type: 'create', payload: { node: { type: 'text', text: `Hello ${i}` } } }],
          inverseOperations: [{ type: 'delete', payload: { nodeId: `node-${i}` } }],
          description: `Create text node ${i}`
        });
      }

      expect(historyManager.getHistory()).toHaveLength(5);
      expect(historyManager.getCurrentIndex()).toBe(4);
    });
  });


  describe('통계 정보', () => {
    it('통계 정보 반환', () => {
      historyManager.push({
        operations: [{ type: 'create', payload: { node: { type: 'text', text: 'Hello' } } }],
        inverseOperations: [{ type: 'delete', payload: { nodeId: 'node-1' } }],
        description: 'Create text node'
      });

      const stats = historyManager.getStats();
      expect(stats.totalEntries).toBe(1);
      expect(stats.currentIndex).toBe(0);
      expect(stats.canUndo).toBe(true);
      expect(stats.canRedo).toBe(false);
    });
  });

  describe('검색 기능', () => {
    it('조건에 맞는 엔트리 검색', () => {
      historyManager.push({
        operations: [{ type: 'create', payload: { node: { type: 'text', text: 'Hello' } } }],
        inverseOperations: [{ type: 'delete', payload: { nodeId: 'node-1' } }],
        description: 'Create text node'
      });

      historyManager.push({
        operations: [{ type: 'update', payload: { nodeId: 'node-1', data: { text: 'World' } } }],
        inverseOperations: [{ type: 'update', payload: { nodeId: 'node-1', data: { text: 'Hello' } } }],
        description: 'Update text node'
      });

      const createEntries = historyManager.findEntries(entry => 
        entry.operations.some(op => op.type === 'create')
      );

      expect(createEntries).toHaveLength(1);
      expect(createEntries[0].description).toBe('Create text node');
    });
  });

  describe('초기화', () => {
    it('히스토리 초기화', () => {
      historyManager.push({
        operations: [{ type: 'create', payload: { node: { type: 'text', text: 'Hello' } } }],
        inverseOperations: [{ type: 'delete', payload: { nodeId: 'node-1' } }],
        description: 'Create text node'
      });

      historyManager.clear();

      expect(historyManager.getHistory()).toHaveLength(0);
      expect(historyManager.getCurrentIndex()).toBe(-1);
    });
  });
});
