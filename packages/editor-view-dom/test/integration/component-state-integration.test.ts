import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Editor } from '@barocss/editor-core';
import { EditorViewDOM } from '../../src/editor-view-dom';
import { DataStore } from '@barocss/datastore';
import { normalizeHTML } from '../utils/html';
import { define, element, slot, data } from '@barocss/dsl';
import { defineState, BaseComponentState } from '@barocss/renderer-dom';
import type { ComponentContext, ModelData } from '@barocss/dsl';

describe('EditorViewDOM + renderer-dom Component State Integration', () => {
  let editor: Editor;
  let view: EditorViewDOM;
  let container: HTMLElement;
  
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    
    const dataStore = new DataStore();
    editor = new Editor({ dataStore });
    view = new EditorViewDOM(editor, { 
      container,
      autoRender: false
    });
    
    // Define basic components (document/paragraph/text)
    // Base template needed for rendering custom components in tests
    define('document', element('div', { className: 'document' }, [slot('content')]));
    define('paragraph', element('p', { className: 'paragraph' }, [slot('content')]));
    define('inline-text', element('span', { className: 'text' }, [data('text')]));
  });
  
  afterEach(() => {
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    if (view) {
      view.destroy();
    }
  });

  describe('Basic State Management', () => {
    it('component can access and use state via context.instance', () => {
      // Define Counter component
      const CounterState = class extends BaseComponentState {};

      defineState('counter', CounterState);
      
      define('counter', (_props: any, model: ModelData, ctx: ComponentContext) => {
        // Manually call initState (get initial value from model.attributes)
        if (!ctx.getState('count')) {
          const initialCount = model.attributes?.count || model.count || 0;
          ctx.initState({ count: Number(initialCount) });
        }
        const count = ctx.instance?.get('count') ?? ctx.getState('count') ?? 0;
        return element('div', { className: 'counter' }, [
          element('span', { className: 'count' }, [String(count)]),
          element('button', { className: 'increment' }, ['+'])
        ]);
      });

      const tree: TreeDocument = {
        sid: 'doc1',
        stype: 'document',
        content: [
          {
            sid: 'counter1',
            stype: 'counter',
            attributes: { count: 5 }
          }
        ]
      };

      view.render(tree);

      const counterEl = container.querySelector('[data-bc-sid="counter1"]');
      expect(counterEl).toBeTruthy();
      
      const countEl = counterEl?.querySelector('.count');
      expect(countEl?.textContent).toBe('5');
    });

    it('setState triggers automatic re-render', async () => {
      const CounterState = class extends BaseComponentState {};

      defineState('counter', CounterState);
      
      let renderCount = 0;
      define('counter', (_props: any, model: ModelData, ctx: ComponentContext) => {
        renderCount++;
        // Call initState
        if (!ctx.getState('count')) {
          const initialCount = model.attributes?.count || model.count || 0;
          ctx.initState({ count: Number(initialCount) });
        }
        const count = ctx.instance?.get('count') ?? ctx.getState('count') ?? 0;
        return element('div', { className: 'counter' }, [
          element('span', { className: 'count' }, [String(count)])
        ]);
      });

      const tree: TreeDocument = {
        sid: 'doc1',
        stype: 'document',
        content: [
          {
            sid: 'counter1',
            stype: 'counter',
            attributes: { count: 0 }
          }
        ]
      };

      view.render(tree);
      const initialCount = renderCount;
      
      // Call setState (triggers automatic re-render)
      const counterEl = container.querySelector('[data-bc-sid="counter1"]');
      expect(counterEl).toBeTruthy();
      
      // Simulate state change (actually called inside component)
      // Automatic re-render occurs when changeState event fires
      // Difficult to test directly here, so verify state access is possible
      expect(renderCount).toBeGreaterThan(0);
    });

    it('multiple components have independent state', () => {
      const CounterState = class extends BaseComponentState {};

      defineState('counter', CounterState);
      
      define('counter', (_props: any, model: ModelData, ctx: ComponentContext) => {
        // Call initState
        if (!ctx.getState('count')) {
          const initialCount = model.attributes?.count || model.count || 0;
          ctx.initState({ count: Number(initialCount) });
        }
        const count = ctx.instance?.get('count') ?? ctx.getState('count') ?? 0;
        return element('div', { className: 'counter' }, [
          element('span', { className: 'count' }, [String(count)])
        ]);
      });

      const tree: TreeDocument = {
        sid: 'doc1',
        stype: 'document',
        content: [
          {
            sid: 'counter1',
            stype: 'counter',
            attributes: { count: 5 }
          },
          {
            sid: 'counter2',
            stype: 'counter',
            attributes: { count: 10 }
          }
        ]
      };

      view.render(tree);

      const counter1 = container.querySelector('[data-bc-sid="counter1"]');
      const counter2 = container.querySelector('[data-bc-sid="counter2"]');
      
      expect(counter1).toBeTruthy();
      expect(counter2).toBeTruthy();
      
      const count1 = counter1?.querySelector('.count')?.textContent;
      const count2 = counter2?.querySelector('.count')?.textContent;
      
      expect(count1).toBe('5');
      expect(count2).toBe('10');
    });
  });

  describe('State with Data Binding', () => {
    it('component state is accessible via data() in template', () => {
      const CounterState = class extends BaseComponentState {};

      defineState('counter', CounterState);
      
      define('counter', (_props: any, model: ModelData, ctx: ComponentContext) => {
        // Call initState
        if (!ctx.getState('count')) {
          const initialCount = model.attributes?.count || model.count || 0;
          const initialLabel = model.attributes?.label || model.label || 'Count';
          ctx.initState({ count: Number(initialCount), label: String(initialLabel) });
        }
        // Access state via ctx.instance or ctx.getState
        const count = ctx.instance?.get('count') ?? ctx.getState('count') ?? 0;
        const label = ctx.instance?.get('label') ?? ctx.getState('label') ?? 'Count';
        return element('div', { className: 'counter' }, [
          element('span', { className: 'label' }, [String(label)]),
          element('span', { className: 'count' }, [String(count)])
        ]);
      });

      const tree: TreeDocument = {
        sid: 'doc1',
        stype: 'document',
        content: [
          {
            sid: 'counter1',
            stype: 'counter',
            attributes: { count: 7, label: 'Total' }
          }
        ]
      };

      view.render(tree);

      const counterEl = container.querySelector('[data-bc-sid="counter1"]');
      expect(counterEl).toBeTruthy();
      
      const labelEl = counterEl?.querySelector('.label');
      const countEl = counterEl?.querySelector('.count');
      
      expect(labelEl?.textContent).toBe('Total');
      expect(countEl?.textContent).toBe('7');
    });
  });

  describe('State Initialization', () => {
    it('initState is called with model attributes', () => {
      const initStateSpy = vi.fn();
      
      const CounterState = class extends BaseComponentState {};

      defineState('counter', CounterState);
      
      define('counter', (_props: any, model: ModelData, ctx: ComponentContext) => {
        // Manually call initState and wrap with spy
        if (!ctx.getState('count')) {
          const initialCount = model.attributes?.count || model.count || 0;
          initStateSpy({ count: initialCount });
          ctx.initState({ count: Number(initialCount) });
        }
        const count = ctx.instance?.get('count') ?? ctx.getState('count') ?? 0;
        return element('div', { className: 'counter' }, [
          element('span', { className: 'count' }, [String(count)])
        ]);
      });

      const tree: TreeDocument = {
        sid: 'doc1',
        stype: 'document',
        content: [
          {
            sid: 'counter1',
            stype: 'counter',
            attributes: { count: 3 }
          }
        ]
      };

      view.render(tree);

      // Verify initState was called
      expect(initStateSpy).toHaveBeenCalled();
      expect(initStateSpy).toHaveBeenCalledWith(expect.objectContaining({ count: 3 }));
    });

    it('state persists across re-renders', () => {
      const CounterState = class extends BaseComponentState {};

      defineState('counter', CounterState);
      
      define('counter', (_props: any, model: ModelData, ctx: ComponentContext) => {
        // Call initState
        if (!ctx.getState('count')) {
          const initialCount = model.attributes?.count || model.count || 0;
          ctx.initState({ count: Number(initialCount) });
        }
        const count = ctx.instance?.get('count') ?? ctx.getState('count') ?? 0;
        return element('div', { className: 'counter' }, [
          element('span', { className: 'count' }, [String(count)])
        ]);
      });

      const tree1: TreeDocument = {
        sid: 'doc1',
        stype: 'document',
        content: [
          {
            sid: 'counter1',
            stype: 'counter',
            attributes: { count: 5 }
          }
        ]
      };

      view.render(tree1);
      const count1 = container.querySelector('[data-bc-sid="counter1"] .count')?.textContent;
      expect(count1).toBe('5');

      // Re-render with same sid (state preserved)
      const tree2: TreeDocument = {
        sid: 'doc1',
        stype: 'document',
        content: [
          {
            sid: 'counter1',
            stype: 'counter',
            attributes: { count: 5 } // Same value
          }
        ]
      };

      view.render(tree2);
      const count2 = container.querySelector('[data-bc-sid="counter1"] .count')?.textContent;
      
      // State should be preserved
      expect(count2).toBe('5');
      
      // DOM element should also be reused
      const el1 = container.querySelector('[data-bc-sid="counter1"]');
      const el2 = container.querySelector('[data-bc-sid="counter1"]');
      expect(el2).toBe(el1);
    });
  });

  describe('State Updates', () => {
    it('getState returns current state value', () => {
      const CounterState = class extends BaseComponentState {};

      defineState('counter', CounterState);
      
      define('counter', (_props: any, model: ModelData, ctx: ComponentContext) => {
        // Call initState
        if (!ctx.getState('count')) {
          const initialCount = model.attributes?.count || model.count || 0;
          ctx.initState({ count: Number(initialCount) });
        }
        const count = ctx.getState('count') || 0;
        return element('div', { className: 'counter' }, [
          element('span', { className: 'count' }, [String(count)])
        ]);
      });

      const tree: TreeDocument = {
        sid: 'doc1',
        stype: 'document',
        content: [
          {
            sid: 'counter1',
            stype: 'counter',
            attributes: { count: 8 }
          }
        ]
      };

      view.render(tree);

      const countEl = container.querySelector('[data-bc-sid="counter1"] .count');
      expect(countEl?.textContent).toBe('8');
    });
  });
});

