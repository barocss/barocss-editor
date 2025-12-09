/**
 * Complex Mark and Decorator Combination Test
 * 
 * This test verifies what VNode VNodeBuilder creates
 * when very complex marks and decorators are combined.
 */
import { describe, it } from 'vitest';
import { define, element, data, defineDecorator, getGlobalRegistry, slot } from '@barocss/dsl';
import { DecoratorData, VNodeBuilder } from '../../src/vnode/factory';

/**
 * VNode를 JSON으로 직렬화 (순환 참조 및 함수 제거)
 */
function serializeVNode(vnode: any, depth: number = 0): any {
  if (depth > 10) return '[Max depth reached]';
  if (vnode === null || vnode === undefined) return vnode;
  if (typeof vnode === 'string' || typeof vnode === 'number' || typeof vnode === 'boolean') {
    return vnode;
  }
  if (Array.isArray(vnode)) {
    return vnode.map((item, idx) => {
      if (typeof item === 'string') return item;
      return serializeVNode(item, depth + 1);
    });
  }
  if (typeof vnode === 'object') {
    const result: any = {};
    for (const key in vnode) {
      if (key === 'getter' || key === 'function') continue;
      const value = vnode[key];
      if (typeof value === 'function') continue;
      result[key] = serializeVNode(value, depth + 1);
    }
    return result;
  }
  return vnode;
}

describe('Complex Marks and Decorators', () => {
  const registry = getGlobalRegistry();
  const builder = new VNodeBuilder(registry);

  beforeEach(() => {
    // Define marks
    define('mark:bold', element('strong', { className: 'mark-bold' }, []));
    define('mark:italic', element('em', { className: 'mark-italic' }, []));
    define('mark:underline', element('u', { className: 'mark-underline' }, []));
    define('mark:code', element('code', { className: 'mark-code' }, []));
    
    // Define Decorators
    defineDecorator('highlight', element('span', { className: 'highlight' }, []));
    defineDecorator('comment', element('div', { className: 'comment' }, []));
    defineDecorator('link', element('a', { className: 'link' }, []));
  });

  it('should handle multiple overlapping marks with decorators', () => {
    define('paragraph', element('p', {}, [data('text')]));
    
    // Text: "This is bold and italic text with code"
    // Marks:
    // - bold: [8, 12] "bold"
    // - italic: [13, 19] "and italic"
    // - code: [30, 34] "code"
    // Decorators:
    // - highlight: [0, 25] "This is bold and italic"
    // - comment: [26, 34] "text with code"
    const model = {
      stype: 'paragraph',
      sid: 'p1',
      text: 'This is bold and italic text with code',
      marks: [
        { type: 'bold', range: [8, 12] },      // "bold"
        { type: 'italic', range: [13, 19] },  // "and italic"
        { type: 'code', range: [30, 34] }     // "code"
      ]
    };
    
    const decorators: DecoratorData[] = [
      {
        sid: 'd1',
        stype: 'highlight',
        type: 'highlight',
        category: 'inline',
        target: { sid: 'p1', startOffset: 0, endOffset: 25 }
      },
      {
        sid: 'd2',
        stype: 'comment',
        type: 'comment',
        category: 'inline',
        target: { sid: 'p1', startOffset: 26, endOffset: 34 }
      }
    ];
    
    const vnode = builder.build('paragraph', model, { decorators });
    const serialized = serializeVNode(vnode);
    
    console.log('\n=== Multiple Overlapping Marks with Decorators ===');
    console.log(JSON.stringify(serialized, null, 2));
    
    // Verification
    expect(vnode).toBeTruthy();
    expect(vnode.tag).toBe('p');
    expect(vnode.children).toBeTruthy();
    expect(Array.isArray(vnode.children)).toBe(true);
  });

  it('should handle nested marks inside decorators', () => {
    define('paragraph', element('p', {}, [data('text')]));
    
    // Text: "Bold text with highlight"
    // Marks:
    // - bold: [0, 9] "Bold text"
    // Decorators:
    // - highlight: [5, 25] "text with highlight"
    // Result: "Bold " (normal) + "text" (bold) inside highlight decorator + " with highlight" (normal)
    const model = {
      stype: 'paragraph',
      sid: 'p2',
      text: 'Bold text with highlight',
      marks: [
        { type: 'bold', range: [0, 9] }  // "Bold text"
      ]
    };
    
    const decorators: DecoratorData[] = [
      {
        sid: 'd3',
        stype: 'highlight',
        type: 'highlight',
        category: 'inline',
        target: { sid: 'p2', startOffset: 5, endOffset: 25 }
      }
    ];
    
    const vnode = builder.build('paragraph', model, { decorators });
    const serialized = serializeVNode(vnode);
    
    console.log('\n=== Nested Marks Inside Decorators ===');
    console.log(JSON.stringify(serialized, null, 2));
    
    expect(vnode).toBeTruthy();
    expect(vnode.children).toBeTruthy();
  });

  it('should handle multiple decorators overlapping with marks', () => {
    define('paragraph', element('p', {}, [data('text')]));
    
    // Text: "Link and highlight text"
    // Marks:
    // - bold: [0, 4] "Link"
    // - italic: [9, 18] "highlight"
    // Decorators:
    // - link: [0, 4] "Link"
    // - highlight: [9, 25] "highlight text"
    const model = {
      stype: 'paragraph',
      sid: 'p3',
      text: 'Link and highlight text',
      marks: [
        { type: 'bold', range: [0, 4] },      // "Link"
        { type: 'italic', range: [9, 18] }   // "highlight"
      ]
    };
    
    const decorators: DecoratorData[] = [
      {
        sid: 'd4',
        stype: 'link',
        type: 'link',
        category: 'inline',
        target: { sid: 'p3', startOffset: 0, endOffset: 4 }
      },
      {
        sid: 'd5',
        stype: 'highlight',
        type: 'highlight',
        category: 'inline',
        target: { sid: 'p3', startOffset: 9, endOffset: 25 }
      }
    ];
    
    const vnode = builder.build('paragraph', model, { decorators });
    const serialized = serializeVNode(vnode);
    
    console.log('\n=== Multiple Decorators Overlapping with Marks ===');
    console.log(JSON.stringify(serialized, null, 2));
    
    expect(vnode).toBeTruthy();
  });

  it('should handle complex scenario: marks, inline decorators, and block decorators', () => {
    define('paragraph', element('p', {}, [data('text')]));
    
    // Text: "Complex text with everything"
    // Marks:
    // - bold: [0, 7] "Complex"
    // - italic: [8, 12] "text"
    // - underline: [13, 16] "with"
    // Inline Decorator:
    // - highlight: [17, 27] "everything"
    // Block Decorator:
    // - comment: entire paragraph
    const model = {
      stype: 'paragraph',
      sid: 'p4',
      text: 'Complex text with everything',
      marks: [
        { type: 'bold', range: [0, 7] },        // "Complex"
        { type: 'italic', range: [8, 12] },    // "text"
        { type: 'underline', range: [13, 16] } // "with"
      ]
    };
    
    const decorators: DecoratorData[] = [
      {
        sid: 'd6',
        stype: 'highlight',
        type: 'highlight',
        category: 'inline',
        target: { sid: 'p4', startOffset: 17, endOffset: 27 }
      },
      {
        sid: 'd7',
        stype: 'comment',
        type: 'comment',
        category: 'block',
        target: { sid: 'p4' }
      }
    ];
    
    const vnode = builder.build('paragraph', model, { decorators });
    const serialized = serializeVNode(vnode);
    
    console.log('\n=== Complex: Marks + Inline + Block Decorators ===');
    console.log(JSON.stringify(serialized, null, 2));
    
    expect(vnode).toBeTruthy();
    expect(vnode.children).toBeTruthy();
  });

  it('should handle deeply nested marks and decorators', () => {
    define('paragraph', element('p', {}, [data('text')]));
    
    // Text: "A B C D E"
    // Marks:
    // - bold: [2, 3] "B"
    // - italic: [4, 5] "C"
    // - underline: [6, 7] "D"
    // Decorator:
    // - highlight: [2, 7] "B C D"
    // Result: "A " + "B" (bold) + " " + "C" (italic) + " " + "D" (underline) inside highlight decorator + " E"
    const model = {
      stype: 'paragraph',
      sid: 'p5',
      text: 'A B C D E',
      marks: [
        { type: 'bold', range: [2, 3] },        // "B"
        { type: 'italic', range: [4, 5] },     // "C"
        { type: 'underline', range: [6, 7] }   // "D"
      ]
    };
    
    const decorators: DecoratorData[] = [
      {
        sid: 'd8',
        stype: 'highlight',
        type: 'highlight',
        category: 'inline',
        target: { sid: 'p5', startOffset: 2, endOffset: 7 }
      }
    ];
    
    const vnode = builder.build('paragraph', model, { decorators });
    const serialized = serializeVNode(vnode);
    
    console.log('\n=== Deeply Nested Marks and Decorators ===');
    console.log(JSON.stringify(serialized, null, 2));
    
    expect(vnode).toBeTruthy();
  });
});

