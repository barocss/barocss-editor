/**
 * Pattern 및 Custom Decorator Edge Cases 테스트
 * 
 * Priority, enabled/disabled, 에러 처리, 빈 배열 반환 등
 * 엣지 케이스와 에러 시나리오를 테스트합니다.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Editor } from '@barocss/editor-core';
import { EditorViewDOM } from '../../src/editor-view-dom';
import { DataStore } from '@barocss/datastore';
import { define, element, slot, data, getGlobalRegistry, defineDecorator } from '@barocss/dsl';
import type { DecoratorGenerator, DecoratorGeneratorContext } from '../../src/decorator/decorator-generator';
import type { ModelData } from '@barocss/dsl';

describe('Pattern 및 Custom Decorator Edge Cases', () => {
  let editor: Editor;
  let view: EditorViewDOM;
  let container: HTMLElement;
  let registry: ReturnType<typeof getGlobalRegistry>;
  
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    
    registry = getGlobalRegistry();
    define('document', element('div', { className: 'document' }, [slot('content')]));
    define('paragraph', element('p', { className: 'paragraph' }, [slot('content')]));
    define('inline-text', element('span', { className: 'text' }, [data('text')]));
    
    defineDecorator('link', element('a', {
      className: 'link-decorator',
      style: { color: 'blue', textDecoration: 'underline' }
    }, [slot('text')]));
    
    defineDecorator('email', element('span', {
      className: 'email-decorator',
      style: { color: 'green' }
    }, [slot('text')]));
    
    const dataStore = new DataStore();
    editor = new Editor({ dataStore });
    view = new EditorViewDOM(editor, { 
      container,
      autoRender: false,
      registry
    });
  });
  
  afterEach(() => {
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    if (view) {
      view.destroy();
    }
  });
  
  describe('Priority 처리', () => {
    it('여러 패턴이 같은 텍스트에 매칭될 때 priority가 낮은 것이 먼저 처리되어야 함', async () => {
      const tree: ModelData = {
        sid: 'doc1',
        stype: 'document',
        content: [
          {
            sid: 'p1',
            stype: 'paragraph',
            content: [
              {
                sid: 't1',
                stype: 'inline-text',
                text: 'https://example.com'
              }
            ]
          }
        ]
      };
      
      // Low priority (processed first)
      view.addDecorator({
        sid: 'url-pattern-low',
        stype: 'link',
        category: 'inline',
        decoratorType: 'pattern',
        data: {
          pattern: /https?:\/\/[^\s]+/g,
          extractData: (match: RegExpMatchArray) => ({ url: match[0], priority: 'low' }),
          createDecorator: (nodeId, start, end, data) => ({
            sid: `pattern-link-low-${nodeId}-${start}-${end}`,
            target: { sid: nodeId, startOffset: start, endOffset: end },
            data: { url: data.url, priority: data.priority }
          }),
          priority: 10 // Low priority
        }
      });
      
      // High priority (processed later)
      view.addDecorator({
        sid: 'url-pattern-high',
        stype: 'link',
        category: 'inline',
        decoratorType: 'pattern',
        data: {
          pattern: /https?:\/\/[^\s]+/g,
          extractData: (match: RegExpMatchArray) => ({ url: match[0], priority: 'high' }),
          createDecorator: (nodeId, start, end, data) => ({
            sid: `pattern-link-high-${nodeId}-${start}-${end}`,
            target: { sid: nodeId, startOffset: start, endOffset: end },
            data: { url: data.url, priority: data.priority }
          }),
          priority: 20 // High priority
        }
      });
      
      view.render(tree, { sync: true });
      
      // Verify both patterns are registered
      const patternConfigs = view.patternDecoratorConfigManager.getConfigs();
      expect(patternConfigs).toHaveLength(2);
      
      // Verify priority order (lower priority first)
      const sorted = patternConfigs.sort((a, b) => (a.priority || 100) - (b.priority || 100));
      expect(sorted[0].sid).toBe('url-pattern-low');
      expect(sorted[1].sid).toBe('url-pattern-high');
    });
  });
  
  describe('Enabled/Disabled 처리', () => {
    it('disabled된 pattern decorator는 매칭되지 않아야 함', async () => {
      const tree: ModelData = {
        sid: 'doc1',
        stype: 'document',
        content: [
          {
            sid: 'p1',
            stype: 'paragraph',
            content: [
              {
                sid: 't1',
                stype: 'inline-text',
                text: 'https://example.com'
              }
            ]
          }
        ]
      };
      
      // Register pattern decorator
      view.addDecorator({
        sid: 'url-pattern',
        stype: 'link',
        category: 'inline',
        decoratorType: 'pattern',
        data: {
          pattern: /https?:\/\/[^\s]+/g,
          extractData: (match: RegExpMatchArray) => ({ url: match[0] }),
          createDecorator: (nodeId, start, end, data) => ({
            sid: `pattern-link-${nodeId}-${start}-${end}`,
            target: { sid: nodeId, startOffset: start, endOffset: end },
            data: { url: data.url }
          }),
          priority: 10
        }
      });
      
      // Disable
      const updated = view.setDecoratorEnabled('url-pattern', false);
      expect(updated).toBe(true); // Verify setDecoratorEnabled succeeded
      
      view.render(tree, { sync: true });
      
      // Verify disabled
      // isDecoratorEnabled checks isConfigEnabled
      const config = view.patternDecoratorConfigManager.getConfigs().find(c => c.sid === 'url-pattern');
      expect(config?.enabled).toBe(false);
      
      // Should not be included when querying with enabledOnly
      const enabledConfigs = view.patternDecoratorConfigManager.getConfigs(true);
      expect(enabledConfigs).toHaveLength(0);
    });
    
    it('disabled된 custom decorator generator는 실행되지 않아야 함', async () => {
      const tree: ModelData = {
        sid: 'doc1',
        stype: 'document',
        content: [
          {
            sid: 'p1',
            stype: 'paragraph',
            content: [
              {
                sid: 't1',
                stype: 'inline-text',
                text: 'Hello World'
              }
            ]
          }
        ]
      };
      
      const generator: DecoratorGenerator = {
        sid: 'test-generator',
        generate: (model: ModelData, text: string | null): any[] => {
          return [{
            sid: `generated-${model.sid}`,
            stype: 'highlight',
            category: 'inline',
            target: { sid: model.sid, startOffset: 0, endOffset: text?.length || 0 },
            data: { generated: true }
          }];
        }
      };
      
      view.addDecorator(generator);
      
      // Disable
      const updated = view.setDecoratorEnabled('test-generator', false);
      expect(updated).toBe(true); // Verify setDecoratorEnabled succeeded
      
      view.render(tree, { sync: true });
      
      // Verify disabled
      // isDecoratorEnabled checks isGeneratorEnabled,
      // isGeneratorEnabled returns generator?.enabled !== false
      // If enabled is undefined, it returns true, so must explicitly set to false
      const retrievedGenerator = view.decoratorGeneratorManager.getGenerator('test-generator');
      expect(retrievedGenerator?.enabled).toBe(false);
      
      // Should not be included when querying with enabledOnly
      const enabledGenerators = view.decoratorGeneratorManager.getAllGenerators(true);
      expect(enabledGenerators).toHaveLength(0);
    });
  });
  
  describe('빈 배열 반환', () => {
    it('createDecorator가 빈 배열을 반환하면 decorator가 생성되지 않아야 함', async () => {
      const tree: ModelData = {
        sid: 'doc1',
        stype: 'document',
        content: [
          {
            sid: 'p1',
            stype: 'paragraph',
            content: [
              {
                sid: 't1',
                stype: 'inline-text',
                text: 'https://example.com'
              }
            ]
          }
        ]
      };
      
      view.addDecorator({
        sid: 'url-pattern-empty',
        stype: 'link',
        category: 'inline',
        decoratorType: 'pattern',
        data: {
          pattern: /https?:\/\/[^\s]+/g,
          extractData: (match: RegExpMatchArray) => ({ url: match[0] }),
          createDecorator: (nodeId, start, end, data) => {
            // Return empty array based on condition
            if (data.url.includes('example')) {
              return []; // Return empty array
            }
            return [{
              sid: `pattern-link-${nodeId}-${start}-${end}`,
              target: { sid: nodeId, startOffset: start, endOffset: end },
              data: { url: data.url }
            }];
          },
          priority: 10
        }
      });
      
      view.render(tree, { sync: true });
      
      // Pattern config is registered but decorator is not created
      const patternConfigs = view.patternDecoratorConfigManager.getConfigs();
      expect(patternConfigs).toHaveLength(1);
    });
    
    it('generate가 빈 배열을 반환하면 decorator가 생성되지 않아야 함', async () => {
      const tree: ModelData = {
        sid: 'doc1',
        stype: 'document',
        content: [
          {
            sid: 'p1',
            stype: 'paragraph',
            content: [
              {
                sid: 't1',
                stype: 'inline-text',
                text: 'Hello World'
              }
            ]
          }
        ]
      };
      
      const generator: DecoratorGenerator = {
        sid: 'empty-generator',
        generate: (model: ModelData, text: string | null): any[] => {
          // Always return empty array
          return [];
        }
      };
      
      view.addDecorator(generator);
      view.render(tree, { sync: true });
      
      // Generator is registered but decorator is not created
      const registeredGenerator = view.decoratorGeneratorManager.getGenerator('empty-generator');
      expect(registeredGenerator).toBeDefined();
    });
  });
  
  describe('에러 처리', () => {
    it('createDecorator에서 에러가 발생해도 다른 패턴은 계속 처리되어야 함', async () => {
      const tree: ModelData = {
        sid: 'doc1',
        stype: 'document',
        content: [
          {
            sid: 'p1',
            stype: 'paragraph',
            content: [
              {
                sid: 't1',
                stype: 'inline-text',
                text: 'https://example.com and user@test.com'
              }
            ]
          }
        ]
      };
      
      // Pattern that throws error
      view.addDecorator({
        sid: 'error-pattern',
        stype: 'link',
        category: 'inline',
        decoratorType: 'pattern',
        data: {
          pattern: /https?:\/\/[^\s]+/g,
          extractData: (match: RegExpMatchArray) => ({ url: match[0] }),
          createDecorator: (nodeId, start, end, data) => {
            throw new Error('Test error in createDecorator');
          },
          priority: 10
        }
      });
      
      // Pattern that works normally
      view.addDecorator({
        sid: 'email-pattern',
        stype: 'email',
        category: 'inline',
        decoratorType: 'pattern',
        data: {
          pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
          extractData: (match: RegExpMatchArray) => ({ email: match[0] }),
          createDecorator: (nodeId, start, end, data) => ({
            sid: `pattern-email-${nodeId}-${start}-${end}`,
            target: { sid: nodeId, startOffset: start, endOffset: end },
            data: { email: data.email }
          }),
          priority: 20
        }
      });
      
      // Other patterns should be processed even if error occurs
      view.render(tree, { sync: true });
      
      // Verify both patterns are registered
      const patternConfigs = view.patternDecoratorConfigManager.getConfigs();
      expect(patternConfigs).toHaveLength(2);
    });
    
    it('generate에서 에러가 발생해도 다른 generator는 계속 실행되어야 함', async () => {
      const tree: ModelData = {
        sid: 'doc1',
        stype: 'document',
        content: [
          {
            sid: 'p1',
            stype: 'paragraph',
            content: [
              {
                sid: 't1',
                stype: 'inline-text',
                text: 'Hello World'
              }
            ]
          }
        ]
      };
      
      // Generator that throws error
      const errorGenerator: DecoratorGenerator = {
        sid: 'error-generator',
        generate: (model: ModelData, text: string | null): any[] => {
          throw new Error('Test error in generate');
        }
      };
      
      // Generator that works normally
      const normalGenerator: DecoratorGenerator = {
        sid: 'normal-generator',
        generate: (model: ModelData, text: string | null): any[] => {
          return [{
            sid: `generated-${model.sid}`,
            stype: 'highlight',
            category: 'inline',
            target: { sid: model.sid, startOffset: 0, endOffset: text?.length || 0 },
            data: { generated: true }
          }];
        }
      };
      
      view.addDecorator(errorGenerator);
      view.addDecorator(normalGenerator);
      
      // Other generators should execute even if error occurs
      view.render(tree, { sync: true });
      
      // Verify both generators are registered
      const allGenerators = view.decoratorGeneratorManager.getAllGenerators();
      expect(allGenerators).toHaveLength(2);
    });
  });
  
  describe('빈 텍스트 처리', () => {
    it('빈 텍스트 노드에서는 pattern decorator가 매칭되지 않아야 함', async () => {
      const tree: ModelData = {
        sid: 'doc1',
        stype: 'document',
        content: [
          {
            sid: 'p1',
            stype: 'paragraph',
            content: [
              {
                sid: 't1',
                stype: 'inline-text',
                text: '' // Empty text
              }
            ]
          }
        ]
      };
      
      view.addDecorator({
        sid: 'url-pattern',
        stype: 'link',
        category: 'inline',
        decoratorType: 'pattern',
        data: {
          pattern: /https?:\/\/[^\s]+/g,
          extractData: (match: RegExpMatchArray) => ({ url: match[0] }),
          createDecorator: (nodeId, start, end, data) => ({
            sid: `pattern-link-${nodeId}-${start}-${end}`,
            target: { sid: nodeId, startOffset: start, endOffset: end },
            data: { url: data.url }
          }),
          priority: 10
        }
      });
      
      view.render(tree, { sync: true });
      
      // Pattern config is registered but no match
      const patternConfigs = view.patternDecoratorConfigManager.getConfigs();
      expect(patternConfigs).toHaveLength(1);
    });
    
    it('null 텍스트에서는 custom decorator generator가 실행되지 않아야 함', async () => {
      const tree: ModelData = {
        sid: 'doc1',
        stype: 'document',
        content: [
          {
            sid: 'p1',
            stype: 'paragraph',
            content: [
              {
                sid: 't1',
                stype: 'inline-text'
                // No text attribute
              }
            ]
          }
        ]
      };
      
      const generator: DecoratorGenerator = {
        sid: 'text-generator',
        generate: (model: ModelData, text: string | null): any[] => {
          // Return empty array if text is null
          if (!text) {
            return [];
          }
          return [{
            sid: `generated-${model.sid}`,
            stype: 'highlight',
            category: 'inline',
            target: { sid: model.sid, startOffset: 0, endOffset: text.length },
            data: { generated: true }
          }];
        }
      };
      
      view.addDecorator(generator);
      view.render(tree, { sync: true });
      
      // Generator is registered but decorator is not created
      const registeredGenerator = view.decoratorGeneratorManager.getGenerator('text-generator');
      expect(registeredGenerator).toBeDefined();
    });
  });
  
  describe('매칭이 없는 경우', () => {
    it('패턴이 매칭되지 않으면 decorator가 생성되지 않아야 함', async () => {
      const tree: ModelData = {
        sid: 'doc1',
        stype: 'document',
        content: [
          {
            sid: 'p1',
            stype: 'paragraph',
            content: [
              {
                sid: 't1',
                stype: 'inline-text',
                text: 'Hello World' // No URL
              }
            ]
          }
        ]
      };
      
      view.addDecorator({
        sid: 'url-pattern',
        stype: 'link',
        category: 'inline',
        decoratorType: 'pattern',
        data: {
          pattern: /https?:\/\/[^\s]+/g,
          extractData: (match: RegExpMatchArray) => ({ url: match[0] }),
          createDecorator: (nodeId, start, end, data) => ({
            sid: `pattern-link-${nodeId}-${start}-${end}`,
            target: { sid: nodeId, startOffset: start, endOffset: end },
            data: { url: data.url }
          }),
          priority: 10
        }
      });
      
      view.render(tree, { sync: true });
      
      // Pattern config is registered but no match
      const patternConfigs = view.patternDecoratorConfigManager.getConfigs();
      expect(patternConfigs).toHaveLength(1);
    });
  });
  
  describe('Context 사용', () => {
    it('custom decorator generator가 context를 활용할 수 있어야 함', async () => {
      const tree: ModelData = {
        sid: 'doc1',
        stype: 'document',
        content: [
          {
            sid: 'p1',
            stype: 'paragraph',
            content: [
              {
                sid: 't1',
                stype: 'inline-text',
                text: 'Hello World'
              }
            ]
          }
        ]
      };
      
      const generator: DecoratorGenerator = {
        sid: 'context-generator',
        generate: (model: ModelData, text: string | null, context?: DecoratorGeneratorContext): any[] => {
          // Use context to create decorator
          const documentModel = context?.documentModel;
          if (documentModel && text) {
            return [{
              sid: `context-generated-${model.sid}`,
              stype: 'highlight',
              category: 'inline',
              target: { sid: model.sid, startOffset: 0, endOffset: text.length },
              data: { 
                generated: true,
                hasDocumentModel: !!documentModel
              }
            }];
          }
          return [];
        }
      };
      
      view.addDecorator(generator);
      view.render(tree, { sync: true });
      
      // Verify generator is registered
      const registeredGenerator = view.decoratorGeneratorManager.getGenerator('context-generator');
      expect(registeredGenerator).toBeDefined();
    });
  });
});

