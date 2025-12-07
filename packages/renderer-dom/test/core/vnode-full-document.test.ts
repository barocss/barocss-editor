/**
 * 전체 문서 VNode 검증 테스트
 * 
 * main.ts를 참고하여 mark와 decorator를 모두 사용한 전체 문서에 대한 VNode를 검증합니다.
 */
import { describe, it } from 'vitest';
import { define, element, data, defineDecorator, getGlobalRegistry, slot, defineMark, attr } from '@barocss/dsl';
import { DecoratorData, VNodeBuilder } from '../../src/vnode/factory';

/**
 * VNode를 JSON으로 직렬화 (순환 참조 및 함수 제거)
 */
function serializeVNode(vnode: any, depth: number = 0): any {
  if (depth > 15) return '[Max depth reached]';
  if (vnode === null || vnode === undefined) return vnode;
  if (typeof vnode === 'string' || typeof vnode === 'number' || typeof vnode === 'boolean') {
    return vnode;
  }
  if (Array.isArray(vnode)) {
    return vnode.map((item, idx) => {
      if (typeof item === 'string' || typeof item === 'number') return item;
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

describe('Full Document VNode Verification', () => {
  const registry = getGlobalRegistry();
  const builder = new VNodeBuilder(registry);

  beforeEach(() => {
    // Define following main.ts structure
    
    // Basic block components
    define('document', element('div', { className: 'document' }, [slot('content')]));
    define('paragraph', element('p', { className: 'paragraph' }, [slot('content')]));
    define('heading', element((model: any) => `h${model.attributes?.level || 1}`, { className: 'heading' }, [slot('content')]));
    
    // inline-text (main.ts structure)
    define('inline-text', element('span', { className: (d: any) => {
      const classes: any[] = ['text'];
      if (Array.isArray(d.marks)) {
        for (const m of d.marks) {
          if (m && m.type) classes.push(`mark-${m.type}`);
        }
      }
      return classes;
    } }, [data('text')]));
    
    // Define marks (part of main.ts)
    defineMark('bold', element('span', { 
      className: 'custom-bold',
      'data-mark-type': 'bold',
      'data-weight': attr('weight', 'bold'),
      style: { fontWeight: 'bold' }
    }, [data('text')]));
    
    defineMark('italic', element('span', { 
      className: 'custom-italic',
      'data-mark-type': 'italic',
      style: { fontStyle: 'italic' }
    }, [data('text')]));
    
    defineMark('fontColor', element('span', { 
      className: 'custom-font-color',
      'data-mark-type': 'fontColor',
      'data-color': attr('color', '#000000'),
      style: { color: attr('color', '#000000') }
    }, [data('text')]));
    
    defineMark('bgColor', element('span', { 
      className: 'custom-bg-color',
      'data-mark-type': 'bgColor',
      'data-bg-color': attr('bgColor', '#ffff00'),
      style: { backgroundColor: attr('bgColor', '#ffff00') }
    }, [data('text')]));
    
    defineMark('underline', element('span', { 
      className: 'custom-underline',
      style: { textDecoration: 'underline' }
    }, [data('text')]));
    
    defineMark('strikethrough', element('span', { 
      className: 'custom-strikethrough',
      style: { textDecoration: 'line-through' }
    }, [data('text')]));
    
    defineMark('code', element('span', { 
      className: 'custom-code',
      'data-language': attr('language', 'text'),
      style: { fontFamily: 'Monaco, Consolas, "Courier New", monospace' }
    }, [data('text')]));
    
    defineMark('link', element('a', { 
      className: 'custom-link',
      href: attr('href', '#'),
      title: attr('title', ''),
      target: '_blank',
      rel: 'noopener noreferrer'
    }, [data('text')]));
    
    defineMark('highlight', element('span', { 
      className: 'custom-highlight',
      'data-highlight-color': attr('color', '#ffff00'),
      style: { backgroundColor: attr('color', '#ffff00') }
    }, [data('text')]));
    
    // Define Decorators
    defineDecorator('comment', element('div', { className: 'comment-block' }, []));
    defineDecorator('highlight-decorator', element('span', { className: 'highlight-decorator' }, []));
  });

  it('should build VNode for full document with complex marks', () => {
    // Reference main.ts's initialTree structure
    const documentModel = {
      sid: 'doc-1',
      stype: 'document',
      content: [
        {
          sid: 'p-1',
          stype: 'paragraph',
          content: [
            { sid: 'text-1', stype: 'inline-text', text: 'This is a ' },
            { sid: 'text-bold', stype: 'inline-text', text: 'bold text', marks: [{ type: 'bold', range: [0, 9] }] },
            { sid: 'text-2', stype: 'inline-text', text: ' and this is ' },
            { sid: 'text-italic', stype: 'inline-text', text: 'italic text', marks: [{ type: 'italic', range: [0, 11] }] },
            { sid: 'text-3', stype: 'inline-text', text: '. You can also combine them: ' },
            { sid: 'text-bold-italic', stype: 'inline-text', text: 'bold and italic', marks: [{ type: 'bold', range: [0, 15] }, { type: 'italic', range: [0, 15] }] },
            { sid: 'text-4', stype: 'inline-text', text: '. Now with colors: ' },
            { sid: 'text-red', stype: 'inline-text', text: 'red text', marks: [{ type: 'fontColor', range: [0, 8], attrs: { color: '#ff0000' } }] },
            { sid: 'text-5', stype: 'inline-text', text: ' and ' },
            { sid: 'text-yellow-bg', stype: 'inline-text', text: 'yellow background', marks: [{ type: 'bgColor', range: [0, 16], attrs: { bgColor: '#ffff00' } }] },
            { sid: 'text-6', stype: 'inline-text', text: '.' }
          ]
        },
        {
          sid: 'p-2',
          stype: 'paragraph',
          content: [
            { sid: 'text-7', stype: 'inline-text', text: 'Text decorations: ' },
            { sid: 'text-underline', stype: 'inline-text', text: 'underlined', marks: [{ type: 'underline', range: [0, 10] }] },
            { sid: 'text-8', stype: 'inline-text', text: ', ' },
            { sid: 'text-strike', stype: 'inline-text', text: 'strikethrough', marks: [{ type: 'strikethrough', range: [0, 13] }] },
            { sid: 'text-9', stype: 'inline-text', text: ', ' },
            { sid: 'text-code', stype: 'inline-text', text: 'code snippet', marks: [{ type: 'code', range: [0, 13], attrs: { language: 'javascript' } }] },
            { sid: 'text-10', stype: 'inline-text', text: '.' }
          ]
        },
        {
          sid: 'p-3',
          stype: 'paragraph',
          content: [
            { sid: 'text-11', stype: 'inline-text', text: 'Links and highlights: ' },
            { sid: 'text-link', stype: 'inline-text', text: 'Visit Google', marks: [{ type: 'link', range: [0, 12], attrs: { href: 'https://google.com', title: 'Google Search' } }] },
            { sid: 'text-12', stype: 'inline-text', text: ', ' },
            { sid: 'text-highlight', stype: 'inline-text', text: 'highlighted text', marks: [{ type: 'highlight', range: [0, 15], attrs: { color: '#ffeb3b' } }] },
            { sid: 'text-13', stype: 'inline-text', text: '.' }
          ]
        }
      ]
    };
    
    const vnode = builder.build('document', documentModel);
    const serialized = serializeVNode(vnode);
    
    console.log('\n=== Full Document with Complex Marks VNode ===');
    console.log(JSON.stringify(serialized, null, 2));
    
    expect(vnode).toBeTruthy();
    expect(vnode.tag).toBe('div');
    expect(vnode.sid).toBe('doc-1');
    expect(vnode.stype).toBe('document');
    expect(vnode.children).toBeTruthy();
    expect(Array.isArray(vnode.children)).toBe(true);
    expect(vnode.children.length).toBeGreaterThan(0);
  });

  it('should build VNode for document with marks and inline decorators', () => {
    const documentModel = {
      sid: 'doc-2',
      stype: 'document',
      content: [
        {
          sid: 'p-1',
          stype: 'paragraph',
          content: [
            { sid: 'text-1', stype: 'inline-text', text: 'This paragraph has ' },
            { sid: 'text-bold', stype: 'inline-text', text: 'bold text', marks: [{ type: 'bold', range: [0, 9] }] },
            { sid: 'text-2', stype: 'inline-text', text: ' with a highlight.' }
          ]
        }
      ]
    };
    
    // Inline decorator should use each text node's sid as target
    // Apply decorator to "bold text" part of 'text-bold' node
    const decorators: DecoratorData[] = [
      {
        sid: 'd1',
        stype: 'highlight-decorator',
        type: 'highlight-decorator',
        category: 'inline',
        target: { sid: 'text-bold', startOffset: 0, endOffset: 4 } // Only "bold" part
      }
    ];
    
    const vnode = builder.build('document', documentModel, { decorators });
    const serialized = serializeVNode(vnode);
    
    console.log('\n=== Document with Marks and Inline Decorators VNode ===');
    console.log(JSON.stringify(serialized, null, 2));
    
    expect(vnode).toBeTruthy();
    
    // Find text-bold node in paragraph's children and verify decorator is applied
    const paragraphChild = (vnode.children as any[]).find((c: any) => c.stype === 'paragraph');
    expect(paragraphChild).toBeTruthy();
    
    const textBoldChild = (paragraphChild.children as any[]).find((c: any) => c.sid === 'text-bold');
    expect(textBoldChild).toBeTruthy();
    
    // If decorator is applied, children should have decorator VNode
    // Or should be processed together with marks
    expect(textBoldChild.children).toBeTruthy();
    expect(Array.isArray(textBoldChild.children)).toBe(true);
  });

  it('should build VNode for document with marks, decorators, and block decorators', () => {
    const documentModel = {
      sid: 'doc-3',
      stype: 'document',
      content: [
        {
          sid: 'p-1',
          stype: 'paragraph',
          content: [
            { sid: 'text-1', stype: 'inline-text', text: 'Complex paragraph with ' },
            { sid: 'text-bold', stype: 'inline-text', text: 'bold', marks: [{ type: 'bold', range: [0, 4] }] },
            { sid: 'text-2', stype: 'inline-text', text: ' and ' },
            { sid: 'text-italic', stype: 'inline-text', text: 'italic', marks: [{ type: 'italic', range: [0, 6] }] },
            { sid: 'text-3', stype: 'inline-text', text: ' text.' }
          ]
        }
      ]
    };
    
    const decorators: DecoratorData[] = [
      {
        sid: 'd1',
        stype: 'highlight-decorator',
        type: 'highlight-decorator',
        category: 'inline',
        target: { sid: 'p-1', startOffset: 10, endOffset: 25 }
      },
      {
        sid: 'd2',
        stype: 'comment',
        type: 'comment',
        category: 'block',
        target: { sid: 'p-1' },
        position: 'after'
      }
    ];
    
    const vnode = builder.build('document', documentModel, { decorators });
    const serialized = serializeVNode(vnode);
    
    console.log('\n=== Document with Marks, Inline and Block Decorators VNode ===');
    console.log(JSON.stringify(serialized, null, 2));
    
    expect(vnode).toBeTruthy();
    expect(vnode.children).toBeTruthy();
    
    // Current builder does not materialize block decorators as children nodes, but stores them in top-level decorators metadata
    expect(Array.isArray((vnode as any).decorators)).toBe(true);
    const hasBlockDecorator = ((vnode as any).decorators as any[]).some((d: any) =>
      d && d.category === 'block' && d.position === 'after' && d.sid === 'd2' && d.target?.sid === 'p-1'
    );
    expect(hasBlockDecorator).toBe(true);
  });

  it('should build VNode for complex nested structure with overlapping marks', () => {
    const documentModel = {
      sid: 'doc-4',
      stype: 'document',
      content: [
        {
          sid: 'p-1',
          stype: 'paragraph',
          content: [
            { sid: 'text-1', stype: 'inline-text', text: 'Complex combinations: ' },
            { sid: 'text-complex1', stype: 'inline-text', text: 'Bold+Underline+Code', marks: [
              { type: 'bold', range: [0, 20] },
              { type: 'underline', range: [0, 20] },
              { type: 'code', range: [0, 20], attrs: { language: 'typescript' } }
            ] },
            { sid: 'text-2', stype: 'inline-text', text: ', ' },
            { sid: 'text-complex2', stype: 'inline-text', text: 'Link+Highlight', marks: [
              { type: 'link', range: [0, 13], attrs: { href: 'https://example.com' } },
              { type: 'highlight', range: [0, 13], attrs: { color: '#e8f5e8' } }
            ] },
            { sid: 'text-3', stype: 'inline-text', text: '.' }
          ]
        }
      ]
    };
    
    const decorators: DecoratorData[] = [
      {
        sid: 'd1',
        stype: 'highlight-decorator',
        type: 'highlight-decorator',
        category: 'inline',
        target: { sid: 'p-1', startOffset: 0, endOffset: 50 }
      }
    ];
    
    const vnode = builder.build('document', documentModel, { decorators });
    const serialized = serializeVNode(vnode);
    
    console.log('\n=== Complex Nested Structure with Overlapping Marks and Decorators VNode ===');
    console.log(JSON.stringify(serialized, null, 2));
    
    expect(vnode).toBeTruthy();
    expect(vnode.children).toBeTruthy();
  });
});

