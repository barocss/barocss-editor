/**
 * Block Decorator Position 테스트
 * 
 * Block decorator의 position 정보가 제대로 저장되고 적용되는지 확인합니다.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { define, element, data, defineDecorator, getGlobalRegistry, slot } from '@barocss/dsl';
import { DecoratorData, VNodeBuilder } from '../../src/vnode/factory';

describe('Block Decorator Position', () => {
  let builder: VNodeBuilder;
  let registry: ReturnType<typeof getGlobalRegistry>;

  beforeEach(() => {
    registry = getGlobalRegistry();
    builder = new VNodeBuilder(registry);
    
    define('document', element('article', { className: 'document' }, [slot('content')]));
    define('paragraph', element('p', {}, [data('text')]));
    defineDecorator('comment', element('div', { className: 'comment-block' }, []));
  });

  it('should store position information in VNode attrs when provided', () => {
    const model = {
      stype: 'document',
      sid: 'doc-1',
      content: [
        {
          stype: 'paragraph',
          sid: 'p1',
          text: 'Some text'
        }
      ]
    };
    
    const decorators: DecoratorData[] = [
      {
        sid: 'd1',
        stype: 'comment',
        type: 'comment',
        category: 'block',
        target: { sid: 'p1' },
        position: 'before'
      }
    ];
    
    const vnode = builder.build('document', model, { decorators });
    
    expect(vnode).toBeTruthy();
    expect(vnode.children).toBeTruthy();
    
    const children = vnode.children as any[];
    const blockDecorator = children.find(c => 
      typeof c === 'object' && 
      c.decoratorCategory === 'block'
    );
    
    expect(blockDecorator).toBeTruthy();
    expect(blockDecorator.decoratorPosition).toBe('before');
    expect(blockDecorator.decoratorSid).toBe('d1');
    expect(blockDecorator.decoratorStype).toBe('comment');
    expect(blockDecorator.decoratorCategory).toBe('block');
  });

  it('should use default position when position is not provided', () => {
    const model = {
      stype: 'document',
      sid: 'doc-2',
      content: [
        {
          stype: 'paragraph',
          sid: 'p2',
          text: 'Some text'
        }
      ]
    };
    
    const decorators: DecoratorData[] = [
      {
        sid: 'd2',
        stype: 'comment',
        type: 'comment',
        category: 'block',
        target: { sid: 'p2' }
        // position 없음
      }
    ];
    
    const vnode = builder.build('document', model, { decorators });
    
    expect(vnode).toBeTruthy();
    expect(vnode.children).toBeTruthy();
    
    const children = vnode.children as any[];
    const blockDecorator = children.find(c => 
      typeof c === 'object' && 
      c.decoratorCategory === 'block'
    );
    
    expect(blockDecorator).toBeTruthy();
    // position이 없으면 기본값 'after' 사용
    expect(blockDecorator.decoratorPosition).toBe('after');
  });

  it('should apply before position correctly', () => {
    const model = {
      stype: 'document',
      sid: 'doc-3',
      content: [
        {
          stype: 'paragraph',
          sid: 'p3',
          text: 'Some text'
        }
      ]
    };
    
    const decorators: DecoratorData[] = [
      {
        sid: 'd3',
        stype: 'comment',
        type: 'comment',
        category: 'block',
        target: { sid: 'p3' },
        position: 'before'
      }
    ];
    
    const vnode = builder.build('document', model, { decorators });
    
    expect(vnode.children).toBeTruthy();
    const children = vnode.children as any[];
    
    // before position이면 paragraph 앞에 decorator가 추가되어야 함
    const firstChild = children[0];
    expect(firstChild).toBeTruthy();
    expect(firstChild.decoratorSid).toBe('d3');
    expect(firstChild.decoratorPosition).toBe('before');
  });

  it('should apply after position correctly', () => {
    const model = {
      stype: 'document',
      sid: 'doc-4',
      content: [
        {
          stype: 'paragraph',
          sid: 'p4',
          text: 'Some text'
        }
      ]
    };
    
    const decorators: DecoratorData[] = [
      {
        sid: 'd4',
        stype: 'comment',
        type: 'comment',
        category: 'block',
        target: { sid: 'p4' },
        position: 'after'
      }
    ];
    
    const vnode = builder.build('document', model, { decorators });
    
    expect(vnode.children).toBeTruthy();
    const children = vnode.children as any[];
    
    // after position이면 paragraph 뒤에 decorator가 추가되어야 함
    const lastChild = children[children.length - 1];
    expect(lastChild).toBeTruthy();
    expect(lastChild.decoratorSid).toBe('d4');
    expect(lastChild.decoratorPosition).toBe('after');
  });
});

