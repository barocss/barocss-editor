import { describe, it, expect, beforeEach } from 'vitest';
import {
  element, el, data, attr, slot, when, text, each,
  component, define, renderer, external, getGlobalRegistry,
  defineDecorator, portal, defineMark,
  addDecoratorAttribute, addMarkClassAttribute
} from '../src/index';
import type {
  ElementTemplate, DataTemplate, SlotTemplate, ConditionalTemplate,
  ComponentTemplate, PortalTemplate, EachTemplate, RendererDefinition
} from '../src/index';

describe('element()', () => {
  it('creates element with tag only', () => {
    const el = element('div');
    expect(el.type).toBe('element');
    expect(el.tag).toBe('div');
    expect(el.children).toEqual([]);
  });

  it('creates element with text content', () => {
    const el = element('h1', 'Hello');
    expect(el.type).toBe('element');
    expect(el.tag).toBe('h1');
    expect(el.children.length).toBe(1);
    expect(el.children[0]).toBe('Hello');
  });

  it('creates element with number content', () => {
    const el = element('span', 42);
    expect(el.children.length).toBe(1);
    expect(el.children[0]).toBe('42');
  });

  it('creates element with children array', () => {
    const child1 = element('span', 'a');
    const child2 = element('span', 'b');
    const el = element('div', [child1, child2]);
    expect(el.children).toHaveLength(2);
  });

  it('creates element with attributes and children', () => {
    const el = element('div', { className: 'container', id: 'main' }, [
      element('p', 'text')
    ]);
    expect(el.type).toBe('element');
    expect(el.attributes.className).toBe('container');
    expect(el.attributes.id).toBe('main');
    expect(el.children).toHaveLength(1);
  });

  it('creates element with null attributes', () => {
    const el = element('div', null, [element('span')]);
    expect(el.attributes).toEqual({});
    expect(el.children).toHaveLength(1);
  });

  it('creates element with data template as child', () => {
    const d = data('name');
    const el = element('span', d);
    expect(el.children).toHaveLength(1);
    expect((el.children[0] as DataTemplate).type).toBe('data');
  });

  it('flattens nested children arrays', () => {
    const el = element('div', [[element('a'), element('b')], element('c')] as any);
    expect(el.children).toHaveLength(3);
  });

  it('filters out null/undefined children', () => {
    const el = element('div', [element('a'), null as any, undefined as any, element('b')]);
    expect(el.children).toHaveLength(2);
  });
});

describe('el() alias', () => {
  it('is the same function as element', () => {
    expect(el).toBe(element);
  });
});

describe('data()', () => {
  it('creates data template with path', () => {
    const d = data('user.name');
    expect(d.type).toBe('data');
    expect(d.path).toBe('user.name');
  });

  it('creates data template with path and default', () => {
    const d = data('user.name', 'anonymous');
    expect(d.type).toBe('data');
    expect(d.path).toBe('user.name');
    expect(d.defaultValue).toBe('anonymous');
  });

  it('creates data template with getter function', () => {
    const getter = (d: any) => d.user.name;
    const d = data(getter);
    expect(d.type).toBe('data');
    expect(d.getter).toBe(getter);
  });

  it('creates data template with getter and default', () => {
    const getter = (d: any) => d.count;
    const d = data(getter, 0);
    expect(d.getter).toBe(getter);
    expect(d.defaultValue).toBe(0);
  });
});

describe('attr()', () => {
  it('creates data template for attribute path', () => {
    const a = attr('className');
    expect(a.type).toBe('data');
    expect(a.path).toBe('attributes.className');
  });

  it('normalizes key that already has attributes prefix', () => {
    const a = attr('attributes.level');
    expect(a.path).toBe('attributes.level');
  });

  it('supports default value', () => {
    const a = attr('level', 1);
    expect(a.defaultValue).toBe(1);
  });
});

describe('slot()', () => {
  it('creates slot template', () => {
    const s = slot('content');
    expect(s.type).toBe('slot');
    expect(s.name).toBe('content');
  });
});

describe('when()', () => {
  it('creates conditional template with then only', () => {
    const condition = (d: any) => d.visible;
    const thenTpl = element('div', 'visible');
    const w = when(condition, thenTpl);
    expect(w.type).toBe('conditional');
    expect(w.condition).toBe(condition);
    expect(w.template).toBe(thenTpl);
    expect(w.elseTemplate).toBeUndefined();
  });

  it('creates conditional template with else', () => {
    const condition = (d: any) => d.visible;
    const thenTpl = element('div', 'yes');
    const elseTpl = element('div', 'no');
    const w = when(condition, thenTpl, elseTpl);
    expect(w.elseTemplate).toBe(elseTpl);
  });
});

describe('text()', () => {
  it('returns string for static text', () => {
    const t = text('hello');
    expect(t).toBe('hello');
  });

  it('returns string for number', () => {
    const t = text(42);
    expect(t).toBe('42');
  });

  it('returns data template for function', () => {
    const fn = (d: any) => d.name;
    const t = text(fn) as DataTemplate;
    expect(t.type).toBe('data');
    expect(t.getter).toBe(fn);
  });
});

describe('each()', () => {
  it('creates each template', () => {
    const renderFn = (item: any) => element('li', item.name);
    const e = each('items', renderFn);
    expect(e.type).toBe('each');
    expect(e.name).toBe('items');
    expect(typeof e.render).toBe('function');
  });

  it('wraps string return from render as element', () => {
    const e = each('items', (_item: any) => 'hello' as any);
    const result = e.render('hello', 0);
    expect(result.type).toBe('element');
    expect(result.tag).toBe('span');
  });

  it('supports key function', () => {
    const keyFn = (item: any) => item.id;
    const e = each('items', (item: any) => element('li', item.name), keyFn);
    expect(e.key).toBe(keyFn);
  });
});

describe('component()', () => {
  it('creates component template with name', () => {
    const c = component('card');
    expect(c.type).toBe('component');
    expect(c.name).toBe('card');
  });

  it('creates component template with props', () => {
    const c = component('card', { title: 'Hello' });
    expect(c.props).toEqual({ title: 'Hello' });
  });

  it('merges children into props.content for object props', () => {
    const children = [element('span', 'child')];
    const c = component('card', { title: 'Hello' }, children);
    expect((c.props as any).content).toBe(children);
  });

  it('wraps function props to inject content', () => {
    const propsFn = (d: any) => ({ title: d.title });
    const children = [element('span', 'child')];
    const c = component('card', propsFn, children);
    expect(typeof c.props).toBe('function');
    const result = (c.props as Function)({ title: 'Test' });
    expect(result.title).toBe('Test');
    expect(result.content).toBe(children);
  });

  it('supports key', () => {
    const c = component('card', {}, [], 'my-key');
    expect(c.key).toBe('my-key');
  });
});

describe('define() / renderer()', () => {
  it('creates and registers renderer definition', () => {
    const tpl = element('div', 'content');
    const def = define('my-card', tpl);
    expect(def.type).toBe('renderer');
    expect(def.nodeType).toBe('my-card');
  });

  it('registers function template as component', () => {
    const fn = (_props: any, _model: any) => element('div', 'hello');
    const def = renderer('fn-comp', fn);
    expect(def.type).toBe('renderer');
    expect(def.nodeType).toBe('fn-comp');
  });

  it('registered component is findable in global registry', () => {
    define('test-widget', (_props: any) => element('div'));
    const registry = getGlobalRegistry();
    expect(registry.has('test-widget')).toBe(true);
  });
});

describe('external()', () => {
  it('creates external descriptor for React component', () => {
    const ReactComp = (props: any) => props;
    const ext = external(ReactComp);
    expect(ext.type).toBe('external');
    expect(ext.reactComponent).toBe(ReactComp);
  });

  it('creates external descriptor for DOM mount/unmount', () => {
    const dom = {
      mount: (_p: any, el: HTMLElement) => el,
      unmount: () => {},
      managesDOM: true
    };
    const ext = external(dom);
    expect(ext.type).toBe('external');
    expect(ext.managesDOM).toBe(true);
  });
});

describe('defineDecorator()', () => {
  it('creates renderer with data-decorator attribute', () => {
    const tpl = element('span', { className: 'highlight' });
    const def = defineDecorator('my-decorator', tpl);
    expect(def.type).toBe('renderer');
    expect(def.nodeType).toBe('my-decorator');
  });
});

describe('addDecoratorAttribute()', () => {
  it('adds data-decorator to element template', () => {
    const tpl = element('span') as ElementTemplate;
    const result = addDecoratorAttribute(tpl) as ElementTemplate;
    expect(result.attributes['data-decorator']).toBe('true');
    expect(result.attributes['data-skip-reconcile']).toBe('true');
  });

  it('preserves existing data-decorator value', () => {
    const tpl = element('span', { 'data-decorator': 'custom' }) as ElementTemplate;
    const result = addDecoratorAttribute(tpl) as ElementTemplate;
    expect(result.attributes['data-decorator']).toBe('custom');
  });

  it('adds props to component template', () => {
    const tpl = component('my-comp', { className: 'test' }) as ComponentTemplate;
    const result = addDecoratorAttribute(tpl) as ComponentTemplate;
    expect((result.props as any)['data-decorator']).toBe('true');
  });
});

describe('addMarkClassAttribute()', () => {
  it('adds mark class to element template', () => {
    const tpl = element('strong') as ElementTemplate;
    const result = addMarkClassAttribute('bold', tpl) as ElementTemplate;
    expect(result.attributes.className).toBe('mark-bold');
  });

  it('appends to existing className', () => {
    const tpl = element('strong', { className: 'existing' }) as ElementTemplate;
    const result = addMarkClassAttribute('bold', tpl) as ElementTemplate;
    expect(result.attributes.className).toBe('existing mark-bold');
  });

  it('avoids duplicate mark class', () => {
    const tpl = element('strong', { className: 'mark-bold' }) as ElementTemplate;
    const result = addMarkClassAttribute('bold', tpl) as ElementTemplate;
    expect(result.attributes.className).toBe('mark-bold');
  });
});

describe('defineMark()', () => {
  it('registers mark renderer with mark: prefix', () => {
    const tpl = element('strong');
    const def = defineMark('bold', tpl);
    expect(def.nodeType).toBe('mark:bold');
  });
});

describe('portal()', () => {
  it('creates portal template with string target', () => {
    const tpl = element('div', 'content');
    const p = portal('#portal-root', tpl, 'my-portal');
    expect(p.type).toBe('portal');
    expect(p.target).toBe('#portal-root');
    expect(p.template).toBe(tpl);
    expect(p.portalId).toBe('my-portal');
  });

  it('creates portal template with function target', () => {
    const targetFn = () => document.body;
    const p = portal(targetFn, element('div'));
    expect(p.target).toBe(targetFn);
  });
});

describe('getGlobalRegistry()', () => {
  it('returns a registry instance', () => {
    const registry = getGlobalRegistry();
    expect(registry).toBeDefined();
    expect(typeof registry.register).toBe('function');
    expect(typeof registry.get).toBe('function');
    expect(typeof registry.getComponent).toBe('function');
  });

  it('returns the same instance every time', () => {
    const r1 = getGlobalRegistry();
    const r2 = getGlobalRegistry();
    expect(r1).toBe(r2);
  });
});
