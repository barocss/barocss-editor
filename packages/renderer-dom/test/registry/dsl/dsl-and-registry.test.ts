import { describe, it, expect } from 'vitest';
import { element, data, slot, when, renderer, text } from '@barocss/dsl';
import { RendererRegistry } from '@barocss/dsl';

describe('Renderer DOM DSL and Registry', () => {
  it('builds element/data/slot/conditional templates', () => {
    const tmpl = element('div', { id: 'x' }, [
      text('text'),
      data('attributes.color'),
      when(d => d.flag, element('span', { className: 'flag' }, ['ok'])),
    ]);

    expect(tmpl.type).toBe('element');
    expect(tmpl.tag).toBe('div');
    expect(tmpl.attributes).toMatchObject({ id: 'x' });
    expect(tmpl.children.length).toBe(3);
  });

  it('registers and retrieves renderers from registry', () => {
    const reg = new RendererRegistry();
    const r = renderer('text', element('span', { className: 't' }, [data('text')]));
    reg.register(r);
    expect(reg.has('text')).toBe(true);
    
    // Since define() automatically converts ElementTemplate to ComponentTemplate,
    // we need to call the component function to get the ElementTemplate
    const component = reg.getComponent('text');
    expect(component).toBeDefined();
    const templateFn = component?.template;
    expect(typeof templateFn).toBe('function');
    const elementTemplate = typeof templateFn === 'function'
      ? templateFn({}, {} as any, {} as any)
      : undefined;
    expect(elementTemplate).toBeTruthy();
    expect(elementTemplate?.tag).toBe('span');
    expect(elementTemplate?.attributes?.className).toBe('t');
    
    expect(reg.getAll().length).toBe(1);
  });
});


