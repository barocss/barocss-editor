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

    // range [0, 16] should be 0 to 16 = 17 characters
    // but slice(0, 16) returns 0 to 15 = only 16 characters
    // therefore range [0, 16] actually includes only 0 to 15 = 16 characters
    
    // First run: part corresponding to range [0, 16]
    expect(runs.length).toBeGreaterThan(0);
    
    const firstRun = runs.find(r => r.types.includes('bgColor'));
    expect(firstRun).toBeTruthy();
    
    if (firstRun) {
      // range [0, 16] is slice(0, 16) = 16 characters
      expect(firstRun.start).toBe(0);
      expect(firstRun.end).toBe(16);
      expect(firstRun.text).toBe('yellow backgroun'); // 16 characters
      expect(firstRun.text.length).toBe(16);
    }
    
    // Second run: part corresponding to range [16, 17] (part without mark)
    const secondRun = runs.find(r => !r.types.includes('bgColor') && r.start >= 16);
    if (secondRun) {
      expect(secondRun.start).toBe(16);
      expect(secondRun.end).toBe(17);
      expect(secondRun.text).toBe('d'); // 1 character
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

    // range [0, 18] should be 0 to 18 = 19 characters
    // but slice(0, 18) returns 0 to 17 = only 18 characters
    // therefore range [0, 18] actually includes only 0 to 17 = 18 characters
    
    // First run: part corresponding to range [0, 18]
    expect(runs.length).toBeGreaterThan(0);
    
    const firstRun = runs.find(r => r.types.includes('bgColor'));
    expect(firstRun).toBeTruthy();
    
    if (firstRun) {
      // range [0, 18] is slice(0, 18) = 18 characters
      expect(firstRun.start).toBe(0);
      expect(firstRun.end).toBe(18);
      expect(firstRun.text).toBe('yellow bㅁackground'); // 18 characters
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

    // range [0, text.length] should include entire text
    expect(runs.length).toBe(1);
    expect(runs[0].start).toBe(0);
    expect(runs[0].end).toBe(text.length);
    expect(runs[0].text).toBe(text);
    expect(runs[0].types).toContain('bgColor');
  });
});

