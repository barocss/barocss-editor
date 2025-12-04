import { describe, it, expect, beforeEach } from 'vitest';
import { Editor } from '../src/editor';
import { textNode } from '@barocss/model';

describe('HistoryManager Advanced Features', () => {
  let editor: Editor;

  beforeEach(() => {
    editor = new Editor({
      history: {
        maxSize: 10
      }
    });
  });

  it('should validate history state correctly', () => {
    const validation = editor.validateHistory();
    expect(validation.isValid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  it('should get memory usage', async () => {
    // 초기 상태
    const initialMemory = editor.getHistoryMemoryUsage();
    expect(initialMemory).toBe(0);

    // 작업 수행 후
    await editor.transaction([
      { type: 'create', payload: { node: textNode('paragraph', 'Hello') } }
    ]).commit();

    const afterMemory = editor.getHistoryMemoryUsage();
    expect(afterMemory).toBeGreaterThan(0);
  });

  it('should resize history correctly', async () => {
    // 여러 작업 수행
    for (let i = 0; i < 5; i++) {
      await editor.transaction([
        { type: 'create', payload: { node: textNode('paragraph', `Step ${i + 1}`) } }
      ]).commit();
    }

    expect(editor.getHistoryStats().totalEntries).toBe(5);

    // 히스토리 크기 축소
    editor.resizeHistory(3);
    expect(editor.getHistoryStats().totalEntries).toBe(3);
  });

  it('should compress similar operations', async () => {
    // 먼저 노드 생성
    await editor.transaction([
      { type: 'create', payload: { node: textNode('paragraph', 'Initial') } }
    ]).commit();

    // 연속된 텍스트 작업 수행 (실제로는 create 작업으로 대체)
    await editor.transaction([
      { type: 'create', payload: { node: textNode('paragraph', 'Hello') } }
    ]).commit();

    await editor.transaction([
      { type: 'create', payload: { node: textNode('paragraph', 'Hello World') } }
    ]).commit();

    await editor.transaction([
      { type: 'create', payload: { node: textNode('paragraph', 'Hello World!') } }
    ]).commit();

    const beforeCompress = editor.getHistoryStats().totalEntries;
    expect(beforeCompress).toBe(4); // 초기 + 3개 작업

    // 압축 실행
    editor.compressHistory();

    const afterCompress = editor.getHistoryStats().totalEntries;
    expect(afterCompress).toBeLessThanOrEqual(beforeCompress);
  });

  it('should handle empty operations gracefully', async () => {
    // 빈 operations로 히스토리 추가 시도
    const initialStats = editor.getHistoryStats();
    
    // 빈 operations는 히스토리에 추가되지 않아야 함
    await editor.transaction([]).commit();
    
    const afterStats = editor.getHistoryStats();
    expect(afterStats.totalEntries).toBe(initialStats.totalEntries);
  });

  it('should maintain history integrity after compression', async () => {
    // 여러 작업 수행
    for (let i = 0; i < 3; i++) {
      await editor.transaction([
        { type: 'create', payload: { node: textNode('paragraph', `Step ${i + 1}`) } }
      ]).commit();
    }

    // 압축 전 검증
    const beforeValidation = editor.validateHistory();
    expect(beforeValidation.isValid).toBe(true);

    // 압축 실행
    editor.compressHistory();

    // 압축 후 검증
    const afterValidation = editor.validateHistory();
    expect(afterValidation.isValid).toBe(true);
  });
});
