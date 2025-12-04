/**
 * VNode Creator Functions 테스트
 * 
 * VNodeBuilder가 사용하는 기본 VNode 생성 함수들의 동작을 검증
 */

import { describe, it, expect } from 'vitest';
import { createTextVNode, createSpanWrapper, createMarkWrapper, createElementVNode } from '../../src/vnode/utils/vnode-creators';
import { VNode } from '../../src/vnode/types';

describe('VNode Creator Functions', () => {
  describe('createTextVNode', () => {
    it('should create text-only VNode with text property', () => {
      const vnode = createTextVNode('Hello');
      
      expect(vnode.tag).toBeUndefined();
      expect(vnode.text).toBe('Hello');
      expect(vnode.children).toEqual([]);
      expect(vnode.attrs).toEqual({});
    });

    it('should convert number to string', () => {
      const vnode = createTextVNode(123);
      
      expect(vnode.text).toBe('123');
    });
  });

  describe('createSpanWrapper', () => {
    it('should create span VNode with children', () => {
      const textVNode = createTextVNode('Hello');
      const wrapper = createSpanWrapper([textVNode]);
      
      expect(wrapper.tag).toBe('span');
      expect(wrapper.children).toEqual([textVNode]);
      expect(wrapper.attrs).toEqual({});
    });

    it('should handle primitive text children', () => {
      const wrapper = createSpanWrapper(['Hello', 'World']);
      
      expect(wrapper.tag).toBe('span');
      expect(wrapper.children).toEqual(['Hello', 'World']);
    });

    it('should handle mixed children', () => {
      const textVNode = createTextVNode('Hello');
      const wrapper = createSpanWrapper([textVNode, 'World']);
      
      expect(wrapper.tag).toBe('span');
      expect(wrapper.children).toEqual([textVNode, 'World']);
    });
  });

  describe('createMarkWrapper', () => {
    it('should create mark wrapper with inner VNode', () => {
      const inner = createSpanWrapper([createTextVNode('Hello')]);
      const markWrapper = createMarkWrapper('span', 'mark-bold', inner);
      
      expect(markWrapper.tag).toBe('span');
      expect(markWrapper.attrs?.className).toBe('mark-bold');
      expect(markWrapper.children).toEqual([inner]);
    });

    it('should preserve inner VNode structure', () => {
      const textVNode = createTextVNode('Hello');
      const inner = createSpanWrapper([textVNode]);
      const markWrapper = createMarkWrapper('span', 'mark-bold', inner);
      
      expect(markWrapper.children?.[0]).toBe(inner);
      expect((markWrapper.children?.[0] as VNode)?.children?.[0]).toBe(textVNode);
    });
  });

  describe('createElementVNode', () => {
    it('should create element VNode with tag and attrs', () => {
      const vnode = createElementVNode('div', { className: 'test' });
      
      expect(vnode.tag).toBe('div');
      expect(vnode.attrs?.className).toBe('test');
      expect(vnode.children).toEqual([]);
    });

    it('should handle children', () => {
      const textVNode = createTextVNode('Hello');
      const vnode = createElementVNode('div', {}, [textVNode]);
      
      expect(vnode.children).toEqual([textVNode]);
    });
  });
});

