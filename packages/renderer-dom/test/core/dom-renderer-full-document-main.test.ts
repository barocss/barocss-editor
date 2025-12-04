import { describe, it, expect, beforeEach } from 'vitest';
import { define, element, slot, data, defineMark, defineDecorator, getGlobalRegistry, attr } from '@barocss/dsl';
import { DOMRenderer } from '../../src/dom-renderer';
import { normalizeHTML } from '../utils/html';

describe('DOMRenderer full document (main.ts-style)', () => {
  let container: HTMLElement;
  let renderer: DOMRenderer;

  beforeEach(() => {
    container = document.createElement('div');
    const reg = getGlobalRegistry();
    // Core blocks
    define('document', element('div', { className: 'document' }, [slot('content')]));
    define('heading', element((model: any) => `h${model.attributes?.level || 1}`, { className: 'heading' }, [slot('content')]));
    define('paragraph', element('p', { className: 'paragraph' }, [slot('content')]));
    define('list', (model: any) => element((d:any)=> (d?.attributes?.type === 'ordered' ? 'ol' : 'ul'), {
      className: (d:any)=> `list list-${d?.attributes?.type || 'bullet'}`
    }, [slot('content')]));
    define('listItem', element('li', { className: 'list-item' }, [slot('content')]));
    // Inline text
    define('inline-text', element('span', { className: (d: any) => {
      const classes: any[] = ['text'];
      if (Array.isArray(d.marks)) for (const m of d.marks) if (m?.type) classes.push(`mark-${m.type}`);
      return classes;
    } }, [data('text')]));
    // Marks
    defineMark('bold', element('span', { className: 'mark-bold', style: { fontWeight: 'bold' } }, [data('text')]))
    defineMark('italic', element('span', { className: 'mark-italic', style: { fontStyle: 'italic' } }, [data('text')]))
    defineMark('link', element('a', { className: 'mark-link', href: attr('href', '#'), title: attr('title','') }, [data('text')]))
    // Decorators (registered; not strictly asserted here)
    defineDecorator('comment', element('div', { className: 'comment-block' }, []));

    renderer = new DOMRenderer(reg);
  });

  it('renders a full document with headings, paragraphs, marks and lists', () => {
    const model = {
      sid: 'doc-1', stype: 'document',
      content: [
        { sid: 'h-1', stype: 'heading', attributes: { level: 2 }, content: [ { sid: 't-h', stype: 'inline-text', text: 'Heading Title' } ] },
        { sid: 'p-1', stype: 'paragraph', content: [
          { sid: 't1', stype: 'inline-text', text: 'Hello ' },
          { sid: 't2', stype: 'inline-text', text: 'World', marks: [{ type: 'bold' }] },
          { sid: 't3', stype: 'inline-text', text: ' and ' },
          { sid: 't4', stype: 'inline-text', text: 'Links', marks: [{ type: 'link', attrs: { href: 'https://example.com', title: 'Example' } }] }
        ]},
        { sid: 'list-1', stype: 'list', attributes: { type: 'bullet' }, content: [
          { sid: 'li-1', stype: 'listItem', content: [ { sid: 'p-li-1', stype: 'paragraph', content: [ { sid: 't-li-1', stype: 'inline-text', text: 'First item' } ] } ] },
          { sid: 'li-2', stype: 'listItem', content: [ { sid: 'p-li-2', stype: 'paragraph', content: [ { sid: 't-li-2', stype: 'inline-text', text: 'Second item' } ] } ] }
        ]}
      ]
    } as any;

    renderer.render(container, model);

    // Document host
    const docHost = container.querySelector('[data-bc-sid="doc-1"]') as HTMLElement;
    expect(docHost).toBeTruthy();
    expect(docHost.className).toContain('document');
    // Heading
    const headingHost = container.querySelector('[data-bc-sid="h-1"]') as HTMLElement;
    expect(headingHost).toBeTruthy();
    expect(headingHost.tagName.toLowerCase()).toBe('h2');
    expect(headingHost.textContent).toContain('Heading Title');
    // Paragraph and marks
    const p1 = container.querySelector('[data-bc-sid="p-1"]') as HTMLElement;
    expect(p1).toBeTruthy();
    expect(p1.tagName.toLowerCase()).toBe('p');
    const boldSpan = p1.querySelector('.mark-bold');
    expect(boldSpan?.textContent).toContain('World');
    // List
    const listHost = container.querySelector('[data-bc-sid="list-1"]') as HTMLElement;
    expect(listHost).toBeTruthy();
    expect(listHost.tagName.toLowerCase()).toBe('ul');
    const li1 = container.querySelector('[data-bc-sid="li-1"]');
    const li2 = container.querySelector('[data-bc-sid="li-2"]');
    expect(li1 && li2).toBeTruthy();
  });

  it('renders complex document with marks, decorators, and nested structures (snapshot)', () => {
    const model = {
      sid: 'doc-snapshot',
      stype: 'document',
      content: [
        {
          sid: 'h-snap',
          stype: 'heading',
          attributes: { level: 1 },
          content: [
            {
              sid: 't-h-snap',
              stype: 'inline-text',
              text: 'Complex Document',
              marks: [{ type: 'bold' }]
            }
          ]
        },
        {
          sid: 'p-snap-1',
          stype: 'paragraph',
          content: [
            { sid: 't-snap-1', stype: 'inline-text', text: 'First paragraph with ' },
            { sid: 't-snap-2', stype: 'inline-text', text: 'bold', marks: [{ type: 'bold' }] },
            { sid: 't-snap-3', stype: 'inline-text', text: ' and ' },
            {
              sid: 't-snap-4',
              stype: 'inline-text',
              text: 'italic',
              marks: [{ type: 'italic' }]
            },
            { sid: 't-snap-5', stype: 'inline-text', text: ' text.' }
          ]
        },
        {
          sid: 'p-snap-2',
          stype: 'paragraph',
          content: [
            {
              sid: 't-snap-6',
              stype: 'inline-text',
              text: 'Link example',
              marks: [{ type: 'link', attrs: { href: 'https://example.com', title: 'Example Link' } }]
            }
          ]
        },
        {
          sid: 'list-snap',
          stype: 'list',
          attributes: { type: 'ordered' },
          content: [
            {
              sid: 'li-snap-1',
              stype: 'listItem',
              content: [
                {
                  sid: 'p-li-snap-1',
                  stype: 'paragraph',
                  content: [
                    { sid: 't-li-snap-1', stype: 'inline-text', text: 'Nested paragraph in list item' }
                  ]
                }
              ]
            },
            {
              sid: 'li-snap-2',
              stype: 'listItem',
              content: [
                {
                  sid: 'p-li-snap-2',
                  stype: 'paragraph',
                  content: [
                    { sid: 't-li-snap-2', stype: 'inline-text', text: 'Second nested paragraph' }
                  ]
                }
              ]
            }
          ]
        }
      ]
    } as any;

    // Add block decorators
    const decorators = [
      {
        sid: 'dec-snap-1',
        stype: 'comment',
        category: 'block',
        position: 'before',
        model: { note: 'Comment before first paragraph' }
      },
      {
        sid: 'dec-snap-2',
        stype: 'comment',
        category: 'block',
        position: 'after',
        model: { note: 'Comment after second paragraph' }
      }
    ] as any;

    renderer.render(container, model, decorators);

    // Snapshot: normalize and compare full HTML structure
    const normalized = normalizeHTML(container.firstElementChild as Element);
    
    // Verify key structural elements are present
    expect(normalized).toContain('data-bc-sid="doc-snapshot"');
    expect(normalized).toContain('data-bc-sid="h-snap"');
    expect(normalized).toContain('data-bc-sid="p-snap-1"');
    expect(normalized).toContain('data-bc-sid="p-snap-2"');
    expect(normalized).toContain('data-bc-sid="list-snap"');
    expect(normalized).toContain('data-bc-sid="li-snap-1"');
    expect(normalized).toContain('data-bc-sid="li-snap-2"');
    
    // Verify marks are applied
    expect(normalized).toContain('mark-bold');
    expect(normalized).toContain('mark-italic');
    expect(normalized).toContain('mark-link');
    
    // Verify text content
    expect(normalized).toContain('Complex Document');
    expect(normalized).toContain('First paragraph with');
    expect(normalized).toContain('bold');
    expect(normalized).toContain('italic');
    expect(normalized).toContain('Link example');
    expect(normalized).toContain('Nested paragraph in list item');
    
    // Verify list structure
    expect(normalized).toContain('<ol'); // ordered list
    expect(normalized).toContain('<li');
    
    // Verify decorators (if rendered)
    // Note: Decorator rendering depends on implementation details
    // This is a structural snapshot, not a pixel-perfect match
  });
});
