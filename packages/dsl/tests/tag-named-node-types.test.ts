import { describe, it, expect, beforeEach } from 'vitest';
import { define, element, slot, data, getGlobalRegistry } from '../src/template-builders';

/**
 * Node types and HTML tags are separate namespaces.
 *
 * A document schema is entitled to call a shape `line` or `path` and a metadata
 * node `meta` — none of which mean the tag of the same name. Registration used
 * to throw for any such name, which made the canvas half of the Office schema
 * unrenderable.
 */
describe('node types named after tags', () => {
  const registry = getGlobalRegistry();

  beforeEach(() => {
    registry.clear?.();
  });

  it('registers a node type that shares a name with an SVG tag', () => {
    // Slide and FigJam both need these
    for (const nodeType of ['line', 'path', 'ellipse']) {
      expect(() => define(nodeType, element('div', { className: nodeType }))).not.toThrow();
      expect(registry.get(nodeType)).toBeDefined();
    }
  });

  it('registers a node type that shares a name with an HTML tag', () => {
    expect(() => define('meta', element('header', { className: 'w-meta' }, [slot('content')]))).not.toThrow();
    expect(registry.get('meta')).toBeDefined();
  });

  it('still resolves element(tag) to the tag, not the registered type', () => {
    define('line', element('div', { className: 'shape-line' }));

    // A template asking for `line` means the SVG element; the node type is
    // reached by its stype instead.
    const template = element('line') as any;
    expect(template.type).toBe('element');
    expect(template.tag).toBe('line');
  });

  it('resolves a non-tag name to the registered component, as before', () => {
    define('stickyNote', element('div', { className: 'sticky' }));

    const template = element('stickyNote') as any;
    // Registered names that are not tags still embed as components
    expect(template.type).toBe('component');
  });

  it('keeps the renderer reachable by stype, which is how documents render', () => {
    define('path', element('div', { className: 'shape-path' }, [data('d', '')]));

    // define() wraps an element template in a component, so reach through it
    const definition = registry.get('path');
    expect(definition?.nodeType).toBe('path');
    const rendered = (definition?.template as any).component({}, {});
    expect(rendered.tag).toBe('div');
    expect(rendered.attributes.className).toBe('shape-path');
  });
});
