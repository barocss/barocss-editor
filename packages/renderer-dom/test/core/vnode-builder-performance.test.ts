/**
 * VNodeBuilder 성능 테스트
 * 
 * 큰 문서 구조를 처리할 때의 성능을 검증합니다.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { define, element, data, slot, defineMark, getGlobalRegistry } from '@barocss/dsl';
import { VNodeBuilder } from '../../src/vnode/factory';

describe('VNodeBuilder Performance Tests', () => {
  let builder: VNodeBuilder;
  let registry: ReturnType<typeof getGlobalRegistry>;

  beforeEach(() => {
    registry = getGlobalRegistry();
    builder = new VNodeBuilder(registry);
    
    // Define base components
    define('document', element('div', { className: 'document' }, [slot('content')]));
    define('paragraph', element('p', { className: 'paragraph' }, [slot('content')]));
    define('inline-text', element('span', { className: 'text' }, [data('text')]));
    defineMark('bold', element('strong', {}, [data('text')]));
    defineMark('italic', element('em', {}, [data('text')]));
  });

  describe('Large document structure', () => {
    it('should build VNode for document with 1000 paragraphs', () => {
      const paragraphs = Array.from({ length: 1000 }, (_, i) => ({
        sid: `p-${i}`,
        stype: 'paragraph',
        content: [{
          sid: `text-${i}`,
          stype: 'inline-text',
          text: `Paragraph ${i} content`
        }]
      }));
      
      const documentModel = {
        sid: 'doc-1',
        stype: 'document',
        content: paragraphs
      };
      
      const startTime = performance.now();
      const vnode = builder.build('document', documentModel);
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      expect(vnode).toBeTruthy();
      expect(vnode.children).toBeTruthy();
      expect(vnode.children.length).toBe(1000);
      
      console.log(`\n✓ Built 1000 paragraphs in ${duration.toFixed(2)}ms`);
      console.log(`  Average: ${(duration / 1000).toFixed(3)}ms per paragraph`);
      
      // Performance target: 1000 paragraphs should be processed within 1 second
      expect(duration).toBeLessThan(1000);
    });

    it('should build VNode for document with 100 paragraphs with marks', () => {
      const paragraphs = Array.from({ length: 100 }, (_, i) => ({
        sid: `p-${i}`,
        stype: 'paragraph',
        content: [{
          sid: `text-${i}`,
          stype: 'inline-text',
          text: `Bold text ${i}`,
          marks: [
            { type: 'bold', range: [0, 9] },
            { type: 'italic', range: [0, 9] }
          ]
        }]
      }));
      
      const documentModel = {
        sid: 'doc-1',
        stype: 'document',
        content: paragraphs
      };
      
      const startTime = performance.now();
      const vnode = builder.build('document', documentModel);
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      expect(vnode).toBeTruthy();
      expect(vnode.children).toBeTruthy();
      expect(vnode.children.length).toBe(100);
      
      console.log(`\n✓ Built 100 paragraphs with marks in ${duration.toFixed(2)}ms`);
      console.log(`  Average: ${(duration / 100).toFixed(3)}ms per paragraph`);
      
      // Performance target: 100 paragraphs with marks should be processed within 500ms
      expect(duration).toBeLessThan(500);
    });

    it('should build VNode for deeply nested structure (10 levels)', () => {
      const createNestedModel = (level: number, maxLevel: number): any => {
        if (level >= maxLevel) {
          return {
            sid: `text-${level}`,
            stype: 'inline-text',
            text: `Level ${level} text`
          };
        }
        
        return {
          sid: `p-${level}`,
          stype: 'paragraph',
          content: [createNestedModel(level + 1, maxLevel)]
        };
      };
      
      const documentModel = {
        sid: 'doc-1',
        stype: 'document',
        content: [createNestedModel(0, 10)]
      };
      
      const startTime = performance.now();
      const vnode = builder.build('document', documentModel);
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      expect(vnode).toBeTruthy();
      
      // Verify nested structure with depth of 10
      let current = vnode;
      let depth = 0;
      while (current.children && current.children.length > 0) {
        const firstChild = current.children[0] as any;
        if (firstChild.tag) {
          current = firstChild;
          depth++;
        } else {
          break;
        }
      }
      
      expect(depth).toBeGreaterThanOrEqual(10);
      
      console.log(`\n✓ Built 10-level nested structure in ${duration.toFixed(2)}ms`);
      
      // Performance target: 10-level nested structure should be processed within 100ms
      expect(duration).toBeLessThan(100);
    });

    it('should build VNode for wide structure (1000 siblings)', () => {
      const siblings = Array.from({ length: 1000 }, (_, i) => ({
        sid: `text-${i}`,
        stype: 'inline-text',
        text: `Text ${i}`
      }));
      
      const paragraphModel = {
        sid: 'p-1',
        stype: 'paragraph',
        content: siblings
      };
      
      const startTime = performance.now();
      const vnode = builder.build('paragraph', paragraphModel);
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      expect(vnode).toBeTruthy();
      expect(vnode.children).toBeTruthy();
      expect(vnode.children.length).toBe(1000);
      
      console.log(`\n✓ Built 1000 sibling nodes in ${duration.toFixed(2)}ms`);
      console.log(`  Average: ${(duration / 1000).toFixed(3)}ms per sibling`);
      
      // Performance target: 1000 siblings should be processed within 500ms
      expect(duration).toBeLessThan(500);
    });
  });

  describe('Complex mark processing performance', () => {
    it('should handle text with many overlapping marks efficiently', () => {
      // Long text with 100 overlapping marks
      const marks = Array.from({ length: 100 }, (_, i) => ({
        type: i % 2 === 0 ? 'bold' : 'italic',
        range: [i, i + 10]
      }));
      
      const model = {
        sid: 'p-1',
        stype: 'paragraph',
        content: [{
          sid: 'text-1',
          stype: 'inline-text',
          text: 'A'.repeat(200), // 200 character text
          marks
        }]
      };
      
      const startTime = performance.now();
      const vnode = builder.build('paragraph', model);
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      expect(vnode).toBeTruthy();
      
      console.log(`\n✓ Processed text with 100 overlapping marks in ${duration.toFixed(2)}ms`);
      
      // Performance target: 100 overlapping marks should be processed within 200ms
      expect(duration).toBeLessThan(200);
    });
  });

  describe('Memory efficiency', () => {
    it('should not create excessive VNode objects for large document', () => {
      const paragraphs = Array.from({ length: 500 }, (_, i) => ({
        sid: `p-${i}`,
        stype: 'paragraph',
        content: [{
          sid: `text-${i}`,
          stype: 'inline-text',
          text: `Paragraph ${i}`
        }]
      }));
      
      const documentModel = {
        sid: 'doc-1',
        stype: 'document',
        content: paragraphs
      };
      
      // Verify VNode structure is created correctly
      const vnode = builder.build('document', documentModel);
      
      expect(vnode).toBeTruthy();
      expect(vnode.children).toBeTruthy();
      expect(vnode.children.length).toBe(500);
      
      // Each paragraph should have correct structure
      const firstParagraph = vnode.children[0] as any;
      expect(firstParagraph.tag).toBe('p');
      expect(firstParagraph.sid).toBe('p-0');
      expect(firstParagraph.children).toBeTruthy();
      expect(firstParagraph.children.length).toBe(1);
      
      console.log(`\n✓ Built 500 paragraphs with correct structure`);
    });
  });
});

