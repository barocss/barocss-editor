/**
 * VNode Creation Utilities
 * 
 * Utility functions for creating VNode objects
 */

import { VNode, VNodeTag } from '../types';
import { ModelData } from '@barocss/dsl';
import { FILLER_ATTR, FILLER_CHAR } from '@barocss/shared';
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
 * Caret filler for an empty inline-text.
 *
 * A zero-length text node is not a valid insertion point in Chrome: the caret can
 * be placed in it, but `beforeinput.getTargetRanges()` snaps to the next block's
 * text, so the first character typed into a freshly created empty block lands in
 * the wrong paragraph.
 *
 * The filler is a zero-width NO-BREAK space (U+FEFF) inside the same span wrapper
 * a normal text run uses, rather than a `<br>`. A `<br>` gives the caret a home but
 * no text node, so the browser creates its own — directly under the sid element,
 * a shape this renderer never produces. The IME then composes into that foreign
 * node and the MutationObserver diff fights it. Keeping the structure identical to
 * a rendered text run means the browser's own mutations land where the model
 * expects them. U+FEFF rather than U+200B because U+200B adds a line-break
 * opportunity (UAX #14 class BA) and would change wrapping.
 *
 * The `data-bc-filler` attribute is what makes it distinguishable from a U+FEFF
 * the user actually typed — the character alone is ambiguous.
 *
 * It must never reach the model: buildTextRunIndex strips it while indexing, and
 * anything reading raw DOM text must call stripFiller().
 */
export function createFillerVNode(): VNode {
  return {
    tag: 'span',
    attrs: { [FILLER_ATTR]: 'true' },
    style: {},
    children: [createTextVNode(FILLER_CHAR)]
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

