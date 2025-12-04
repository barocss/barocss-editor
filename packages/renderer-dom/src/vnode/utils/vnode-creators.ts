/**
 * VNode Creation Utilities
 * 
 * Utility functions for creating VNode objects
 */

import { VNode, VNodeTag } from '../types';
import { ModelData } from '@barocss/dsl';
import type { Decorator } from '../decorator';

/**
 * 텍스트 VNode를 생성합니다.
 */
export function createTextVNode(text: string | number): VNode {
  return {
    tag: VNodeTag.TEXT,
    attrs: {},
    style: {},
    children: [],
    text: String(text)
  } as VNode;
}

/**
 * 기본 요소 VNode를 생성합니다.
 */
export function createElementVNode(
  tag: string,
  attrs?: Record<string, any>,
  children?: (string | number | VNode)[],
  style?: Record<string, any>
): VNode {
  return {
    tag,
    attrs: attrs || {},
    style: style || {},
    children: children || []
  } as VNode;
}

/**
 * 컴포넌트 VNode를 생성합니다.
 */
export function createComponentVNode(options: {
  sid?: string;
  stype: string;
  props?: Record<string, any>;
  model?: ModelData;
  isExternal?: boolean;
  attrs?: Record<string, any>;
}): VNode {
  return {
    tag: 'div',
    attrs: options.attrs || {},
    sid: options.sid,
    stype: options.stype,
    props: options.props,
    model: options.model,
    isExternal: options.isExternal
  } as any;
}

/**
 * Span 래퍼 VNode를 생성합니다.
 */
export function createSpanWrapper(children: (string | number | VNode)[]): VNode {
  return {
    tag: 'span',
    attrs: {},
    style: {},
    children
  } as VNode;
}

/**
 * 마크 래퍼 VNode를 생성합니다.
 */
export function createMarkWrapper(tag: string, className: string, inner: VNode): VNode {
  return {
    tag,
    attrs: { className },
    style: {},
    children: [inner]
  } as any;
}

