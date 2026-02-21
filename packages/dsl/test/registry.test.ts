import { describe, it, expect, beforeEach } from 'vitest';
import { RendererRegistry } from '../src/registry';
import { element, define } from '../src/template-builders';
import type { RendererDefinition, ExternalComponent, ContextualComponent } from '../src/types';

describe('RendererRegistry', () => {
  let registry: RendererRegistry;

  beforeEach(() => {
    registry = new RendererRegistry({ global: true });
  });

  describe('register / get', () => {
    it('registers and retrieves a renderer definition', () => {
      const def: RendererDefinition = {
        type: 'renderer',
        nodeType: 'test-card',
        template: element('div', 'card')
      };
      registry.register(def);
      expect(registry.get('test-card')).toBeDefined();
      expect(registry.has('test-card')).toBe(true);
    });

    it('returns undefined for unregistered type', () => {
      expect(registry.get('nonexistent')).toBeUndefined();
    });
  });

  describe('registerComponent / getComponent', () => {
    it('registers and retrieves external component', () => {
      const comp: ExternalComponent = {
        mount: (_props, container) => container,
        unmount: () => {},
        managesDOM: true
      };
      registry.registerComponent('ext-widget', comp);
      expect(registry.getComponent('ext-widget')).toBe(comp);
    });

    it('hasComponent returns true for registered component', () => {
      const comp: ExternalComponent = {
        mount: (_props, container) => container,
        unmount: () => {}
      };
      registry.registerComponent('has-test', comp);
      expect(registry.hasComponent('has-test')).toBe(true);
    });

    it('hasComponent returns false for unregistered component', () => {
      expect(registry.hasComponent('missing')).toBe(false);
    });

    it('removeComponent removes a component', () => {
      const comp: ExternalComponent = {
        mount: (_props, container) => container,
        unmount: () => {}
      };
      registry.registerComponent('removable', comp);
      expect(registry.removeComponent('removable')).toBe(true);
      expect(registry.hasComponent('removable')).toBe(false);
    });
  });

  describe('registerContextComponent', () => {
    it('registers a context component as ExternalComponent wrapper', () => {
      const fn: ContextualComponent = (_props, _model, _ctx) => element('div');
      registry.registerContextComponent('ctx-comp', fn);
      const comp = registry.getComponent('ctx-comp');
      expect(comp).toBeDefined();
      expect(comp!.template).toBe(fn);
      expect(comp!.managesDOM).toBe(false);
    });
  });

  describe('getMarkRenderer', () => {
    it('returns template for registered mark renderer', () => {
      const tpl = element('strong');
      const fn: ContextualComponent = () => tpl;
      const def: RendererDefinition = {
        type: 'renderer',
        nodeType: 'mark:bold',
        template: {
          type: 'component',
          name: 'mark:bold',
          component: fn
        }
      };
      registry.register(def);
      const result = registry.getMarkRenderer('bold');
      expect(result).toBeDefined();
    });

    it('returns undefined for unregistered mark', () => {
      expect(registry.getMarkRenderer('nonexistent')).toBeUndefined();
    });
  });

  describe('auto-registration of external components', () => {
    it('stores external component in _components, not _renderers', () => {
      const comp: ExternalComponent = {
        type: 'external' as any,
        mount: (_props, container) => container,
        unmount: () => {},
        managesDOM: true
      };
      const def: RendererDefinition = {
        type: 'renderer',
        nodeType: 'ext-auto',
        template: comp
      };
      registry.register(def);
      expect(registry.getComponent('ext-auto')).toBeDefined();
    });
  });

  describe('getAll', () => {
    it('returns all registered renderers', () => {
      const def1: RendererDefinition = {
        type: 'renderer',
        nodeType: 'type-a',
        template: element('div')
      };
      const def2: RendererDefinition = {
        type: 'renderer',
        nodeType: 'type-b',
        template: element('span')
      };
      registry.register(def1);
      registry.register(def2);
      const all = registry.getAll();
      expect(all.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('remove', () => {
    it('removes a renderer', () => {
      const def: RendererDefinition = {
        type: 'renderer',
        nodeType: 'removable-renderer',
        template: element('div')
      };
      registry.register(def);
      expect(registry.remove('removable-renderer')).toBe(true);
      expect(registry.has('removable-renderer')).toBe(false);
    });
  });

  describe('clear', () => {
    it('clears all renderers', () => {
      registry.register({
        type: 'renderer',
        nodeType: 'clear-test',
        template: element('div')
      });
      registry.clear();
      expect(registry.has('clear-test')).toBe(false);
    });
  });

  describe('clearComponents', () => {
    it('clears all components', () => {
      const comp: ExternalComponent = {
        mount: (_props, container) => container,
        unmount: () => {}
      };
      registry.registerComponent('clear-comp', comp);
      registry.clearComponents();
      expect(registry.hasComponent('clear-comp')).toBe(false);
    });
  });
});
