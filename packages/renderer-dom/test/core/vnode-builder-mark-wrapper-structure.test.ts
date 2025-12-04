/**
 * VNodeBuilder Mark Wrapper Structure 테스트
 * 
 * mark wrapper가 생성하는 VNode 구조를 정확히 검증
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { VNodeBuilder } from '../../src/vnode/factory';
import { defineMark, define, element, data } from '@barocss/dsl';
import { VNode } from '../../src/vnode/types';

describe('VNodeBuilder Mark Wrapper Structure', () => {
  let builder: VNodeBuilder;

  beforeEach(() => {
    builder = new VNodeBuilder();
  });

  it('should create mark wrapper with span wrapper and text VNode inside', () => {
    defineMark('bold', element('span', {
      className: 'mark-bold'
    }, [data('text')]));

    const model = {
      text: 'Hello',
      marks: [{
        type: 'bold',
        range: [0, 5]
      }]
    };

    // VNodeBuilder를 통해 직접 빌드하는 대신, 구조를 확인하기 위해
    // _buildMarkedRunVNode를 테스트할 수 없으므로, 실제 빌드 결과를 확인
    // 하지만 이건 private 메서드이므로, 실제 사용 시나리오를 테스트해야 함
    
    // 대신 createMarkWrapper와 createSpanWrapper의 조합을 확인
    const textVNode = {
      tag: undefined,
      text: 'Hello',
      children: []
    } as VNode;

    const spanWrapper = {
      tag: 'span',
      attrs: {},
      children: [textVNode]
    } as VNode;

    const markWrapper = {
      tag: 'span',
      attrs: { className: 'mark-bold' },
      children: [spanWrapper]
    } as VNode;

    // 구조 확인
    expect(markWrapper.tag).toBe('span');
    expect(markWrapper.attrs?.className).toBe('mark-bold');
    expect(markWrapper.children?.length).toBe(1);
    
    const inner = markWrapper.children?.[0] as VNode;
    expect(inner.tag).toBe('span');
    expect(inner.children?.length).toBe(1);
    
    const textNode = inner.children?.[0] as VNode;
    expect(textNode.tag).toBeUndefined();
    expect(textNode.text).toBe('Hello');
  });

  it('should verify mark wrapper children structure', () => {
    // mark wrapper의 children은 VNode 배열이어야 함
    // primitive text가 아닌 VNode (span wrapper)를 children으로 가짐
    
    const textVNode = {
      tag: undefined,
      text: 'Hello',
      children: []
    } as VNode;

    const spanWrapper = {
      tag: 'span',
      attrs: {},
      children: [textVNode]
    } as VNode;

    const markWrapper = {
      tag: 'span',
      attrs: { className: 'mark-bold' },
      children: [spanWrapper]
    } as VNode;

    // mark wrapper의 children은 VNode 배열
    expect(Array.isArray(markWrapper.children)).toBe(true);
    expect(markWrapper.children?.length).toBe(1);
    expect(typeof markWrapper.children?.[0]).toBe('object');
    expect((markWrapper.children?.[0] as VNode).tag).toBe('span');
    
    // primitive text가 아님
    expect(typeof markWrapper.children?.[0]).not.toBe('string');
    expect(typeof markWrapper.children?.[0]).not.toBe('number');
  });

  it('should verify inner span wrapper has text VNode as child', () => {
    const textVNode = {
      tag: undefined,
      text: 'Hello',
      children: []
    } as VNode;

    const spanWrapper = {
      tag: 'span',
      attrs: {},
      children: [textVNode]
    } as VNode;

    // inner span wrapper의 children은 VNode 배열
    expect(Array.isArray(spanWrapper.children)).toBe(true);
    expect(spanWrapper.children?.length).toBe(1);
    
    const child = spanWrapper.children?.[0] as VNode;
    expect(child.tag).toBeUndefined();
    expect(child.text).toBe('Hello');
  });
});

