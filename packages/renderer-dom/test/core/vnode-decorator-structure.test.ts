/**
 * Decorator가 적용된 VNode 구조 검증 테스트
 * 
 * 이 테스트는 decorator가 적용될 때 VNode가 어떻게 생성되는지 확인합니다.
 * 특히 inline decorator의 position: 'before'/'after' 경우를 중점적으로 다룹니다.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { define, element, data, defineDecorator, getGlobalRegistry, slot, text } from '@barocss/dsl';
import { VNodeBuilder } from '../../src/vnode/factory';
import type { Decorator } from '../../src/vnode/decorator';

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
    return vnode.map((item) => serializeVNode(item, depth + 1));
  }
  if (typeof vnode === 'object') {
    const result: any = {};
    for (const key in vnode) {
      if (key === 'getter' || typeof vnode[key] === 'function') continue;
      result[key] = serializeVNode(vnode[key], depth + 1);
    }
    return result;
  }
  return vnode;
}

/**
 * VNode 구조를 읽기 쉽게 출력
 */
function printVNodeStructure(vnode: any, prefix: string = ''): void {
  if (typeof vnode === 'string' || typeof vnode === 'number') {
    console.log(`${prefix}${vnode}`);
    return;
  }
  if (Array.isArray(vnode)) {
    vnode.forEach((item, idx) => {
      console.log(`${prefix}[${idx}]`);
      printVNodeStructure(item, prefix + '  ');
    });
    return;
  }
  if (vnode && typeof vnode === 'object') {
    console.log(`${prefix}{`);
    if (vnode.tag) console.log(`${prefix}  tag: ${vnode.tag}`);
    if (vnode.sid) console.log(`${prefix}  sid: ${vnode.sid}`);
    if (vnode.stype) console.log(`${prefix}  stype: ${vnode.stype}`);
    if (vnode.attrs?.['data-decorator-sid']) console.log(`${prefix}  decoratorSid: ${vnode.attrs['data-decorator-sid']}`);
    if (vnode.attrs?.['data-decorator-stype']) console.log(`${prefix}  decoratorStype: ${vnode.attrs['data-decorator-stype']}`);
    if (vnode.attrs?.['data-decorator-position']) console.log(`${prefix}  decoratorPosition: ${vnode.attrs['data-decorator-position']}`);
    if (vnode.text !== undefined) console.log(`${prefix}  text: "${vnode.text}"`);
    if (vnode.children) {
      console.log(`${prefix}  children:`);
      printVNodeStructure(vnode.children, prefix + '    ');
    }
    console.log(`${prefix}}`);
  }
}

describe('VNode Decorator Structure', () => {
  let builder: VNodeBuilder;
  let registry: ReturnType<typeof getGlobalRegistry>;

  beforeEach(() => {
    registry = getGlobalRegistry();
    builder = new VNodeBuilder(registry);

    // Define base templates
    define('paragraph', element('p', { className: 'paragraph' }, [slot('content')]));
    define('inline-text', element('span', { className: 'text' }, [data('text')]));
    
    // Define chip decorator
    defineDecorator('chip', element('span', {
      className: 'chip',
      style: {
        display: 'inline-block',
        padding: '2px 6px',
        backgroundColor: '#e0e0e0',
        borderRadius: '4px',
        fontSize: '12px',
        margin: '0 2px'
      }
    }, [text('CHIP')]));
  });

  describe('decorator 없이 텍스트만 있는 경우', () => {
    it('should build VNode without decorator', () => {
      const model = {
        sid: 'text-14',
        stype: 'inline-text',
        text: 'Hello World'
      };

      const vnode = builder.build('inline-text', model);

      console.log('\n=== VNode without decorator ===');
      printVNodeStructure(vnode);
      console.log('\n=== Serialized VNode ===');
      console.log(JSON.stringify(serializeVNode(vnode), null, 2));

      expect(vnode).toBeTruthy();
      expect(vnode.sid).toBe('text-14');
      expect(vnode.stype).toBe('inline-text');
      expect(vnode.tag).toBe('span');
    });
  });

  describe('inline decorator with position: before', () => {
    it('should build VNode with decorator before text', () => {
      const model = {
        sid: 'text-14',
        stype: 'inline-text',
        text: 'Hello World'
      };

      const decorators: Decorator[] = [
        {
          sid: 'chip-before',
          stype: 'chip',
          category: 'inline',
          target: {
            sid: 'text-14',
            startOffset: 0,
            endOffset: 5
          },
          position: 'before',
          data: {}
        }
      ];

      const vnode = builder.build('inline-text', model, { decorators });

      console.log('\n=== VNode with decorator (position: before) ===');
      printVNodeStructure(vnode);
      console.log('\n=== Serialized VNode ===');
      console.log(JSON.stringify(serializeVNode(vnode), null, 2));

      expect(vnode).toBeTruthy();
      expect(vnode.sid).toBe('text-14');
      expect(vnode.stype).toBe('inline-text');
      expect(vnode.tag).toBe('span');
      
      // children should exist
      expect(vnode.children).toBeTruthy();
      expect(Array.isArray(vnode.children)).toBe(true);
      expect(vnode.children.length).toBeGreaterThan(0);

      // First child should be decorator VNode
      const firstChild = vnode.children[0] as any;
      expect(firstChild).toBeTruthy();
      expect(firstChild.attrs?.['data-decorator-sid']).toBe('chip-before');
      expect(firstChild.attrs?.['data-decorator-stype']).toBe('chip');
      expect(firstChild.attrs?.['data-decorator-position']).toBe('before');

      // Second child should be split text (may be wrapped in mark wrapper)
      const secondChild = vnode.children[1] as any;
      expect(secondChild).toBeTruthy();
      const text1 = secondChild.text || (secondChild.children?.[0]?.text);
      expect(text1).toBe('Hello');
      expect(secondChild.sid).toBeUndefined(); // Split text has no sid

      // Third child should be remaining text (may be wrapped in mark wrapper)
      const thirdChild = vnode.children[2] as any;
      expect(thirdChild).toBeTruthy();
      const text2 = thirdChild.text || (thirdChild.children?.[0]?.text);
      expect(text2).toBe(' World');
      expect(thirdChild.sid).toBeUndefined(); // Split text has no sid
    });
  });

  describe('inline decorator with position: after', () => {
    it('should build VNode with decorator after text', () => {
      const model = {
        sid: 'text-14',
        stype: 'inline-text',
        text: 'Hello World'
      };

      const decorators: Decorator[] = [
        {
          sid: 'chip-after',
          stype: 'chip',
          category: 'inline',
          target: {
            sid: 'text-14',
            startOffset: 0,
            endOffset: 5
          },
          position: 'after',
          data: {}
        }
      ];

      const vnode = builder.build('inline-text', model, { decorators });

      console.log('\n=== VNode with decorator (position: after) ===');
      printVNodeStructure(vnode);
      console.log('\n=== Serialized VNode ===');
      console.log(JSON.stringify(serializeVNode(vnode), null, 2));

      expect(vnode).toBeTruthy();
      expect(vnode.sid).toBe('text-14');
      expect(vnode.stype).toBe('inline-text');
      expect(vnode.tag).toBe('span');
      
      // children should exist
      expect(vnode.children).toBeTruthy();
      expect(Array.isArray(vnode.children)).toBe(true);
      expect(vnode.children.length).toBeGreaterThan(0);

      // First child should be split text (may be wrapped in mark wrapper)
      const firstChild = vnode.children[0] as any;
      expect(firstChild).toBeTruthy();
      const text1 = firstChild.text || (firstChild.children?.[0]?.text);
      expect(text1).toBe('Hello');
      expect(firstChild.sid).toBeUndefined(); // Split text has no sid

      // Second child should be decorator VNode
      const secondChild = vnode.children[1] as any;
      expect(secondChild).toBeTruthy();
      expect(secondChild.attrs?.['data-decorator-sid']).toBe('chip-after');
      expect(secondChild.attrs?.['data-decorator-stype']).toBe('chip');
      expect(secondChild.attrs?.['data-decorator-position']).toBe('after');

      // Third child should be remaining text (may be wrapped in mark wrapper)
      const thirdChild = vnode.children[2] as any;
      expect(thirdChild).toBeTruthy();
      const text2 = thirdChild.text || (thirdChild.children?.[0]?.text);
      expect(text2).toBe(' World');
      expect(thirdChild.sid).toBeUndefined(); // Split text has no sid
    });
  });

  describe('여러 decorator가 있는 경우', () => {
    it('should build VNode with multiple decorators', () => {
      const model = {
        sid: 'text-14',
        stype: 'inline-text',
        text: 'Hello World'
      };

      const decorators: Decorator[] = [
        {
          sid: 'chip-before',
          stype: 'chip',
          category: 'inline',
          target: {
            sid: 'text-14',
            startOffset: 0,
            endOffset: 5
          },
          position: 'before',
          data: {}
        },
        {
          sid: 'chip-after',
          stype: 'chip',
          category: 'inline',
          target: {
            sid: 'text-14',
            startOffset: 6,
            endOffset: 11
          },
          position: 'after',
          data: {}
        }
      ];

      const vnode = builder.build('inline-text', model, { decorators });

      console.log('\n=== VNode with multiple decorators ===');
      printVNodeStructure(vnode);
      console.log('\n=== Serialized VNode ===');
      console.log(JSON.stringify(serializeVNode(vnode), null, 2));

      expect(vnode).toBeTruthy();
      expect(vnode.sid).toBe('text-14');
      expect(vnode.stype).toBe('inline-text');
      expect(vnode.tag).toBe('span');
      
      // children should exist
      expect(vnode.children).toBeTruthy();
      expect(Array.isArray(vnode.children)).toBe(true);
      expect(vnode.children.length).toBeGreaterThan(0);

      // Verify structure
      const children = vnode.children as any[];
      console.log(`\nChildren count: ${children.length}`);
      children.forEach((child, idx) => {
        console.log(`Child ${idx}:`, {
          tag: child.tag,
          sid: child.sid,
          decoratorSid: child.attrs?.['data-decorator-sid'],
          text: child.text,
          decoratorPosition: child.attrs?.['data-decorator-position']
        });
      });
    });
  });

  describe('decorator 추가/제거 시 VNode 구조 변화', () => {
    it('should show VNode structure change when decorator is added', () => {
      const model = {
        sid: 'text-14',
        stype: 'inline-text',
        text: 'Hello World'
      };

      // 1. Build without decorator
      const vnode1 = builder.build('inline-text', model);
      console.log('\n=== VNode without decorator ===');
      printVNodeStructure(vnode1);

      // 2. Build after adding decorator
      const decorators: Decorator[] = [
        {
          sid: 'chip-before',
          stype: 'chip',
          category: 'inline',
          target: {
            sid: 'text-14',
            startOffset: 0,
            endOffset: 5
          },
          position: 'before',
          data: {}
        }
      ];
      const vnode2 = builder.build('inline-text', model, { decorators });
      console.log('\n=== VNode with decorator ===');
      printVNodeStructure(vnode2);

      // Compare
      console.log('\n=== Comparison ===');
      console.log('Without decorator - children count:', (vnode1.children as any[])?.length || 0);
      console.log('With decorator - children count:', (vnode2.children as any[])?.length || 0);

      // Original component VNode should exist only once
      expect(vnode1.sid).toBe('text-14');
      expect(vnode2.sid).toBe('text-14');
      
      // When decorator is added, children structure changes
      expect(vnode1.children).not.toEqual(vnode2.children);
    });
  });
});

