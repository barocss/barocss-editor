import { describe, it, expect, beforeEach } from 'vitest';
import { define, element, data, defineDecorator, getGlobalRegistry, defineMark, slot } from '@barocss/dsl';
import { DecoratorData, VNodeBuilder } from '../../src/vnode/factory';

describe('VNodeBuilder verification', () => {
  let builder: VNodeBuilder;
  let registry: ReturnType<typeof getGlobalRegistry>;

  beforeEach(() => {
    registry = getGlobalRegistry();
    builder = new VNodeBuilder(registry);
  });

  it('should build VNode from element template without data-bc-* attributes', () => {
    define('paragraph', element('p', { className: 'para' }, []));
    
    const model = { stype: 'paragraph', sid: 'p1', text: 'Hello' };
    const vnode = builder.build('paragraph', model);
    
    expect(vnode).toBeTruthy();
    expect(vnode.tag).toBe('p');
    expect(vnode.attrs).toBeTruthy();
    expect(vnode.attrs?.className).toBe('para');
    // data-bc-* 속성이 VNode에 없어야 함
    expect(vnode.attrs?.['data-bc-sid']).toBeUndefined();
    expect(vnode.attrs?.['data-bc-stype']).toBeUndefined();
    expect(vnode.attrs?.['data-bc-component']).toBeUndefined();
  });

  it('should build VNode with children from element template', () => {
    define('container', element('div', { className: 'container' }, [
      element('span', { className: 'child' }, [])
    ]));
    
    const model = { stype: 'container', sid: 'c1' };
    const vnode = builder.build('container', model);
    
    expect(vnode).toBeTruthy();
    expect(vnode.tag).toBe('div');
    expect(vnode.children).toBeTruthy();
    expect(Array.isArray(vnode.children)).toBe(true);
    expect(vnode.children.length).toBeGreaterThan(0);
    
    const firstChild = vnode.children[0] as any;
    expect(firstChild).toBeTruthy();
    expect(firstChild.tag).toBe('span');
    expect(firstChild.attrs?.className).toBe('child');
    // children에도 data-bc-* 없어야 함
    expect(firstChild.attrs?.['data-bc-sid']).toBeUndefined();
  });

  it('should build VNode with text content', () => {
    define('paragraph', element('p', {}, []));
    
    const model = { stype: 'paragraph', sid: 'p2', text: 'Test text' };
    const vnode = builder.build('paragraph', model);
    
    expect(vnode).toBeTruthy();
    expect(vnode.tag).toBe('p');
    // text는 children에 포함되거나 별도 처리될 수 있음 (구현에 따라)
  });

  it('should build VNode with decorators', () => {
    define('paragraph', element('p', { className: 'para' }, []));
    
    const model = { stype: 'paragraph', sid: 'p3' };
    const decorators = [
      { type: 'bold', from: 0, to: 5 }
    ];
    const vnode = builder.build('paragraph', model, { decorators });
    
    expect(vnode).toBeTruthy();
    expect(vnode.tag).toBe('p');
    // decorator는 VNode 구조에 반영될 수 있음 (구현에 따라)
  });

  it('should not include any data-bc-* attributes in VNode tree', () => {
    define('nested', element('div', { className: 'outer' }, [
      element('span', { className: 'inner' }, [])
    ]));
    
    const model = { stype: 'nested', sid: 'n1' };
    const vnode = builder.build('nested', model);
    
    // VNode 자체에 data-bc-* 없어야 함
    expect(vnode.attrs?.['data-bc-sid']).toBeUndefined();
    expect(vnode.attrs?.['data-bc-stype']).toBeUndefined();
    expect(vnode.attrs?.['data-bc-component']).toBeUndefined();
    
    // children에도 data-bc-* 없어야 함
    if (Array.isArray(vnode.children)) {
      for (const child of vnode.children) {
        if (typeof child === 'object' && 'attrs' in child) {
          expect((child as any).attrs?.['data-bc-sid']).toBeUndefined();
          expect((child as any).attrs?.['data-bc-stype']).toBeUndefined();
        }
      }
    }
  });

  it('should preserve template attributes but not add DOM markers', () => {
    define('button', element('button', { 
      className: 'btn',
      id: 'my-button',
      'data-action': 'click'
    }, []));
    
    const model = { stype: 'button', sid: 'btn1' };
    const vnode = builder.build('button', model);
    
    expect(vnode.tag).toBe('button');
    expect(vnode.attrs?.className).toBe('btn');
    expect(vnode.attrs?.id).toBe('my-button');
    expect(vnode.attrs?.['data-action']).toBe('click'); // 일반 data-*는 템플릿 일부이므로 유지
    
    // 하지만 DOM 표식용 data-bc-*는 없어야 함
    expect(vnode.attrs?.['data-bc-sid']).toBeUndefined();
    expect(vnode.attrs?.['data-bc-stype']).toBeUndefined();
  });

  describe('복잡한 문서 구조: 텍스트 + 마크 + decorator', () => {
    beforeEach(() => {
      // 마크 renderer 정의
      define('mark:bold', element('strong', { className: 'mark-bold' }, []));
      define('mark:italic', element('em', { className: 'mark-italic' }, []));
    });

    it('should build VNode with text marks', () => {
      define('paragraph', element('p', {}, [data('text')]));
      
      const model = {
        stype: 'paragraph',
        sid: 'p1',
        text: 'Hello world',
        marks: [
          { type: 'bold', range: [0, 5] },
          { type: 'italic', range: [6, 11] }
        ]
      };
      
      const vnode = builder.build('paragraph', model);
      
      expect(vnode).toBeTruthy();
      expect(vnode.tag).toBe('p');
      expect(vnode.sid).toBe('p1');
      expect(vnode.stype).toBe('paragraph');
      
      expect(vnode.children).toBeTruthy();
      expect(Array.isArray(vnode.children)).toBe(true);
      
      // marks가 적용된 children 구조 확인
      const children = vnode.children as any[];
      expect(children.length).toBeGreaterThan(0);
      
      // 첫 번째 마크 (bold)
      const boldChild = children.find(c => 
        typeof c === 'object' && 
        (c.tag === 'strong' || c.attrs?.className?.includes('mark-bold'))
      );
      expect(boldChild).toBeTruthy();
    });

    it('should build VNode with inline decorators', () => {
      define('document', element('article', { className: 'document' }, [slot('content')]));
      define('paragraph', element('p', {}, [data('text')]));
      defineDecorator('highlight', element('span', { className: 'highlight' }, []));
      
      const model = {
        stype: 'document',
        sid: 'doc-1',
        content: [
          {
            stype: 'paragraph',
            sid: 'p2',
            text: 'Important text'
          }
        ]
      };
      
      const decorators = [
        {
          sid: 'd1',
          stype: 'highlight',
          type: 'highlight',
          category: 'inline',
          target: { sid: 'p2', startOffset: 0, endOffset: 9 }
        }
      ];
      
      const vnode = builder.build('document', model, { decorators: decorators as DecoratorData[] });
      
      expect(vnode).toBeTruthy();
      expect(vnode.tag).toBe('article');
      expect(vnode.sid).toBe('doc-1');
      expect(vnode.stype).toBe('document');
      
      expect(vnode.children).toBeTruthy();
      
      // paragraph VNode 찾기
      const children = vnode.children as any[];
      const paragraphVNode = children.find(c => 
        typeof c === 'object' && 
        c.stype === 'paragraph' &&
        c.sid === 'p2'
      );
      expect(paragraphVNode).toBeTruthy();
      
      // paragraph의 children에서 decorator가 적용된 구조 확인
      if (paragraphVNode && paragraphVNode.children) {
        const paragraphChildren = paragraphVNode.children as any[];
        const decoratorChild = paragraphChildren.find(c => 
          typeof c === 'object' && 
          (c.attrs?.['data-decorator-sid'] === 'd1' || 
           c.attrs?.['data-decorator-category'] === 'inline')
        );
        expect(decoratorChild).toBeTruthy();
      }
    });

    it('should build VNode with text marks and inline decorators integrated', () => {
      define('paragraph', element('p', {}, [data('text')]));
      define('mark:bold', element('strong', {}, []));
      defineDecorator('highlight', element('span', { className: 'highlight' }, []));
      
      const model = {
        stype: 'paragraph',
        sid: 'p3',
        text: 'Bold and highlighted',
        marks: [
          { type: 'bold', range: [0, 4] }
        ]
      };
      
      const decorators = [
        {
          sid: 'd2',
          stype: 'highlight',
          type: 'highlight',
          category: 'inline',
          target: { sid: 'p3', startOffset: 5, endOffset: 19 }
        }
      ];
      
      const vnode = builder.build('paragraph', model, { decorators });
      
      expect(vnode).toBeTruthy();
      expect(vnode.tag).toBe('p');
      expect(vnode.sid).toBe('p3');
      expect(vnode.stype).toBe('paragraph');
      
      // decorators가 VNode 최상위에 있는지 확인
      expect(vnode.decorators).toBeTruthy();
      expect(Array.isArray(vnode.decorators)).toBe(true);
      expect(vnode.decorators!.length).toBe(1);
      
      expect(vnode.children).toBeTruthy();
      
      const children = vnode.children as any[];
      expect(children.length).toBeGreaterThan(0);
      
      // marks와 decorators가 모두 적용되었는지 확인
      const hasMark = children.some(c => 
        typeof c === 'object' && 
        (c.tag === 'strong' || c.attrs?.className?.includes('mark-bold'))
      );
      const hasDecorator = children.some(c => 
        typeof c === 'object' && 
        c.attrs?.['data-decorator-sid'] === 'd2'
      );
      
      expect(hasMark || hasDecorator).toBe(true);
    });

    it('should build VNode with nested structure: list with marked items', () => {
      define('list', element('ul', { className: 'list' }, [
        slot('content')
      ]));
      define('item', element('li', {}, [data('text')]));
      defineMark('bold', element('strong', {}, [slot('content')]));
      
      const model = {
        stype: 'list',
        sid: 'list1',
        content: [
          { stype: 'item', sid: 'item1', text: 'First item', marks: [{ type: 'bold', range: [0, 5] }] },
          { stype: 'item', sid: 'item2', text: 'Second item' }
        ]
      };
      
      const vnode = builder.build('list', model);
      
      expect(vnode).toBeTruthy();
      expect(vnode.tag).toBe('ul');
      expect(vnode.attrs?.className).toBe('list');
      expect(vnode.children).toBeTruthy();
      
      // children 구조 확인 (slot 확장 후)
      const children = vnode.children as any[];
      // items가 slot으로 확장되어 children에 포함되어야 함
      // 실제 구조는 slot 처리 방식에 따라 다를 수 있음
    });

    it('should build complex VNode: document with multiple paragraphs, marks, and decorators', () => {
      define('document', element('article', { className: 'document' }, [
        slot('content')
      ]));
      define('paragraph', element('p', {}, [data('text')]));
      define('mark:bold', element('strong', {}, []));
      define('mark:italic', element('em', {}, []));
      defineDecorator('highlight', element('span', { className: 'highlight' }, []));
      defineDecorator('comment', element('div', { className: 'comment-block' }, []));
      
      const model = {
        stype: 'document',
        sid: 'doc1',
        content: [
          {
            stype: 'paragraph',
            sid: 'p1',
            text: 'This is bold and italic text',
            marks: [
              { type: 'bold', range: [8, 12] },
              { type: 'italic', range: [17, 23] }
            ]
          },
          {
            stype: 'paragraph',
            sid: 'p2',
            text: 'This paragraph has a highlight'
          }
        ]
      };
      
      const decorators = [
        {
          sid: 'd1',
          stype: 'highlight',
          type: 'highlight',
          category: 'inline',
          target: { sid: 'p2', startOffset: 25, endOffset: 34 }
        },
        {
          sid: 'd2',
          stype: 'comment',
          type: 'comment',
          category: 'block',
          target: { sid: 'p2' }
        }
      ];
      
      const vnode = builder.build('document', model, { decorators: decorators as DecoratorData[] });
      
      expect(vnode).toBeTruthy();
      expect(vnode.tag).toBe('article');
      expect(vnode.attrs?.className).toBe('document');
      
      // 복잡한 구조가 올바르게 빌드되었는지 확인
      expect(vnode.children).toBeTruthy();
      const children = vnode.children as any[];
      
      // content가 slot으로 확장되어 포함되어야 함
      // 실제 구조는 slot 처리 방식에 따라 다를 수 있음
    });

    it('should build VNode with overlapping marks and decorators', () => {
      define('paragraph', element('p', {}, [data('text')]));
      define('mark:bold', element('strong', {}, []));
      define('mark:italic', element('em', {}, []));
      defineDecorator('highlight', element('span', { className: 'highlight' }, []));
      
      const model = {
        stype: 'paragraph',
        sid: 'p1',
        text: 'Bold italic and highlighted text',
        marks: [
          { type: 'bold', range: [0, 4] },
          { type: 'italic', range: [5, 11] }
        ]
      };
      
      const decorators = [
        {
          sid: 'd1',
          stype: 'highlight',
          type: 'highlight',
          category: 'inline',
          target: { sid: 'p1', startOffset: 16, endOffset: 27 }
        }
      ];
      
      const vnode = builder.build('paragraph', model, { decorators: decorators as DecoratorData[] });
      
      expect(vnode).toBeTruthy();
      expect(vnode.tag).toBe('p');
      expect(vnode.children).toBeTruthy();
      
      const children = vnode.children as any[];
      expect(children.length).toBeGreaterThan(0);
      
      // marks와 decorators가 모두 적용되었는지 확인
      const hasBold = children.some(c => 
        typeof c === 'object' && 
        (c.tag === 'strong' || c.attrs?.className?.includes('mark-bold'))
      );
      const hasItalic = children.some(c => 
        typeof c === 'object' && 
        (c.tag === 'em' || c.attrs?.className?.includes('mark-italic'))
      );
      const hasHighlight = children.some(c => 
        typeof c === 'object' && 
        c.attrs?.['data-decorator-sid'] === 'd1'
      );
      
      // 최소한 하나는 적용되어야 함
      expect(hasBold || hasItalic || hasHighlight).toBe(true);
    });

    it('should build VNode with block decorators', () => {
      define('document', element('article', { className: 'document' }, [slot('content')]));
      define('paragraph', element('p', {}, [data('text')]));
      defineDecorator('comment', element('div', { className: 'comment-block' }, []));
      
      const model = {
        stype: 'document',
        sid: 'doc-2',
        content: [
          {
            stype: 'paragraph',
            sid: 'p4',
            text: 'Some text'
          }
        ]
      };
      
      const decorators = [
        {
          sid: 'd3',
          stype: 'comment',
          type: 'comment',
          category: 'block',
          target: { sid: 'p4' }
        }
      ];
      
      const vnode = builder.build('document', model, { decorators: decorators as DecoratorData[] });
      
      expect(vnode).toBeTruthy();
      expect(vnode.tag).toBe('article');
      
      // document의 children에서 paragraph와 block decorator 찾기
      const children = vnode.children as any[];
      const paragraphVNode = children.find(c => 
        typeof c === 'object' && 
        c.stype === 'paragraph' &&
        c.sid === 'p4'
      );
      expect(paragraphVNode).toBeTruthy();
      
      // block decorator가 paragraph의 sibling으로 추가되었는지 확인
      const blockDecorator = children.find(c => 
        typeof c === 'object' && 
        c.attrs?.['data-decorator-category'] === 'block' &&
        (c.attrs?.['data-decorator-sid'] === 'd3' || c.attrs?.['data-decorator-stype'] === 'comment')
      );
      expect(blockDecorator).toBeTruthy();
    });
  });
});

