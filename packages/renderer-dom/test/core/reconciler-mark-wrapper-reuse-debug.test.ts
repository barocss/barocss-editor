/**
 * reconciler-mark-wrapper-reuse-debug.test.ts
 * 
 * "dyellow" 문제 디버깅을 위한 테스트
 * 실제 VNodeBuilder가 생성하는 VNode 구조를 확인
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DOMRenderer } from '../../src/dom-renderer';
import { define, defineMark, element, data, slot } from '@barocss/dsl';
import { ModelData } from '@barocss/dsl';

describe('Reconciler: Mark Wrapper Reuse Debug', () => {
  let container: HTMLElement;
  let renderer: DOMRenderer;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    renderer = new DOMRenderer();
  });

  it('should debug VNodeBuilder output for mark wrapper structure', () => {
    // Define bgColor mark with style and className
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

    define('inline-text', element('span', {
      className: 'text'
    }, [data('text')]));

    define('paragraph', element('p', {
      className: 'paragraph'
    }, [slot('content')]));

    // Initial render with bgColor mark
    // IMPORTANT: mark range is in [start, end) format, so to include entire text, use [0, text.length]
    const initialModel: ModelData = {
      sid: 'p-1',
      stype: 'paragraph',
      content: [{
        sid: 'text-yellow-bg',
        stype: 'inline-text',
        text: 'yellow background', // 17 characters
        marks: [{
          type: 'bgColor',
          range: [0, 17], // Modified to include entire text (previously: [0, 16])
          attrs: { bgColor: '#ffff00' }
        }]
      }]
    };

    // Create VNode using VNodeBuilder (using DOMRenderer's build method)
    const initialVNode = renderer.build(initialModel);

    // Verify VNode structure
    console.log('[DEBUG] Initial VNode structure:');
    console.log(JSON.stringify(initialVNode, (key, value) => {
      if (key === 'meta') return '[meta]';
      if (key === 'props') return '[props]';
      if (key === 'model') return '[model]';
      return value;
    }, 2));

    // Update: change text
    const updatedModel: ModelData = {
      sid: 'p-1',
      stype: 'paragraph',
      content: [{
        sid: 'text-yellow-bg',
        stype: 'inline-text',
        text: 'yellow bㅁackground', // Text changed
        marks: [{
          type: 'bgColor',
          range: [0, 18],
          attrs: { bgColor: '#ffff00' }
        }]
      }]
    };

    const updatedVNode = renderer.build(updatedModel);

    // Verify Updated VNode structure
    console.log('[DEBUG] Updated VNode structure:');
    console.log(JSON.stringify(updatedVNode, (key, value) => {
      if (key === 'meta') return '[meta]';
      if (key === 'props') return '[props]';
      if (key === 'model') return '[model]';
      return value;
    }, 2));

    // Actual rendering
    renderer.render(container, initialModel);
    
    const textSpan = container.querySelector('[data-bc-sid="text-yellow-bg"]') as HTMLElement;
    const markWrapper = textSpan?.querySelector('span.custom-bg-color') as HTMLElement;
    
    console.log('[DEBUG] Initial DOM structure:');
    console.log('textSpan:', textSpan?.outerHTML);
    console.log('markWrapper:', markWrapper?.outerHTML);
    console.log('markWrapper.textContent:', markWrapper?.textContent);
    console.log('markWrapper.childNodes.length:', markWrapper?.childNodes.length);
    console.log('markWrapper.childNodes:', Array.from(markWrapper?.childNodes || []).map(n => ({
      nodeType: n.nodeType,
      nodeName: n.nodeName,
      textContent: n.textContent
    })));

    // Update render
    renderer.render(container, updatedModel);

    const updatedTextSpan = container.querySelector('[data-bc-sid="text-yellow-bg"]') as HTMLElement;
    const updatedMarkWrapper = updatedTextSpan?.querySelector('span.custom-bg-color') as HTMLElement;
    
    console.log('[DEBUG] Updated DOM structure:');
    console.log('updatedTextSpan:', updatedTextSpan?.outerHTML);
    console.log('updatedMarkWrapper:', updatedMarkWrapper?.outerHTML);
    console.log('updatedMarkWrapper.textContent:', updatedMarkWrapper?.textContent);
    console.log('updatedMarkWrapper.childNodes.length:', updatedMarkWrapper?.childNodes.length);
    console.log('updatedMarkWrapper.childNodes:', Array.from(updatedMarkWrapper?.childNodes || []).map(n => ({
      nodeType: n.nodeType,
      nodeName: n.nodeName,
      textContent: n.textContent
    })));

    // Assertions
    expect(updatedMarkWrapper).toBeTruthy();
    expect(updatedMarkWrapper.textContent).toBe('yellow bㅁackground');
  });
});

