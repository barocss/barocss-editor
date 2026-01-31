/* eslint-disable @typescript-eslint/no-explicit-any */
// @ts-nocheck - same define/defineMark as editor-test
import { define, element, slot, data, defineMark, attr } from '@barocss/dsl';

/** Same define/defineMark as editor-test for comparison. */
export function registerRenderers(): void {
  // define is immediately registered in global registry
  define('document', element('div', {className: 'document'}, [slot('content')]));
  define('heading', element((model: any) => `h${model.attributes.level || 1}`, { className: 'heading' }, [slot('content')]));
  define('paragraph', element('p', {className: 'paragraph'}, [slot('content')]));
  // New blocks: blockQuote, pullQuote, codeFence, pageBreak, section, columns/column, toc, footnoteDef
  define('blockQuote', element('blockquote', { className: 'block-quote' }, [slot('content')]));
  define('pullQuote', element('blockquote', { className: 'pull-quote' }, [slot('content')]));

  define('codeFence', element('pre', { className: 'code-fence', 'data-language': attr('language', 'text') }, [
    element('code', { 'data-language': attr('language', 'text') }, [data('text')])
  ]));

  define('pageBreak', element('div', { className: 'page-break', 'aria-hidden': 'true' }));

  define('docSection', element('section', { className: 'section' }, [slot('content')]));
  define('columns', element('div', { className: 'columns', style: { display: 'flex', gap: '16px', alignItems: 'stretch', width: '100%' } }, [slot('content')]));
  define('column', element('div', { className: 'column', style: { width: attr('width', ''), flex: (d:any) => (d?.attributes?.width ? '0 0 auto' : '1 1 0'), boxSizing: 'border-box' } }, [slot('content')]));

  define('toc', element('nav', { className: 'toc', role: 'navigation' }));

  define('footnoteDef', element('div', { className: 'footnote-def', id: (d:any)=>`fn-${d?.attributes?.id||''}` }, [
    element('sup', { className: 'footnote-label' }, [attr('id', '')]),
    element('span', { className: 'footnote-content' }, [slot('content')])
  ]));
  define('inline-image', element('img', { 
      src: attr('src', ''), 
      alt: attr('alt', '') 
    })
  );
  
  // New node types - add one by one
  
  define('codeBlock', element('div', { 
      className: 'code-block',
      'data-language': attr('language', 'text')
    }, [
      element('pre', { 
        className: 'code-content',
        'data-language': attr('language', 'text')
      }, [data('text')])
    ])
  );
  
  define('horizontalRule', element('div', { 
    className: 'horizontal-rule'
  }));
  
  // list / listItem (use native ul/ol/li tags)
  define('list', (model: any) => {
    const attrs = model?.attrs ?? model?.attributes ?? {};
    const type = attrs.type || 'bullet';
    return element((d: { attributes?: { type?: string } })=> d.attributes?.type === 'ordered' ? 'ol' : 'ul', {
      className: `list list-${type}`,
      'data-list-type': attr('type', 'bullet')
    }, [slot('content')]);
  });

  define('listItem', element('li', {
    className: 'list-item'
  }, [slot('content')]));

  define('taskItem', element('li', { className: 'task-item', 'data-checked': attr('checked', false) }, [
      element('input', { type: 'checkbox', checked: attr('checked', false), disabled: true }),
      element('span', { className: 'task-content' }, [slot('content')])
    ])
  );

  define('callout', element('div', { className: data((d:any) => `callout callout-${(d.attributes?.type)||'info'}`), 'data-type': attr('type', 'info') }, [
      element('div', { className: 'callout-title' }, [attr('title', '')]),
      element('div', { className: 'callout-body' }, [slot('content')])
    ])
  );

  define('bFigure', element('figure', { className: 'figure' }, [slot('content')]));
  define('bFigcaption', element('figcaption', { className: 'figcaption' }, [slot('content')]));

  define('bDetails', element('details', { className: 'details' }, [slot('content')]));
  define('bSummary', element('summary', { className: 'summary' }, [slot('content')]));

  define('descList', element('dl', { className: 'dl' }, [slot('content')]));
  define('descTerm', element('dt', { className: 'dt' }, [slot('content')]));
  define('descDef', element('dd', { className: 'dd' }, [slot('content')]));

  define('mathInline', element('span', { className: 'math-inline', 'data-engine': attr('engine', 'katex') }, [attr('tex', '')]));
  define('mathBlock', element('div', { className: 'math-block', 'data-engine': attr('engine', 'katex') }, [attr('tex', '')]));

  define('mediaVideo', element('video', { className: 'video', src: attr('src', ''), poster: attr('poster', ''), controls: attr('controls', true) }));
  define('mediaAudio', element('audio', { className: 'audio', src: attr('src', ''), controls: attr('controls', true) }));
  define('mediaEmbed', element('iframe', { className: 'embed', title: attr('title', ''), 'data-provider': attr('provider', ''), 'data-embed-id': attr('id', ''), width: '560', height: '315', frameborder: '0', allowfullscreen: true }));

  define('hardBreak', element('br'));

  // External component renderer: chart (managesDOM signature)
  define('chart', {
    managesDOM: true,
    mount(props: any, container: HTMLElement) {
      try {
        const title = (props?.attributes?.title ?? props?.title ?? 'Chart').toString();
        const raw = (props?.attributes?.values ?? props?.values ?? '').toString();
        const values = raw
          .split(',')
          .map((v: string) => Number(v.trim()))
          .filter((n: number) => Number.isFinite(n));

        const host = document.createElement('div');
        host.className = 'chart-host';
        host.style.display = 'block';
        if (!host.style.height && !host.style.minHeight) host.style.minHeight = '180px';

        const wrapper = document.createElement('div');
        wrapper.className = 'chart-container';
        wrapper.style.height = '160px';
        wrapper.style.display = 'flex';
        wrapper.style.flexDirection = 'column';
        wrapper.style.gap = '8px';

        const titleEl = document.createElement('div');
        titleEl.className = 'chart-title';
        titleEl.textContent = title;

        const bars = document.createElement('div');
        bars.className = 'chart-bars';
        bars.style.display = 'flex';
        bars.style.alignItems = 'flex-end';
        bars.style.gap = '6px';
        bars.style.height = '100%';

        if (values.length === 0) {
          const empty = document.createElement('div');
          empty.className = 'chart-empty';
          empty.textContent = 'No data';
          bars.appendChild(empty);
        } else {
          values.forEach((n: number) => {
            const bar = document.createElement('div');
            bar.className = 'chart-bar';
            const h = Math.max(2, Math.min(100, n));
            bar.style.height = `${h}%`;
            bar.style.width = '16px';
            bar.style.background = '#4F46E5';
            bar.style.borderRadius = '3px 3px 0 0';
            bars.appendChild(bar);
          });
        }

        wrapper.appendChild(titleEl);
        wrapper.appendChild(bars);
        host.appendChild(wrapper);
        (host as any).__chartUnmount = () => { host.textContent = ''; };

        container.appendChild(host);
        return host;
      } catch (err) {
        const fallback = document.createElement('div');
        fallback.className = 'chart-fallback';
        const t = (props?.attributes?.title ?? props?.title ?? 'Chart').toString();
        const v = (props?.attributes?.values ?? props?.values ?? '').toString();
        fallback.textContent = `${t}: ${v}`;
        container.appendChild(fallback);
        return fallback;
      }
    },
    unmount(instance: any) {
      try {
        const el = instance?.element as HTMLElement | null;
        const un = el && (el as any).__chartUnmount;
        if (typeof un === 'function') un();
      } catch {}
    }
  } as any);

  // Word-processor style renderers (minimal)
  define('docHeader', element('header', { className: 'doc-header' }, [slot('content')]));
  define('docFooter', element('footer', { className: 'doc-footer' }, [slot('content')]));
  define('bibliography', element('section', { className: 'bibliography' }, [slot('content')]));
  define('commentThread', (model: any) => element('aside', { className: 'comment-thread', 'data-id': (d:any)=>d?.attributes?.id }, [slot('content')]));
  define('endnoteDef', (model: any) => element('div', { className: 'endnote-def', id: (d:any)=>`en-${d?.attributes?.id||''}` }, [
    element('sup', { className: 'endnote-label' }, [attr('id', '')]),
    element('span', { className: 'endnote-content' }, [slot('content')])
  ]));
  define('indexBlock', element('section', { className: 'index-block' }, [slot('content')]));
  define('fieldPageNumber', element('span', { className: 'field-page-number' }, []));
  define('fieldPageCount', element('span', { className: 'field-page-count' }, []));
  define('fieldDateTime', element('time', { className: 'field-datetime', datetime: (d:any)=>new Date().toISOString() }, [attr('format','')]));
  define('fieldDocTitle', element('span', { className: 'field-doc-title' }, []));
  define('fieldAuthor', element('span', { className: 'field-author' }, []));
  define('bookmarkAnchor', element('a', { className: 'bookmark-anchor', id: (d:any)=>d?.attributes?.id }, []));

  // table / tableRow / tableCell
  define('bTable', (model: any) => {
    return element('table', {
      className: 'table',
      'data-bc-caption': attr('caption', '')
    }, [
      ...(model?.attributes?.caption
        ? [element('caption', { className: 'table-caption' }, [attr('caption', '')])]
        : []),
      // Let browser auto-insert <tbody> for rows; keep <thead> as direct child
      slot('content')
    ]);
  });

  define('bTableHeader', element('thead', { className: 'table-head' }, [
    element('tr', { className: 'table-row' }, [slot('content')])
  ]));

  define('bTableBody', element('tbody', {}, [slot('content')]));
  define('bTableFooter', element('tfoot', {}, [slot('content')]));
  define('bTableHeaderCell', (model: any) => {
    return element('th', {
      className: 'table-cell',
      colspan: attr('colspan', 1),
      rowspan: attr('rowspan', 1),
      scope: 'col'
    }, [slot('content')]);
  });

  define('bTableRow', element('tr', { className: 'table-row' }, [slot('content')]));

  define('bTableCell', (model: any) => {
    const isHeader = !!attr('header');
    const tag = isHeader ? 'th' : 'td';
    return element(tag as any, {
      className: 'table-cell',
      colspan: attr('colspan', 1),
      rowspan: attr('rowspan', 1),
      scope: isHeader ? 'col' : undefined
    }, [slot('content')]);
  });

  
  // Define custom mark renderers
  defineMark('bold', element('span', { 
    className: 'custom-bold',
    'data-mark-type': 'bold',
    'data-weight': attr('weight', 'bold'),
    style: { 
      fontWeight: 'bold',
      padding: '1px 2px',
      borderRadius: '2px'
    }
  }, [data('text')]));
  
  defineMark('italic', element('span', { 
    className: 'custom-italic',
    'data-mark-type': 'italic',
    'data-style': attr('style', 'italic'),
    style: { 
      fontStyle: 'italic',
      padding: '1px 2px',
      borderRadius: '2px'
    }
  }, [data('text')]));
  
  defineMark('fontColor', element('span', { 
    className: 'custom-font-color',
    'data-mark-type': 'fontColor',
    'data-color': attr('color', '#000000'),
    style: { 
      color: attr('color', '#000000'),
      padding: '1px 2px',
      borderRadius: '2px'
    }
  }, [data('text')]));
  
  defineMark('bgColor', element('span', { 
    className: 'custom-bg-color',
    'data-mark-type': 'bgColor',
    'data-bg-color': attr('bgColor', '#ffff00'),
    style: { 
      backgroundColor: attr('bgColor', '#ffff00'),
      padding: '1px 2px',
      borderRadius: '2px'
    }
  }, [data('text')]));
  
  defineMark('underline', element('span', { 
    className: 'custom-underline',
    'data-mark-type': 'underline',
    style: { 
      textDecoration: 'underline',
      textDecorationColor: '#666',
      textDecorationThickness: '2px',
      padding: '1px 2px',
      borderRadius: '2px'
    }
  }, [data('text')]));
  
  defineMark('strikethrough', element('span', { 
    className: 'custom-strikethrough',
    'data-mark-type': 'strikethrough',
    style: { 
      textDecoration: 'line-through',
      textDecorationColor: '#ff0000',
      textDecorationThickness: '2px',
      padding: '1px 2px',
      borderRadius: '2px'
    }
  }, [data('text')]));
  
  defineMark('code', element('span', { 
    className: 'custom-code',
    'data-mark-type': 'code',
    'data-language': attr('language', 'text'),
    style: { 
      fontFamily: 'Monaco, Consolas, "Courier New", monospace',
      backgroundColor: '#f5f5f5',
      color: '#d63384',
      padding: '2px 4px',
      borderRadius: '3px',
      fontSize: '0.9em',
      border: '1px solid #e0e0e0'
    }
  }, [data('text')]));

  // inlineCode mark (alias-like but separate)
  defineMark('inlineCode', element('code', {
    className: 'mark-inline-code',
    'data-language': attr('language', 'text')
  }, [data('text')]));
  
  defineMark('link', element('a', { 
    className: 'custom-link',
    'data-mark-type': 'link',
    href: attr('href', '#'),
    title: attr('title', ''),
    target: '_blank',
    rel: 'noopener noreferrer',
    style: { 
      color: '#007bff',
      textDecoration: 'underline',
      textDecorationColor: '#007bff',
      padding: '1px 2px',
      borderRadius: '2px'
    }
  }, [data('text')]));

  // Tracked changes / citations / cross-ref / index
  defineMark('inserted', element('ins', {
    className: 'mark-inserted',
    'data-author': attr('author', ''),
    'data-date': attr('date', '')
  }, [data('text')]))

  defineMark('deleted', element('del', {
    className: 'mark-deleted',
    'data-author': attr('author', ''),
    'data-date': attr('date', '')
  }, [data('text')]))

  defineMark('citation', element('span', {
    className: 'mark-citation',
    'data-key': attr('key', ''),
    'data-style': attr('style', '')
  }, [data('text')]))

  defineMark('xref', element('a', {
    className: 'mark-xref',
    href: (d:any)=> `#${d?.attributes?.target||''}`,
    title: attr('label', '')
  }, [data('text')]))

  defineMark('indexEntry', element('span', {
    className: 'mark-index-entry',
    'data-term': attr('term',''),
    'data-subterm': attr('subterm','')
  }, [data('text')]))

  defineMark('endnoteRef', element('sup', {
    className: 'endnote-ref'
  }, [
    element('a', { href: (d:any)=> `#en-${d?.attributes?.id||''}` }, [attr('id','')])
  ]))

  defineMark('bookmark', element('a', {
    className: 'mark-bookmark',
    id: (d:any)=> d?.attributes?.id
  }, [data('text')]))
  
  defineMark('highlight', element('span', { 
    className: 'custom-highlight',
    'data-mark-type': 'highlight',
    'data-highlight-color': attr('color', '#ffff00'),
    style: { 
      backgroundColor: attr('color', '#ffff00'),
      padding: '1px 2px',
      borderRadius: '2px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
    }
  }, [data('text')]));
  
  defineMark('fontSize', element('span', { 
    className: 'custom-font-size',
    'data-mark-type': 'fontSize',
    'data-size': attr('size', '14px'),
    style: { 
      fontSize: attr('size', '14px'),
      padding: '1px 2px',
      borderRadius: '2px'
    }
  }, [data('text')]));
  
  defineMark('fontFamily', element('span', { 
    className: 'custom-font-family',
    'data-mark-type': 'fontFamily',
    'data-family': attr('family', 'Arial'),
    style: { 
      fontFamily: attr('family', 'Arial'),
      padding: '1px 2px',
      borderRadius: '2px'
    }
  }, [data('text')]));
  
  defineMark('subscript', element('sub', { 
    className: 'custom-subscript',
    'data-mark-type': 'subscript',
    'data-position': attr('position', 'sub'),
    style: { 
      fontSize: '0.75em',
      verticalAlign: 'sub',
      padding: '1px 2px',
      borderRadius: '2px'
    }
  }, [data('text')]));
  
  defineMark('superscript', element('sup', { 
    className: 'custom-superscript',
    'data-mark-type': 'superscript',
    'data-position': attr('position', 'super'),
    style: { 
      fontSize: '0.75em',
      verticalAlign: 'super',
      padding: '1px 2px',
      borderRadius: '2px'
    }
  }, [data('text')]));
  
  defineMark('smallCaps', element('span', { 
    className: 'custom-small-caps',
    'data-mark-type': 'smallCaps',
    'data-variant': attr('variant', 'small-caps'),
    style: { 
      fontVariant: 'small-caps',
      padding: '1px 2px',
      borderRadius: '2px'
    }
  }, [data('text')]));
  
  defineMark('letterSpacing', element('span', { 
    className: 'custom-letter-spacing',
    'data-mark-type': 'letterSpacing',
    'data-spacing': attr('spacing', '0.1em'),
    style: { 
      letterSpacing: attr('spacing', '0.1em'),
      padding: '1px 2px',
      borderRadius: '2px'
    }
  }, [data('text')]));
  
  defineMark('wordSpacing', element('span', { 
    className: 'custom-word-spacing',
    'data-mark-type': 'wordSpacing',
    'data-spacing': attr('spacing', '0.2em'),
    style: { 
      wordSpacing: attr('spacing', '0.2em'),
      padding: '1px 2px',
      borderRadius: '2px'
    }
  }, [data('text')]));
  
  defineMark('lineHeight', element('span', { 
    className: 'custom-line-height',
    'data-mark-type': 'lineHeight',
    'data-height': attr('height', '1.5'),
    style: { 
      lineHeight: attr('height', '1.5'),
      padding: '1px 2px',
      borderRadius: '2px'
    }
  }, [data('text')]));
  
  defineMark('textShadow', element('span', { 
    className: 'custom-text-shadow',
    'data-mark-type': 'textShadow',
    'data-shadow': attr('shadow', '1px 1px 2px rgba(0,0,0,0.3)'),
    style: { 
      textShadow: attr('shadow', '1px 1px 2px rgba(0,0,0,0.3)'),
      padding: '1px 2px',
      borderRadius: '2px'
    }
  }, [data('text')]));
  
  defineMark('border', element('span', { 
    className: 'custom-border',
    'data-mark-type': 'border',
    'data-style': attr('style', 'solid'),
    'data-width': attr('width', '1px'),
    'data-color': attr('color', '#000000'),
    style: { 
      borderStyle: attr('style', 'solid'),
      borderWidth: attr('width', '1px'),
      borderColor: attr('color', '#000000'),
      padding: '1px 2px',
      borderRadius: '2px'
    }
  }, [data('text')]));

  // Additional inline marks used across tests
  defineMark('kbd', element('kbd', {
    className: 'mark-kbd'
  }, [data('text')]));

  defineMark('mention', element('span', {
    className: 'mention mark-mention',
    'data-id': attr('id', '')
  }, [data('text')]));

  defineMark('spoiler', element('span', {
    className: 'spoiler mark-spoiler'
  }, [
    // simple structure: toggle + content span
    element('span', { className: 'spoiler-toggle' }),
    data('text')
  ]));

  // footnote reference mark
  defineMark('footnoteRef', element('sup', {
    className: 'footnote-ref'
  }, [
    element('a', { href: (d:any)=> `#fn-${d?.attributes?.id||''}` }, [attr('id','')])
  ]));

  defineMark('spanLang', element('span', {
    'data-lang': attr('lang', ''),
    'data-dir': attr('dir', ''),
    lang: attr('lang', ''),
    dir: attr('dir', '')
  }, [data('text')]));
  
  // Text node: if empty, render filler <br> to maintain line height/cursor
  // Note: do not add mark classes to inline-text template
  // marks are handled as separate wrappers in _buildMarkedRunsWithDecorators
  // therefore className should only be 'text'
  define('inline-text',element('span', { className: 'text' }, [
        data('text', '')
      ])
  );
}
