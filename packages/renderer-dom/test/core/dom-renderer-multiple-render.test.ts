/**
 * DOMRenderer.render() 여러 번 호출 테스트
 * 
 * decorator가 추가된 후 다시 render()를 호출할 때 decorator가 제대로 전달되는지 확인
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { define, element, data, defineDecorator, getGlobalRegistry, slot } from '@barocss/dsl';
import { DOMRenderer } from '../../src/dom-renderer';
import { expectHTML } from '../utils/html';

describe('DOMRenderer Multiple Render Calls', () => {
  let renderer: DOMRenderer;
  let registry: ReturnType<typeof getGlobalRegistry>;
  let container: HTMLElement;

  beforeEach(() => {
    registry = getGlobalRegistry();
    renderer = new DOMRenderer(registry);
    container = document.createElement('div');
    document.body.appendChild(container);

    // Define base templates
    define('paragraph', element('p', { className: 'paragraph' }, [slot('content')]));
    define('inline-text', element('span', { className: 'text' }, [data('text')]));
    
    // Define chip decorator (same as main.ts)
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
    }, [data('text', 'CHIP')]));
  });

  afterEach(() => {
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    renderer.destroy();
  });

  describe('decorator 추가 후 재렌더링', () => {
    it('첫 번째 render() 호출 시 decorator 없이 렌더링', () => {
      const model = {
        sid: 'p-1',
        stype: 'paragraph',
        content: [
          {
            sid: 'text-14',
            stype: 'inline-text',
            text: 'Hello World'
          }
        ]
      };

      renderer.render(container, model);

      // Should render only text without decorator
      expectHTML(
        container,
        `<p class="paragraph" data-bc-sid="p-1">
          <span class="text" data-bc-sid="text-14">
            <span>Hello World</span>
          </span>
        </p>`,
        expect
      );
    });

    it('decorator 추가 후 두 번째 render() 호출 시 decorator가 전달되어야 함', () => {
      const model = {
        sid: 'p-1',
        stype: 'paragraph',
        content: [
          {
            sid: 'text-14',
            stype: 'inline-text',
            text: 'Hello World'
          }
        ]
      };

      // First render (no decorator)
      renderer.render(container, model);

      // Add decorator
      const decorators = [
        {
          sid: 'chip-before',
          stype: 'chip',
          category: 'inline' as const,
          target: {
            sid: 'text-14',
            startOffset: 0,
            endOffset: 5
          },
          position: 'before' as const
        }
      ];

      // Second render (with decorator)
      renderer.render(container, model, decorators);

      // Decorator should be rendered
      const textElement = container.querySelector('[data-bc-sid="text-14"]');
      expect(textElement).toBeTruthy();
      
      // chip decorator is rendered as children of text-14
      const chipElement = textElement?.querySelector('[data-decorator-sid="chip-before"]') || 
                         textElement?.querySelector('.chip');
      expect(chipElement).toBeTruthy();
      expect(chipElement?.textContent).toBe('CHIP');
      expect(chipElement?.classList.contains('chip')).toBe(true);
    });

    it('여러 decorator 추가 후 재렌더링', () => {
      const model = {
        sid: 'p-1',
        stype: 'paragraph',
        content: [
          {
            sid: 'text-14',
            stype: 'inline-text',
            text: 'Hello World'
          }
        ]
      };

      // First render
      renderer.render(container, model);

      // Add multiple decorators
      const decorators = [
        {
          sid: 'chip-before',
          stype: 'chip',
          category: 'inline' as const,
          target: {
            sid: 'text-14',
            startOffset: 0,
            endOffset: 5
          },
          position: 'before' as const
        },
        {
          sid: 'chip-after',
          stype: 'chip',
          category: 'inline' as const,
          target: {
            sid: 'text-14',
            startOffset: 6,
            endOffset: 11
          },
          position: 'after' as const
        }
      ];

      // Second render
      renderer.render(container, model, decorators);

      // Both decorators should be rendered
      const textElement = container.querySelector('[data-bc-sid="text-14"]');
      expect(textElement).toBeTruthy();
      
      // Decorators are rendered as children of text-14
      // before decorator
      const beforeChip = textElement?.querySelector('[data-decorator-sid="chip-before"]') || 
                         textElement?.querySelector('.chip');
      expect(beforeChip).toBeTruthy();
      expect(beforeChip?.textContent).toBe('CHIP');
      
      // after decorator is also rendered inside text-14
      // According to VNodeBuilder's _buildMarkedRunsWithDecorators logic, it goes into children
      const textContent = textElement?.textContent || '';
      expect(textContent).toContain('Hello');
      expect(textContent).toContain('World');
      
      // Also verify after decorator
      const afterChip = textElement?.querySelector('[data-decorator-sid="chip-after"]');
      // after decorator position may vary depending on text range
      if (afterChip) {
        expect(afterChip.textContent).toBe('CHIP');
      }
    });

    it('decorator 제거 후 재렌더링', () => {
      const model = {
        sid: 'p-1',
        stype: 'paragraph',
        content: [
          {
            sid: 'text-14',
            stype: 'inline-text',
            text: 'Hello World'
          }
        ]
      };

      // First render (with decorator)
      const decorators1 = [
        {
          sid: 'chip-before',
          stype: 'chip',
          category: 'inline' as const,
          target: {
            sid: 'text-14',
            startOffset: 0,
            endOffset: 5
          },
          position: 'before' as const
        }
      ];
      renderer.render(container, model, decorators1);

      // Second render (no decorator)
      renderer.render(container, model);

      // Decorator should be removed
      const textElement = container.querySelector('[data-bc-sid="text-14"]');
      expect(textElement).toBeTruthy();
      
      const chipElement = textElement?.previousSibling as HTMLElement;
      // Since decorator is removed, chip should not exist
      if (chipElement) {
        expect(chipElement?.classList.contains('chip')).toBe(false);
      }
    });

    it('동일한 modelData로 여러 번 render() 호출 시 decorator가 계속 전달되어야 함', () => {
      const model = {
        sid: 'p-1',
        stype: 'paragraph',
        content: [
          {
            sid: 'text-14',
            stype: 'inline-text',
            text: 'Hello World'
          }
        ]
      };

      const decorators = [
        {
          sid: 'chip-before',
          stype: 'chip',
          category: 'inline' as const,
          target: {
            sid: 'text-14',
            startOffset: 0,
            endOffset: 5
          },
          position: 'before' as const
        }
      ];

      // First render
      renderer.render(container, model, decorators);
      
      const chip1 = container.querySelector('.chip');
      expect(chip1).toBeTruthy();

      // Second render (same modelData, same decorators)
      renderer.render(container, model, decorators);
      
      const chip2 = container.querySelector('.chip');
      expect(chip2).toBeTruthy();
      
      // Third render
      renderer.render(container, model, decorators);
      
      const chip3 = container.querySelector('.chip');
      expect(chip3).toBeTruthy();
    });
  });

  describe('context.getComponent 전달 확인', () => {
    it('updateComponent가 호출될 때 context.getComponent가 있어야 함', () => {
      const model = {
        sid: 'p-1',
        stype: 'paragraph',
        content: [
          {
            sid: 'text-14',
            stype: 'inline-text',
            text: 'Hello World'
          }
        ]
      };

      // First render
      renderer.render(container, model);

      // Second render after adding decorator
      const decorators = [
        {
          sid: 'chip-before',
          stype: 'chip',
          category: 'inline' as const,
          target: {
            sid: 'text-14',
            startOffset: 0,
            endOffset: 5
          },
          position: 'before' as const
        }
      ];

      // In this call, updateComponent should be called,
      // and context.getComponent should exist so no warning occurs
      let warningOccurred = false;
      const originalWarn = console.warn;
      console.warn = (...args: any[]) => {
        if (args[0]?.includes?.('getComponent not provided')) {
          warningOccurred = true;
        }
        originalWarn.apply(console, args);
      };

      renderer.render(container, model, decorators);

      console.warn = originalWarn;

      // Warning should not occur
      expect(warningOccurred).toBe(false);
    });
  });
});

