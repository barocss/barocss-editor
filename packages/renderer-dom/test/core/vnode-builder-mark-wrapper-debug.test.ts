/**
 * VNodeBuilder Mark Wrapper 구조 디버깅 테스트
 * 
 * "dyellow" 문제 해결을 위해 실제 VNode 구조를 정확히 파악
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { VNodeBuilder } from '../../src/vnode/factory';
import { defineMark, define, element, data } from '@barocss/dsl';
import { VNode } from '../../src/vnode/types';

describe('VNodeBuilder Mark Wrapper Debug', () => {
  let builder: VNodeBuilder;

  beforeEach(() => {
    builder = new VNodeBuilder();
    
    define('inline-text', element('span', {
      className: 'text'
    }, [data('text')]));
  });

  it('should log actual VNode structure for bgColor mark', () => {
    defineMark('bgColor', element('span', {
      className: 'custom-bg-color',
      'data-mark-type': 'bgColor',
      'data-bg-color': data('bgColor', '#ffff00'),
      style: {
        backgroundColor: data('bgColor', '#ffff00'),
        padding: '1px 2px',
        borderRadius: '2px'
      }
    }, [data('text')]));

    const initialModel = {
      sid: 'text-yellow-bg',
      stype: 'inline-text',
      text: 'yellow background',
      marks: [{
        type: 'bgColor',
        range: [0, 16],
        attrs: { bgColor: '#ffff00' }
      }]
    };

    const vnode = builder.build('inline-text', initialModel);

    // 실제 구조를 JSON으로 출력
    const structure = JSON.stringify(vnode, (key, value) => {
      // 순환 참조 방지
      if (key === 'meta' || key === 'component' || key === 'registry') {
        return undefined;
      }
      return value;
    }, 2);

    console.log('Initial VNode Structure:', structure);

    // 구조 확인
    expect(vnode.tag).toBe('span');
    expect(vnode.sid).toBe('text-yellow-bg');
    expect(vnode.stype).toBe('inline-text');
    
    // children이 있는지 확인
    if (vnode.children && vnode.children.length > 0) {
      console.log('Children count:', vnode.children.length);
      
      vnode.children.forEach((child, index) => {
        console.log(`Child ${index}:`, {
          type: typeof child,
          isVNode: typeof child === 'object' && child !== null,
          tag: typeof child === 'object' && child !== null ? (child as VNode).tag : undefined,
          text: typeof child === 'object' && child !== null ? (child as VNode).text : undefined,
          childrenCount: typeof child === 'object' && child !== null ? (child as VNode).children?.length : undefined
        });
      });
    }
  });

  it('should compare VNode structure before and after text change', () => {
    defineMark('bgColor', element('span', {
      className: 'custom-bg-color',
      'data-mark-type': 'bgColor',
      'data-bg-color': data('bgColor', '#ffff00'),
      style: {
        backgroundColor: data('bgColor', '#ffff00'),
        padding: '1px 2px',
        borderRadius: '2px'
      }
    }, [data('text')]));

    const initialModel = {
      sid: 'text-yellow-bg',
      stype: 'inline-text',
      text: 'yellow background',
      marks: [{
        type: 'bgColor',
        range: [0, 16],
        attrs: { bgColor: '#ffff00' }
      }]
    };

    const updatedModel = {
      sid: 'text-yellow-bg',
      stype: 'inline-text',
      text: 'yellow bㅁackground',
      marks: [{
        type: 'bgColor',
        range: [0, 18],
        attrs: { bgColor: '#ffff00' }
      }]
    };

    const initialVNode = builder.build('inline-text', initialModel);
    const updatedVNode = builder.build('inline-text', updatedModel);

    console.log('Initial children count:', initialVNode.children?.length);
    console.log('Updated children count:', updatedVNode.children?.length);

    // 구조 비교
    if (initialVNode.children && initialVNode.children.length > 0) {
      const initialMarkWrapper = initialVNode.children[0] as VNode;
      console.log('Initial mark wrapper:', {
        tag: initialMarkWrapper.tag,
        className: initialMarkWrapper.attrs?.className,
        childrenCount: initialMarkWrapper.children?.length
      });

      if (initialMarkWrapper.children && initialMarkWrapper.children.length > 0) {
        const initialInner = initialMarkWrapper.children[0] as VNode;
        console.log('Initial inner:', {
          tag: initialInner.tag,
          text: initialInner.text,
          childrenCount: initialInner.children?.length
        });
      }
    }

    if (updatedVNode.children && updatedVNode.children.length > 0) {
      const updatedMarkWrapper = updatedVNode.children[0] as VNode;
      console.log('Updated mark wrapper:', {
        tag: updatedMarkWrapper.tag,
        className: updatedMarkWrapper.attrs?.className,
        childrenCount: updatedMarkWrapper.children?.length
      });

      if (updatedMarkWrapper.children && updatedMarkWrapper.children.length > 0) {
        const updatedInner = updatedMarkWrapper.children[0] as VNode;
        console.log('Updated inner:', {
          tag: updatedInner.tag,
          text: updatedInner.text,
          childrenCount: updatedInner.children?.length
        });
      }
    }
  });
});

