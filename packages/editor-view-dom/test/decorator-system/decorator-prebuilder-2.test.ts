/**
 * DecoratorPrebuilder 추가 테스트 (2)
 * 
 * - custom / pattern decorator 처리
 * - inline decorator의 비-content layerTarget 처리
 * - 입력 불변성 보장
 * - 결과 순서 보장
 * 
 * 모든 테스트는 전체 JSON 구조를 비교합니다.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RendererRegistry, ModelData, define, element } from '@barocss/dsl';
import { DOMRenderer } from '@barocss/renderer-dom';
import { DecoratorPrebuilder, type DecoratorModel } from '../../src/decorator/decorator-prebuilder';
import type { Decorator } from '../../src/decorator/types';

describe('DecoratorPrebuilder (set 2)', () => {
  let registry: RendererRegistry;
  let contentLayer: HTMLElement;
  let contentRenderer: DOMRenderer;
  let prebuilder: DecoratorPrebuilder;
  
  beforeEach(() => {
    registry = new RendererRegistry({ global: false });
    // Define basic renderers (global)
    define('document', element('div', { className: 'document' }));
    define('paragraph', element('p', { className: 'paragraph' }));
    define('inline-text', element('span', { className: 'inline-text' }));
    
    contentLayer = document.createElement('div');
    contentLayer.className = 'barocss-editor-content';
    document.body.appendChild(contentLayer);
    
    contentRenderer = new DOMRenderer(registry);
    prebuilder = new DecoratorPrebuilder(registry, contentLayer, contentRenderer);
  });
  
  afterEach(() => {
    if (contentLayer.parentNode) contentLayer.parentNode.removeChild(contentLayer);
  });
  
  it('inline decorator라도 layerTarget이 decorator면 절대좌표 style을 적용해야 함 (data.position이 있는 경우)', () => {
    const modelData: ModelData = {
      sid: 'doc1',
      stype: 'document'
    };
    
    const decorator: Decorator = {
      sid: 'i1',
      stype: 'inline-note',
      category: 'inline',
      layerTarget: 'decorator',
      data: {
        position: { top: 7, left: 11, width: 33, height: 14 },
        note: 'inline on overlay'
      }
    };
    
    const models = prebuilder.buildAll([decorator], modelData);
    
    const expected: DecoratorModel[] = [
      {
        sid: 'i1',
        stype: 'inline-note',
        category: 'inline',
        layerTarget: 'decorator',
        position: { top: 7, left: 11, width: 33, height: 14 },
        data: {
          position: { top: 7, left: 11, width: 33, height: 14 },
          note: 'inline on overlay'
        },
        style: {
          position: 'absolute',
          top: '7px',
          left: '11px',
          width: '33px',
          height: '14px'
        }
      }
    ];
    
    expect(models).toEqual(expected);
  });
  
  it('custom decorator는 generate를 무시하고 주어진 데이터로만 변환해야 함', () => {
    const modelData: ModelData = {
      sid: 'doc1',
      stype: 'document'
    };
    
    const decorator: Decorator = {
      sid: 'c1',
      stype: 'ai-status',
      category: 'layer',
      layerTarget: 'decorator',
      decoratorType: 'custom',
      // generate is not used in Prebuilder stage (only processes already generated results)
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      generate: (() => []) as any,
      data: {
        position: { top: 1, left: 2, width: 3, height: 4 },
        status: 'processing'
      }
    };
    
    const models = prebuilder.buildAll([decorator], modelData);
    
    const expected: DecoratorModel[] = [
      {
        sid: 'c1',
        stype: 'ai-status',
        category: 'layer',
        layerTarget: 'decorator',
        position: { top: 1, left: 2, width: 3, height: 4 },
        data: {
          position: { top: 1, left: 2, width: 3, height: 4 },
          status: 'processing'
        },
        style: {
          position: 'absolute',
          top: '1px',
          left: '2px',
          width: '3px',
          height: '4px'
        }
      }
    ];
    
    expect(models).toEqual(expected);
  });
  
  it('pattern decorator는 일반 target decorator처럼 데이터가 보존되어야 함', () => {
    const modelData: ModelData = {
      sid: 'doc1',
      stype: 'document',
      content: [
        {
          sid: 'p1',
          stype: 'paragraph',
          content: [
            { sid: 't1', stype: 'inline-text', text: 'Hello' }
          ]
        }
      ]
    };
    contentRenderer.render(contentLayer, modelData);
    
    const decorator: Decorator = {
      sid: 'pat1',
      stype: 'pattern-highlight',
      category: 'inline',
      decoratorType: 'pattern',
      target: {
        sid: 't1',
        startOffset: 0,
        endOffset: 5
      },
      data: {
        color: 'orange',
        source: 'pattern:hello'
      }
    };
    
    const models = prebuilder.buildAll([decorator], modelData);
    
    const expected: DecoratorModel[] = [
      {
        sid: 'pat1',
        stype: 'pattern-highlight',
        category: 'inline',
        layerTarget: 'content',
        data: {
          color: 'orange',
          source: 'pattern:hello'
        }
      }
    ];
    
    expect(models).toEqual(expected);
  });
  
  it('패턴 매칭으로 생성된 여러 decorator가 올바르게 변환되어야 함', () => {
    const modelData: ModelData = {
      sid: 'doc1',
      stype: 'document',
      content: [
        {
          sid: 'p1',
          stype: 'paragraph',
          content: [
            { sid: 't1', stype: 'inline-text', text: 'Visit https://example.com and https://test.com' }
          ]
        }
      ]
    };
    contentRenderer.render(contentLayer, modelData);
    
    // Simulate decorators generated by pattern matching
    // (actually generated by PatternDecoratorGenerator)
    const patternDecorators: Decorator[] = [
      {
        sid: 'pat-link-1',
        stype: 'link',
        category: 'inline',
        decoratorType: 'pattern',
        target: {
          sid: 't1',
          startOffset: 6,
          endOffset: 25 // 'https://example.com'
        },
        data: {
          url: 'https://example.com',
          extracted: { fullMatch: 'https://example.com' }
        }
      },
      {
        sid: 'pat-link-2',
        stype: 'link',
        category: 'inline',
        decoratorType: 'pattern',
        target: {
          sid: 't1',
          startOffset: 30,
          endOffset: 47 // 'https://test.com'
        },
        data: {
          url: 'https://test.com',
          extracted: { fullMatch: 'https://test.com' }
        }
      }
    ];
    
    const models = prebuilder.buildAll(patternDecorators, modelData);
    
    const expected: DecoratorModel[] = [
      {
        sid: 'pat-link-1',
        stype: 'link',
        category: 'inline',
        layerTarget: 'content',
        data: {
          url: 'https://example.com',
          extracted: { fullMatch: 'https://example.com' }
        }
      },
      {
        sid: 'pat-link-2',
        stype: 'link',
        category: 'inline',
        layerTarget: 'content',
        data: {
          url: 'https://test.com',
          extracted: { fullMatch: 'https://test.com' }
        }
      }
    ];
    
    expect(models).toEqual(expected);
  });
  
  it('패턴 매칭으로 생성된 decorator에 extractData 결과가 포함되어야 함', () => {
    const modelData: ModelData = {
      sid: 'doc1',
      stype: 'document',
      content: [
        {
          sid: 'p1',
          stype: 'paragraph',
          content: [
            { sid: 't1', stype: 'inline-text', text: 'Email: user@example.com' }
          ]
        }
      ]
    };
    contentRenderer.render(contentLayer, modelData);
    
    // Decorator generated by pattern matching (includes extractData results)
    const patternDecorator: Decorator = {
      sid: 'pat-email-1',
      stype: 'email',
      category: 'inline',
      decoratorType: 'pattern',
      target: {
        sid: 't1',
        startOffset: 7,
        endOffset: 25 // 'user@example.com'
      },
      data: {
        email: 'user@example.com',
        local: 'user',
        domain: 'example.com',
        extracted: {
          fullMatch: 'user@example.com',
          groups: { local: 'user', domain: 'example.com' }
        }
      }
    };
    
    const models = prebuilder.buildAll([patternDecorator], modelData);
    
    const expected: DecoratorModel[] = [
      {
        sid: 'pat-email-1',
        stype: 'email',
        category: 'inline',
        layerTarget: 'content',
        data: {
          email: 'user@example.com',
          local: 'user',
          domain: 'example.com',
          extracted: {
            fullMatch: 'user@example.com',
            groups: { local: 'user', domain: 'example.com' }
          }
        }
      }
    ];
    
    expect(models).toEqual(expected);
  });
  
  it('패턴 매칭으로 생성된 decorator와 일반 decorator가 혼합되어도 올바르게 처리되어야 함', () => {
    const modelData: ModelData = {
      sid: 'doc1',
      stype: 'document',
      content: [
        {
          sid: 'p1',
          stype: 'paragraph',
          content: [
            { sid: 't1', stype: 'inline-text', text: 'Hello https://example.com world' }
          ]
        }
      ]
    };
    contentRenderer.render(contentLayer, modelData);
    
    const decorators: Decorator[] = [
      // Regular decorator
      {
        sid: 'manual-1',
        stype: 'highlight',
        category: 'inline',
        target: {
          sid: 't1',
          startOffset: 0,
          endOffset: 5 // 'Hello'
        },
        data: {
          color: 'yellow'
        }
      },
      // Decorator generated by pattern matching
      {
        sid: 'pat-link-1',
        stype: 'link',
        category: 'inline',
        decoratorType: 'pattern',
        target: {
          sid: 't1',
          startOffset: 6,
          endOffset: 25 // 'https://example.com'
        },
        data: {
          url: 'https://example.com'
        }
      },
      // Another regular decorator
      {
        sid: 'manual-2',
        stype: 'underline',
        category: 'inline',
        target: {
          sid: 't1',
          startOffset: 26,
          endOffset: 31 // 'world'
        },
        data: {
          style: 'solid'
        }
      }
    ];
    
    const models = prebuilder.buildAll(decorators, modelData);
    
    const expected: DecoratorModel[] = [
      {
        sid: 'manual-1',
        stype: 'highlight',
        category: 'inline',
        layerTarget: 'content',
        data: {
          color: 'yellow'
        }
      },
      {
        sid: 'pat-link-1',
        stype: 'link',
        category: 'inline',
        layerTarget: 'content',
        data: {
          url: 'https://example.com'
        }
      },
      {
        sid: 'manual-2',
        stype: 'underline',
        category: 'inline',
        layerTarget: 'content',
        data: {
          style: 'solid'
        }
      }
    ];
    
    expect(models).toEqual(expected);
  });
  
  it('입력 decorator 배열 및 객체는 변환 과정에서 변경되지 않아야 함 (불변성)', () => {
    const modelData: ModelData = {
      sid: 'doc1',
      stype: 'document'
    };
    
    const original: Decorator[] = [
      {
        sid: 'x1',
        stype: 'cursor',
        category: 'layer',
        layerTarget: 'decorator',
        data: { position: { top: 1, left: 2, width: 3, height: 4 }, extra: 'a' }
      },
      {
        sid: 'x2',
        stype: 'highlight',
        category: 'inline',
        target: { sid: 't-none', startOffset: 0, endOffset: 1 },
        data: { color: 'yellow' }
      }
    ];
    const copyBefore = JSON.parse(JSON.stringify(original));
    
    const _ = prebuilder.buildAll(original, modelData);
    
    expect(original).toEqual(copyBefore);
  });
  
  it('결과 순서는 입력 decorator 순서를 그대로 보장해야 함', () => {
    const modelData: ModelData = {
      sid: 'doc1',
      stype: 'document'
    };
    
    const decorators: Decorator[] = [
      { sid: 'a', stype: 'd-a', category: 'layer', layerTarget: 'decorator', data: { position: { top: 0, left: 0, width: 1, height: 1 } } },
      { sid: 'b', stype: 'd-b', category: 'inline', target: { sid: 't', startOffset: 0, endOffset: 1 }, data: { k: 1 } },
      { sid: 'c', stype: 'd-c', category: 'block', target: { sid: 'n' }, data: { v: 2 } },
    ];
    
    const models = prebuilder.buildAll(decorators, modelData);
    const sids = models.map(m => m.sid);
    expect(sids).toEqual(['a', 'b', 'c']);
  });
});


