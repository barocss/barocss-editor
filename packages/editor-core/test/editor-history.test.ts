import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setText } from '@barocss/model';
import { Editor } from '../src/editor';

describe('Editor History Integration', () => {
  let editor: Editor;

  beforeEach(() => {
    editor = new Editor({
      history: {
        maxSize: 10
      }
    });
  });

  it('preserves the commit outcome when the transactionExecuted notification throws', async () => {
    editor.dataStore.setNode({ sid: 't', stype: 'inline-text', text: 'before', attributes: {} }, false);
    const emit = editor.emit.bind(editor);
    vi.spyOn(editor, 'emit').mockImplementation((event, data) => {
      if (event === 'transactionExecuted') throw new Error('notification failed');
      emit(event, data);
    });
    const result = await editor.executeTransaction({ operations: [setText('t', 'after')] });
    expect(result).toMatchObject({ success: true, committed: true, errors: [], postCommitErrors: ['transactionExecuted: notification failed'] });
    expect(editor.dataStore.getNode('t')?.text).toBe('after');
    expect(editor.historyManager.getHistory()).toHaveLength(1);
    editor.destroy();
  });

  describe('기본 History 기능', () => {
    it('Editor에 HistoryManager가 통합되어야 함', () => {
      expect(editor.historyManager).toBeDefined();
      expect(editor.canUndo()).toBe(false);
      expect(editor.canRedo()).toBe(false);
    });

    it('History 통계 정보를 가져올 수 있어야 함', () => {
      const stats = editor.getHistoryStats();
      expect(stats).toHaveProperty('totalEntries');
      expect(stats).toHaveProperty('currentIndex');
      expect(stats).toHaveProperty('canUndo');
      expect(stats).toHaveProperty('canRedo');
    });
  });


  describe('History 초기화', () => {
    it('History를 초기화할 수 있어야 함', () => {
      editor.clearHistory();
      
      const stats = editor.getHistoryStats();
      expect(stats.totalEntries).toBe(0);
    });
  });

  describe('History 설정', () => {
    it('History 설정이 올바르게 적용되어야 함', () => {
      const customEditor = new Editor({
        history: {
          maxSize: 5
        }
      });

      const stats = customEditor.getHistoryStats();
      expect(stats.totalEntries).toBe(0);
    });
  });
});
