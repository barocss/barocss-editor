/**
 * VNodeBuilder Edge Cases 및 에러 처리 검증
 * 
 * 기본 기능 외에 edge cases, 에러 처리, 예외 상황을 검증합니다.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { define, element, data, defineDecorator, getGlobalRegistry, defineMark, slot, attr } from '@barocss/dsl';
import { DecoratorData, VNodeBuilder } from '../../src/vnode/factory';

describe('VNodeBuilder Edge Cases and Error Handling', () => {
  let builder: VNodeBuilder;
  let registry: ReturnType<typeof getGlobalRegistry>;

  beforeEach(() => {
    registry = getGlobalRegistry();
    builder = new VNodeBuilder(registry);
  });

  describe('Empty and null data handling', () => {
    it('should handle empty text', () => {
      define('paragraph', element('p', {}, [data('text')]));
      
      const model = { stype: 'paragraph', sid: 'p1', text: '' };
      const vnode = builder.build('paragraph', model);
      
      expect(vnode).toBeTruthy();
      expect(vnode.tag).toBe('p');
      expect(vnode.children).toBeTruthy();
      // Empty text should also be processed
      expect(Array.isArray(vnode.children)).toBe(true);
    });

    it('should handle null text', () => {
      define('paragraph', element('p', {}, [data('text')]));
      
      const model = { stype: 'paragraph', sid: 'p1', text: null };
      const vnode = builder.build('paragraph', model);
      
      expect(vnode).toBeTruthy();
      expect(vnode.tag).toBe('p');
    });

    it('should handle undefined text', () => {
      define('paragraph', element('p', {}, [data('text')]));
      
      const model = { stype: 'paragraph', sid: 'p1' };
      const vnode = builder.build('paragraph', model);
      
      expect(vnode).toBeTruthy();
      expect(vnode.tag).toBe('p');
    });

    it('should handle empty content array', () => {
      define('container', element('div', {}, [slot('content')]));
      
      const model = { stype: 'container', sid: 'c1', content: [] };
      const vnode = builder.build('container', model);
      
      expect(vnode).toBeTruthy();
      expect(vnode.tag).toBe('div');
      expect(vnode.children).toBeTruthy();
      expect(Array.isArray(vnode.children)).toBe(true);
      expect(vnode.children.length).toBe(0);
    });

    it('should handle null data parameter', () => {
      define('paragraph', element('p', {}, []));
      
      expect(() => {
        builder.build('paragraph', null as any);
      }).toThrow('Data cannot be null or undefined');
    });

    it('should handle undefined data parameter', () => {
      define('paragraph', element('p', {}, []));
      
      // undefined is processed as default {}, so no error occurs
      // Processed as empty object and VNode is created
      const vnode = builder.build('paragraph', undefined as any);
      expect(vnode).toBeTruthy();
      expect(vnode.tag).toBe('p');
    });
  });

  describe('Missing renderer handling', () => {
    it('should throw error for unregistered node type', () => {
      expect(() => {
        builder.build('non-existent-type', { stype: 'non-existent-type', sid: 'x1' });
      }).toThrow(/Component for node type 'non-existent-type' not found/);
    });

    it('should handle missing decorator renderer gracefully', () => {
      define('paragraph', element('p', {}, [data('text')]));
      
      const model = { stype: 'paragraph', sid: 'p1', text: 'Hello' };
      const decorators: DecoratorData[] = [
        {
          sid: 'd1',
          stype: 'non-existent-decorator',
          type: 'non-existent-decorator',
          category: 'inline',
          target: { sid: 'p1', startOffset: 0, endOffset: 5 }
        }
      ];
      
      const vnode = builder.build('paragraph', model, { decorators });
      
      expect(vnode).toBeTruthy();
      // Fallback decorator VNode should be created
      const hasDecorator = (vnode.children as any[]).some((child: any) => 
        child.decoratorSid === 'd1'
      );
      expect(hasDecorator).toBe(true);
    });
  });

  describe('Invalid mark ranges', () => {
    it('should handle mark range exceeding text length', () => {
      define('paragraph', element('p', {}, [data('text')]));
      defineMark('bold', element('strong', {}, [data('text')]));
      
      const model = { 
        stype: 'paragraph', 
        sid: 'p1', 
        text: 'Hello',
        marks: [{ type: 'bold', range: [0, 100] }] // Exceeds text length (5)
      };
      
      const vnode = builder.build('paragraph', model);
      
      expect(vnode).toBeTruthy();
      // Exceeding range should be limited to text length
      expect(vnode.children).toBeTruthy();
    });

    it('should handle negative mark range', () => {
      define('paragraph', element('p', {}, [data('text')]));
      defineMark('bold', element('strong', {}, [data('text')]));
      
      const model = { 
        stype: 'paragraph', 
        sid: 'p1', 
        text: 'Hello',
        marks: [{ type: 'bold', range: [-5, 3] }] // Negative range
      };
      
      const vnode = builder.build('paragraph', model);
      
      expect(vnode).toBeTruthy();
      // Negative range should be limited to 0
      expect(vnode.children).toBeTruthy();
    });

    it('should handle reversed mark range (start > end)', () => {
      define('paragraph', element('p', {}, [data('text')]));
      defineMark('bold', element('strong', {}, [data('text')]));
      
      const model = { 
        stype: 'paragraph', 
        sid: 'p1', 
        text: 'Hello',
        marks: [{ type: 'bold', range: [5, 2] }] // start > end
      };
      
      const vnode = builder.build('paragraph', model);
      
      expect(vnode).toBeTruthy();
      // Reversed range should be processed as empty range or automatically corrected
      expect(vnode.children).toBeTruthy();
    });
  });

  describe('Invalid decorator ranges', () => {
    it('should handle decorator range exceeding text length', () => {
      define('paragraph', element('p', {}, [data('text')]));
      defineDecorator('highlight', element('span', { className: 'highlight' }, []));
      
      const model = { stype: 'paragraph', sid: 'p1', text: 'Hello' };
      const decorators: DecoratorData[] = [
        {
          sid: 'd1',
          stype: 'highlight',
          type: 'highlight',
          category: 'inline',
          target: { sid: 'p1', startOffset: 0, endOffset: 100 } // Exceeds text length
        }
      ];
      
      const vnode = builder.build('paragraph', model, { decorators });
      
      expect(vnode).toBeTruthy();
      // Exceeding range should be limited to text length
      expect(vnode.children).toBeTruthy();
    });

    it('should handle negative decorator range', () => {
      define('paragraph', element('p', {}, [data('text')]));
      defineDecorator('highlight', element('span', { className: 'highlight' }, []));
      
      const model = { stype: 'paragraph', sid: 'p1', text: 'Hello' };
      const decorators: DecoratorData[] = [
        {
          sid: 'd1',
          stype: 'highlight',
          type: 'highlight',
          category: 'inline',
          target: { sid: 'p1', startOffset: -5, endOffset: 3 } // Negative range
        }
      ];
      
      const vnode = builder.build('paragraph', model, { decorators });
      
      expect(vnode).toBeTruthy();
      // Negative range should be limited to 0
      expect(vnode.children).toBeTruthy();
    });
  });

  describe('Invalid decorator data', () => {
    it('should handle decorator without stype', () => {
      define('paragraph', element('p', {}, [data('text')]));
      
      const model = { stype: 'paragraph', sid: 'p1', text: 'Hello' };
      const decorators: DecoratorData[] = [
        {
          sid: 'd1',
          stype: '', // Empty stype
          type: 'highlight',
          category: 'inline',
          target: { sid: 'p1', startOffset: 0, endOffset: 5 }
        } as any
      ];
      
      const vnode = builder.build('paragraph', model, { decorators });
      
      expect(vnode).toBeTruthy();
      // Error VNode should be created
      const hasErrorDecorator = (vnode.children as any[]).some((child: any) => 
        child.attrs?.['data-decorator-error']
      );
      expect(hasErrorDecorator).toBe(true);
    });

    it('should handle decorator without target', () => {
      define('paragraph', element('p', {}, [data('text')]));
      
      const model = { stype: 'paragraph', sid: 'p1', text: 'Hello' };
      const decorators: DecoratorData[] = [
        {
          sid: 'd1',
          stype: 'highlight',
          type: 'highlight',
          category: 'inline',
          target: null as any // null target
        }
      ];
      
      // If target is missing, decorator should not be applied
      const vnode = builder.build('paragraph', model, { decorators });
      
      expect(vnode).toBeTruthy();
      // Decorator should not be applied (children should be empty or text only)
      if (vnode.children) {
        const hasDecorator = (vnode.children as any[]).some((child: any) => 
          child.decoratorSid === 'd1'
        );
        expect(hasDecorator).toBe(false);
      }
    });
  });

  describe('Nested slot structures', () => {
    it('should handle deeply nested slots', () => {
      define('outer', element('div', { className: 'outer' }, [slot('content')]));
      define('middle', element('div', { className: 'middle' }, [slot('content')]));
      define('inner', element('div', { className: 'inner' }, [slot('content')]));
      define('text', element('span', {}, [data('text')]));
      
      const model = {
        stype: 'outer',
        sid: 'o1',
        content: [{
          stype: 'middle',
          sid: 'm1',
          content: [{
            stype: 'inner',
            sid: 'i1',
            content: [{
              stype: 'text',
              sid: 't1',
              text: 'Nested text'
            }]
          }]
        }]
      };
      
      const vnode = builder.build('outer', model);
      
      expect(vnode).toBeTruthy();
      expect(vnode.tag).toBe('div');
      expect(vnode.children).toBeTruthy();
      expect(vnode.children.length).toBeGreaterThan(0);
      
      const middleChild = (vnode.children as any[])[0];
      expect(middleChild.tag).toBe('div');
      expect(middleChild.children).toBeTruthy();
      
      const innerChild = (middleChild.children as any[])[0];
      expect(innerChild.tag).toBe('div');
      expect(innerChild.children).toBeTruthy();
    });
  });

  describe('Complex mark combinations edge cases', () => {
    it('should handle multiple overlapping marks with same range', () => {
      define('paragraph', element('p', {}, [data('text')]));
      defineMark('bold', element('strong', {}, [data('text')]));
      defineMark('italic', element('em', {}, [data('text')]));
      
      const model = { 
        stype: 'paragraph', 
        sid: 'p1', 
        text: 'Hello',
        marks: [
          { type: 'bold', range: [0, 5] },
          { type: 'italic', range: [0, 5] } // Same range
        ]
      };
      
      const vnode = builder.build('paragraph', model);
      
      expect(vnode).toBeTruthy();
      expect(vnode.children).toBeTruthy();
      // Both marks should be applied (nested structure)
      const hasBold = (vnode.children as any[]).some((child: any) => 
        child.tag === 'strong'
      );
      expect(hasBold).toBe(true);
    });

    it('should handle marks with empty range', () => {
      define('paragraph', element('p', {}, [data('text')]));
      defineMark('bold', element('strong', {}, [data('text')]));
      
      const model = { 
        stype: 'paragraph', 
        sid: 'p1', 
        text: 'Hello',
        marks: [{ type: 'bold', range: [2, 2] }] // Empty range
      };
      
      const vnode = builder.build('paragraph', model);
      
      expect(vnode).toBeTruthy();
      // Empty range should be ignored or empty mark VNode should be created
      expect(vnode.children).toBeTruthy();
    });
  });

  describe('Attributes and style handling', () => {
    it('should handle undefined attributes', () => {
      define('paragraph', element('p', { 
        className: attr('className', 'default'),
        id: attr('id', '')
      }, []));
      
      const model = { stype: 'paragraph', sid: 'p1' };
      const vnode = builder.build('paragraph', model);
      
      expect(vnode).toBeTruthy();
      expect(vnode.attrs).toBeTruthy();
      // Default value should be applied
      expect(vnode.attrs?.className).toBe('default');
    });

    it('should handle null style values', () => {
      define('paragraph', element('p', { 
        style: { color: attr('color', 'black') }
      }, []));
      
      const model = { stype: 'paragraph', sid: 'p1', color: null };
      const vnode = builder.build('paragraph', model);
      
      expect(vnode).toBeTruthy();
      expect(vnode.style).toBeTruthy();
    });
  });

  describe('Sid handling', () => {
    it('should preserve sid from model without modification', () => {
      define('paragraph', element('p', {}, []));
      
      const model = { stype: 'paragraph', sid: 'custom-sid-123' };
      const vnode = builder.build('paragraph', model);
      
      expect(vnode).toBeTruthy();
      expect(vnode.sid).toBe('custom-sid-123');
      // sid should not be generated, should be taken from model as-is
    });

    it('should handle missing sid gracefully', () => {
      define('paragraph', element('p', {}, []));
      
      const model = { stype: 'paragraph' }; // No sid
      const vnode = builder.build('paragraph', model);
      
      expect(vnode).toBeTruthy();
      // VNode should be created even without sid
      expect(vnode.tag).toBe('p');
    });
  });
});

