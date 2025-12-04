/**
 * Document type-based rendering with slots
 * This demonstrates how different document node types are rendered
 */

import { define, element, slot, data } from '../src/template-builders';
import { build } from '../src/factory';
import { render } from '../src/reconcile';

export function renderLayout(container: HTMLElement) {
  // 1. Document type renderer (root container with slots)
  define('document', element('div', {
    className: 'app-layout',
    style: {
      display: 'grid', gridTemplateColumns: '240px 1fr', gridTemplateRows: '60px 1fr', height: '100vh'
    }
  }, [
    element('header', { style: { gridColumn: '1 / -1', borderBottom: '1px solid #eee', padding: '12px' } }, [ slot('header') ]),
    element('aside',  { style: { borderRight: '1px solid #eee', padding: '12px' } }, [ slot('sidebar') ]),
    element('main',   { style: { padding: '16px', overflow: 'auto' } }, [ slot('content') ])
  ]));

  // 2. Header type renderer
  define('header', element('div', { className: 'hdr' }, 'Header Area'));

  // 3. Sidebar type renderer  
  define('sidebar', element('ul', { className: 'sidenav' }, [
    element('li', 'Home'),
    element('li', 'Docs')
  ]));

  // 4. Content type renderer (renders document content)
  define('content', element('section', [ slot('content') ]));

  // 5. Document node type renderers
  define('paragraph', element('p', { className: 'paragraph' }, [ data('text') ]));
  define('heading', element('h2', { className: 'heading' }, [ data('text') ]));

  // 6. Document data (type-based node structure)
  const documentData = {
    type: 'document',
    id: 'doc-1',
    content: [
      { type: 'paragraph', id: 'p1', text: 'First paragraph content' },
      { type: 'paragraph', id: 'p2', text: 'Second paragraph content' },
      { type: 'heading', id: 'h1', text: 'Section Title' },
      { type: 'paragraph', id: 'p3', text: 'More content here...' }
    ]
  };

  const view = build('document', documentData);
  render(null, view, container);
}


