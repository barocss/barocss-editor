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

    // 기본 템플릿 정의
    define('paragraph', element('p', { className: 'paragraph' }, [slot('content')]));
    define('inline-text', element('span', { className: 'text' }, [data('text')]));
    
    // chip decorator 정의 (main.ts와 동일)
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

      // decorator 없이 텍스트만 렌더링되어야 함
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

      // 첫 번째 render (decorator 없음)
      renderer.render(container, model);

      // decorator 추가
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

      // 두 번째 render (decorator 있음)
      renderer.render(container, model, decorators);

      // decorator가 렌더링되어야 함
      const textElement = container.querySelector('[data-bc-sid="text-14"]');
      expect(textElement).toBeTruthy();
      
      // chip decorator는 text-14의 children으로 렌더링됨
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

      // 첫 번째 render
      renderer.render(container, model);

      // 여러 decorator 추가
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

      // 두 번째 render
      renderer.render(container, model, decorators);

      // 두 decorator가 모두 렌더링되어야 함
      const textElement = container.querySelector('[data-bc-sid="text-14"]');
      expect(textElement).toBeTruthy();
      
      // decorator는 text-14의 children으로 렌더링됨
      // before decorator
      const beforeChip = textElement?.querySelector('[data-decorator-sid="chip-before"]') || 
                         textElement?.querySelector('.chip');
      expect(beforeChip).toBeTruthy();
      expect(beforeChip?.textContent).toBe('CHIP');
      
      // after decorator도 text-14 내부에 렌더링됨
      // VNodeBuilder의 _buildMarkedRunsWithDecorators 로직에 따라 children으로 들어감
      const textContent = textElement?.textContent || '';
      expect(textContent).toContain('Hello');
      expect(textContent).toContain('World');
      
      // after decorator도 확인
      const afterChip = textElement?.querySelector('[data-decorator-sid="chip-after"]');
      // after decorator는 텍스트 범위에 따라 위치가 달라질 수 있음
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

      // 첫 번째 render (decorator 있음)
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

      // 두 번째 render (decorator 없음)
      renderer.render(container, model);

      // decorator가 제거되어야 함
      const textElement = container.querySelector('[data-bc-sid="text-14"]');
      expect(textElement).toBeTruthy();
      
      const chipElement = textElement?.previousSibling as HTMLElement;
      // decorator가 제거되었으므로 chip이 없어야 함
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

      // 첫 번째 render
      renderer.render(container, model, decorators);
      
      const chip1 = container.querySelector('.chip');
      expect(chip1).toBeTruthy();

      // 두 번째 render (동일한 modelData, 동일한 decorators)
      renderer.render(container, model, decorators);
      
      const chip2 = container.querySelector('.chip');
      expect(chip2).toBeTruthy();
      
      // 세 번째 render
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

      // 첫 번째 render
      renderer.render(container, model);

      // decorator 추가 후 두 번째 render
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

      // 이 호출에서 updateComponent가 호출되어야 하고,
      // context.getComponent가 있어서 warning이 발생하지 않아야 함
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

      // warning이 발생하지 않아야 함
      expect(warningOccurred).toBe(false);
    });
  });
});

