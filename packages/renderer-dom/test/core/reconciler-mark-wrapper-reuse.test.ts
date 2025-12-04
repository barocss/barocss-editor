/**
 * Test for mark wrapper DOM element reuse
 * 
 * 문제: mark wrapper span이 sid가 없어서 매번 새로 생성되는 문제
 * 해결: prevVNode에 DOM element 참조를 저장하여 재사용
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DOMRenderer } from '../../src/dom-renderer';
import { getGlobalRegistry, define, element, data, slot, defineMark } from '@barocss/dsl';
import type { ModelData } from '@barocss/dsl';
import { VNodeBuilder } from '../../src/vnode/factory';

describe('Reconciler: Mark Wrapper DOM Element Reuse', () => {
  let container: HTMLElement;
  let renderer: DOMRenderer;
  let registry: ReturnType<typeof getGlobalRegistry>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    
    registry = getGlobalRegistry();
    renderer = new DOMRenderer(registry);
    
    // Define inline-text component with marks
    // Note: 실제 mark rendering은 factory에서 처리되므로, 여기서는 간단한 구조로 테스트
    define('inline-text', element('span', {
      'data-bc-sid': data('sid'),
      'data-bc-stype': () => 'inline-text',
      class: 'text'
    }, [
      // Mark wrapper는 factory에서 생성되므로, 여기서는 직접 구조를 만들지 않음
      // 대신 실제 사용 패턴을 시뮬레이션
      data('text')
    ]));
  });

  afterEach(() => {
    if (container && container.parentNode) {
      document.body.removeChild(container);
    }
  });

  it('should reuse mark wrapper span when text changes', () => {
    // Initial render
    const initialModel: ModelData = {
      sid: 'text-1',
      stype: 'inline-text',
      text: 'Hello',
      marks: [{
        type: 'bold',
        range: [0, 5]
      }]
    };

    renderer.render(container, initialModel);

    // Check initial DOM structure
    const initialSpan = container.querySelector('[data-bc-sid="text-1"]') as HTMLElement;
    expect(initialSpan).toBeTruthy();
    expect(initialSpan.textContent).toBe('Hello');
    
    // Store reference to initial span
    const initialSpanRef = initialSpan;

    // Update: change text from "Hello" to "Hello World"
    const updatedModel: ModelData = {
      sid: 'text-1',
      stype: 'inline-text',
      text: 'Hello World',
      marks: [{
        type: 'bold',
        range: [0, 11]
      }]
    };

    renderer.render(container, updatedModel);

    // Check that span was reused (same DOM element)
    const updatedSpan = container.querySelector('[data-bc-sid="text-1"]') as HTMLElement;
    
    expect(updatedSpan).toBeTruthy();
    expect(updatedSpan).toBe(initialSpanRef); // Same DOM element
    expect(updatedSpan.textContent).toBe('Hello World');
    
    // Check that there's only one span (no duplicates)
    const allSpans = container.querySelectorAll('[data-bc-sid="text-1"]');
    expect(allSpans.length).toBe(1);
  });

  it('should reuse element when text changes without marks', () => {
    // Initial render
    const initialModel: ModelData = {
      sid: 'text-1',
      stype: 'inline-text',
      text: 'Hello'
    };

    renderer.render(container, initialModel);

    const initialSpan = container.querySelector('[data-bc-sid="text-1"]') as HTMLElement;
    expect(initialSpan).toBeTruthy();
    expect(initialSpan.textContent).toBe('Hello');
    
    const initialSpanRef = initialSpan;

    // Update: change text
    const updatedModel: ModelData = {
      sid: 'text-1',
      stype: 'inline-text',
      text: 'Hello World'
    };

    renderer.render(container, updatedModel);

    const updatedSpan = container.querySelector('[data-bc-sid="text-1"]') as HTMLElement;
    
    expect(updatedSpan).toBeTruthy();
    expect(updatedSpan).toBe(initialSpanRef); // Same DOM element
    expect(updatedSpan.textContent).toBe('Hello World');
    
    // No duplicates
    const allSpans = container.querySelectorAll('[data-bc-sid="text-1"]');
    expect(allSpans.length).toBe(1);
  });

  it('should reuse mark wrapper span when text changes (with actual mark rendering)', () => {
    // Define mark templates
    defineMark('bold', element('span', {
      className: 'mark-bold',
      style: { fontWeight: 'bold' }
    }, [data('text')]));

    define('paragraph', element('p', {
      className: 'paragraph'
    }, [slot('content')]));

    // Initial render with bold mark
    const initialModel: ModelData = {
      sid: 'p-1',
      stype: 'paragraph',
      content: [{
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello',
        marks: [{ type: 'bold', range: [0, 5] }]
      }]
    };

    renderer.render(container, initialModel);

    const textSpan = container.querySelector('[data-bc-sid="text-1"]') as HTMLElement;
    expect(textSpan).toBeTruthy();
    
    const initialMarkWrapper = textSpan.querySelector('span.mark-bold') as HTMLElement;
    expect(initialMarkWrapper).toBeTruthy();
    expect(initialMarkWrapper.textContent).toBe('Hello');
    
    // Store reference to initial mark wrapper
    const initialMarkWrapperRef = initialMarkWrapper;

    // Update: change text from "Hello" to "Hello World"
    const updatedModel: ModelData = {
      sid: 'p-1',
      stype: 'paragraph',
      content: [{
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello World',
        marks: [{ type: 'bold', range: [0, 11] }]
      }]
    };

    renderer.render(container, updatedModel);

    // Check that mark wrapper was reused (same DOM element)
    const updatedTextSpan = container.querySelector('[data-bc-sid="text-1"]') as HTMLElement;
    const updatedMarkWrapper = updatedTextSpan?.querySelector('span.mark-bold') as HTMLElement;
    
    expect(updatedMarkWrapper).toBeTruthy();
    expect(updatedMarkWrapper).toBe(initialMarkWrapperRef); // Same DOM element - THIS IS THE KEY TEST
    expect(updatedMarkWrapper.textContent).toBe('Hello World');
    
    // Check that there's only one mark wrapper (no duplicates)
    const allMarkWrappers = updatedTextSpan.querySelectorAll('span.mark-bold');
    expect(allMarkWrappers.length).toBe(1);
    
    // Verify the structure: text-1 should have only one child (the mark wrapper)
    const textSpanChildren = Array.from(updatedTextSpan.children);
    expect(textSpanChildren.length).toBe(1);
    expect(textSpanChildren[0]).toBe(updatedMarkWrapper);
  });

  it('should reuse mark wrapper after multiple updates', () => {
    defineMark('bold', element('span', {
      className: 'mark-bold',
      style: { fontWeight: 'bold' }
    }, [data('text')]));

    define('paragraph', element('p', {
      className: 'paragraph'
    }, [slot('content')]));

    // Initial render
    const model1: ModelData = {
      sid: 'p-1',
      stype: 'paragraph',
      content: [{
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello',
        marks: [{ type: 'bold', range: [0, 5] }]
      }]
    };

    renderer.render(container, model1);
    const markWrapper1 = container.querySelector('span.mark-bold') as HTMLElement;
    expect(markWrapper1).toBeTruthy();
    const ref1 = markWrapper1;

    // Update 1
    const model2: ModelData = {
      sid: 'p-1',
      stype: 'paragraph',
      content: [{
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello World',
        marks: [{ type: 'bold', range: [0, 11] }]
      }]
    };
    renderer.render(container, model2);
    const markWrapper2 = container.querySelector('span.mark-bold') as HTMLElement;
    expect(markWrapper2).toBe(ref1);

    // Update 2
    const model3: ModelData = {
      sid: 'p-1',
      stype: 'paragraph',
      content: [{
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello Beautiful World',
        marks: [{ type: 'bold', range: [0, 22] }]
      }]
    };
    renderer.render(container, model3);
    const markWrapper3 = container.querySelector('span.mark-bold') as HTMLElement;
    expect(markWrapper3).toBe(ref1);

    // No duplicates
    const allMarkWrappers = container.querySelectorAll('span.mark-bold');
    expect(allMarkWrappers.length).toBe(1);
  });

  it('should reuse nested mark wrappers (bold + italic)', () => {
    defineMark('bold', element('span', {
      className: 'mark-bold',
      style: { fontWeight: 'bold' }
    }, [data('text')]));

    defineMark('italic', element('span', {
      className: 'mark-italic',
      style: { fontStyle: 'italic' }
    }, [data('text')]));

    define('paragraph', element('p', {
      className: 'paragraph'
    }, [slot('content')]));

    // Initial render with nested marks
    const initialModel: ModelData = {
      sid: 'p-1',
      stype: 'paragraph',
      content: [{
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello World',
        marks: [
          { type: 'bold', range: [0, 11] },
          { type: 'italic', range: [0, 11] }
        ]
      }]
    };

    renderer.render(container, initialModel);

    const textSpan = container.querySelector('[data-bc-sid="text-1"]') as HTMLElement;
    const initialBoldWrapper = textSpan.querySelector('span.mark-bold') as HTMLElement;
    const initialItalicWrapper = initialBoldWrapper?.querySelector('span.mark-italic') as HTMLElement;
    
    expect(initialBoldWrapper).toBeTruthy();
    expect(initialItalicWrapper).toBeTruthy();
    
    const boldRef = initialBoldWrapper;
    const italicRef = initialItalicWrapper;

    // Update: change text
    const updatedModel: ModelData = {
      sid: 'p-1',
      stype: 'paragraph',
      content: [{
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello Beautiful World',
        marks: [
          { type: 'bold', range: [0, 22] },
          { type: 'italic', range: [0, 22] }
        ]
      }]
    };

    renderer.render(container, updatedModel);

    const updatedTextSpan = container.querySelector('[data-bc-sid="text-1"]') as HTMLElement;
    const updatedBoldWrapper = updatedTextSpan.querySelector('span.mark-bold') as HTMLElement;
    const updatedItalicWrapper = updatedBoldWrapper?.querySelector('span.mark-italic') as HTMLElement;
    
    // Both should be reused
    expect(updatedBoldWrapper).toBe(boldRef);
    expect(updatedItalicWrapper).toBe(italicRef);
    
    // No duplicates
    expect(updatedTextSpan.querySelectorAll('span.mark-bold').length).toBe(1);
    expect(updatedBoldWrapper.querySelectorAll('span.mark-italic').length).toBe(1);
  });

  it('should handle mark addition (no mark -> with mark)', () => {
    defineMark('bold', element('span', {
      className: 'mark-bold',
      style: { fontWeight: 'bold' }
    }, [data('text')]));

    define('paragraph', element('p', {
      className: 'paragraph'
    }, [slot('content')]));

    // Initial render without mark
    const initialModel: ModelData = {
      sid: 'p-1',
      stype: 'paragraph',
      content: [{
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello'
      }]
    };

    renderer.render(container, initialModel);

    const textSpan1 = container.querySelector('[data-bc-sid="text-1"]') as HTMLElement;
    expect(textSpan1.textContent).toBe('Hello');
    expect(textSpan1.querySelector('span.mark-bold')).toBeNull();

    // Update: add bold mark
    const updatedModel: ModelData = {
      sid: 'p-1',
      stype: 'paragraph',
      content: [{
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello',
        marks: [{ type: 'bold', range: [0, 5] }]
      }]
    };

    renderer.render(container, updatedModel);

    const textSpan2 = container.querySelector('[data-bc-sid="text-1"]') as HTMLElement;
    const markWrapper = textSpan2.querySelector('span.mark-bold') as HTMLElement;
    
    expect(markWrapper).toBeTruthy();
    expect(markWrapper.textContent).toBe('Hello');
    expect(textSpan2).toBe(textSpan1); // textSpan should be reused
  });

  it('should handle mark removal (with mark -> no mark)', () => {
    defineMark('bold', element('span', {
      className: 'mark-bold',
      style: { fontWeight: 'bold' }
    }, [data('text')]));

    define('paragraph', element('p', {
      className: 'paragraph'
    }, [slot('content')]));

    // Initial render with mark
    const initialModel: ModelData = {
      sid: 'p-1',
      stype: 'paragraph',
      content: [{
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello',
        marks: [{ type: 'bold', range: [0, 5] }]
      }]
    };

    renderer.render(container, initialModel);

    const textSpan1 = container.querySelector('[data-bc-sid="text-1"]') as HTMLElement;
    expect(textSpan1.querySelector('span.mark-bold')).toBeTruthy();

    // Update: remove bold mark
    const updatedModel: ModelData = {
      sid: 'p-1',
      stype: 'paragraph',
      content: [{
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello'
      }]
    };

    renderer.render(container, updatedModel);

    const textSpan2 = container.querySelector('[data-bc-sid="text-1"]') as HTMLElement;
    expect(textSpan2).toBe(textSpan1); // textSpan should be reused
    expect(textSpan2.querySelector('span.mark-bold')).toBeNull();
    expect(textSpan2.textContent).toBe('Hello');
  });

  it('should reuse multiple mark wrappers in sequence', () => {
    defineMark('bold', element('span', {
      className: 'mark-bold',
      style: { fontWeight: 'bold' }
    }, [data('text')]));

    defineMark('italic', element('span', {
      className: 'mark-italic',
      style: { fontStyle: 'italic' }
    }, [data('text')]));

    define('paragraph', element('p', {
      className: 'paragraph'
    }, [slot('content')]));

    // Initial render with multiple marks in sequence
    const initialModel: ModelData = {
      sid: 'p-1',
      stype: 'paragraph',
      content: [{
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello World',
        marks: [
          { type: 'bold', range: [0, 5] },   // "Hello"
          { type: 'italic', range: [6, 11] }  // "World"
        ]
      }]
    };

    renderer.render(container, initialModel);

    const textSpan = container.querySelector('[data-bc-sid="text-1"]') as HTMLElement;
    const boldWrappers = Array.from(textSpan.querySelectorAll('span.mark-bold'));
    const italicWrappers = Array.from(textSpan.querySelectorAll('span.mark-italic'));
    
    expect(boldWrappers.length).toBe(1);
    expect(italicWrappers.length).toBe(1);
    
    const boldRef = boldWrappers[0] as HTMLElement;
    const italicRef = italicWrappers[0] as HTMLElement;

    // Update: change text but keep same mark structure
    const updatedModel: ModelData = {
      sid: 'p-1',
      stype: 'paragraph',
      content: [{
        sid: 'text-1',
        stype: 'inline-text',
        text: 'Hello Beautiful World',
        marks: [
          { type: 'bold', range: [0, 5] },        // "Hello"
          { type: 'italic', range: [6, 15] }       // "Beautiful"
        ]
      }]
    };

    renderer.render(container, updatedModel);

    const updatedTextSpan = container.querySelector('[data-bc-sid="text-1"]') as HTMLElement;
    const updatedBoldWrappers = Array.from(updatedTextSpan.querySelectorAll('span.mark-bold'));
    const updatedItalicWrappers = Array.from(updatedTextSpan.querySelectorAll('span.mark-italic'));
    
    // Both should be reused
    expect(updatedBoldWrappers.length).toBe(1);
    expect(updatedItalicWrappers.length).toBe(1);
    expect(updatedBoldWrappers[0]).toBe(boldRef);
    expect(updatedItalicWrappers[0]).toBe(italicRef);
  });

  it('should preserve mark styles (class, style, data-mark-type) after second render', () => {
    // Define bgColor mark with style and className (similar to text-yellow-bg issue)
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

    define('paragraph', element('p', {
      className: 'paragraph'
    }, [slot('content')]));

    // Initial render with bgColor mark
    // IMPORTANT: mark range는 [start, end) 형식이므로, 전체 텍스트를 포함하려면 [0, text.length]이어야 함
    const initialModel: ModelData = {
      sid: 'p-1',
      stype: 'paragraph',
      content: [{
        sid: 'text-yellow-bg',
        stype: 'inline-text',
        text: 'yellow background', // 17자
        marks: [{
          type: 'bgColor',
          range: [0, 17], // 전체 텍스트를 포함하도록 수정 (기존: [0, 16])
          attrs: { bgColor: '#ffff00' }
        }]
      }]
    };

    renderer.render(container, initialModel);

    const textSpan = container.querySelector('[data-bc-sid="text-yellow-bg"]') as HTMLElement;
    expect(textSpan).toBeTruthy();
    
    const markWrapper = textSpan.querySelector('span.custom-bg-color') as HTMLElement;
    expect(markWrapper).toBeTruthy();
    
    // Store initial mark styles
    const initialClassName = markWrapper.className;
    const initialStyle = markWrapper.getAttribute('style');
    const initialDataMarkType = markWrapper.getAttribute('data-mark-type');
    const initialDataBgColor = markWrapper.getAttribute('data-bg-color');
    
    expect(initialClassName).toContain('custom-bg-color');
    expect(initialStyle).toBeTruthy();
    expect(initialStyle).toContain('background-color');
    expect(initialDataMarkType).toBe('bgColor');
    expect(initialDataBgColor).toBe('#ffff00');
    
    // Update: change text (simulating text input)
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

    renderer.render(container, updatedModel);

    // Check that mark wrapper still exists and styles are preserved
    const updatedTextSpan = container.querySelector('[data-bc-sid="text-yellow-bg"]') as HTMLElement;
    expect(updatedTextSpan).toBeTruthy();
    
    const updatedMarkWrapper = updatedTextSpan.querySelector('span.custom-bg-color') as HTMLElement;
    expect(updatedMarkWrapper).toBeTruthy();
    
    // CRITICAL: Verify that styles are preserved after second render
    const updatedClassName = updatedMarkWrapper.className;
    const updatedStyle = updatedMarkWrapper.getAttribute('style');
    const updatedDataMarkType = updatedMarkWrapper.getAttribute('data-mark-type');
    const updatedDataBgColor = updatedMarkWrapper.getAttribute('data-bg-color');
    
    expect(updatedClassName).toBe(initialClassName);
    expect(updatedStyle).toBe(initialStyle);
    expect(updatedDataMarkType).toBe(initialDataMarkType);
    expect(updatedDataBgColor).toBe(initialDataBgColor);
    
    // Verify text content was updated
    expect(updatedMarkWrapper.textContent).toBe('yellow bㅁackground');
  });

  it('should preserve mark styles for bold mark after text change', () => {
    defineMark('bold', element('span', {
      className: 'custom-bold mark-bold',
      'data-mark-type': 'bold',
      'data-weight': data('weight', 'bold'),
      style: {
        fontWeight: 'bold',
        padding: '1px 2px',
        borderRadius: '2px'
      }
    }, [data('text')]));

    define('paragraph', element('p', {
      className: 'paragraph'
    }, [slot('content')]));

    // Initial render
    const initialText = 'bold text';
    const initialModel: ModelData = {
      sid: 'p-1',
      stype: 'paragraph',
      content: [{
        sid: 'text-bold',
        stype: 'inline-text',
        text: initialText,
        marks: [{ type: 'bold', range: [0, initialText.length] }]
      }]
    };

    const builder = new VNodeBuilder(registry);
    console.log('[test:bold] initial model', JSON.stringify(initialModel, null, 2));
    const initialVNode = builder.build('paragraph', initialModel);
    console.log('[test:bold] initial VNode tree', JSON.stringify(initialVNode, null, 2));
    renderer.render(container, initialModel);

    const textSpan = container.querySelector('[data-bc-sid="text-bold"]') as HTMLElement;
    const markWrapper = textSpan.querySelector('span.custom-bold') as HTMLElement;
    console.log('[test:bold] after initial render', {
      textContent: markWrapper?.textContent,
      outerHTML: markWrapper?.outerHTML
    });
    
    const initialClassName = markWrapper.className;
    const initialStyle = markWrapper.getAttribute('style');
    const initialDataMarkType = markWrapper.getAttribute('data-mark-type');
    
    // Update: change text
    const updatedText = 'bold text updated';
    const updatedModel: ModelData = {
      sid: 'p-1',
      stype: 'paragraph',
      content: [{
        sid: 'text-bold',
        stype: 'inline-text',
        text: updatedText,
        marks: [{ type: 'bold', range: [0, updatedText.length] }]
      }]
    };

    console.log('[test:bold] updated model', JSON.stringify(updatedModel, null, 2));
    const updatedVNode = builder.build('paragraph', updatedModel);
    console.log('[test:bold] updated VNode tree', JSON.stringify(updatedVNode, null, 2));
    renderer.render(container, updatedModel);

    const updatedTextSpan = container.querySelector('[data-bc-sid="text-bold"]') as HTMLElement;
    const updatedMarkWrapper = updatedTextSpan.querySelector('span.custom-bold') as HTMLElement;
    console.log('[test:bold] after second render', {
      textContent: updatedMarkWrapper?.textContent,
      outerHTML: updatedMarkWrapper?.outerHTML
    });
    
    // Verify styles are preserved
    expect(updatedMarkWrapper.className).toBe(initialClassName);
    expect(updatedMarkWrapper.getAttribute('style')).toBe(initialStyle);
    expect(updatedMarkWrapper.getAttribute('data-mark-type')).toBe(initialDataMarkType);
    expect(updatedMarkWrapper.textContent).toBe('bold text updated');
  });
});

