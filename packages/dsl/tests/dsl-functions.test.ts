import { describe, it, expect } from 'vitest';
import { 
  element, data, slot, text, when, define, component, attr, portal, defineMark, defineDecorator,
  DataTemplate, ElementChild, ElementTemplate, PortalTemplate 
} from '../src/index';

describe('DSL Functions Tests', () => {
  describe('element() function', () => {
    it('should create element template with tag only', () => {
      const template = element('div') as ElementTemplate;
      
      expect(template.type).toBe('element');
      expect(template.tag).toBe('div');
      expect(template.attributes).toEqual({});
      expect(template.children).toEqual([]);
    });

    it('should create element template with tag and text content', () => {
      const template = element('h1', 'Hello World') as ElementTemplate;
      
      expect(template.type).toBe('element');
      expect(template.tag).toBe('h1');
      expect(template.attributes).toEqual({});
      expect(template.children).toHaveLength(1);
      expect(template.children[0]).toBe('Hello World');
    });

    it('should create element template with tag and attributes', () => {
      const template = element('div', { className: 'container', id: 'main' }) as ElementTemplate;
      
      expect(template.type).toBe('element');
      expect(template.tag).toBe('div');
      expect(template.attributes).toEqual({ className: 'container', id: 'main' });
      expect(template.children).toEqual([]);
    });

    it('should create element template with tag, attributes, and children', () => {
      const template = element('div', { className: 'container' }, [
        element('h1', 'Title') as ElementTemplate,
        element('p', 'Content') as ElementTemplate
      ]) as ElementTemplate;
      
      expect(template.type).toBe('element');
      expect(template.tag).toBe('div');
      expect(template.attributes).toEqual({ className: 'container' });
      expect(template.children).toHaveLength(2);
      expect((template.children[0] as ElementTemplate).type).toBe('element');
      expect((template.children[0] as ElementTemplate).tag).toBe('h1');
      expect((template.children[1] as ElementTemplate).type).toBe('element');
      expect((template.children[1] as ElementTemplate).tag).toBe('p');
    });

    it('should handle children array normalization', () => {
      const template = element('div', [
        element('span', 'First'),
        element('span', 'Second'),
        [element('span', 'Third'), element('span', 'Fourth')] // Nested array
      ]) as ElementTemplate;
      
      expect(template.children).toHaveLength(4);
      expect((template.children[0] as ElementTemplate).tag).toBe('span');
      expect((template.children[1] as ElementTemplate).tag).toBe('span');
      expect((template.children[2] as ElementTemplate).tag).toBe('span');
      expect((template.children[3] as ElementTemplate).tag).toBe('span');
    });
  });

  describe('data() function', () => {
    it('should create data template with path', () => {
      const template = data('user.name') as DataTemplate;
      
      expect(template.type).toBe('data');
      expect(template.path).toBe('user.name');
      expect(template.defaultValue).toBeUndefined();
    });

    it('should create data template with path and default value', () => {
      const template = data('user.age', 0) as DataTemplate;
      
      expect(template.type).toBe('data');
      expect(template.path).toBe('user.age');
      expect(template.defaultValue).toBe(0);
    });

    it('should create data template with getter function', () => {
      const getter = (data: any) => data.user?.name || 'Unknown';
      const template = data(getter) as DataTemplate;
      
      expect(template.type).toBe('data');
      expect(template.getter).toBe(getter);
      expect(template.path).toBeUndefined();
    });
  });

  describe('text() function', () => {
    it('should create text string from string input', () => {
      const result = text('Hello World') as ElementChild;
      
      expect(result).toBe('Hello World');
    });

    it('should create text string from number input', () => {
      const result = text(42) as ElementChild;
      
      expect(result).toBe('42');
    });

    it('should create data template from function input', () => {
      const getter = (data: any) => data.message;
      const result = text(getter) as DataTemplate;
      
      expect(result.type).toBe('data');
      expect(result.getter).toBe(getter);
    });
  });

  describe('slot() function', () => {
    it('should create slot template with default name', () => {
      const template = slot('content');
      
      expect(template.type).toBe('slot');
      expect(template.name).toBe('content');
    });

    it('should create slot template with custom name', () => {
      const template = slot('header');
      
      expect(template.type).toBe('slot');
      expect(template.name).toBe('header');
    });
  });

  describe('when() function', () => {
    it('should create conditional template', () => {
      const condition = (data: any) => data.show;
      const template = when(condition, element('div', 'Conditional content'));
      
      expect(template.type).toBe('conditional');
      expect(template.condition).toBe(condition);
      expect(template.template).toEqual(element('div', 'Conditional content'));
      expect(template.elseTemplate).toBeUndefined();
    });

    it('should create conditional template with else clause', () => {
      const condition = (data: any) => data.show;
      const thenTemplate = element('div', 'Show this');
      const elseTemplate = element('div', 'Hide this');
      const template = when(condition, thenTemplate, elseTemplate);
      
      expect(template.type).toBe('conditional');
      expect(template.condition).toBe(condition);
      expect(template.template).toBe(thenTemplate);
      expect(template.elseTemplate).toBe(elseTemplate);
    });
  });


  describe('define() function', () => {
    it('should create renderer definition', () => {
      const template = element('div', { className: 'custom' }, [slot('content')]);
      const definition = define('custom-component', template);
      
      expect(definition.type).toBe('renderer');
      expect(definition.nodeType).toBe('custom-component');
      // Since define() now wraps ElementTemplate as ComponentTemplate, template will be converted
      expect(definition.template.type).toBe('component');
      if (definition.template.type === 'component' && typeof definition.template.component === 'function') {
        const elementTemplate = definition.template.component({}, {} as any);
        expect(elementTemplate.attributes?.className).toBe('custom');
      }
    });
  });

  describe('attr() function', () => {
    it('should create data template for attributes', () => {
      const template = attr('level', 1);
      
      expect(template.type).toBe('data');
      expect(template.path).toBe('attributes.level');
      expect(template.defaultValue).toBe(1);
    });

    it('should handle attributes with attributes. prefix', () => {
      const template = attr('attributes.level', 2);
      
      expect(template.type).toBe('data');
      expect(template.path).toBe('attributes.level');
      expect(template.defaultValue).toBe(2);
    });

    it('should handle attributes without default value', () => {
      const template = attr('disabled');
      
      expect(template.type).toBe('data');
      expect(template.path).toBe('attributes.disabled');
      expect(template.defaultValue).toBeUndefined();
    });
  });

  describe('portal() function', () => {
    it('should create portal template', () => {
      // Create a mock target element for testing
      const targetElement = document.createElement('div');
      const template = element('span', 'Portal content');
      const portalTemplate = portal(targetElement, template, 'portal-1');
      
      expect(portalTemplate.type).toBe('portal');
      expect(portalTemplate.target).toBe(targetElement);
      expect(portalTemplate.template).toBe(template);
      expect(portalTemplate.portalId).toBe('portal-1');
    });

    it('should create portal template without portalId', () => {
      const targetElement = document.createElement('div');
      const template = element('span', 'Portal content');
      const portalTemplate = portal(targetElement, template);
      
      expect(portalTemplate.type).toBe('portal');
      expect(portalTemplate.target).toBe(targetElement);
      expect(portalTemplate.template).toBe(template);
      expect(portalTemplate.portalId).toBeUndefined();
    });
  });

  describe('defineMark() function', () => {
    it('should create mark renderer definition', () => {
      const template = element('span', { className: 'mark-bold' }, [slot('content')]);
      const definition = defineMark('bold', template);
      
      expect(definition.type).toBe('renderer');
      expect(definition.nodeType).toBe('mark:bold');
      // Since define() now wraps ElementTemplate as ComponentTemplate, we need to call the component function
      if (definition.template.type === 'component' && typeof definition.template.component === 'function') {
        const elementTemplate = definition.template.component({}, {} as any);
        expect(elementTemplate.attributes?.className).toBe('mark-bold mark-bold');
      } else {
        expect(definition.template.attributes?.className).toBe('mark-bold mark-bold');
      }
    });

    it('should create mark renderer with complex template', () => {
      const template = element('strong', { 
        className: 'mark-italic',
        style: 'font-style: italic;'
      }, [slot('content')]);
      const definition = defineMark('italic', template);
      
      expect(definition.type).toBe('renderer');
      expect(definition.nodeType).toBe('mark:italic');
      // Since define() now wraps ElementTemplate as ComponentTemplate, we need to call the component function
      if (definition.template.type === 'component' && typeof definition.template.component === 'function') {
        const elementTemplate = definition.template.component({}, {} as any);
        expect(elementTemplate.attributes?.className).toBe('mark-italic mark-italic');
      } else {
        expect(definition.template.attributes?.className).toBe('mark-italic mark-italic');
      }
    });
  });

  describe('defineDecorator() function', () => {
    it('should create decorator renderer definition', () => {
      const template = element('div', { className: 'decorator-highlight' }, [slot('content')]);
      const definition = defineDecorator('highlight', template);
      
      expect(definition.type).toBe('renderer');
      expect(definition.nodeType).toBe('highlight');
      // Since define() now wraps ElementTemplate as ComponentTemplate, we need to call the component function
      if (definition.template.type === 'component' && typeof definition.template.component === 'function') {
        const elementTemplate = definition.template.component({}, {} as any);
        expect(elementTemplate.attributes?.['data-decorator']).toBe('true');
      } else {
        expect(definition.template.attributes?.['data-decorator']).toBe('true');
      }
    });

    it('should create decorator with data binding', () => {
      const template = element('div', { 
        className: 'decorator-tooltip',
        'data-tooltip': data('tooltipText')
      }, [slot('content')]);
      const definition = defineDecorator('tooltip', template);
      
      expect(definition.type).toBe('renderer');
      expect(definition.nodeType).toBe('tooltip');
      // Since define() now wraps ElementTemplate as ComponentTemplate, we need to call the component function
      if (definition.template.type === 'component' && typeof definition.template.component === 'function') {
        const elementTemplate = definition.template.component({}, {} as any);
        expect(elementTemplate.attributes?.['data-decorator']).toBe('true');
      } else {
        expect(definition.template.attributes?.['data-decorator']).toBe('true');
      }
    });

    it('should create decorator with conditional rendering', () => {
      const template = element('div', { className: 'decorator-container' }, [
        when(d => d.showTooltip, element('div', { className: 'tooltip' }, [data('tooltipText')])),
        slot('content')
      ]);
      const definition = defineDecorator('conditional-tooltip', template);
      
      expect(definition.type).toBe('renderer');
      expect(definition.nodeType).toBe('conditional-tooltip');
      // Since define() now wraps ElementTemplate as ComponentTemplate, we need to call the component function
      if (definition.template.type === 'component' && typeof definition.template.component === 'function') {
        const elementTemplate = definition.template.component({}, {} as any);
        expect(elementTemplate.attributes?.['data-decorator']).toBe('true');
      } else {
        expect(definition.template.attributes?.['data-decorator']).toBe('true');
      }
    });
  });

  describe('component() function', () => {
    it('should create component template with string name', () => {
      const props = { title: 'Test' };
      const children = [element('span', 'Content')];
      const template = component('my-component', props, children);
      
      expect(template.type).toBe('component');
      expect(template.name).toBe('my-component');
      expect(template.props).toEqual({ ...props, content: children });
      expect(template.children).toEqual(children);
    });

  });

  describe('Complex DSL combinations', () => {
    it('should create complex nested template structure', () => {
      const template = element('div', { className: 'container' }, [
        element('header', [
          element('h1', data('title')),
          when(d => d.subtitle, element('h2', data('subtitle')))
        ]),
        element('main', [
          slot('content')
        ]),
        element('footer', [
          (d: any) => d.links.map((link: any) => 
            element('a', { href: link.url }, [text(link.text)])
          )
        ])
      ]) as ElementTemplate;

      expect(template.type).toBe('element');
      expect(template.tag).toBe('div');
      expect(template.children).toHaveLength(3);
      
      // Header
      expect((template.children[0] as ElementTemplate).tag).toBe('header');
      expect((template.children[0] as ElementTemplate).children).toHaveLength(2);
      expect(((template.children[0] as ElementTemplate).children[0] as ElementTemplate).tag).toBe('h1');
      expect(((template.children[0] as ElementTemplate).children[0] as ElementTemplate).children[0].type).toBe('data');
      expect((template.children[0] as ElementTemplate).children[1].type).toBe('conditional');
      
      // Main
      expect((template.children[1] as ElementTemplate).tag).toBe('main');
      expect((template.children[1] as ElementTemplate).children[0].type).toBe('slot');
      
      // Footer - function children are kept as functions in DSL level, converted to 'each' at render time
      expect((template.children[2] as ElementTemplate).tag).toBe('footer');
      // Function children remain as functions in DSL level
      expect(typeof (template.children[2] as ElementTemplate).children[0]).toBe('function');
    });

    it('should handle deeply nested structures', () => {
      let nested = element('span', 'Deep content') as ElementTemplate;
      for (let i = 0; i < 5; i++) {
        nested = element('div', { className: `level-${i}` }, [nested]) as ElementTemplate;
      }

      expect(nested.type).toBe('element');
      expect(nested.tag).toBe('div');
      expect(nested.attributes?.className).toBe('level-4');
      expect(nested.children).toHaveLength(1);
      
      // Check deepest level
      let current = nested as ElementTemplate;
      for (let i = 0; i < 4; i++) {
        current = current.children[0] as ElementTemplate;
        expect(current.type).toBe('element');
        expect(current.tag).toBe('div');
      }
      expect(current.children[0]).toEqual(element('span', 'Deep content'));
    });
  });

  describe('DSL function parameter validation', () => {
    it('should handle null and undefined inputs gracefully', () => {
      const template1 = element('div', null, []) as ElementTemplate;
      expect(template1.attributes).toEqual({});
      
      const template2 = element('div', undefined, []) as ElementTemplate;
      expect(template2.attributes).toEqual({});
      
      const template3 = element('div', {}, [null, undefined]) as ElementTemplate;
      expect(template3.children).toEqual([]);
    });

    it('should handle empty arrays and objects', () => {
      const template = element('div', {}, []) as ElementTemplate;
      expect(template.children).toEqual([]);
      
      const template2 = element('div', {}) as ElementTemplate;
      expect(template2.attributes).toEqual({});
    });

    it('should handle special characters in attributes', () => {
      const template = element('div', { 
        'data-test': 'value',
        'aria-label': 'Test label',
        'data-value': 'special-chars: !@#$%^&*()'
      }) as ElementTemplate;
      
      expect(template.attributes?.['data-test']).toBe('value');
      expect(template.attributes?.['aria-label']).toBe('Test label');
      expect(template.attributes?.['data-value']).toBe('special-chars: !@#$%^&*()');
    });
  });
});
