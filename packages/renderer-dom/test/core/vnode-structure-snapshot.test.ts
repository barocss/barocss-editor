/**
 * VNode Structure Snapshot Test
 * 
 * This test serializes actual VNode structures to JSON for documentation.
 * After test execution, results can be updated to docs/vnode-structure-examples.md.
 */
import { describe, it } from 'vitest';
import { define, element, data, defineDecorator, getGlobalRegistry, slot } from '@barocss/dsl';
import { DecoratorData, VNodeBuilder } from '../../src/vnode/factory';

/**
 * Serialize VNode to JSON (remove circular references and functions)
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
      if (key === 'getter' || key === 'function') continue; // Exclude functions
      const value = vnode[key];
      if (typeof value === 'function') continue; // Exclude functions
      if (key === 'component' && value) {
        // Serialize component information limitedly
        result.component = {
          name: value.name,
          props: serializeVNode(value.props, depth + 1),
          model: serializeVNode(value.model, depth + 1),
          decorators: value.decorators ? `[${value.decorators.length} decorators]` : undefined
        };
      } else {
        result[key] = serializeVNode(value, depth + 1);
      }
    }
    return result;
  }
  return vnode;
}

describe('VNode Structure Snapshots', () => {
  const registry = getGlobalRegistry();
  const builder = new VNodeBuilder(registry);

  it('should document simple paragraph VNode structure', () => {
    define('paragraph', element('p', { className: 'para' }, [data('text')]));
    
    const model = { stype: 'paragraph', sid: 'p1', text: 'Hello world' };
    const vnode = builder.build('paragraph', model);
    
    const serialized = serializeVNode(vnode);
    console.log('\n=== Simple Paragraph VNode ===');
    console.log(JSON.stringify(serialized, null, 2));
  });

  it('should document VNode with text marks', () => {
    define('paragraph', element('p', {}, [data('text')]));
    define('mark:bold', element('strong', { className: 'mark-bold' }, []));
    define('mark:italic', element('em', { className: 'mark-italic' }, []));
    
    const model = {
      stype: 'paragraph',
      sid: 'p2',
      text: 'Hello world',
      marks: [
        { type: 'bold', range: [0, 5] },
        { type: 'italic', range: [6, 11] }
      ]
    };
    
    const vnode = builder.build('paragraph', model);
    
    const serialized = serializeVNode(vnode);
    console.log('\n=== Paragraph with Marks VNode ===');
    console.log(JSON.stringify(serialized, null, 2));
  });

  it('should document VNode with inline decorators', () => {
    define('paragraph', element('p', {}, [data('text')]));
    defineDecorator('highlight', element('span', { className: 'highlight' }, []));
    
    const model = {
      stype: 'paragraph',
      sid: 'p3',
      text: 'Important text'
    };
    
    const decorators: DecoratorData[] = [
      {
        sid: 'd1',
        stype: 'highlight',
        type: 'highlight',
        category: 'inline',
        target: { sid: 'p3', startOffset: 0, endOffset: 9 }
      }
    ];
    
    const vnode = builder.build('paragraph', model, { decorators });
    
    const serialized = serializeVNode(vnode);
    console.log('\n=== Paragraph with Inline Decorator VNode ===');
    console.log(JSON.stringify(serialized, null, 2));
  });

  it('should document VNode with marks and decorators integrated', () => {
    define('paragraph', element('p', {}, [data('text')]));
    define('mark:bold', element('strong', {}, []));
    defineDecorator('highlight', element('span', { className: 'highlight' }, []));
    
    const model = {
      stype: 'paragraph',
      sid: 'p4',
      text: 'Bold and highlighted',
      marks: [
        { type: 'bold', range: [0, 4] }
      ]
    };
    
    const decorators: DecoratorData[] = [
      {
        sid: 'd2',
        stype: 'highlight',
        type: 'highlight',
        category: 'inline',
        target: { sid: 'p4', startOffset: 5, endOffset: 19 }
      }
    ];
    
    const vnode = builder.build('paragraph', model, { decorators });
    
    const serialized = serializeVNode(vnode);
    console.log('\n=== Paragraph with Marks and Decorators VNode ===');
    console.log(JSON.stringify(serialized, null, 2));
  });

  it('should document VNode with block decorators', () => {
    define('paragraph', element('p', {}, [data('text')]));
    defineDecorator('comment', element('div', { className: 'comment-block' }, []));
    
    const model = {
      stype: 'paragraph',
      sid: 'p5',
      text: 'Some text'
    };
    
    const decorators: DecoratorData[] = [
      {
        sid: 'd3',
        stype: 'comment',
        type: 'comment',
        category: 'block',
        target: { sid: 'p5' }
      }
    ];
    
    const vnode = builder.build('paragraph', model, { decorators });
    
    const serialized = serializeVNode(vnode);
    console.log('\n=== Paragraph with Block Decorator VNode ===');
    console.log(JSON.stringify(serialized, null, 2));
  });

  it('should document nested structure VNode', () => {
    define('container', element('div', { className: 'container' }, [
      element('header', { className: 'header' }, []),
      element('content', { className: 'content' }, [])
    ]));
    define('header', element('h1', {}, [data('title')]));
    define('content', element('div', {}, [data('text')]));
    
    const model = {
      stype: 'container',
      sid: 'c1',
      title: 'My Title',
      text: 'Content here'
    };
    
    const vnode = builder.build('container', model);
    
    const serialized = serializeVNode(vnode);
    console.log('\n=== Nested Container VNode ===');
    console.log(JSON.stringify(serialized, null, 2));
  });

  it('should document complex document VNode', () => {
    define('document', element('article', { className: 'document' }, [
      slot('content')
    ]));
    define('paragraph', element('p', {}, [data('text')]));
    define('mark:bold', element('strong', {}, []));
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
            { type: 'bold', range: [8, 12] }
          ]
        },
        {
          stype: 'paragraph',
          sid: 'p2',
          text: 'This paragraph has a highlight'
        }
      ]
    };
    
    const decorators: DecoratorData[] = [
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
    
    const vnode = builder.build('document', model, { decorators });
    
    const serialized = serializeVNode(vnode);
    console.log('\n=== Complex Document VNode ===');
    console.log(JSON.stringify(serialized, null, 2));
  });
});

