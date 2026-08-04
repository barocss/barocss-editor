import { describe, it, expect } from 'vitest';
import { define, element, getGlobalRegistry } from '@barocss/dsl';

/**
 * Node types and HTML/SVG tags are separate namespaces.
 *
 * `define()` used to refuse any node type whose name matched a tag, on the
 * assumption that the two share a namespace. They do not: a node type is reached
 * through the registry by its stype, a tag through `element(tag)`, and `element`
 * resolves a native tag before consulting the registry — so they cannot collide
 * at lookup.
 *
 * These tests hold the line that actually matters: registration is unrestricted,
 * and a native tag still wins inside a template.
 */
describe('node types and tags are separate namespaces', () => {
  it('registers node types whose names are also HTML tags', () => {
    for (const nodeType of ['div', 'span', 'button', 'form', 'meta', 'table']) {
      expect(() => define(nodeType, element('div', { className: nodeType }))).not.toThrow();
      expect(getGlobalRegistry().get(nodeType)).toBeDefined();
    }
  });

  it('registers node types whose names are also SVG tags', () => {
    // The canvas half of the Office schema depends on exactly these
    for (const nodeType of ['line', 'path', 'ellipse', 'rect', 'circle', 'text', 'g']) {
      expect(() => define(nodeType, element('div', { className: nodeType }))).not.toThrow();
      expect(getGlobalRegistry().get(nodeType)).toBeDefined();
    }
  });

  it('registers node types with descriptive names, as before', () => {
    for (const nodeType of ['card', 'button-primary', 'custom-form', 'ui-div']) {
      expect(() => define(nodeType, element('div', { className: nodeType }))).not.toThrow();
    }
  });

  it('resolves element(tag) to the native tag even when a node type shares its name', () => {
    define('div', element('section', { className: 'registered-div' }));

    // A template asking for `div` means the HTML element, not the node type
    const divElement = element('div', { className: 'native' });
    expect(divElement.type).toBe('element');
    expect(divElement.tag).toBe('div');

    const buttonElement = element('button', 'Click me');
    expect(buttonElement.type).toBe('element');
    expect(buttonElement.tag).toBe('button');
  });

  it('resolves element(name) to a registered component when the name is not a tag', () => {
    define('card', element('div', { className: 'card' }, [element('h3', 'Card Title')]));
    define('button-primary', element('button', { className: 'btn-primary' }, 'Primary Button'));

    expect(() => {
      define('page', element('div', [
        element('card', { title: 'My Card' }),
        element('button-primary', { onClick: () => {} })
      ]));
      element('page', {});
    }).not.toThrow();

    expect((element('card', {}) as any).type).toBe('component');
  });

  it('keeps a tag-named node type reachable by stype, which is how documents render', () => {
    define('path', element('div', { className: 'shape-path' }));

    const definition = getGlobalRegistry().get('path');
    expect(definition?.nodeType).toBe('path');
    // define() wraps an element template in a component, so reach through it
    const rendered = (definition?.template as any).component({}, {});
    expect(rendered.tag).toBe('div');
    expect(rendered.attributes.className).toBe('shape-path');
  });
});
