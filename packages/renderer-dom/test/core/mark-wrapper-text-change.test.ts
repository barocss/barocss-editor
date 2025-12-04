/**
 * Mark Wrapper Text Change Test
 * 
 * mark가 있는 텍스트에 글자를 입력했을 때 mark wrapper가 유지되는지 테스트
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DOMRenderer } from '../../src/dom-renderer';
import { define, element, data, getGlobalRegistry, slot, defineMark } from '@barocss/dsl';
import { waitForFiber } from '../utils/fiber-wait';
import { getMarks } from '../../src/vnode/utils/model-data';

describe('Mark Wrapper Text Change', () => {
  let renderer: DOMRenderer;
  let container: HTMLElement;
  let registry: ReturnType<typeof getGlobalRegistry>;

  beforeEach(() => {
    registry = getGlobalRegistry();
    renderer = new DOMRenderer(registry);
    container = document.createElement('div');
    document.body.appendChild(container);

    // 기본 템플릿 정의
    define('paragraph', element('p', { className: 'paragraph' }, [slot('content')]));
    define('inline-text', element('span', { className: 'text' }, [data('text')]));

    // Bold mark 정의 (useDataAsSlot을 위해 data('text') 사용)
    defineMark('bold', element('span', {
      className: 'custom-bold mark-bold',
      'data-mark-type': 'bold',
      'data-weight': 'bold',
      style: { 'font-weight': 'bold', 'padding': '1px 2px', 'border-radius': '2px' }
    }, [data('text')]));

    // Italic mark 정의 (useDataAsSlot을 위해 data('text') 사용)
    defineMark('italic', element('span', {
      className: 'custom-italic mark-italic',
      'data-mark-type': 'italic',
      'data-style': 'italic',
      style: { 'font-style': 'italic', 'padding': '1px 2px', 'border-radius': '2px' }
    }, [data('text')]));
  });

  afterEach(() => {
    if (container && container.parentNode) {
      document.body.removeChild(container);
    }
    renderer.destroy();
  });

  it('bold + italic mark가 있는 텍스트에 글자 추가 시 mark wrapper 유지', async () => {
    // 초기 모델: "bold and italic"
    const model1 = {
      sid: 'p-1',
      stype: 'paragraph',
      content: [
        {
          sid: 'text-bold-italic',
          stype: 'inline-text',
          text: 'bold and italic',
          marks: [
            { type: 'bold', range: [0, 17] },
            { type: 'italic', range: [0, 17] }
          ]
        }
      ]
    };

    // 초기 렌더링
    renderer.render(container, model1 as any, []);
    await waitForFiber(renderer);

    // 초기 DOM 구조 확인
    const textNode = container.querySelector('[data-bc-sid="text-bold-italic"]');
    expect(textNode).toBeTruthy();
    
    const boldWrapper = textNode?.querySelector('.mark-bold');
    const italicWrapper = textNode?.querySelector('.mark-italic');
    expect(boldWrapper).toBeTruthy();
    expect(italicWrapper).toBeTruthy();
    
    // 초기 텍스트 확인
    expect(textNode?.textContent).toBe('bold and italic');
    
    // 초기 DOM 구조 저장
    const initialBoldWrapper = boldWrapper as HTMLElement;
    const initialItalicWrapper = italicWrapper as HTMLElement;
    const initialTextContent = textNode?.textContent;

    // 모델 변경: "bold and italic" -> "boㅁld and italic" (글자 하나 추가)
    const model2 = {
      sid: 'p-1',
      stype: 'paragraph',
      content: [
        {
          sid: 'text-bold-italic',
          stype: 'inline-text',
          text: 'boㅁld and italic',
          marks: [
            { type: 'bold', range: [0, 18] },
            { type: 'italic', range: [0, 18] }
          ]
        }
      ]
    };

    // 재렌더링
    renderer.render(container, model2 as any, []);
    await waitForFiber(renderer);

    // 재렌더링 후 DOM 구조 확인
    const textNodeAfter = container.querySelector('[data-bc-sid="text-bold-italic"]');
    expect(textNodeAfter).toBeTruthy();
    expect(textNodeAfter?.textContent).toBe('boㅁld and italic');

    // Mark wrapper가 유지되었는지 확인
    const boldWrapperAfter = textNodeAfter?.querySelector('.mark-bold');
    const italicWrapperAfter = textNodeAfter?.querySelector('.mark-italic');
    
    expect(boldWrapperAfter).toBeTruthy();
    expect(italicWrapperAfter).toBeTruthy();
    
    // DOM 요소가 재사용되었는지 확인 (같은 객체여야 함)
    expect(boldWrapperAfter).toBe(initialBoldWrapper);
    expect(italicWrapperAfter).toBe(initialItalicWrapper);
    
    // 구조 확인: <span data-bc-sid="text-bold-italic">
    //   <span class="mark-bold">
    //     <span class="mark-italic">
    //       <span>boㅁld and italic</span>
    //     </span>
    //   </span>
    // </span>
    const innerSpan = italicWrapperAfter?.querySelector('span:not(.mark-bold):not(.mark-italic)');
    expect(innerSpan).toBeTruthy();
    expect(innerSpan?.textContent).toBe('boㅁld and italic');
  });

  it('VNodeBuilder가 동일한 구조를 생성하는지 확인', async () => {
    // 모델 1
    const model1 = {
      sid: 'text-bold-italic',
      stype: 'inline-text',
      text: 'bold and italic',
      marks: [
        { type: 'bold', range: [0, 17] },
        { type: 'italic', range: [0, 17] }
      ]
    };

    // VNodeBuilder로 VNode 생성
    const builder = (renderer as any).builder;
    
    // 디버깅: getMarks 확인
    const marks1 = getMarks(model1 as any);
    console.log('[TEST] model1 marks:', marks1);
    console.log('[TEST] model1:', JSON.stringify(model1, null, 2));
    
    const vnode1 = builder.build('inline-text', model1 as any, {});
    console.log('[TEST] vnode1 children:', vnode1.children?.length);
    console.log('[TEST] vnode1 first child:', JSON.stringify(vnode1.children?.[0], null, 2));

    // 모델 2 (글자 하나 추가)
    const model2 = {
      sid: 'text-bold-italic',
      stype: 'inline-text',
      text: 'boㅁld and italic',
      marks: [
        { type: 'bold', range: [0, 18] },
        { type: 'italic', range: [0, 18] }
      ]
    };

    const vnode2 = builder.build('inline-text', model2 as any, {});

    // VNode 구조 비교
    // 1. children 개수 확인
    expect(vnode1.children?.length).toBe(1);
    expect(vnode2.children?.length).toBe(1);

    // 2. 첫 번째 child가 mark wrapper인지 확인
    const child1 = vnode1.children?.[0] as any;
    const child2 = vnode2.children?.[0] as any;
    
    expect(child1?.tag).toBe('span');
    expect(child2?.tag).toBe('span');
    
    // 3. mark wrapper의 class 확인
    const child1Class = child1?.attrs?.class || child1?.attrs?.className;
    const child2Class = child2?.attrs?.class || child2?.attrs?.className;
    
    expect(child1Class).toContain('mark-bold');
    expect(child2Class).toContain('mark-bold');
    
    // 4. 중첩된 mark wrapper 확인
    const child1Children = child1?.children;
    const child2Children = child2?.children;
    
    expect(child1Children?.length).toBe(1);
    expect(child2Children?.length).toBe(1);
    
    const nested1 = child1Children?.[0] as any;
    const nested2 = child2Children?.[0] as any;
    
    expect(nested1?.tag).toBe('span');
    expect(nested2?.tag).toBe('span');
    
    const nested1Class = nested1?.attrs?.class || nested1?.attrs?.className;
    const nested2Class = nested2?.attrs?.class || nested2?.attrs?.className;
    
    expect(nested1Class).toContain('mark-italic');
    expect(nested2Class).toContain('mark-italic');
    
    // 5. 최종 텍스트 노드 확인 (재귀적으로 찾기)
    const findTextVNode = (vnode: any): any => {
      if (vnode?.text !== undefined) {
        return vnode;
      }
      if (Array.isArray(vnode?.children)) {
        for (const child of vnode.children) {
          const found = findTextVNode(child);
          if (found) return found;
        }
      }
      return null;
    };
    
    const final1 = findTextVNode(nested1);
    const final2 = findTextVNode(nested2);
    
    expect(final1).toBeTruthy();
    expect(final2).toBeTruthy();
    expect(final1?.text).toBe('bold and italic');
    expect(final2?.text).toBe('boㅁld and italic');
    
    // 구조는 동일하고 텍스트만 다름
    expect(vnode1.children?.length).toBe(vnode2.children?.length);
  });
});

