/**
 * Block Decorator 스펙 및 테스트
 * 
 * Block Decorator는 block-level 요소에 적용되는 decorator로,
 * target 요소의 형제 요소로 before/after 위치에 렌더링됩니다.
 * 
 * 스펙:
 * - category: 'block'
 * - position: 'before' | 'after' (block decorator는 주로 before/after 사용)
 * - target: { sid: string } (startOffset/endOffset 없음 - 전체 요소 대상)
 * - 렌더링 위치: target 요소의 형제 요소로 before/after에 삽입
 * - target 요소의 텍스트/children에는 영향을 주지 않아야 함
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { define, element, data, defineDecorator, getGlobalRegistry, slot } from '@barocss/dsl';
import { DOMRenderer } from '../../src/dom-renderer';
import { expectHTML } from '../utils/html';
import type { Decorator } from '../../src/vnode/decorator';

describe('Block Decorator 스펙 및 테스트', () => {
  let renderer: DOMRenderer;
  let registry: ReturnType<typeof getGlobalRegistry>;
  let container: HTMLElement;

  beforeEach(() => {
    registry = getGlobalRegistry();
    renderer = new DOMRenderer(registry);
    container = document.createElement('div');
    document.body.appendChild(container);

    // 기본 템플릿 정의
    define('document', element('div', { className: 'document' }, [slot('content')]));
    define('paragraph', element('p', { className: 'paragraph' }, [data('text')]));
    define('heading', element('h1', { className: 'heading' }, [data('text')]));
    
    // Block Decorator 정의
    defineDecorator('comment', element('div', {
      className: 'comment-decorator',
      style: {
        borderLeft: '3px solid blue',
        paddingLeft: '5px',
        margin: '10px 0',
        backgroundColor: '#f0f0f0'
      }
    }, [data('text', 'COMMENT')]));
    
    defineDecorator('note', element('div', {
      className: 'note-decorator',
      style: {
        borderLeft: '3px solid green',
        paddingLeft: '5px',
        margin: '10px 0',
        backgroundColor: '#f0fff0'
      }
    }, [data('text', 'NOTE')]));
  });

  afterEach(() => {
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
  });

  describe('Block Decorator 기본 스펙', () => {
    it('block decorator가 before position으로 렌더링되어야 함', () => {
      const model = {
        sid: 'doc-1',
        stype: 'document',
        content: [
          {
        sid: 'p-1',
        stype: 'paragraph',
        text: 'This is a paragraph with a comment before it.'
          }
        ]
      };

      const decorators: Decorator[] = [
        {
          sid: 'comment-1',
          stype: 'comment',
          category: 'block',
          target: {
            sid: 'p-1'
          },
          position: 'before',
          data: {}
        }
      ];

      renderer.render(container, model, decorators);

      // 실제 DOM 구조 확인
      const paragraph = container.querySelector('[data-bc-sid="p-1"]') as HTMLElement;
      const decorator = container.querySelector('[data-decorator-sid="comment-1"]') as HTMLElement;
      
      expect(paragraph).toBeTruthy();
      expect(decorator).toBeTruthy();
      expect(decorator.getAttribute('data-decorator-position')).toBe('before');
      expect(paragraph.textContent).toBe('This is a paragraph with a comment before it.');
      
      // expectHTML로 전체 DOM 구조 검증
      expectHTML(
        container,
        `<div class="document" data-bc-sid="doc-1">
          <div class="comment-decorator" data-decorator="true" data-decorator-category="block" data-decorator-position="before" data-decorator-sid="comment-1" data-decorator-stype="comment" data-skip-reconcile="true" style="background-color: rgb(240, 240, 240); border-left: 3px solid blue; margin: 10px 0px; padding-left: 5px">COMMENT</div>
          <p class="paragraph" data-bc-sid="p-1">This is a paragraph with a comment before it.</p>
        </div>`,
        expect
      );
    });

    it('block decorator가 after position으로 렌더링되어야 함', () => {
      const model = {
        sid: 'doc-1',
        stype: 'document',
        content: [
          {
        sid: 'p-1',
        stype: 'paragraph',
        text: 'This is a paragraph with a comment after it.'
          }
        ]
      };

      const decorators: Decorator[] = [
        {
          sid: 'comment-1',
          stype: 'comment',
          category: 'block',
          target: {
            sid: 'p-1'
          },
          position: 'after',
          data: {}
        }
      ];

      renderer.render(container, model, decorators);

      // 실제 DOM 구조 확인
      const paragraph = container.querySelector('[data-bc-sid="p-1"]') as HTMLElement;
      const decorator = container.querySelector('[data-decorator-sid="comment-1"]') as HTMLElement;
      
      expect(paragraph).toBeTruthy();
      expect(decorator).toBeTruthy();
      expect(decorator.getAttribute('data-decorator-position')).toBe('after');
      expect(paragraph.textContent).toBe('This is a paragraph with a comment after it.');
      
      // expectHTML로 전체 DOM 구조 검증
      expectHTML(
        container,
        `<div class="document" data-bc-sid="doc-1">
          <p class="paragraph" data-bc-sid="p-1">This is a paragraph with a comment after it.</p>
          <div class="comment-decorator" data-decorator="true" data-decorator-category="block" data-decorator-position="after" data-decorator-sid="comment-1" data-decorator-stype="comment" data-skip-reconcile="true" style="background-color: rgb(240, 240, 240); border-left: 3px solid blue; margin: 10px 0px; padding-left: 5px">COMMENT</div>
        </div>`,
        expect
      );
    });

    it('block decorator가 있어도 paragraph의 텍스트가 정상적으로 렌더링되어야 함', () => {
      const model = {
        sid: 'doc-1',
        stype: 'document',
        content: [
          {
        sid: 'p-1',
        stype: 'paragraph',
        text: 'This paragraph should have its text rendered correctly even with block decorators.'
          }
        ]
      };

      const decorators: Decorator[] = [
        {
          sid: 'comment-1',
          stype: 'comment',
          category: 'block',
          target: {
            sid: 'p-1'
          },
          position: 'before',
          data: {}
        },
        {
          sid: 'note-1',
          stype: 'note',
          category: 'block',
          target: {
            sid: 'p-1'
          },
          position: 'after',
          data: {}
        }
      ];

      renderer.render(container, model, decorators);

      // paragraph의 텍스트가 정상적으로 렌더링되는지 확인
      const paragraph = container.querySelector('[data-bc-sid="p-1"]') as HTMLElement;
      expect(paragraph).toBeTruthy();
      expect(paragraph.textContent).toBe('This paragraph should have its text rendered correctly even with block decorators.');
      
      const commentDecorator = container.querySelector('[data-decorator-sid="comment-1"]') as HTMLElement;
      const noteDecorator = container.querySelector('[data-decorator-sid="note-1"]') as HTMLElement;
      expect(commentDecorator).toBeTruthy();
      expect(noteDecorator).toBeTruthy();
      expect(commentDecorator.textContent).toBe('COMMENT');
      expect(noteDecorator.textContent).toBe('NOTE');
      
      // expectHTML로 전체 DOM 구조 검증
      expectHTML(
        container,
        `<div class="document" data-bc-sid="doc-1">
          <div class="comment-decorator" data-decorator="true" data-decorator-category="block" data-decorator-position="before" data-decorator-sid="comment-1" data-decorator-stype="comment" data-skip-reconcile="true" style="background-color: rgb(240, 240, 240); border-left: 3px solid blue; margin: 10px 0px; padding-left: 5px">COMMENT</div>
          <p class="paragraph" data-bc-sid="p-1">This paragraph should have its text rendered correctly even with block decorators.</p>
          <div class="note-decorator" data-decorator="true" data-decorator-category="block" data-decorator-position="after" data-decorator-sid="note-1" data-decorator-stype="note" data-skip-reconcile="true" style="background-color: rgb(240, 255, 240); border-left: 3px solid green; margin: 10px 0px; padding-left: 5px">NOTE</div>
        </div>`,
        expect
      );
    });
  });

  describe('여러 Block Decorator', () => {
    it('여러 block decorator가 올바른 순서로 렌더링되어야 함', () => {
      const model = {
        sid: 'doc-1',
        stype: 'document',
        content: [
          {
        sid: 'p-1',
        stype: 'paragraph',
        text: 'Paragraph with multiple block decorators.'
          }
        ]
      };

      const decorators: Decorator[] = [
        {
          sid: 'comment-1',
          stype: 'comment',
          category: 'block',
          target: {
            sid: 'p-1'
          },
          position: 'before',
          data: {}
        },
        {
          sid: 'note-1',
          stype: 'note',
          category: 'block',
          target: {
            sid: 'p-1'
          },
          position: 'before',
          data: {}
        },
        {
          sid: 'comment-2',
          stype: 'comment',
          category: 'block',
          target: {
            sid: 'p-1'
          },
          position: 'after',
          data: {}
        }
      ];

      renderer.render(container, model, decorators);

      // expectHTML로 전체 DOM 구조 검증
      expectHTML(
        container,
        `<div class="document" data-bc-sid="doc-1">
          <div class="comment-decorator" data-decorator="true" data-decorator-category="block" data-decorator-position="before" data-decorator-sid="comment-1" data-decorator-stype="comment" data-skip-reconcile="true" style="background-color: rgb(240, 240, 240); border-left: 3px solid blue; margin: 10px 0px; padding-left: 5px">COMMENT</div>
          <div class="note-decorator" data-decorator="true" data-decorator-category="block" data-decorator-position="before" data-decorator-sid="note-1" data-decorator-stype="note" data-skip-reconcile="true" style="background-color: rgb(240, 255, 240); border-left: 3px solid green; margin: 10px 0px; padding-left: 5px">NOTE</div>
          <p class="paragraph" data-bc-sid="p-1">Paragraph with multiple block decorators.</p>
          <div class="comment-decorator" data-decorator="true" data-decorator-category="block" data-decorator-position="after" data-decorator-sid="comment-2" data-decorator-stype="comment" data-skip-reconcile="true" style="background-color: rgb(240, 240, 240); border-left: 3px solid blue; margin: 10px 0px; padding-left: 5px">COMMENT</div>
        </div>`,
        expect
      );
    });
  });

  describe('Block Decorator와 Document 구조', () => {
    it('document 내부의 paragraph에 block decorator가 적용되어야 함', () => {
      const model = {
        sid: 'doc-1',
        stype: 'document',
        content: [
          {
            sid: 'p-1',
            stype: 'paragraph',
            text: 'First paragraph'
          },
          {
            sid: 'p-2',
            stype: 'paragraph',
            text: 'Second paragraph'
          }
        ]
      };

      const decorators: Decorator[] = [
        {
          sid: 'comment-1',
          stype: 'comment',
          category: 'block',
          target: {
            sid: 'p-1'
          },
          position: 'before',
          data: {}
        },
        {
          sid: 'note-1',
          stype: 'note',
          category: 'block',
          target: {
            sid: 'p-2'
          },
          position: 'after',
          data: {}
        }
      ];

      renderer.render(container, model, decorators);

      // expectHTML로 전체 DOM 구조 검증 (실제 구조에 맞게)
      // TODO: p-1의 텍스트가 정상적으로 렌더링되어야 함 (현재 버그)
      // block decorator가 before position일 때 텍스트가 paragraph 밖으로 나가는 문제가 있음
      expectHTML(
        container,
        `<div class="document" data-bc-sid="doc-1">
          <div class="comment-decorator" data-decorator="true" data-decorator-category="block" data-decorator-position="before" data-decorator-sid="comment-1" data-decorator-stype="comment" data-skip-reconcile="true" style="background-color: rgb(240, 240, 240); border-left: 3px solid blue; margin: 10px 0px; padding-left: 5px">COMMENT</div>
          <p class="paragraph" data-bc-sid="p-1">First paragraph</p>
          <p class="paragraph" data-bc-sid="p-2">Second paragraph</p>
          <div class="note-decorator" data-decorator="true" data-decorator-category="block" data-decorator-position="after" data-decorator-sid="note-1" data-decorator-stype="note" data-skip-reconcile="true" style="background-color: rgb(240, 255, 240); border-left: 3px solid green; margin: 10px 0px; padding-left: 5px">NOTE</div>
        </div>`,
        expect
      );
    });
  });

  describe('Block Decorator 추가/제거', () => {
    it('block decorator 추가 시 paragraph 텍스트가 유지되어야 함', () => {
      const model = {
        sid: 'doc-1',
        stype: 'document',
        content: [
          {
        sid: 'p-1',
        stype: 'paragraph',
        text: 'This paragraph should keep its text when decorator is added.'
          }
        ]
      };

      // 첫 번째 렌더링: decorator 없음
      renderer.render(container, model, []);
      const paragraph1 = container.querySelector('[data-bc-sid="p-1"]') as HTMLElement;
      expect(paragraph1.textContent).toBe('This paragraph should keep its text when decorator is added.');

      // 두 번째 렌더링: decorator 추가
      const decorators: Decorator[] = [
        {
          sid: 'comment-1',
          stype: 'comment',
          category: 'block',
          target: {
            sid: 'p-1'
          },
          position: 'before',
          data: {}
        }
      ];
      renderer.render(container, model, decorators);
      
      const paragraph2 = container.querySelector('[data-bc-sid="p-1"]') as HTMLElement;
      expect(paragraph2).toBe(paragraph1); // 같은 DOM 요소여야 함
      expect(paragraph2.textContent).toBe('This paragraph should keep its text when decorator is added.'); // 텍스트 유지
    });

    it('block decorator 제거 시 paragraph 텍스트가 유지되어야 함', () => {
      const model = {
        sid: 'doc-1',
        stype: 'document',
        content: [
          {
        sid: 'p-1',
        stype: 'paragraph',
        text: 'This paragraph should keep its text when decorator is removed.'
          }
        ]
      };

      // 첫 번째 렌더링: decorator 있음
      const decorators: Decorator[] = [
        {
          sid: 'comment-1',
          stype: 'comment',
          category: 'block',
          target: {
            sid: 'p-1'
          },
          position: 'before',
          data: {}
        }
      ];
      renderer.render(container, model, decorators);
      const paragraph1 = container.querySelector('[data-bc-sid="p-1"]') as HTMLElement;
      expect(paragraph1).toBeTruthy();
      expect(paragraph1.textContent).toBe('This paragraph should keep its text when decorator is removed.');

      // 두 번째 렌더링: decorator 제거
      renderer.render(container, model, []);
      
      const paragraph2 = container.querySelector('[data-bc-sid="p-1"]') as HTMLElement;
      expect(paragraph2).toBe(paragraph1); // 같은 DOM 요소여야 함
      expect(paragraph2.textContent).toBe('This paragraph should keep its text when decorator is removed.'); // 텍스트 유지
    });
  });
});

