/**
 * 복잡한 Mark와 Decorator 결합 테스트
 * 
 * 여러 mark가 겹치고, mark와 decorator가 복잡하게 섞인 경우를 테스트
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { define, element, data, defineMark, defineDecorator, getGlobalRegistry, slot } from '@barocss/dsl';
import { DOMRenderer } from '../../src/dom-renderer';
import { expectHTML } from '../utils/html';
import type { Decorator } from '../../src/vnode/decorator';

describe('Mark와 Decorator 복잡한 결합 테스트', () => {
  let renderer: DOMRenderer;
  let registry: ReturnType<typeof getGlobalRegistry>;
  let container: HTMLElement;

  beforeEach(() => {
    registry = getGlobalRegistry();
    renderer = new DOMRenderer(registry);
    container = document.createElement('div');
    document.body.appendChild(container);

    // Define base templates
    define('document', element('div', { className: 'document' }, [slot('content')]));
    define('paragraph', element('p', { className: 'paragraph' }, [slot('content')]));
    define('inline-text', element('span', { className: 'text' }, [data('text')]));
    
    // Define Marks
    defineMark('bold', element('strong', { className: 'mark-bold' }, [data('text')]));
    defineMark('italic', element('em', { className: 'mark-italic' }, [data('text')]));
    defineMark('link', element('a', { className: 'mark-link', href: '#' }, [data('text')]));
    defineMark('code', element('code', { className: 'mark-code' }, [data('text')]));
    
    // Define Decorators
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
    
    defineDecorator('badge', element('span', {
      className: 'badge',
      style: {
        display: 'inline-block',
        padding: '1px 4px',
        backgroundColor: '#ff6b6b',
        color: 'white',
        borderRadius: '3px',
        fontSize: '10px',
        margin: '0 1px'
      }
    }, [data('text', 'BADGE')]));
  });

  afterEach(() => {
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    renderer.destroy();
  });

  describe('여러 Mark와 Decorator 결합', () => {
    it('bold + italic + decorator가 모두 적용된 텍스트', () => {
      const model = {
        sid: 'p-1',
        stype: 'paragraph',
        content: [
          {
            sid: 'text-1',
            stype: 'inline-text',
            text: 'Bold italic text with decorator',
            marks: [
              {
                type: 'bold',
                range: [0, 4] // "Bold"
              },
              {
                type: 'italic',
                range: [5, 11] // "italic"
              }
            ]
          }
        ]
      };

      const decorators: Decorator[] = [
        {
          sid: 'chip-1',
          stype: 'chip',
          category: 'inline',
          target: {
            sid: 'text-1',
            startOffset: 0,
            endOffset: 4
          },
          position: 'before',
          data: {}
        }
      ];

      renderer.render(container, model, decorators);

      // Verify entire DOM structure with expectHTML
      expectHTML(
        container,
        `<p class="paragraph" data-bc-sid="p-1">
          <span class="text" data-bc-sid="text-1">
            <span class="chip" data-decorator="true" data-decorator-category="inline" data-decorator-position="before" data-decorator-sid="chip-1" data-decorator-stype="chip" data-skip-reconcile="true" style="display: inline-block; padding: 2px 6px; background-color: rgb(224, 224, 224); border-radius: 4px; font-size: 12px; margin: 0px 2px;">CHIP</span>
            <strong class="mark-bold"><span>Bold</span></strong>
            <em class="mark-italic"><span>italic</span></em>
            <span>text with decorator</span>
          </span>
        </p>`,
        expect
      );
    });

    it('겹치는 Mark와 Decorator', () => {
      const model = {
        sid: 'p-1',
        stype: 'paragraph',
        content: [
          {
            sid: 'text-1',
            stype: 'inline-text',
            text: 'Bold and italic text',
            marks: [
              {
                type: 'bold',
                range: [0, 4] // "Bold"
              },
              {
                type: 'italic',
                range: [9, 15] // "italic"
              }
            ]
          }
        ]
      };

      const decorators: Decorator[] = [
        {
          sid: 'chip-1',
          stype: 'chip',
          category: 'inline',
          target: {
            sid: 'text-1',
            startOffset: 0,
            endOffset: 4
          },
          position: 'before',
          data: {}
        },
        {
          sid: 'badge-1',
          stype: 'badge',
          category: 'inline',
          target: {
            sid: 'text-1',
            startOffset: 9,
            endOffset: 15
          },
          position: 'after',
          data: {}
        }
      ];

      renderer.render(container, model, decorators);

      // Verify entire DOM structure with expectHTML (matching actual DOM structure)
      expectHTML(
        container,
        `<p class="paragraph" data-bc-sid="p-1">
          <span class="text" data-bc-sid="text-1">
            <span class="chip" data-decorator="true" data-decorator-category="inline" data-decorator-position="before" data-decorator-sid="chip-1" data-decorator-stype="chip" data-skip-reconcile="true" style="display: inline-block; padding: 2px 6px; background-color: rgb(224, 224, 224); border-radius: 4px; font-size: 12px; margin: 0px 2px;">CHIP</span>
            <strong class="mark-bold"><span>Bold</span></strong>
            <span>and</span>
            <em class="mark-italic"><span>italic</span></em>
            <span class="badge" data-decorator="true" data-decorator-category="inline" data-decorator-position="after" data-decorator-sid="badge-1" data-decorator-stype="badge" data-skip-reconcile="true" style="display: inline-block; padding: 1px 4px; background-color: rgb(255, 107, 107); color: white; border-radius: 3px; font-size: 10px; margin: 0px 1px;">BADGE</span>
            <span>text</span>
          </span>
        </p>`,
        expect
      );
    });

    it('Mark 안에 Decorator가 있는 경우', () => {
      const model = {
        sid: 'p-1',
        stype: 'paragraph',
        content: [
          {
            sid: 'text-1',
            stype: 'inline-text',
            text: 'Bold text with decorator inside',
            marks: [
              {
                type: 'bold',
                range: [0, 9] // "Bold text"
              }
            ]
          }
        ]
      };

      const decorators: Decorator[] = [
        {
          sid: 'chip-1',
          stype: 'chip',
          category: 'inline',
          target: {
            sid: 'text-1',
            startOffset: 5,
            endOffset: 9 // "text" part
          },
          position: 'before',
          data: {}
        }
      ];

      renderer.render(container, model, decorators);

      // Verify entire DOM structure with expectHTML (matching actual DOM structure)
      expectHTML(
        container,
        `<p class="paragraph" data-bc-sid="p-1">
          <span class="text" data-bc-sid="text-1">
            <strong class="mark-bold"><span>Bold</span></strong>
            <span class="chip" data-decorator="true" data-decorator-category="inline" data-decorator-position="before" data-decorator-sid="chip-1" data-decorator-stype="chip" data-skip-reconcile="true" style="display: inline-block; padding: 2px 6px; background-color: rgb(224, 224, 224); border-radius: 4px; font-size: 12px; margin: 0px 2px;">CHIP</span>
            <strong class="mark-bold"><span>text</span></strong>
            <span>with decorator inside</span>
          </span>
        </p>`,
        expect
      );
    });

    it('여러 Mark가 겹치고 여러 Decorator가 있는 경우', () => {
      const model = {
        sid: 'p-1',
        stype: 'paragraph',
        content: [
          {
            sid: 'text-1',
            stype: 'inline-text',
            text: 'Bold italic link text with multiple decorators',
            marks: [
              {
                type: 'bold',
                range: [0, 4] // "Bold"
              },
              {
                type: 'italic',
                range: [5, 11] // "italic"
              },
              {
                type: 'link',
                range: [12, 16] // "link"
              }
            ]
          }
        ]
      };

      const decorators: Decorator[] = [
        {
          sid: 'chip-1',
          stype: 'chip',
          category: 'inline',
          target: {
            sid: 'text-1',
            startOffset: 0,
            endOffset: 4
          },
          position: 'before',
          data: {}
        },
        {
          sid: 'badge-1',
          stype: 'badge',
          category: 'inline',
          target: {
            sid: 'text-1',
            startOffset: 12,
            endOffset: 16
          },
          position: 'after',
          data: {}
        }
      ];

      renderer.render(container, model, decorators);

      // Verify entire DOM structure with expectHTML (matching actual DOM structure)
      expectHTML(
        container,
        `<p class="paragraph" data-bc-sid="p-1">
          <span class="text" data-bc-sid="text-1">
            <span class="chip" data-decorator="true" data-decorator-category="inline" data-decorator-position="before" data-decorator-sid="chip-1" data-decorator-stype="chip" data-skip-reconcile="true" style="display: inline-block; padding: 2px 6px; background-color: rgb(224, 224, 224); border-radius: 4px; font-size: 12px; margin: 0px 2px;">CHIP</span>
            <strong class="mark-bold"><span>Bold</span></strong>
            <em class="mark-italic"><span>italic</span></em>
            <a class="mark-link" href="#"><span>link</span></a>
            <span class="badge" data-decorator="true" data-decorator-category="inline" data-decorator-position="after" data-decorator-sid="badge-1" data-decorator-stype="badge" data-skip-reconcile="true" style="display: inline-block; padding: 1px 4px; background-color: rgb(255, 107, 107); color: white; border-radius: 3px; font-size: 10px; margin: 0px 1px;">BADGE</span>
            <span>text with multiple decorators</span>
          </span>
        </p>`,
        expect
      );
    });
  });

  describe('여러 겹으로 겹친 Mark', () => {
    it('bold와 italic이 같은 텍스트에 겹치는 경우', () => {
      const model = {
        sid: 'p-1',
        stype: 'paragraph',
        content: [
          {
            sid: 'text-1',
            stype: 'inline-text',
            text: 'Bold and italic text',
            marks: [
              {
                type: 'bold',
                range: [0, 4] // "Bold"
              },
              {
                type: 'italic',
                range: [0, 4] // Overlaps with "Bold"
              }
            ]
          }
        ]
      };

      renderer.render(container, model);

      // Verify entire DOM structure with expectHTML
      expectHTML(
        container,
        `<p class="paragraph" data-bc-sid="p-1">
          <span class="text" data-bc-sid="text-1">
            <strong class="mark-bold">
              <em class="mark-italic"><span>Bold</span></em>
            </strong>
            <span> and italic text</span>
          </span>
        </p>`,
        expect
      );
    });

    it('bold, italic, link가 모두 같은 텍스트에 겹치는 경우', () => {
      const model = {
        sid: 'p-1',
        stype: 'paragraph',
        content: [
          {
            sid: 'text-1',
            stype: 'inline-text',
            text: 'Bold italic link text',
            marks: [
              {
                type: 'bold',
                range: [0, 4] // "Bold"
              },
              {
                type: 'italic',
                range: [0, 4] // Overlaps with "Bold"
              },
              {
                type: 'link',
                range: [0, 4] // Overlaps with "Bold"
              }
            ]
          }
        ]
      };

      renderer.render(container, model);

      // Verify entire DOM structure with expectHTML
      expectHTML(
        container,
        `<p class="paragraph" data-bc-sid="p-1">
          <span class="text" data-bc-sid="text-1">
            <strong class="mark-bold">
              <em class="mark-italic">
                <a class="mark-link" href="#"><span>Bold</span></a>
              </em>
            </strong>
            <span> italic link text</span>
          </span>
        </p>`,
        expect
      );
    });

    it('부분적으로 겹치는 여러 Mark', () => {
      const model = {
        sid: 'p-1',
        stype: 'paragraph',
        content: [
          {
            sid: 'text-1',
            stype: 'inline-text',
            text: 'Bold italic and link text',
            marks: [
              {
                type: 'bold',
                range: [0, 4] // "Bold"
              },
              {
                type: 'italic',
                range: [5, 11] // "italic"
              },
              {
                type: 'link',
                range: [16, 20] // "link"
              }
            ]
          }
        ]
      };

      renderer.render(container, model);

      // Verify entire DOM structure with expectHTML
      expectHTML(
        container,
        `<p class="paragraph" data-bc-sid="p-1">
          <span class="text" data-bc-sid="text-1">
            <strong class="mark-bold"><span>Bold</span></strong>
            <em class="mark-italic"><span>italic</span></em>
            <span> and </span>
            <a class="mark-link" href="#"><span>link</span></a>
            <span> text</span>
          </span>
        </p>`,
        expect
      );
    });

    it('겹치는 Mark와 Decorator가 함께 있는 경우', () => {
      const model = {
        sid: 'p-1',
        stype: 'paragraph',
        content: [
          {
            sid: 'text-1',
            stype: 'inline-text',
            text: 'Bold italic text with decorator',
            marks: [
              {
                type: 'bold',
                range: [0, 4] // "Bold"
              },
              {
                type: 'italic',
                range: [0, 4] // Overlaps with "Bold"
              }
            ]
          }
        ]
      };

      const decorators: Decorator[] = [
        {
          sid: 'chip-1',
          stype: 'chip',
          category: 'inline',
          target: {
            sid: 'text-1',
            startOffset: 0,
            endOffset: 4
          },
          position: 'before',
          data: {}
        }
      ];

      renderer.render(container, model, decorators);

      // Verify entire DOM structure with expectHTML
      expectHTML(
        container,
        `<p class="paragraph" data-bc-sid="p-1">
          <span class="text" data-bc-sid="text-1">
            <span class="chip" data-decorator="true" data-decorator-category="inline" data-decorator-position="before" data-decorator-sid="chip-1" data-decorator-stype="chip" data-skip-reconcile="true" style="display: inline-block; padding: 2px 6px; background-color: rgb(224, 224, 224); border-radius: 4px; font-size: 12px; margin: 0px 2px;">CHIP</span>
            <strong class="mark-bold">
              <em class="mark-italic"><span>Bold</span></em>
            </strong>
            <span> italic text with decorator</span>
          </span>
        </p>`,
        expect
      );
    });

    it('긴 텍스트에 여러 겹의 Mark가 부분적으로 겹치는 경우', () => {
      const model = {
        sid: 'p-1',
        stype: 'paragraph',
        content: [
          {
            sid: 'text-1',
            stype: 'inline-text',
            text: 'This is bold italic and link text with code',
            marks: [
              {
                type: 'bold',
                range: [8, 12] // "bold"
              },
              {
                type: 'italic',
                range: [8, 12] // Overlaps with "bold"
              },
              {
                type: 'link',
                range: [13, 19] // "italic"
              },
              {
                type: 'code',
                range: [34, 38] // "code"
              }
            ]
          }
        ]
      };

      renderer.render(container, model);

      // Verify entire DOM structure with expectHTML (matching actual DOM structure)
      expectHTML(
        container,
        `<p class="paragraph" data-bc-sid="p-1">
          <span class="text" data-bc-sid="text-1">
            <span>This is</span>
            <strong class="mark-bold">
              <em class="mark-italic"><span>bold</span></em>
            </strong>
            <a class="mark-link" href="#"><span>italic</span></a>
            <span>and link text</span>
            <code class="mark-code"><span>with</span></code>
            <span>code</span>
          </span>
        </p>`,
        expect
      );
    });

    it('지그재그로 겹쳐진 Mark들 (0-2 bold, 5-7 bold, 0-10 italic)', () => {
      const model = {
        sid: 'p-1',
        stype: 'paragraph',
        content: [
          {
            sid: 'text-1',
            stype: 'inline-text',
            text: 'Hello World',
            marks: [
              {
                type: 'bold',
                range: [0, 2] // "He"
              },
              {
                type: 'bold',
                range: [5, 7] // "Wo"
              },
              {
                type: 'italic',
                range: [0, 10] // "Hello Worl" (covers almost entire text)
              }
            ]
          }
        ]
      };

      renderer.render(container, model);

      // Verify entire DOM structure with expectHTML (matching actual DOM structure)
      // italic covers 0-10, with bold at 0-2 and 5-7 inside it
      // Actually, bold may be outside italic
      expectHTML(
        container,
        `<p class="paragraph" data-bc-sid="p-1">
          <span class="text" data-bc-sid="text-1">
            <strong class="mark-bold">
              <em class="mark-italic"><span>He</span></em>
            </strong>
            <em class="mark-italic"><span>llo</span></em>
            <strong class="mark-bold">
              <em class="mark-italic"><span>W</span></em>
            </strong>
            <em class="mark-italic"><span>orl</span></em>
            <span>d</span>
          </span>
        </p>`,
        expect
      );
    });

    it('복잡한 지그재그 겹침 (여러 구간의 bold와 전체를 덮는 italic)', () => {
      const model = {
        sid: 'p-1',
        stype: 'paragraph',
        content: [
          {
            sid: 'text-1',
            stype: 'inline-text',
            text: 'This is a test text',
            marks: [
              {
                type: 'bold',
                range: [0, 4] // "This"
              },
              {
                type: 'bold',
                range: [8, 9] // "a"
              },
              {
                type: 'bold',
                range: [10, 14] // "test"
              },
              {
                type: 'italic',
                range: [0, 15] // "This is a test " (almost entire)
              }
            ]
          }
        ]
      };

      renderer.render(container, model);

      // Verify entire DOM structure with expectHTML (matching actual DOM structure)
      expectHTML(
        container,
        `<p class="paragraph" data-bc-sid="p-1">
          <span class="text" data-bc-sid="text-1">
            <strong class="mark-bold">
              <em class="mark-italic"><span>This</span></em>
            </strong>
            <em class="mark-italic"><span>is</span></em>
            <strong class="mark-bold">
              <em class="mark-italic"><span>a</span></em>
            </strong>
            <strong class="mark-bold">
              <em class="mark-italic"><span>test</span></em>
            </strong>
            <span>text</span>
          </span>
        </p>`,
        expect
      );
    });

    it('여러 겹의 지그재그 (bold, italic, link가 복잡하게 겹침)', () => {
      const model = {
        sid: 'p-1',
        stype: 'paragraph',
        content: [
          {
            sid: 'text-1',
            stype: 'inline-text',
            text: 'Bold italic link text',
            marks: [
              {
                type: 'bold',
                range: [0, 4] // "Bold"
              },
              {
                type: 'bold',
                range: [12, 16] // "link"
              },
              {
                type: 'italic',
                range: [5, 11] // "italic"
              },
              {
                type: 'italic',
                range: [12, 16] // "link" (overlaps with bold)
              },
              {
                type: 'link',
                range: [0, 4] // "Bold" (overlaps with bold)
              },
              {
                type: 'link',
                range: [12, 16] // "link" (overlaps with bold, italic)
              }
            ]
          }
        ]
      };

      renderer.render(container, model);

      // Verify entire DOM structure with expectHTML (matching actual DOM structure)
      // Complex nested structure
      expectHTML(
        container,
        `<p class="paragraph" data-bc-sid="p-1">
          <span class="text" data-bc-sid="text-1">
            <strong class="mark-bold">
              <a class="mark-link" href="#"><span>Bold</span></a>
            </strong>
            <em class="mark-italic"><span>italic</span></em>
            <strong class="mark-bold">
              <em class="mark-italic">
                <a class="mark-link" href="#"><span>link</span></a>
              </em>
            </strong>
            <span>text</span>
          </span>
        </p>`,
        expect
      );
    });

    it('지그재그 겹침과 Decorator 결합', () => {
      const model = {
        sid: 'p-1',
        stype: 'paragraph',
        content: [
          {
            sid: 'text-1',
            stype: 'inline-text',
            text: 'Hello World',
            marks: [
              {
                type: 'bold',
                range: [0, 2] // "He"
              },
              {
                type: 'bold',
                range: [5, 7] // "Wo"
              },
              {
                type: 'italic',
                range: [0, 10] // "Hello Worl"
              }
            ]
          }
        ]
      };

      const decorators: Decorator[] = [
        {
          sid: 'chip-1',
          stype: 'chip',
          category: 'inline',
          target: {
            sid: 'text-1',
            startOffset: 0,
            endOffset: 2
          },
          position: 'before',
          data: {}
        },
        {
          sid: 'badge-1',
          stype: 'badge',
          category: 'inline',
          target: {
            sid: 'text-1',
            startOffset: 5,
            endOffset: 7
          },
          position: 'after',
          data: {}
        }
      ];

      renderer.render(container, model, decorators);

      // Verify entire DOM structure with expectHTML (matching actual DOM structure)
      expectHTML(
        container,
        `<p class="paragraph" data-bc-sid="p-1">
          <span class="text" data-bc-sid="text-1">
            <span class="chip" data-decorator="true" data-decorator-category="inline" data-decorator-position="before" data-decorator-sid="chip-1" data-decorator-stype="chip" data-skip-reconcile="true" style="display: inline-block; padding: 2px 6px; background-color: rgb(224, 224, 224); border-radius: 4px; font-size: 12px; margin: 0px 2px;">CHIP</span>
            <strong class="mark-bold">
              <em class="mark-italic"><span>He</span></em>
            </strong>
            <em class="mark-italic"><span>llo</span></em>
            <strong class="mark-bold">
              <em class="mark-italic"><span>W</span></em>
            </strong>
            <span class="badge" data-decorator="true" data-decorator-category="inline" data-decorator-position="after" data-decorator-sid="badge-1" data-decorator-stype="badge" data-skip-reconcile="true" style="display: inline-block; padding: 1px 4px; background-color: rgb(255, 107, 107); color: white; border-radius: 3px; font-size: 10px; margin: 0px 1px;">BADGE</span>
            <em class="mark-italic"><span>orl</span></em>
            <span>d</span>
          </span>
        </p>`,
        expect
      );
    });
  });

  describe('복잡한 중첩 구조', () => {
    it('여러 단락에 각각 다른 Mark와 Decorator', () => {
      const model = {
        sid: 'doc-1',
        stype: 'document',
        content: [
          {
            sid: 'p-1',
            stype: 'paragraph',
            content: [
              {
                sid: 'text-1',
                stype: 'inline-text',
                text: 'First paragraph with bold',
                marks: [
                  {
                    type: 'bold',
                    range: [6, 10] // "with"
                  }
                ]
              }
            ]
          },
          {
            sid: 'p-2',
            stype: 'paragraph',
            content: [
              {
                sid: 'text-2',
                stype: 'inline-text',
                text: 'Second paragraph with italic',
                marks: [
                  {
                    type: 'italic',
                    range: [6, 10] // "with"
                  }
                ]
              }
            ]
          },
          {
            sid: 'p-3',
            stype: 'paragraph',
            content: [
              {
                sid: 'text-3',
                stype: 'inline-text',
                text: 'Third paragraph with link',
                marks: [
                  {
                    type: 'link',
                    range: [6, 10] // "with"
                  }
                ]
              }
            ]
          }
        ]
      };

      const decorators: Decorator[] = [
        {
          sid: 'chip-1',
          stype: 'chip',
          category: 'inline',
          target: {
            sid: 'text-1',
            startOffset: 0,
            endOffset: 5
          },
          position: 'before',
          data: {}
        },
        {
          sid: 'badge-2',
          stype: 'badge',
          category: 'inline',
          target: {
            sid: 'text-2',
            startOffset: 0,
            endOffset: 6
          },
          position: 'before',
          data: {}
        }
      ];

      renderer.render(container, model, decorators);

      // Verify entire DOM structure with expectHTML (matching actual DOM structure)
      expectHTML(
        container,
        `<div class="document" data-bc-sid="doc-1">
          <p class="paragraph" data-bc-sid="p-1">
            <span class="text" data-bc-sid="text-1">
              <span class="chip" data-decorator="true" data-decorator-category="inline" data-decorator-position="before" data-decorator-sid="chip-1" data-decorator-stype="chip" data-skip-reconcile="true" style="display: inline-block; padding: 2px 6px; background-color: rgb(224, 224, 224); border-radius: 4px; font-size: 12px; margin: 0px 2px;">CHIP</span>
              <span>First</span>
              <strong class="mark-bold"><span>para</span></strong>
              <span>graph with bold</span>
            </span>
          </p>
          <p class="paragraph" data-bc-sid="p-2">
            <span class="text" data-bc-sid="text-2">
              <span class="badge" data-decorator="true" data-decorator-category="inline" data-decorator-position="before" data-decorator-sid="badge-2" data-decorator-stype="badge" data-skip-reconcile="true" style="display: inline-block; padding: 1px 4px; background-color: rgb(255, 107, 107); border-radius: 3px; color: white; font-size: 10px; margin: 0px 1px;">BADGE</span>
              <span>Second</span>
              <em class="mark-italic"><span>par</span></em>
              <span>agraph with italic</span>
            </span>
          </p>
          <p class="paragraph" data-bc-sid="p-3">
            <span class="text" data-bc-sid="text-3">
              <span>Third</span>
              <a class="mark-link" href="#"><span>para</span></a>
              <span>graph with link</span>
            </span>
          </p>
        </div>`,
        expect
      );
    });
  });

  describe('실제 사용 시나리오', () => {
    it('마크다운 문서처럼 복잡한 구조', () => {
      const model = {
        sid: 'doc-1',
        stype: 'document',
        content: [
          {
            sid: 'p-1',
            stype: 'paragraph',
            content: [
              {
                sid: 'text-1',
                stype: 'inline-text',
                text: 'This is bold text with a link and code',
                marks: [
                  {
                    type: 'bold',
                    range: [8, 12] // "bold"
                  },
                  {
                    type: 'link',
                    range: [25, 29] // "link"
                  },
                  {
                    type: 'code',
                    range: [34, 38] // "code"
                  }
                ]
              }
            ]
          }
        ]
      };

      const decorators: Decorator[] = [
        {
          sid: 'chip-1',
          stype: 'chip',
          category: 'inline',
          target: {
            sid: 'text-1',
            startOffset: 8,
            endOffset: 12
          },
          position: 'before',
          data: {}
        },
        {
          sid: 'badge-1',
          stype: 'badge',
          category: 'inline',
          target: {
            sid: 'text-1',
            startOffset: 34,
            endOffset: 38
          },
          position: 'after',
          data: {}
        }
      ];

      renderer.render(container, model, decorators);

      // Verify entire DOM structure with expectHTML (matching actual DOM structure)
      expectHTML(
        container,
        `<div class="document" data-bc-sid="doc-1">
          <p class="paragraph" data-bc-sid="p-1">
            <span class="text" data-bc-sid="text-1">
              <span>This is</span>
              <span class="chip" data-decorator="true" data-decorator-category="inline" data-decorator-position="before" data-decorator-sid="chip-1" data-decorator-stype="chip" data-skip-reconcile="true" style="display: inline-block; padding: 2px 6px; background-color: rgb(224, 224, 224); border-radius: 4px; font-size: 12px; margin: 0px 2px;">CHIP</span>
              <strong class="mark-bold"><span>bold</span></strong>
              <span>text with a</span>
              <a class="mark-link" href="#"><span>link</span></a>
              <span>and</span>
              <code class="mark-code"><span>code</span></code>
              <span class="badge" data-decorator="true" data-decorator-category="inline" data-decorator-position="after" data-decorator-sid="badge-1" data-decorator-stype="badge" data-skip-reconcile="true" style="display: inline-block; padding: 1px 4px; background-color: rgb(255, 107, 107); color: white; border-radius: 3px; font-size: 10px; margin: 0px 1px;">BADGE</span>
            </span>
          </p>
        </div>`,
        expect
      );
    });

    it('여러 번 render() 호출 시 Mark와 Decorator 유지', () => {
      const model = {
        sid: 'p-1',
        stype: 'paragraph',
        content: [
          {
            sid: 'text-1',
            stype: 'inline-text',
            text: 'Bold text with decorator',
            marks: [
              {
                type: 'bold',
                range: [0, 4] // "Bold"
              }
            ]
          }
        ]
      };

      // First render: no decorator
      renderer.render(container, model);
      expectHTML(
        container,
        `<p class="paragraph" data-bc-sid="p-1">
          <span class="text" data-bc-sid="text-1">
            <strong class="mark-bold"><span>Bold</span></strong>
            <span> text with decorator</span>
          </span>
        </p>`,
        expect
      );

      // Second render: add decorator
      const decorators: Decorator[] = [
        {
          sid: 'chip-1',
          stype: 'chip',
          category: 'inline',
          target: {
            sid: 'text-1',
            startOffset: 0,
            endOffset: 4
          },
          position: 'before',
          data: {}
        }
      ];
      renderer.render(container, model, decorators);
      expectHTML(
        container,
        `<p class="paragraph" data-bc-sid="p-1">
          <span class="text" data-bc-sid="text-1">
            <span class="chip" data-decorator="true" data-decorator-category="inline" data-decorator-position="before" data-decorator-sid="chip-1" data-decorator-stype="chip" data-skip-reconcile="true" style="display: inline-block; padding: 2px 6px; background-color: rgb(224, 224, 224); border-radius: 4px; font-size: 12px; margin: 0px 2px;">CHIP</span>
            <strong class="mark-bold"><span>Bold</span></strong>
            <span> text with decorator</span>
          </span>
        </p>`,
        expect
      );

      // Third render: remove decorator
      renderer.render(container, model);
      expectHTML(
        container,
        `<p class="paragraph" data-bc-sid="p-1">
          <span class="text" data-bc-sid="text-1">
            <strong class="mark-bold"><span>Bold</span></strong>
            <span> text with decorator</span>
          </span>
        </p>`,
        expect
      );
    });
  });
});

