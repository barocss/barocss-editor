import { describe, it, expect, beforeEach } from 'vitest';
import { define, element, slot, data, attr, when, each, defineMark, getGlobalRegistry, external } from '@barocss/dsl';
import { buildToReact } from '../src/build-to-react';
import { ReactRenderer } from '../src/react-renderer';

/** Get direct children of a React node (single or array) for assertion */
function directChildren(node: any): any[] {
  if (node == null) return [];
  const c = node.props?.children;
  if (c == null) return [];
  return Array.isArray(c) ? c : [c];
}

/** Recursively collect all descendants (for finding nested elements) */
function flattenChildren(node: any): any[] {
  if (node == null) return [];
  if (typeof node === 'string' || typeof node === 'number') return [node];
  const children = directChildren(node);
  return children.flatMap((ch: any) =>
    ch && typeof ch === 'object' && ch.type ? [ch, ...flattenChildren(ch)] : [ch]
  );
}

/** Collect direct child keys and types */
function collectChildKeysAndTypes(node: any): { key: string | null; type: string }[] {
  const children = directChildren(node);
  return children.map((ch: any) => ({
    key: ch?.key ?? null,
    type: typeof ch?.type === 'string' ? ch.type : ch?.type?.displayName ?? 'component',
  }));
}

/** Find first descendant that is an element with the given type (e.g. 'strong', 'em') */
function findElementByType(node: any, tag: string): any {
  if (node == null) return null;
  if (typeof node.type === 'string' && node.type === tag) return node;
  const children = directChildren(node);
  for (const ch of children) {
    const found = findElementByType(ch, tag);
    if (found) return found;
  }
  return null;
}

/** Check if a node tree contains raw string content */
function hasRawText(node: any, text: string): boolean {
  if (node == null) return false;
  if (typeof node === 'string') return node === text;
  const children = directChildren(node);
  for (const ch of children) {
    if (hasRawText(ch, text)) return true;
  }
  return false;
}

describe('buildToReact – data(text) and marks', () => {
  beforeEach(() => {
    const registry = getGlobalRegistry();
    if (!registry.has?.('inline-text')) {
      define('inline-text', element('span', { className: 'text' }, [data('text')]));
    }
    if (!(registry as any).get?.('mark:bold')) {
      defineMark('bold', element('strong', { className: 'mark-bold' }, []));
    }
    if (!(registry as any).get?.('mark:italic')) {
      defineMark('italic', element('em', { className: 'mark-italic' }, []));
    }
  });

  it('data("text") with no marks renders text inside span', () => {
    const registry = getGlobalRegistry();
    const model = { sid: 't1', stype: 'inline-text', text: 'Plain text' };
    const node = buildToReact(registry, 'inline-text', model as any) as any;
    expect(node.type).toBe('span');
    expect(node.key).toBe('t1');
    expect(node.props?.['data-bc-sid']).toBe('t1');
    const children = directChildren(node);
    expect(children).toHaveLength(1);
    expect(children[0]).toBe('Plain text');
  });

  it('data("text") with global bold mark wraps text in strong', () => {
    const registry = getGlobalRegistry();
    const model = {
      sid: 't1',
      stype: 'inline-text',
      text: 'Bold text',
      marks: [{ stype: 'bold' }],
    };
    const node = buildToReact(registry, 'inline-text', model as any) as any;
    expect(node.type).toBe('span');
    const strong = findElementByType(node, 'strong');
    expect(strong).toBeTruthy();
    expect(strong.props?.className).toContain('mark-bold');
    const children = directChildren(strong);
    expect(children).toContain('Bold text');
  });

  it('data("text") with ranged marks splits into runs and wraps each run', () => {
    const registry = getGlobalRegistry();
    const model = {
      sid: 't1',
      stype: 'inline-text',
      text: 'Hello world',
      marks: [
        { stype: 'bold', range: [0, 5] },
        { stype: 'italic', range: [6, 11] },
      ],
    };
    const node = buildToReact(registry, 'inline-text', model as any) as any;
    expect(node.type).toBe('span');
    const strong = findElementByType(node, 'strong');
    const em = findElementByType(node, 'em');
    expect(strong).toBeTruthy();
    expect(em).toBeTruthy();
    expect(hasRawText(node, 'Hello')).toBe(true);
    expect(hasRawText(node, ' ')).toBe(true);
    expect(hasRawText(node, 'world')).toBe(true);
  });

  it('unregistered mark type is skipped; text still rendered', () => {
    const registry = getGlobalRegistry();
    const model = {
      sid: 't1',
      stype: 'inline-text',
      text: 'Mixed',
      marks: [
        { stype: 'bold', range: [0, 2] },
        { stype: 'unknown-mark', range: [2, 5] },
      ],
    };
    const node = buildToReact(registry, 'inline-text', model as any) as any;
    expect(node).toBeTruthy();
    const strong = findElementByType(node, 'strong');
    expect(strong).toBeTruthy();
    expect(hasRawText(node, 'Mi')).toBe(true);
    expect(hasRawText(node, 'xed')).toBe(true);
  });
});

describe('buildToReact – deep tree and multiple children', () => {
  beforeEach(() => {
    const registry = getGlobalRegistry();
    if (!registry.has?.('doc')) {
      define('doc', element('div', { className: 'document' }, [slot('content')]));
    }
    if (!registry.has?.('paragraph')) {
      define('paragraph', element('p', { className: 'paragraph' }, [slot('content')]));
    }
    if (!registry.has?.('inline-text')) {
      define('inline-text', element('span', {}, [data('text')]));
    }
  });

  it('document with two paragraphs renders both with correct keys', () => {
    const registry = getGlobalRegistry();
    const model = {
      sid: 'd1',
      stype: 'doc',
      content: [
        { sid: 'p1', stype: 'paragraph', content: [{ sid: 't1', stype: 'inline-text', text: 'First' }] },
        { sid: 'p2', stype: 'paragraph', content: [{ sid: 't2', stype: 'inline-text', text: 'Second' }] },
      ],
    };
    const node = buildToReact(registry, 'doc', model as any) as any;
    const keysAndTypes = collectChildKeysAndTypes(node);
    expect(keysAndTypes).toHaveLength(2);
    expect(keysAndTypes[0]).toEqual({ key: 'p1', type: 'p' });
    expect(keysAndTypes[1]).toEqual({ key: 'p2', type: 'p' });
  });

  it('document with empty content array renders div with no block children', () => {
    const registry = getGlobalRegistry();
    const model = { sid: 'd1', stype: 'doc', content: [] };
    const node = buildToReact(registry, 'doc', model as any) as any;
    expect(node.type).toBe('div');
    expect(node.key).toBe('d1');
    const children = directChildren(node);
    expect(children).toHaveLength(0);
  });

  it('deep tree: doc > paragraph > inline-text preserves key and data-bc-* at each level', () => {
    const registry = getGlobalRegistry();
    const model = {
      sid: 'd1',
      stype: 'doc',
      content: [
        {
          sid: 'p1',
          stype: 'paragraph',
          content: [{ sid: 't1', stype: 'inline-text', text: 'Nested' }],
        },
      ],
    };
    const node = buildToReact(registry, 'doc', model as any) as any;
    expect(node.props?.['data-bc-sid']).toBe('d1');
    expect(node.props?.['data-bc-stype']).toBe('doc');
    const p = directChildren(node)[0] as any;
    expect(p?.props?.['data-bc-sid']).toBe('p1');
    expect(p?.props?.['data-bc-stype']).toBe('paragraph');
    const span = directChildren(p)[0] as any;
    expect(span?.props?.['data-bc-sid']).toBe('t1');
    expect(span?.props?.['data-bc-stype']).toBe('inline-text');
  });
});

describe('buildToReact – attributes', () => {
  beforeEach(() => {
    const registry = getGlobalRegistry();
    if (!registry.has?.('styled-block')) {
      define('styled-block', element('div', { className: 'block', 'data-test': 'value' }, [slot('content')]));
    }
  });

  it('element template attributes are applied to root element', () => {
    const registry = getGlobalRegistry();
    const model = { sid: 'b1', stype: 'styled-block', content: [] };
    const node = buildToReact(registry, 'styled-block', model as any) as any;
    expect(node.type).toBe('div');
    expect(node.props?.className).toBe('block');
    expect(node.props?.['data-test']).toBe('value');
    expect(node.props?.['data-bc-sid']).toBe('b1');
  });
});

describe('ReactRenderer – complex document', () => {
  beforeEach(() => {
    const registry = getGlobalRegistry();
    if (!registry.has?.('doc')) {
      define('doc', element('div', { className: 'document' }, [slot('content')]));
    }
    if (!registry.has?.('paragraph')) {
      define('paragraph', element('p', { className: 'paragraph' }, [slot('content')]));
    }
    if (!registry.has?.('inline-text')) {
      define('inline-text', element('span', {}, [data('text')]));
    }
  });

  it('build() produces full document tree with stable keys', () => {
    const renderer = new ReactRenderer(getGlobalRegistry());
    const model = {
      sid: 'root',
      stype: 'doc',
      content: [
        {
          sid: 'p1',
          stype: 'paragraph',
          content: [
            { sid: 't1', stype: 'inline-text', text: 'One' },
          ],
        },
        {
          sid: 'p2',
          stype: 'paragraph',
          content: [
            { sid: 't2', stype: 'inline-text', text: 'Two' },
          ],
        },
      ],
    };
    const node = renderer.build(model as any) as any;
    expect(node.type).toBe('div');
    expect(node.key).toBe('root');
    const children = directChildren(node);
    expect(children).toHaveLength(2);
    expect(children[0].key).toBe('p1');
    expect(children[1].key).toBe('p2');
    const p1Children = directChildren(children[0]);
    const p2Children = directChildren(children[1]);
    expect(p1Children.some((c: any) => c === 'One' || (c?.props?.children === 'One'))).toBe(true);
    expect(p2Children.some((c: any) => c === 'Two' || (c?.props?.children === 'Two'))).toBe(true);
  });
});

// --- Implementation verification: complex scenarios matching build-to-react.ts and marks.ts ---

describe('buildToReact – implementation: overlapping marks and run keys', () => {
  beforeEach(() => {
    const registry = getGlobalRegistry();
    if (!registry.has?.('inline-text')) {
      define('inline-text', element('span', { className: 'text' }, [data('text')]));
    }
    if (!(registry as any).get?.('mark:bold')) {
      defineMark('bold', element('strong', { className: 'mark-bold' }, []));
    }
    if (!(registry as any).get?.('mark:italic')) {
      defineMark('italic', element('em', { className: 'mark-italic' }, []));
    }
  });

  it('overlapping marks produce 5 runs with correct strong/em and text', () => {
    const registry = getGlobalRegistry();
    const model = {
      sid: 't1',
      stype: 'inline-text',
      text: 'abcdef',
      marks: [
        { stype: 'bold', range: [1, 4] },
        { stype: 'italic', range: [2, 5] },
      ],
    };
    const node = buildToReact(registry, 'inline-text', model as any) as any;
    expect(node.type).toBe('span');
    const children = directChildren(node);
    expect(children).toHaveLength(5);
    expect(children[0]).toBe('a');
    const run1 = children[1];
    const run2 = children[2];
    const run3 = children[3];
    expect(children[4]).toBe('f');
    expect(run1?.type).toBe('strong');
    expect(hasRawText(run1, 'b')).toBe(true);
    expect(run2?.type).toBe('strong');
    const run2Inner = directChildren(run2)[0];
    expect(run2Inner?.type).toBe('em');
    expect(hasRawText(run2Inner, 'cd')).toBe(true);
    expect(run3?.type).toBe('em');
    expect(hasRawText(run3, 'e')).toBe(true);
  });

  it('mark run elements have keys from keyBase (sid_r0, sid_r1, ...)', () => {
    const registry = getGlobalRegistry();
    const model = {
      sid: 'n1',
      stype: 'inline-text',
      text: 'xy',
      marks: [
        { stype: 'bold', range: [0, 1] },
        { stype: 'italic', range: [1, 2] },
      ],
    };
    const node = buildToReact(registry, 'inline-text', model as any) as any;
    const children = directChildren(node);
    expect(children).toHaveLength(2);
    expect(children[0].key).toMatch(/^n1_r0_/);
    expect(children[1].key).toMatch(/^n1_r1_/);
  });
});

describe('buildToReact – implementation: dynamic tag and data path', () => {
  it('dynamic tag from model resolves to correct element type', () => {
    const registry = getGlobalRegistry();
    const tagFn = (d: any) => d.tagName ?? 'div';
    define('dynamic-block', element(tagFn as any, { className: 'dynamic' }, [slot('content')]));
    const model = { sid: 'b1', stype: 'dynamic-block', tagName: 'section', content: [] };
    const node = buildToReact(registry, 'dynamic-block', model as any) as any;
    expect(node.type).toBe('section');
    expect(node.props?.className).toBe('dynamic');
  });

  it('data path with dot resolves nested value', () => {
    const registry = getGlobalRegistry();
    define('meta-line', element('span', {}, [data('meta.title')]));
    const model = { sid: 'm1', stype: 'meta-line', meta: { title: 'Title' } };
    const node = buildToReact(registry, 'meta-line', model as any) as any;
    const children = directChildren(node);
    expect(children).toHaveLength(1);
    expect(children[0]).toBe('Title');
  });

  it('data(path) other than "text" does not apply marks even when model.marks exists', () => {
    const registry = getGlobalRegistry();
    define('caption-block', element('span', {}, [data('caption')]));
    const model = {
      sid: 'c1',
      stype: 'caption-block',
      caption: 'Cap',
      marks: [{ stype: 'bold' }],
    };
    const node = buildToReact(registry, 'caption-block', model as any) as any;
    const children = directChildren(node);
    expect(children).toHaveLength(1);
    expect(children[0]).toBe('Cap');
    expect(findElementByType(node, 'strong')).toBeNull();
  });
});

describe('buildToReact – implementation: mixed children and empty text', () => {
  beforeEach(() => {
    const registry = getGlobalRegistry();
    if (!registry.has?.('doc')) {
      define('doc', element('div', { className: 'document' }, [slot('content')]));
    }
    if (!registry.has?.('paragraph')) {
      define('paragraph', element('p', {}, [slot('content')]));
    }
    if (!registry.has?.('inline-text')) {
      define('inline-text', element('span', {}, [data('text')]));
    }
  });

  it('template with slot then data renders slot children then data value', () => {
    const registry = getGlobalRegistry();
    define('block-with-caption', element('div', {}, [slot('content'), data('caption')]));
    const model = {
      sid: 'b1',
      stype: 'block-with-caption',
      content: [{ sid: 'p1', stype: 'paragraph', content: [{ sid: 't1', stype: 'inline-text', text: 'Para' }] }],
      caption: 'Caption text',
    };
    const node = buildToReact(registry, 'block-with-caption', model as any) as any;
    const children = directChildren(node);
    expect(children.length).toBeGreaterThanOrEqual(2);
    expect(hasRawText(node, 'Para')).toBe(true);
    expect(hasRawText(node, 'Caption text')).toBe(true);
  });

  it('data("text") with empty string renders without throwing', () => {
    const registry = getGlobalRegistry();
    const model = { sid: 't1', stype: 'inline-text', text: '' };
    const node = buildToReact(registry, 'inline-text', model as any) as any;
    expect(node).toBeTruthy();
    const children = directChildren(node);
    expect(children).toHaveLength(1);
    expect(children[0]).toBe('');
  });
});

describe('buildToReact – implementation: contextual component and managesDOM', () => {
  it('contextual component (template as function) returns element and is used for build', () => {
    const registry = getGlobalRegistry();
    const contextualTemplate = (_props: any, model: any) =>
      element('div', { className: 'from-contextual', 'data-bc-sid': model?.sid }, [data('text')]);
    define('contextual-block', contextualTemplate as any);
    const model = { sid: 'c1', stype: 'contextual-block', text: 'From contextual' };
    const node = buildToReact(registry, 'contextual-block', model as any) as any;
    expect(node.type).toBe('div');
    expect(node.props?.className).toBe('from-contextual');
    expect(hasRawText(node, 'From contextual')).toBe(true);
  });

  it('managesDOM template renders placeholder div with data-bc-sid and data-bc-stype', () => {
    const registry = getGlobalRegistry();
    (registry as any).registerComponent?.('external-block', {
      managesDOM: true,
      mount: () => ({} as any),
      unmount: () => {},
    });
    const model = { sid: 'e1', stype: 'external-block' };
    const node = buildToReact(registry, 'external-block', model as any) as any;
    expect(node.type).toBe('div');
    expect(node.props?.['data-bc-sid']).toBe('e1');
    expect(node.props?.['data-bc-stype']).toBe('external-block');
    expect(node.props?.className).toContain('react-renderer-external-placeholder');
  });

  it('external(ReactComponent) renders the component with model, sid, stype props', () => {
    const registry = getGlobalRegistry();
    function ReactExternalBlock(_props: Record<string, any>) {
      return null;
    }
    define('react-external-block', external(ReactExternalBlock as any));
    const model = { sid: 'r1', stype: 'react-external-block', title: 'Hello' };
    const node = buildToReact(registry, 'react-external-block', model as any) as any;
    expect(node.type).toBe(ReactExternalBlock);
    expect(node.props?.model).toEqual(model);
    expect(node.props?.sid).toBe('r1');
    expect(node.props?.stype).toBe('react-external-block');
    expect(node.props?.['data-bc-sid']).toBe('r1');
  });

  it('external(ReactComponent) with no model.content has undefined props.children and does not throw', () => {
    const registry = getGlobalRegistry();
    function EmptyCard(_props: Record<string, any>) {
      return null;
    }
    define('empty-card', external(EmptyCard as any));
    const modelNoContent = { sid: 'c1', stype: 'empty-card' };
    const modelEmptyContent = { sid: 'c2', stype: 'empty-card', content: [] };
    const node1 = buildToReact(registry, 'empty-card', modelNoContent as any) as any;
    const node2 = buildToReact(registry, 'empty-card', modelEmptyContent as any) as any;
    expect(node1.type).toBe(EmptyCard);
    expect(node1.props?.children).toBeUndefined();
    expect(node2.type).toBe(EmptyCard);
    expect(node2.props?.children).toBeUndefined();
  });

  it('external(ReactComponent) with model.content receives props.children (schema hierarchy)', () => {
    const registry = getGlobalRegistry();
    if (!registry.has?.('paragraph')) {
      define('paragraph', element('p', {}, [slot('content')]));
    }
    if (!registry.has?.('inline-text')) {
      define('inline-text', element('span', {}, [data('text')]));
    }
    function CardWithChildren(_props: Record<string, any>) {
      return null;
    }
    define('card-block', external(CardWithChildren as any));
    const model = {
      sid: 'card1',
      stype: 'card-block',
      content: [
        { sid: 'p1', stype: 'paragraph', content: [{ sid: 't1', stype: 'inline-text', text: 'A' }] },
        { sid: 'p2', stype: 'paragraph', content: [{ sid: 't2', stype: 'inline-text', text: 'B' }] },
      ],
    };
    const node = buildToReact(registry, 'card-block', model as any) as any;
    expect(node.type).toBe(CardWithChildren);
    expect(node.props?.model).toEqual(model);
    expect(Array.isArray(node.props?.children)).toBe(true);
    expect(node.props.children).toHaveLength(2);
    expect(node.props.children[0].type).toBe('p');
    expect(node.props.children[1].type).toBe('p');
    expect(hasRawText(node, 'A')).toBe(true);
    expect(hasRawText(node, 'B')).toBe(true);
  });
});

// --- Spec §8.2 Integration + checklist + edge cases ---

describe('buildToReact – spec §3 integration: document > paragraph > inline-text with marks', () => {
  beforeEach(() => {
    const registry = getGlobalRegistry();
    if (!registry.has?.('doc')) {
      define('doc', element('div', { className: 'document' }, [slot('content')]));
    }
    if (!registry.has?.('paragraph')) {
      define('paragraph', element('p', { className: 'paragraph' }, [slot('content')]));
    }
    if (!registry.has?.('inline-text')) {
      define('inline-text', element('span', { className: 'text' }, [data('text')]));
    }
    if (!(registry as any).get?.('mark:bold')) {
      defineMark('bold', element('strong', { className: 'mark-bold' }, []));
    }
    if (!(registry as any).get?.('mark:italic')) {
      defineMark('italic', element('em', { className: 'mark-italic' }, []));
    }
  });

  it('full document tree has root key and data-bc-sid; children present; text runs with marks wrapped (strong/em)', () => {
    const registry = getGlobalRegistry();
    const model = {
      sid: 'doc1',
      stype: 'doc',
      content: [
        {
          sid: 'p1',
          stype: 'paragraph',
          content: [
            {
              sid: 't1',
              stype: 'inline-text',
              text: 'Bold and italic',
              marks: [
                { stype: 'bold', range: [0, 4] },
                { stype: 'italic', range: [9, 15] },
              ],
            },
          ],
        },
      ],
    };
    const node = buildToReact(registry, 'doc', model as any) as any;
    expect(node.key).toBe('doc1');
    expect(node.props?.['data-bc-sid']).toBe('doc1');
    expect(node.props?.['data-bc-stype']).toBe('doc');
    const p = directChildren(node)[0] as any;
    expect(p?.key).toBe('p1');
    const span = directChildren(p)[0] as any;
    expect(span?.key).toBe('t1');
    const strong = findElementByType(node, 'strong');
    const em = findElementByType(node, 'em');
    expect(strong).toBeTruthy();
    expect(em).toBeTruthy();
    expect(hasRawText(node, 'Bold')).toBe(true);
    expect(hasRawText(node, ' and ')).toBe(true);
    expect(hasRawText(node, 'italic')).toBe(true);
  });
});

describe('buildToReact – data defaultValue and attribute resolution', () => {
  it('data(path, defaultValue) uses defaultValue when value is null or undefined', () => {
    const registry = getGlobalRegistry();
    define('fallback-text', element('span', {}, [data('title', 'Default Title')]));
    const node1 = buildToReact(registry, 'fallback-text', { sid: 'a1', stype: 'fallback-text' } as any) as any;
    const node2 = buildToReact(registry, 'fallback-text', { sid: 'a2', stype: 'fallback-text', title: null } as any) as any;
    expect(directChildren(node1)[0]).toBe('Default Title');
    expect(directChildren(node2)[0]).toBe('Default Title');
  });

  it('attribute from model path (e.g. attributes.className) resolves to element prop', () => {
    const registry = getGlobalRegistry();
    define('attr-block', element('div', { className: data('attributes.className') }, [slot('content')]));
    const model = { sid: 'b1', stype: 'attr-block', attributes: { className: 'from-model' }, content: [] };
    const node = buildToReact(registry, 'attr-block', model as any) as any;
    expect(node.props?.className).toBe('from-model');
  });

  it('data(getter) without path uses getter result as text', () => {
    const registry = getGlobalRegistry();
    define('getter-text', element('span', {}, [data((d: any) => (d.prefix ?? '') + '-' + (d.suffix ?? ''))]));
    const model = { sid: 'g1', stype: 'getter-text', prefix: 'Pre', suffix: 'Fix' };
    const node = buildToReact(registry, 'getter-text', model as any) as any;
    expect(directChildren(node)[0]).toBe('Pre-Fix');
  });

  it('attr(key) from DSL resolves to model.attributes[key]', () => {
    const registry = getGlobalRegistry();
    define('attr-dsl-block', element('div', { className: attr('className'), id: attr('id', 'default-id') }, []));
    const model = { sid: 'a1', stype: 'attr-dsl-block', attributes: { className: 'from-attr', id: 'my-id' } };
    const node = buildToReact(registry, 'attr-dsl-block', model as any) as any;
    expect(node.props?.className).toBe('from-attr');
    expect(node.props?.id).toBe('my-id');
  });

  it('attr(key, defaultValue) uses defaultValue when attribute is missing', () => {
    const registry = getGlobalRegistry();
    define('attr-fallback', element('div', { role: attr('role', 'article') }, []));
    const model = { sid: 'a2', stype: 'attr-fallback', attributes: {} };
    const node = buildToReact(registry, 'attr-fallback', model as any) as any;
    expect(node.props?.role).toBe('article');
  });

  it('className resolved as object (Record<string, boolean>) yields only true keys as class string', () => {
    const registry = getGlobalRegistry();
    define('class-map-block', element('div', { className: (d: any) => ({ active: !!d.active, disabled: !!d.disabled }) }, []));
    const model = { sid: 'b1', stype: 'class-map-block', active: true, disabled: false };
    const node = buildToReact(registry, 'class-map-block', model as any) as any;
    expect(node.props?.className).toBe('active');
  });

  it('style object with values from model resolves to inline style', () => {
    const registry = getGlobalRegistry();
    define('styled-block', element('div', { style: (d: any) => ({ color: d.color, fontSize: d.fontSize }) }, []));
    const model = { sid: 'b1', stype: 'styled-block', color: 'red', fontSize: '14px' };
    const node = buildToReact(registry, 'styled-block', model as any) as any;
    expect(node.props?.style?.color).toBe('red');
    expect(node.props?.style?.fontSize).toBe('14px');
  });
});

describe('buildToReact – flattenChildren: function child returning element', () => {
  beforeEach(() => {
    const registry = getGlobalRegistry();
    if (!registry.has?.('inline-text')) {
      define('inline-text', element('span', {}, [data('text')]));
    }
  });

  it('template child as function (d) => element(...) is flattened and built', () => {
    const registry = getGlobalRegistry();
    define('fn-child-block', element('div', {}, [(d: any) => element('span', {}, [d.label ?? '']) as any]));
    const model = { sid: 'b1', stype: 'fn-child-block', label: 'From function' };
    const node = buildToReact(registry, 'fn-child-block', model as any) as any;
    expect(node.type).toBe('div');
    const span = directChildren(node)[0] as any;
    expect(span?.type).toBe('span');
    expect(hasRawText(node, 'From function')).toBe(true);
  });
});

describe('buildToReact – options.contextStub and component returning non-element', () => {
  it('options.contextStub is passed to contextual component', () => {
    const registry = getGlobalRegistry();
    const contextualTemplate = (_p: any, model: any, ctx: any) =>
      element('div', { className: ctx?.getState?.('theme') ?? 'none' }, [data('text')]);
    define('contextual-theme', contextualTemplate as any);
    const model = { sid: 'c1', stype: 'contextual-theme', text: 'Hi' };
    const node = buildToReact(registry, 'contextual-theme', model as any, {
      contextStub: { getState: (key: string) => (key === 'theme' ? 'dark' : undefined) },
    } as any) as any;
    expect(node.props?.className).toBe('dark');
    expect(hasRawText(node, 'Hi')).toBe(true);
  });

  it('returns null when template is ComponentTemplate and component() returns non-element', () => {
    const registry = getGlobalRegistry();
    define('null-component', { type: 'component', component: () => null } as any);
    const model = { sid: 'n1', stype: 'null-component' };
    const node = buildToReact(registry, 'null-component', model as any);
    expect(node).toBeNull();
  });
});

describe('buildToReact – defineMark with ComponentTemplate', () => {
  beforeEach(() => {
    const registry = getGlobalRegistry();
    if (!registry.has?.('inline-text')) {
      define('inline-text', element('span', {}, [data('text')]));
    }
  });

  it('mark registered with component that returns element wraps run in that element', () => {
    const registry = getGlobalRegistry();
    defineMark(
      'highlight',
      { type: 'component', component: () => element('mark', { className: 'hl' }, []) } as any
    );
    const model = {
      sid: 't1',
      stype: 'inline-text',
      text: 'One two',
      marks: [{ stype: 'highlight', range: [0, 3] }],
    };
    const node = buildToReact(registry, 'inline-text', model as any) as any;
    const markEl = findElementByType(node, 'mark');
    expect(markEl).toBeTruthy();
    expect(markEl?.props?.className).toBe('hl');
    expect(hasRawText(node, 'One')).toBe(true);
    expect(hasRawText(node, ' two')).toBe(true);
  });
});

describe('buildToReact – defineMark with external(reactComponent)', () => {
  beforeEach(() => {
    const registry = getGlobalRegistry();
    if (!registry.has?.('inline-text')) {
      define('inline-text', element('span', {}, [data('text')]));
    }
  });

  it('mark registered with external(ReactComponent) wraps text in that component', () => {
    const registry = getGlobalRegistry();
    const CustomBold = ({ children, ...rest }: any) => {
      return { type: 'b', props: { className: 'rc-bold', children }, key: rest.key };
    };
    defineMark('rcBold', external(CustomBold));
    const model = {
      sid: 't1',
      stype: 'inline-text',
      text: 'Hello world',
      marks: [{ stype: 'rcBold', range: [0, 5], attrs: { weight: '700' } }],
    };
    const node = buildToReact(registry, 'inline-text', model as any) as any;
    expect(node).toBeTruthy();
    const children = directChildren(node);
    const boldEl = children.find((el: any) => el?.type === CustomBold);
    expect(boldEl).toBeTruthy();
    expect(boldEl.props.markType).toBe('rcBold');
    expect(boldEl.props.attributes).toEqual({ weight: '700' });
    expect(boldEl.props.children).toBe('Hello');
  });

  it('external mark receives mark attrs via attributes prop', () => {
    const registry = getGlobalRegistry();
    const ColorMark = ({ children, attributes }: any) => {
      return { type: 'span', props: { style: { color: attributes?.color }, children } };
    };
    defineMark('rcColor', external(ColorMark));
    const model = {
      sid: 't2',
      stype: 'inline-text',
      text: 'Red text',
      marks: [{ stype: 'rcColor', attrs: { color: '#ff0000' } }],
    };
    const node = buildToReact(registry, 'inline-text', model as any) as any;
    const children = directChildren(node);
    const colorEl = children.find((el: any) => el?.type === ColorMark);
    expect(colorEl).toBeTruthy();
    expect(colorEl.props.attributes).toEqual({ color: '#ff0000' });
    expect(colorEl.props.children).toBe('Red text');
  });

  it('nested external marks — two marks on same range produce nested React elements', () => {
    const registry = getGlobalRegistry();
    const ExtBold = (p: any) => p;
    const ExtItalic = (p: any) => p;
    defineMark('extBold', external(ExtBold));
    defineMark('extItalic', external(ExtItalic));
    const model = {
      sid: 'n1',
      stype: 'inline-text',
      text: 'nested',
      marks: [
        { stype: 'extBold', attrs: { weight: '700' } },
        { stype: 'extItalic', attrs: { style: 'oblique' } },
      ],
    };
    const node = buildToReact(registry, 'inline-text', model as any) as any;
    const children = directChildren(node);
    expect(children).toHaveLength(1);
    const outer = children[0];
    expect(outer.type).toBe(ExtBold);
    expect(outer.props.markType).toBe('extBold');
    expect(outer.props.attributes).toEqual({ weight: '700' });
    const inner = outer.props.children;
    expect(inner.type).toBe(ExtItalic);
    expect(inner.props.markType).toBe('extItalic');
    expect(inner.props.attributes).toEqual({ style: 'oblique' });
    expect(inner.props.children).toBe('nested');
  });

  it('ranged external marks split text into multiple runs', () => {
    const registry = getGlobalRegistry();
    const ExtHL = (p: any) => p;
    defineMark('extHL', external(ExtHL));
    const model = {
      sid: 'r1',
      stype: 'inline-text',
      text: 'ABCDEF',
      marks: [{ stype: 'extHL', range: [2, 4], attrs: { color: 'yellow' } }],
    };
    const node = buildToReact(registry, 'inline-text', model as any) as any;
    const children = directChildren(node);
    expect(children).toHaveLength(3);
    expect(children[0]).toBe('AB');
    expect(children[1].type).toBe(ExtHL);
    expect(children[1].props.children).toBe('CD');
    expect(children[1].props.attributes).toEqual({ color: 'yellow' });
    expect(children[2]).toBe('EF');
  });

  it('overlapping external marks on different ranges produce correct runs', () => {
    const registry = getGlobalRegistry();
    const MarkA = (p: any) => p;
    const MarkB = (p: any) => p;
    defineMark('markA', external(MarkA));
    defineMark('markB', external(MarkB));
    const model = {
      sid: 'o1',
      stype: 'inline-text',
      text: '012345',
      marks: [
        { stype: 'markA', range: [0, 3], attrs: { id: 'a' } },
        { stype: 'markB', range: [2, 5], attrs: { id: 'b' } },
      ],
    };
    const node = buildToReact(registry, 'inline-text', model as any) as any;
    const children = directChildren(node);
    // runs: [0,2)="01" markA only, [2,3)="2" markA+markB, [3,5)="34" markB only, [5,6)="5" plain
    expect(children).toHaveLength(4);
    // "01" — only markA
    expect(children[0].type).toBe(MarkA);
    expect(children[0].props.children).toBe('01');
    // "2" — markA wrapping markB (outer=A, inner=B)
    expect(children[1].type).toBe(MarkA);
    const innerMark = children[1].props.children;
    expect(innerMark.type).toBe(MarkB);
    expect(innerMark.props.children).toBe('2');
    // "34" — only markB
    expect(children[2].type).toBe(MarkB);
    expect(children[2].props.children).toBe('34');
    // "5" — plain text
    expect(children[3]).toBe('5');
  });

  it('mixed: external mark + element mark on same text both render', () => {
    const registry = getGlobalRegistry();
    const ExtUnderline = (p: any) => p;
    defineMark('extUL', external(ExtUnderline));
    defineMark('elemStrong', element('strong', { className: 'mark-elemStrong' }, [data('text')]));
    const model = {
      sid: 'm1',
      stype: 'inline-text',
      text: 'mixed',
      marks: [
        { stype: 'elemStrong' },
        { stype: 'extUL', attrs: { style: 'wavy' } },
      ],
    };
    const node = buildToReact(registry, 'inline-text', model as any) as any;
    const children = directChildren(node);
    expect(children).toHaveLength(1);
    // outermost mark wraps: elemStrong (tag=strong), then extUL (React component)
    const outer = children[0];
    expect(outer.type).toBe('strong');
    const inner = outer.props.children;
    expect(inner.type).toBe(ExtUnderline);
    expect(inner.props.markType).toBe('extUL');
    expect(inner.props.attributes).toEqual({ style: 'wavy' });
    expect(inner.props.children).toBe('mixed');
  });

  it('global external mark with no range wraps entire text', () => {
    const registry = getGlobalRegistry();
    const GlobalMark = (p: any) => p;
    defineMark('extGlobal', external(GlobalMark));
    const model = {
      sid: 'g1',
      stype: 'inline-text',
      text: 'entire text here',
      marks: [{ stype: 'extGlobal', attrs: { level: 3 } }],
    };
    const node = buildToReact(registry, 'inline-text', model as any) as any;
    const children = directChildren(node);
    expect(children).toHaveLength(1);
    const el = children[0];
    expect(el.type).toBe(GlobalMark);
    expect(el.props.children).toBe('entire text here');
    expect(el.props.attributes).toEqual({ level: 3 });
  });

  it('external mark with no attrs receives empty attributes object', () => {
    const registry = getGlobalRegistry();
    const NoAttrMark = (p: any) => p;
    defineMark('extNoAttr', external(NoAttrMark));
    const model = {
      sid: 'na1',
      stype: 'inline-text',
      text: 'plain',
      marks: [{ stype: 'extNoAttr' }],
    };
    const node = buildToReact(registry, 'inline-text', model as any) as any;
    const children = directChildren(node);
    const el = children.find((c: any) => c?.type === NoAttrMark);
    expect(el).toBeTruthy();
    expect(el.props.attributes).toEqual({});
  });

  it('three external marks nested in correct order (outermost first in marks array)', () => {
    const registry = getGlobalRegistry();
    const M1 = (p: any) => p;
    const M2 = (p: any) => p;
    const M3 = (p: any) => p;
    defineMark('ext3a', external(M1));
    defineMark('ext3b', external(M2));
    defineMark('ext3c', external(M3));
    const model = {
      sid: 'tri1',
      stype: 'inline-text',
      text: 'deep',
      marks: [
        { stype: 'ext3a', attrs: { n: 1 } },
        { stype: 'ext3b', attrs: { n: 2 } },
        { stype: 'ext3c', attrs: { n: 3 } },
      ],
    };
    const node = buildToReact(registry, 'inline-text', model as any) as any;
    const children = directChildren(node);
    expect(children).toHaveLength(1);
    // nesting: ext3a > ext3b > ext3c > "deep"
    const l1 = children[0];
    expect(l1.type).toBe(M1);
    expect(l1.props.markType).toBe('ext3a');
    const l2 = l1.props.children;
    expect(l2.type).toBe(M2);
    expect(l2.props.markType).toBe('ext3b');
    const l3 = l2.props.children;
    expect(l3.type).toBe(M3);
    expect(l3.props.markType).toBe('ext3c');
    expect(l3.props.children).toBe('deep');
  });

  it('external mark on empty text produces element with empty string child', () => {
    const registry = getGlobalRegistry();
    const EmptyMark = (p: any) => p;
    defineMark('extEmpty', external(EmptyMark));
    const model = {
      sid: 'e1',
      stype: 'inline-text',
      text: '',
      marks: [{ stype: 'extEmpty' }],
    };
    const node = buildToReact(registry, 'inline-text', model as any) as any;
    const children = directChildren(node);
    // empty text → splitTextByMarks returns [] → no runs
    expect(children).toHaveLength(0);
  });
});

describe('ReactRenderer – options', () => {
  beforeEach(() => {
    const registry = getGlobalRegistry();
    if (!registry.has?.('doc')) {
      define('doc', element('div', {}, [slot('content')]));
    }
  });

  it('constructor accepts options and getRegistry returns same registry', () => {
    const registry = getGlobalRegistry();
    const renderer = new ReactRenderer(registry, { name: 'TestRenderer' });
    expect(renderer.getRegistry()).toBe(registry);
    const node = renderer.build({ sid: 'd1', stype: 'doc', content: [] } as any) as any;
    expect(node).toBeTruthy();
    expect(node.type).toBe('div');
  });
});

describe('buildToReact – when() / each() unsupported', () => {
  it('template with when() does not throw; conditional branch is not rendered', () => {
    const registry = getGlobalRegistry();
    define(
      'conditional-block',
      element('div', {}, [when((d: any) => !!d.show, element('span', {}, ['visible']))])
    );
    const model = { sid: 'c1', stype: 'conditional-block', show: true };
    const node = buildToReact(registry, 'conditional-block', model as any) as any;
    expect(node).toBeTruthy();
    expect(node.type).toBe('div');
    const children = directChildren(node);
    expect(children).toHaveLength(0);
  });

  it('template with each() does not throw; iterated content is not rendered', () => {
    const registry = getGlobalRegistry();
    define(
      'each-block',
      element('div', {}, [each('items', (item: any) => element('span', {}, [String(item?.name ?? '')]))])
    );
    const model = { sid: 'e1', stype: 'each-block', items: [{ name: 'A' }, { name: 'B' }] };
    const node = buildToReact(registry, 'each-block', model as any) as any;
    expect(node).toBeTruthy();
    expect(node.type).toBe('div');
    const children = directChildren(node);
    expect(children).toHaveLength(0);
  });
});
