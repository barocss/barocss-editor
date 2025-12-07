import { describe, it, expect } from 'vitest';
import { analyzeTextChanges } from '@barocss/text-analyzer';

describe('Model Application Test', () => {
  describe('변화량을 모델에 적용할 수 있는지 검증', () => {
    it('삽입 케이스: oldText + changes = newText', () => {
      const oldText = 'hello world';
      const newText = 'hello beautiful world';
      const selectionOffset = 6;
      const selectionLength = 0;

      const changes = analyzeTextChanges({
        oldText,
        newText,
        selectionOffset,
        selectionLength
      });

      console.log('삽입 케이스 변화량:', changes);

      // 1. Verify oldText + changes = newText
      let reconstructedText = oldText;
      
      changes.forEach(change => {
        if (change.type === 'insert') {
          // Insert: insert text at start position
          reconstructedText = 
            reconstructedText.slice(0, change.start) + 
            change.text + 
            reconstructedText.slice(change.start);
        } else if (change.type === 'delete') {
          // Delete: delete from start to end
          reconstructedText = 
            reconstructedText.slice(0, change.start) + 
            reconstructedText.slice(change.end);
        } else if (change.type === 'replace') {
          // Replace: delete from start to end, then insert text
          reconstructedText = 
            reconstructedText.slice(0, change.start) + 
            change.text + 
            reconstructedText.slice(change.end);
        }
      });

      console.log('원본 oldText:', oldText);
      console.log('원본 newText:', newText);
      console.log('재구성된 텍스트:', reconstructedText);

      expect(reconstructedText).toBe(newText);
    });

    it('삭제 케이스: oldText + changes = newText', () => {
      const oldText = 'hello beautiful world';
      const newText = 'hello world';
      const selectionOffset = 6;
      const selectionLength = 0;

      const changes = analyzeTextChanges({
        oldText,
        newText,
        selectionOffset,
        selectionLength
      });

      console.log('삭제 케이스 변화량:', changes);

      // 1. Verify oldText + changes = newText
      let reconstructedText = oldText;
      
      changes.forEach(change => {
        if (change.type === 'insert') {
          reconstructedText = 
            reconstructedText.slice(0, change.start) + 
            change.text + 
            reconstructedText.slice(change.start);
        } else if (change.type === 'delete') {
          reconstructedText = 
            reconstructedText.slice(0, change.start) + 
            reconstructedText.slice(change.end);
        } else if (change.type === 'replace') {
          reconstructedText = 
            reconstructedText.slice(0, change.start) + 
            change.text + 
            reconstructedText.slice(change.end);
        }
      });

      console.log('원본 oldText:', oldText);
      console.log('원본 newText:', newText);
      console.log('재구성된 텍스트:', reconstructedText);

      expect(reconstructedText).toBe(newText);
    });

    it('교체 케이스: oldText + changes = newText', () => {
      const oldText = 'hello world';
      const newText = 'hello there';
      const selectionOffset = 6;
      const selectionLength = 5;

      const changes = analyzeTextChanges({
        oldText,
        newText,
        selectionOffset,
        selectionLength
      });

      console.log('교체 케이스 변화량:', changes);

      // 1. Verify oldText + changes = newText
      let reconstructedText = oldText;
      
      changes.forEach(change => {
        if (change.type === 'insert') {
          reconstructedText = 
            reconstructedText.slice(0, change.start) + 
            change.text + 
            reconstructedText.slice(change.start);
        } else if (change.type === 'delete') {
          reconstructedText = 
            reconstructedText.slice(0, change.start) + 
            reconstructedText.slice(change.end);
        } else if (change.type === 'replace') {
          reconstructedText = 
            reconstructedText.slice(0, change.start) + 
            change.text + 
            reconstructedText.slice(change.end);
        }
      });

      console.log('원본 oldText:', oldText);
      console.log('원본 newText:', newText);
      console.log('재구성된 텍스트:', reconstructedText);

      expect(reconstructedText).toBe(newText);
    });

    it('복합 케이스: 여러 변경사항이 있는 경우', () => {
      const oldText = 'hello world';
      const newText = 'hello beautiful there';
      const selectionOffset = 6;
      const selectionLength = 0;

      const changes = analyzeTextChanges({
        oldText,
        newText,
        selectionOffset,
        selectionLength
      });

      console.log('복합 케이스 변화량:', changes);

      // 1. Verify oldText + changes = newText
      let reconstructedText = oldText;
      
      changes.forEach(change => {
        if (change.type === 'insert') {
          reconstructedText = 
            reconstructedText.slice(0, change.start) + 
            change.text + 
            reconstructedText.slice(change.start);
        } else if (change.type === 'delete') {
          reconstructedText = 
            reconstructedText.slice(0, change.start) + 
            reconstructedText.slice(change.end);
        } else if (change.type === 'replace') {
          reconstructedText = 
            reconstructedText.slice(0, change.start) + 
            change.text + 
            reconstructedText.slice(change.end);
        }
      });

      console.log('원본 oldText:', oldText);
      console.log('원본 newText:', newText);
      console.log('재구성된 텍스트:', reconstructedText);

      expect(reconstructedText).toBe(newText);
    });
  });
});
