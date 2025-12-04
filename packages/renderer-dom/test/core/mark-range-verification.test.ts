/**
 * mark-range-verification.test.ts
 * 
 * mark range가 올바르게 처리되는지 확인
 */

import { describe, it, expect } from 'vitest';
import { splitTextByMarks } from '../../src/vnode/utils/marks';

describe('Mark Range Verification', () => {
  it('should correctly split text by mark range [0, 16] for "yellow background" (17 chars)', () => {
    const text = 'yellow background';
    const marks = [{
      type: 'bgColor',
      range: [0, 16] as [number, number],
      attrs: { bgColor: '#ffff00' }
    }];

    const runs = splitTextByMarks(text, marks);

    console.log('[DEBUG] Text:', text);
    console.log('[DEBUG] Text length:', text.length);
    console.log('[DEBUG] Mark range:', [0, 16]);
    console.log('[DEBUG] Runs:', runs.map(r => ({
      start: r.start,
      end: r.end,
      text: r.text,
      textLength: r.text.length,
      types: r.types
    })));

    // range [0, 16]은 0부터 16까지 = 17자여야 함
    // 하지만 slice(0, 16)은 0부터 15까지 = 16자만 반환
    // 따라서 range [0, 16]은 실제로는 0부터 15까지 = 16자만 포함됨
    
    // 첫 번째 run: range [0, 16]에 해당하는 부분
    expect(runs.length).toBeGreaterThan(0);
    
    const firstRun = runs.find(r => r.types.includes('bgColor'));
    expect(firstRun).toBeTruthy();
    
    if (firstRun) {
      // range [0, 16]은 slice(0, 16) = 16자
      expect(firstRun.start).toBe(0);
      expect(firstRun.end).toBe(16);
      expect(firstRun.text).toBe('yellow backgroun'); // 16자
      expect(firstRun.text.length).toBe(16);
    }
    
    // 두 번째 run: range [16, 17]에 해당하는 부분 (mark가 없는 부분)
    const secondRun = runs.find(r => !r.types.includes('bgColor') && r.start >= 16);
    if (secondRun) {
      expect(secondRun.start).toBe(16);
      expect(secondRun.end).toBe(17);
      expect(secondRun.text).toBe('d'); // 1자
      expect(secondRun.text.length).toBe(1);
    }
  });

  it('should correctly split text by mark range [0, 18] for "yellow bㅁackground" (18 chars)', () => {
    const text = 'yellow bㅁackground';
    const marks = [{
      type: 'bgColor',
      range: [0, 18] as [number, number],
      attrs: { bgColor: '#ffff00' }
    }];

    const runs = splitTextByMarks(text, marks);

    console.log('[DEBUG] Text:', text);
    console.log('[DEBUG] Text length:', text.length);
    console.log('[DEBUG] Mark range:', [0, 18]);
    console.log('[DEBUG] Runs:', runs.map(r => ({
      start: r.start,
      end: r.end,
      text: r.text,
      textLength: r.text.length,
      types: r.types
    })));

    // range [0, 18]은 0부터 18까지 = 19자여야 함
    // 하지만 slice(0, 18)은 0부터 17까지 = 18자만 반환
    // 따라서 range [0, 18]은 실제로는 0부터 17까지 = 18자만 포함됨
    
    // 첫 번째 run: range [0, 18]에 해당하는 부분
    expect(runs.length).toBeGreaterThan(0);
    
    const firstRun = runs.find(r => r.types.includes('bgColor'));
    expect(firstRun).toBeTruthy();
    
    if (firstRun) {
      // range [0, 18]은 slice(0, 18) = 18자
      expect(firstRun.start).toBe(0);
      expect(firstRun.end).toBe(18);
      expect(firstRun.text).toBe('yellow bㅁackground'); // 18자
      expect(firstRun.text.length).toBe(18);
    }
  });

  it('should handle mark range that covers entire text', () => {
    const text = 'yellow background';
    const marks = [{
      type: 'bgColor',
      range: [0, text.length] as [number, number],
      attrs: { bgColor: '#ffff00' }
    }];

    const runs = splitTextByMarks(text, marks);

    console.log('[DEBUG] Text:', text);
    console.log('[DEBUG] Text length:', text.length);
    console.log('[DEBUG] Mark range:', [0, text.length]);
    console.log('[DEBUG] Runs:', runs.map(r => ({
      start: r.start,
      end: r.end,
      text: r.text,
      textLength: r.text.length,
      types: r.types
    })));

    // range [0, text.length]은 전체 텍스트를 포함해야 함
    expect(runs.length).toBe(1);
    expect(runs[0].start).toBe(0);
    expect(runs[0].end).toBe(text.length);
    expect(runs[0].text).toBe(text);
    expect(runs[0].types).toContain('bgColor');
  });
});

