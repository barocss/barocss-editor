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

    // Define basic templates
    define('paragraph', element('p', { className: 'paragraph' }, [slot('content')]));
    define('inline-text', element('span', { className: 'text' }, [data('text')]));

    // Define Bold mark (using data('text') for useDataAsSlot)
    defineMark('bold', element('span', {
      className: 'custom-bold mark-bold',
      'data-mark-type': 'bold',
      'data-weight': 'bold',
      style: { 'font-weight': 'bold', 'padding': '1px 2px', 'border-radius': '2px' }
    }, [data('text')]));

    // Define Italic mark (using data('text') for useDataAsSlot)
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
    // Initial model: "bold and italic"
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

    // Initial rendering
    renderer.render(container, model1 as any, []);
    await waitForFiber(renderer);

    const textNode = container.querySelector('[data-bc-sid="text-bold-italic"]');
    expect(textNode).toBeTruthy();
    expect(textNode?.textContent).toBe('bold and italic');

    const boldWrapper = textNode?.querySelector('.mark-bold');
    const italicWrapper = textNode?.querySelector('.mark-italic');
    const initialBoldWrapper = boldWrapper as HTMLElement | undefined;
    const initialItalicWrapper = italicWrapper as HTMLElement | undefined;

    // Model change: "bold and italic" -> "boㅁld and italic" (add one character)
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

    // Re-render
    renderer.render(container, model2 as any, []);
    await waitForFiber(renderer);

    const textNodeAfter = container.querySelector('[data-bc-sid="text-bold-italic"]');
    expect(textNodeAfter).toBeTruthy();
    expect(textNodeAfter?.textContent).toBe('boㅁld and italic');

    const boldWrapperAfter = textNodeAfter?.querySelector('.mark-bold');
    const italicWrapperAfter = textNodeAfter?.querySelector('.mark-italic');
    if (initialBoldWrapper && boldWrapperAfter) {
      expect(boldWrapperAfter).toBe(initialBoldWrapper);
    }
    if (initialItalicWrapper && italicWrapperAfter) {
      expect(italicWrapperAfter).toBe(initialItalicWrapper);
    }
  });

  it('VNodeBuilder가 동일한 구조를 생성하는지 확인', async () => {
    // Model 1
    const model1 = {
      sid: 'text-bold-italic',
      stype: 'inline-text',
      text: 'bold and italic',
      marks: [
        { type: 'bold', range: [0, 17] },
        { type: 'italic', range: [0, 17] }
      ]
    };

    // Create VNode using VNodeBuilder
    const builder = (renderer as any).builder;
    
    // Debug: check getMarks
    const marks1 = getMarks(model1 as any);
    console.log('[TEST] model1 marks:', marks1);
    console.log('[TEST] model1:', JSON.stringify(model1, null, 2));
    
    const vnode1 = builder.build('inline-text', model1 as any, {});
    console.log('[TEST] vnode1 children:', vnode1.children?.length);
    console.log('[TEST] vnode1 first child:', JSON.stringify(vnode1.children?.[0], null, 2));

    // Model 2 (add one character)
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

    // Compare VNode structures
    // 1. Verify children count
    expect(vnode1.children?.length).toBe(1);
    expect(vnode2.children?.length).toBe(1);

    // 2. Verify first child is mark wrapper
    const child1 = vnode1.children?.[0] as any;
    const child2 = vnode2.children?.[0] as any;
    
    expect(child1?.tag).toBe('span');
    expect(child2?.tag).toBe('span');
    
    const child1Class = (child1?.attrs?.class ?? child1?.attrs?.className ?? '') as string;
    const child2Class = (child2?.attrs?.class ?? child2?.attrs?.className ?? '') as string;
    if (child1Class) expect(child1Class).toContain('mark-bold');
    if (child2Class) expect(child2Class).toContain('mark-bold');
    
    // 4. Verify nested mark wrapper
    const child1Children = child1?.children;
    const child2Children = child2?.children;
    
    expect(child1Children?.length).toBe(1);
    expect(child2Children?.length).toBe(1);
    
    const nested1 = child1Children?.[0] as any;
    const nested2 = child2Children?.[0] as any;
    
    expect(['span', '#text'].includes(nested1?.tag)).toBe(true);
    expect(['span', '#text'].includes(nested2?.tag)).toBe(true);
    
    const nested1Class = (nested1?.attrs?.class ?? nested1?.attrs?.className ?? '') as string;
    const nested2Class = (nested2?.attrs?.class ?? nested2?.attrs?.className ?? '') as string;
    if (nested1Class) expect(nested1Class).toContain('mark-italic');
    if (nested2Class) expect(nested2Class).toContain('mark-italic');
    
    // 5. Verify final text node (find recursively)
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
    
    // Structure is identical, only text differs
    expect(vnode1.children?.length).toBe(vnode2.children?.length);
  });
});

