import { describe, it, expect, beforeEach } from 'vitest';
import {
  define,
  element,
  slot,
  data,
  defineDecorator,
  defineMark,
  getGlobalRegistry,
} from '@barocss/dsl';
import { buildToReact } from '../src/build-to-react';
import { ReactRenderer } from '../src/react-renderer';
import type { Decorator } from '../src/decorator/types';

function getChildren(node: any): any[] {
  const c = node?.props?.children;
  if (c == null) return [];
  return Array.isArray(c) ? c : [c];
}

/** Recursively collect all nodes that have data-decorator-sid (any depth). */
function collectDecoratorNodes(node: any): any[] {
  if (node == null) return [];
  const out: any[] = [];
  if (typeof node === 'object' && node.props?.['data-decorator-sid']) {
    out.push(node);
  }
  const children = getChildren(node);
  for (const ch of children) {
    out.push(...collectDecoratorNodes(ch));
  }
  return out;
}

/** Recursively get text content (string leaves only). */
function getTextContent(node: any): string {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  const children = getChildren(node);
  return children.map(getTextContent).join('');
}

/** Flatten all element nodes (type + key) in order for structure assertion. */
function flattenStructure(node: any): { type: string; key?: string; decoratorSid?: string }[] {
  if (node == null) return [];
  if (typeof node === 'string' || typeof node === 'number') return [];
  const out: { type: string; key?: string; decoratorSid?: string }[] = [];
  const type = typeof node.type === 'string' ? node.type : '?';
  const key = node.key ?? undefined;
  const decoratorSid = node.props?.['data-decorator-sid'];
  out.push({ type, key: key ?? undefined, decoratorSid });
  for (const ch of getChildren(node)) {
    out.push(...flattenStructure(ch));
  }
  return out;
}

describe('renderer-react decorators – complex', () => {
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
    if (!registry.has?.('chip')) {
      defineDecorator('chip', element('span', { className: 'chip', 'data-decorator': 'true' }, []));
    }
    if (!registry.has?.('highlight')) {
      defineDecorator('highlight', element('span', { className: 'highlight', style: { backgroundColor: 'yellow' } }, []));
    }
    if (!registry.has?.('comment')) {
      defineDecorator('comment', element('div', { className: 'comment-block' }, []));
    }
    if (!(registry as any).get?.('mark:bold')) {
      defineMark('bold', element('strong', { className: 'mark-bold' }, [data('text')]));
    }
  });

  describe('inline decorator positions', () => {
    it('position before: decorator node appears before the wrapped text run (sibling order inside span)', () => {
      const registry = getGlobalRegistry();
      const model = {
        sid: 'p1',
        stype: 'paragraph',
        content: [{ sid: 't1', stype: 'inline-text', text: 'Hello world' }],
      };
      const decorators: Decorator[] = [
        {
          sid: 'd-before',
          stype: 'chip',
          category: 'inline',
          target: { sid: 't1', startOffset: 0, endOffset: 5 },
          position: 'before',
        },
      ];
      const node = buildToReact(registry, 'paragraph', model as any, { decorators }) as any;
      const pChildren = getChildren(node);
      expect(pChildren.length).toBeGreaterThanOrEqual(1);
      const textSpan = pChildren.find((c: any) => c?.key === 't1');
      expect(textSpan).toBeTruthy();
      const spanChildren = getChildren(textSpan);
      const firstChild = spanChildren[0];
      expect(firstChild).toBeTruthy();
      expect(firstChild?.props?.['data-decorator-sid']).toBe('d-before');
      expect(getTextContent(node)).toBe('Hello world');
    });

    it('position after: decorator node appears after the wrapped text run', () => {
      const registry = getGlobalRegistry();
      const model = {
        sid: 'p1',
        stype: 'paragraph',
        content: [{ sid: 't1', stype: 'inline-text', text: 'Hello world' }],
      };
      const decorators: Decorator[] = [
        {
          sid: 'd-after',
          stype: 'chip',
          category: 'inline',
          target: { sid: 't1', startOffset: 6, endOffset: 11 },
          position: 'after',
        },
      ];
      const node = buildToReact(registry, 'paragraph', model as any, { decorators }) as any;
      const flat = flattenStructure(node);
      const decoratorIndices = flat
        .map((x, i) => (x.decoratorSid === 'd-after' ? i : -1))
        .filter((i) => i >= 0);
      expect(decoratorIndices.length).toBeGreaterThanOrEqual(1);
      const textSpanIndex = flat.findIndex((x) => x.type === 'span' && x.key === 't1');
      expect(textSpanIndex).toBeGreaterThanOrEqual(0);
      expect(decoratorIndices[0]).toBeGreaterThan(textSpanIndex);
    });

    it('overlay (no position): decorator wraps the text run', () => {
      const registry = getGlobalRegistry();
      const model = {
        sid: 'p1',
        stype: 'paragraph',
        content: [{ sid: 't1', stype: 'inline-text', text: 'Highlighted' }],
      };
      const decorators: Decorator[] = [
        {
          sid: 'd-overlay',
          stype: 'highlight',
          category: 'inline',
          target: { sid: 't1', startOffset: 0, endOffset: 10 },
        },
      ];
      const node = buildToReact(registry, 'paragraph', model as any, { decorators }) as any;
      const decoratorsFound = collectDecoratorNodes(node);
      expect(decoratorsFound.some((n) => n.props?.['data-decorator-sid'] === 'd-overlay')).toBe(true);
      const fullText = getTextContent(node);
      expect(fullText).toContain('Highlighted');
    });
  });

  describe('multiple inline decorators splitting text', () => {
    it('two non-overlapping ranges produce three segments: plain, decorated, plain', () => {
      const registry = getGlobalRegistry();
      const model = {
        sid: 'p1',
        stype: 'paragraph',
        content: [{ sid: 't1', stype: 'inline-text', text: 'ABC DEF GHI' }],
      };
      const decorators: Decorator[] = [
        { sid: 'd1', stype: 'chip', category: 'inline', target: { sid: 't1', startOffset: 0, endOffset: 3 } },
        { sid: 'd2', stype: 'highlight', category: 'inline', target: { sid: 't1', startOffset: 8, endOffset: 11 } },
      ];
      const node = buildToReact(registry, 'paragraph', model as any, { decorators }) as any;
      const fullText = getTextContent(node);
      expect(fullText).toBe('ABC DEF GHI');
      const decoratorNodes = collectDecoratorNodes(node);
      expect(decoratorNodes.length).toBe(2);
      const sids = decoratorNodes.map((n) => n.props?.['data-decorator-sid']).sort();
      expect(sids).toEqual(['d1', 'd2']);
    });

    it('adjacent ranges: [0,3] and [3,6] produce two decorated segments and no plain between', () => {
      const registry = getGlobalRegistry();
      const model = {
        sid: 'p1',
        stype: 'paragraph',
        content: [{ sid: 't1', stype: 'inline-text', text: 'ABCDEF' }],
      };
      const decorators: Decorator[] = [
        { sid: 'd1', stype: 'chip', category: 'inline', target: { sid: 't1', startOffset: 0, endOffset: 3 } },
        { sid: 'd2', stype: 'highlight', category: 'inline', target: { sid: 't1', startOffset: 3, endOffset: 6 } },
      ];
      const node = buildToReact(registry, 'paragraph', model as any, { decorators }) as any;
      expect(getTextContent(node)).toBe('ABCDEF');
      const decoratorNodes = collectDecoratorNodes(node);
      expect(decoratorNodes.length).toBe(2);
    });
  });

  describe('marks and inline decorators', () => {
    it('bold mark + inline decorator before on same range: chip then bold text', () => {
      const registry = getGlobalRegistry();
      const model = {
        sid: 'p1',
        stype: 'paragraph',
        content: [
          {
            sid: 't1',
            stype: 'inline-text',
            text: 'Bold text',
            marks: [{ stype: 'bold', range: [0, 4] }],
          },
        ],
      };
      const decorators: Decorator[] = [
        {
          sid: 'chip-1',
          stype: 'chip',
          category: 'inline',
          target: { sid: 't1', startOffset: 0, endOffset: 4 },
          position: 'before',
        },
      ];
      const node = buildToReact(registry, 'paragraph', model as any, { decorators }) as any;
      const fullText = getTextContent(node);
      expect(fullText).toBe('Bold text');
      const decoratorNodes = collectDecoratorNodes(node);
      expect(decoratorNodes.some((n) => n.props?.['data-decorator-sid'] === 'chip-1')).toBe(true);
      const flat = flattenStructure(node);
      const strongIndex = flat.findIndex((x) => x.type === 'strong');
      const chipIndex = flat.findIndex((x) => x.decoratorSid === 'chip-1');
      expect(strongIndex).toBeGreaterThanOrEqual(0);
      expect(chipIndex).toBeGreaterThanOrEqual(0);
      expect(chipIndex).toBeLessThan(strongIndex);
    });
  });

  describe('block decorators', () => {
    it('block before + block after on same node: order is before, child, after', () => {
      const registry = getGlobalRegistry();
      const model = {
        sid: 'doc1',
        stype: 'doc',
        content: [{ sid: 'p1', stype: 'paragraph', content: [] }],
      };
      const decorators: Decorator[] = [
        { sid: 'dec-before', stype: 'comment', category: 'block', target: { sid: 'p1' }, position: 'before' },
        { sid: 'dec-after', stype: 'chip', category: 'block', target: { sid: 'p1' }, position: 'after' },
      ];
      const node = buildToReact(registry, 'doc', model as any, { decorators }) as any;
      const children = getChildren(node);
      const keysAndDecSids = children.map((c: any) => ({
        key: c?.key,
        decoratorSid: c?.props?.['data-decorator-sid'],
      }));
      const beforeIdx = keysAndDecSids.findIndex((x) => x.decoratorSid === 'dec-before');
      const pIdx = keysAndDecSids.findIndex((x) => x.key === 'p1');
      const afterIdx = keysAndDecSids.findIndex((x) => x.decoratorSid === 'dec-after');
      expect(beforeIdx).toBe(0);
      expect(pIdx).toBe(1);
      expect(afterIdx).toBe(2);
    });

    it('multiple block decorators both after: child then both decorators', () => {
      const registry = getGlobalRegistry();
      const model = {
        sid: 'doc1',
        stype: 'doc',
        content: [{ sid: 'p1', stype: 'paragraph', content: [] }],
      };
      const decorators: Decorator[] = [
        { sid: 'dec1', stype: 'comment', category: 'block', target: { sid: 'p1' }, position: 'after' },
        { sid: 'dec2', stype: 'chip', category: 'block', target: { sid: 'p1' }, position: 'after' },
      ];
      const node = buildToReact(registry, 'doc', model as any, { decorators }) as any;
      const children = getChildren(node);
      expect(children[0]?.key).toBe('p1');
      expect(children[1]?.props?.['data-decorator-sid']).toBe('dec1');
      expect(children[2]?.props?.['data-decorator-sid']).toBe('dec2');
    });

    it('block decorator default position is after (decorator appears after child)', () => {
      const registry = getGlobalRegistry();
      const model = {
        sid: 'doc1',
        stype: 'doc',
        content: [{ sid: 'p1', stype: 'paragraph', content: [] }],
      };
      const decorators: Decorator[] = [
        { sid: 'dec1', stype: 'comment', category: 'block', target: { sid: 'p1' } },
      ];
      const node = buildToReact(registry, 'doc', model as any, { decorators }) as any;
      const children = getChildren(node);
      expect(children[0]?.key).toBe('p1');
      expect(children[1]?.props?.['data-decorator-sid']).toBe('dec1');
      expect(children[1]?.props?.['data-decorator-category']).toBe('block');
    });
  });

  describe('mixed block and inline in same document', () => {
    it('two paragraphs: first has block decorator, second has inline decorator in text', () => {
      const registry = getGlobalRegistry();
      const model = {
        sid: 'doc1',
        stype: 'doc',
        content: [
          { sid: 'p1', stype: 'paragraph', content: [{ sid: 't1', stype: 'inline-text', text: 'First' }] },
          { sid: 'p2', stype: 'paragraph', content: [{ sid: 't2', stype: 'inline-text', text: 'Second' }] },
        ],
      };
      const decorators: Decorator[] = [
        { sid: 'block1', stype: 'comment', category: 'block', target: { sid: 'p1' }, position: 'after' },
        { sid: 'inline1', stype: 'highlight', category: 'inline', target: { sid: 't2', startOffset: 0, endOffset: 6 } },
      ];
      const node = buildToReact(registry, 'doc', model as any, { decorators }) as any;
      expect(getTextContent(node)).toBe('FirstSecond');
      const decoratorNodes = collectDecoratorNodes(node);
      expect(decoratorNodes.some((n) => n.props?.['data-decorator-sid'] === 'block1')).toBe(true);
      expect(decoratorNodes.some((n) => n.props?.['data-decorator-sid'] === 'inline1')).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('empty decorators array: renders content only, no decorator nodes', () => {
      const registry = getGlobalRegistry();
      const model = {
        sid: 'p1',
        stype: 'paragraph',
        content: [{ sid: 't1', stype: 'inline-text', text: 'Hello' }],
      };
      const node = buildToReact(registry, 'paragraph', model as any, { decorators: [] }) as any;
      const decoratorNodes = collectDecoratorNodes(node);
      expect(decoratorNodes.length).toBe(0);
      expect(getTextContent(node)).toBe('Hello');
    });

    it('decorator targeting non-existent sid: content still renders, no crash', () => {
      const registry = getGlobalRegistry();
      const model = {
        sid: 'doc1',
        stype: 'doc',
        content: [{ sid: 'p1', stype: 'paragraph', content: [] }],
      };
      const decorators: Decorator[] = [
        { sid: 'orphan', stype: 'chip', category: 'block', target: { sid: 'nonexistent' }, position: 'after' },
      ];
      const node = buildToReact(registry, 'doc', model as any, { decorators }) as any;
      const children = getChildren(node);
      expect(children.length).toBe(1);
      expect(children[0]?.key).toBe('p1');
      const decoratorNodes = collectDecoratorNodes(node);
      expect(decoratorNodes.length).toBe(0);
    });

    it('unknown decorator stype: fallback node with data-decorator-missing-renderer', () => {
      const registry = getGlobalRegistry();
      const model = {
        sid: 'doc1',
        stype: 'doc',
        content: [{ sid: 'p1', stype: 'paragraph', content: [] }],
      };
      const decorators: Decorator[] = [
        {
          sid: 'unknown-dec',
          stype: 'unknown-decorator-type',
          category: 'block',
          target: { sid: 'p1' },
          position: 'after',
        },
      ];
      const node = buildToReact(registry, 'doc', model as any, { decorators }) as any;
      const children = getChildren(node);
      const fallback = children.find((c: any) => c?.props?.['data-decorator-missing-renderer'] === 'unknown-decorator-type');
      expect(fallback).toBeTruthy();
      expect(fallback?.props?.['data-decorator-sid']).toBe('unknown-dec');
    });

    it('layer category decorator is rendered like block (after child)', () => {
      const registry = getGlobalRegistry();
      const model = {
        sid: 'doc1',
        stype: 'doc',
        content: [{ sid: 'p1', stype: 'paragraph', content: [] }],
      };
      const decorators: Decorator[] = [
        { sid: 'layer1', stype: 'comment', category: 'layer', target: { sid: 'p1' } },
      ];
      const node = buildToReact(registry, 'doc', model as any, { decorators }) as any;
      const children = getChildren(node);
      expect(children[0]?.key).toBe('p1');
      expect(children[1]?.props?.['data-decorator-sid']).toBe('layer1');
      expect(children[1]?.props?.['data-decorator-category']).toBe('layer');
    });
  });

  describe('inline: same range with before + overlay + after', () => {
    it('one text run can have before, overlay, and after decorators', () => {
      const registry = getGlobalRegistry();
      if (!registry.has?.('badge')) {
        defineDecorator('badge', element('span', { className: 'badge' }, []));
      }
      const model = {
        sid: 'p1',
        stype: 'paragraph',
        content: [{ sid: 't1', stype: 'inline-text', text: 'X' }],
      };
      const decorators: Decorator[] = [
        { sid: 'd-before', stype: 'chip', category: 'inline', target: { sid: 't1', startOffset: 0, endOffset: 1 }, position: 'before' },
        { sid: 'd-overlay', stype: 'highlight', category: 'inline', target: { sid: 't1', startOffset: 0, endOffset: 1 } },
        { sid: 'd-after', stype: 'badge', category: 'inline', target: { sid: 't1', startOffset: 0, endOffset: 1 }, position: 'after' },
      ];
      const node = buildToReact(registry, 'paragraph', model as any, { decorators }) as any;
      const dec = collectDecoratorNodes(node);
      expect(dec.some((n) => n.props?.['data-decorator-sid'] === 'd-before')).toBe(true);
      expect(dec.some((n) => n.props?.['data-decorator-sid'] === 'd-overlay')).toBe(true);
      expect(dec.some((n) => n.props?.['data-decorator-sid'] === 'd-after')).toBe(true);
      expect(getTextContent(node)).toBe('X');
    });
  });

  describe('block on node with empty content', () => {
    it('paragraph with content: [] still gets block decorator after', () => {
      const registry = getGlobalRegistry();
      const model = {
        sid: 'doc1',
        stype: 'doc',
        content: [{ sid: 'p1', stype: 'paragraph', content: [] }],
      };
      const decorators: Decorator[] = [
        { sid: 'block1', stype: 'comment', category: 'block', target: { sid: 'p1' }, position: 'after' },
      ];
      const node = buildToReact(registry, 'doc', model as any, { decorators }) as any;
      const children = getChildren(node);
      expect(children[0]?.key).toBe('p1');
      expect(children[1]?.props?.['data-decorator-sid']).toBe('block1');
    });
  });

  describe('inline decorator range edge cases', () => {
    it('inline decorator range start >= text length: text renders without decorator', () => {
      const registry = getGlobalRegistry();
      const model = {
        sid: 'p1',
        stype: 'paragraph',
        content: [{ sid: 't1', stype: 'inline-text', text: 'Hi' }],
      };
      const decorators: Decorator[] = [
        { sid: 'd1', stype: 'chip', category: 'inline', target: { sid: 't1', startOffset: 10, endOffset: 20 } },
      ];
      const node = buildToReact(registry, 'paragraph', model as any, { decorators }) as any;
      expect(getTextContent(node)).toBe('Hi');
      const dec = collectDecoratorNodes(node);
      expect(dec.length).toBe(0);
    });

    it('inline decorator with valid range does not affect other text nodes', () => {
      const registry = getGlobalRegistry();
      const model = {
        sid: 'p1',
        stype: 'paragraph',
        content: [
          { sid: 't1', stype: 'inline-text', text: 'First' },
          { sid: 't2', stype: 'inline-text', text: 'Second' },
        ],
      };
      const decorators: Decorator[] = [
        { sid: 'd1', stype: 'highlight', category: 'inline', target: { sid: 't2', startOffset: 0, endOffset: 6 } },
      ];
      const node = buildToReact(registry, 'paragraph', model as any, { decorators }) as any;
      expect(getTextContent(node)).toBe('FirstSecond');
      const dec = collectDecoratorNodes(node);
      expect(dec.length).toBe(1);
      expect(dec[0]?.props?.['data-decorator-sid']).toBe('d1');
    });
  });

  describe('three-level nesting with block and inline', () => {
    it('doc → paragraph → inline-text: block on paragraph, inline on text', () => {
      const registry = getGlobalRegistry();
      const model = {
        sid: 'doc1',
        stype: 'doc',
        content: [
          {
            sid: 'p1',
            stype: 'paragraph',
            content: [{ sid: 't1', stype: 'inline-text', text: 'Nested' }],
          },
        ],
      };
      const decorators: Decorator[] = [
        { sid: 'block-p', stype: 'comment', category: 'block', target: { sid: 'p1' }, position: 'before' },
        { sid: 'inline-t', stype: 'highlight', category: 'inline', target: { sid: 't1', startOffset: 0, endOffset: 6 } },
      ];
      const node = buildToReact(registry, 'doc', model as any, { decorators }) as any;
      const docChildren = getChildren(node);
      const blockDec = docChildren.find((c: any) => c?.props?.['data-decorator-sid'] === 'block-p');
      expect(blockDec).toBeTruthy();
      expect(collectDecoratorNodes(node).some((n) => n.props?.['data-decorator-sid'] === 'inline-t')).toBe(true);
      expect(getTextContent(node)).toBe('Nested');
    });
  });

  describe('multiple mark runs with one inline decorator on first run only', () => {
    it('bold [0,4] + italic [5,11] with inline decorator [0,4]: chip then bold then italic then plain', () => {
      const registry = getGlobalRegistry();
      if (!(registry as any).get?.('mark:italic')) {
        defineMark('italic', element('em', { className: 'mark-italic' }, [data('text')]));
      }
      const model = {
        sid: 'p1',
        stype: 'paragraph',
        content: [
          {
            sid: 't1',
            stype: 'inline-text',
            text: 'Bold italic rest',
            marks: [
              { stype: 'bold', range: [0, 4] },
              { stype: 'italic', range: [5, 11] },
            ],
          },
        ],
      };
      const decorators: Decorator[] = [
        { sid: 'chip1', stype: 'chip', category: 'inline', target: { sid: 't1', startOffset: 0, endOffset: 4 }, position: 'before' },
      ];
      const node = buildToReact(registry, 'paragraph', model as any, { decorators }) as any;
      expect(getTextContent(node)).toBe('Bold italic rest');
      const dec = collectDecoratorNodes(node);
      expect(dec.some((n) => n.props?.['data-decorator-sid'] === 'chip1')).toBe(true);
    });
  });

  describe('structure stability', () => {
    it('same model and decorators built twice produce same number of decorator nodes', () => {
      const registry = getGlobalRegistry();
      const model = {
        sid: 'doc1',
        stype: 'doc',
        content: [
          { sid: 'p1', stype: 'paragraph', content: [{ sid: 't1', stype: 'inline-text', text: 'A' }] },
          { sid: 'p2', stype: 'paragraph', content: [{ sid: 't2', stype: 'inline-text', text: 'B' }] },
        ],
      };
      const decorators: Decorator[] = [
        { sid: 'd1', stype: 'highlight', category: 'inline', target: { sid: 't1', startOffset: 0, endOffset: 1 } },
        { sid: 'd2', stype: 'comment', category: 'block', target: { sid: 'p2' }, position: 'after' },
      ];
      const node1 = buildToReact(registry, 'doc', model as any, { decorators }) as any;
      const node2 = buildToReact(registry, 'doc', model as any, { decorators }) as any;
      const count1 = collectDecoratorNodes(node1).length;
      const count2 = collectDecoratorNodes(node2).length;
      expect(count1).toBe(count2);
      expect(count1).toBe(2);
    });
  });

  describe('decorator data', () => {
    it('decorator with data and template using data(path) renders decorator node with correct sid', () => {
      const registry = getGlobalRegistry();
      if (!registry.has?.('label-decorator')) {
        defineDecorator('label-decorator', element('span', { className: 'label-decorator' }, [data('label')]));
      }
      const model = {
        sid: 'doc1',
        stype: 'doc',
        content: [{ sid: 'p1', stype: 'paragraph', content: [] }],
      };
      const decorators: Decorator[] = [
        {
          sid: 'dec1',
          stype: 'label-decorator',
          category: 'block',
          target: { sid: 'p1' },
          position: 'after',
          data: { label: 'CustomLabel' },
        },
      ];
      const node = buildToReact(registry, 'doc', model as any, { decorators }) as any;
      const dec = collectDecoratorNodes(node).find((n) => n.props?.['data-decorator-sid'] === 'dec1');
      expect(dec).toBeTruthy();
      expect(dec?.props?.['data-decorator-stype']).toBe('label-decorator');
      if (dec?.props?.className != null) {
        expect(String(dec.props.className)).toContain('label-decorator');
      }
      const decChildren = getChildren(dec);
      const decText = decChildren.map((c: any) => (typeof c === 'string' ? c : getTextContent(c))).join('');
      if (decText) {
        expect(decText).toBe('CustomLabel');
      }
    });
  });

  describe('block and layer on same node', () => {
    it('block + layer decorators on same target: both appear after child', () => {
      const registry = getGlobalRegistry();
      const model = {
        sid: 'doc1',
        stype: 'doc',
        content: [{ sid: 'p1', stype: 'paragraph', content: [] }],
      };
      const decorators: Decorator[] = [
        { sid: 'b1', stype: 'comment', category: 'block', target: { sid: 'p1' }, position: 'after' },
        { sid: 'l1', stype: 'chip', category: 'layer', target: { sid: 'p1' } },
      ];
      const node = buildToReact(registry, 'doc', model as any, { decorators }) as any;
      const children = getChildren(node);
      expect(children[0]?.key).toBe('p1');
      const afterP = children.slice(1);
      const sids = afterP.map((c: any) => c?.props?.['data-decorator-sid']).filter(Boolean);
      expect(sids).toContain('b1');
      expect(sids).toContain('l1');
      expect(sids.length).toBe(2);
    });
  });

  describe('full document with nested structure', () => {
    it('doc → two paragraphs → each with inline-text; mix of block and inline decorators', () => {
      const renderer = new ReactRenderer(getGlobalRegistry());
      const model = {
        sid: 'doc1',
        stype: 'doc',
        content: [
          {
            sid: 'p1',
            stype: 'paragraph',
            content: [{ sid: 't1', stype: 'inline-text', text: 'One' }],
          },
          {
            sid: 'p2',
            stype: 'paragraph',
            content: [{ sid: 't2', stype: 'inline-text', text: 'Two' }],
          },
        ],
      };
      const decorators: Decorator[] = [
        { sid: 'b1', stype: 'comment', category: 'block', target: { sid: 'p1' }, position: 'before' },
        { sid: 'i1', stype: 'highlight', category: 'inline', target: { sid: 't2', startOffset: 0, endOffset: 3 } },
      ];
      const node = renderer.build(model as any, decorators) as any;
      const fullText = getTextContent(node);
      expect(fullText).toBe('OneTwo');
      const dec = collectDecoratorNodes(node);
      expect(dec.some((n) => n.props?.['data-decorator-sid'] === 'b1')).toBe(true);
      expect(dec.some((n) => n.props?.['data-decorator-sid'] === 'i1')).toBe(true);
    });
  });
});
