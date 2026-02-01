/**
 * Block Decorator Position Test
 * 
 * Verifies that block decorator's position information is properly stored and applied.
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
    const blockDecorator = children.find((c: any) =>
      typeof c === 'object' &&
      (c.decoratorCategory === 'block' || c.attrs?.['data-decorator-category'] === 'block')
    );

    expect(blockDecorator).toBeTruthy();
    expect(blockDecorator.decoratorPosition ?? blockDecorator.attrs?.['data-decorator-position']).toBe('before');
    expect(blockDecorator.decoratorSid ?? blockDecorator.attrs?.['data-decorator-sid']).toBe('d1');
    expect(blockDecorator.decoratorStype ?? blockDecorator.attrs?.['data-decorator-stype']).toBe('comment');
    expect(blockDecorator.decoratorCategory ?? blockDecorator.attrs?.['data-decorator-category']).toBe('block');
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
        // No position
      }
    ];
    
    const vnode = builder.build('document', model, { decorators });
    
    expect(vnode).toBeTruthy();
    expect(vnode.children).toBeTruthy();
    
    const children = vnode.children as any[];
    const blockDecorator = children.find((c: any) =>
      typeof c === 'object' &&
      (c.decoratorCategory === 'block' || c.attrs?.['data-decorator-category'] === 'block')
    );

    expect(blockDecorator).toBeTruthy();
    // Use default 'after' if position is not provided
    expect(blockDecorator.decoratorPosition ?? blockDecorator.attrs?.['data-decorator-position']).toBe('after');
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
    
    // If before position, decorator should be added before paragraph
    const firstChild = children[0];
    expect(firstChild).toBeTruthy();
    expect(firstChild.decoratorSid ?? firstChild.attrs?.['data-decorator-sid']).toBe('d3');
    expect(firstChild.decoratorPosition ?? firstChild.attrs?.['data-decorator-position']).toBe('before');
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
    
    // If after position, decorator should be added after paragraph
    const lastChild = children[children.length - 1];
    expect(lastChild).toBeTruthy();
    expect(lastChild.decoratorSid ?? lastChild.attrs?.['data-decorator-sid']).toBe('d4');
    expect(lastChild.decoratorPosition ?? lastChild.attrs?.['data-decorator-position']).toBe('after');
  });
});

