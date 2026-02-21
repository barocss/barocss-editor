import type { INode } from '@barocss/datastore';

export interface PDFExportOptions {
  title?: string;
  author?: string;
  pageSize?: 'A4' | 'Letter' | 'Legal';
  orientation?: 'portrait' | 'landscape';
  margins?: { top: string; right: string; bottom: string; left: string };
  headerHTML?: string;
  footerHTML?: string;
  fontSize?: string;
  fontFamily?: string;
  lineHeight?: string;
  includeStyles?: boolean;
}

const DEFAULT_OPTIONS: Required<PDFExportOptions> = {
  title: 'Document',
  author: '',
  pageSize: 'A4',
  orientation: 'portrait',
  margins: { top: '2.54cm', right: '2.54cm', bottom: '2.54cm', left: '2.54cm' },
  headerHTML: '',
  footerHTML: '',
  fontSize: '12pt',
  fontFamily: '"Times New Roman", Times, serif',
  lineHeight: '1.6',
  includeStyles: true
};

const PAGE_SIZES: Record<string, { width: string; height: string }> = {
  A4: { width: '210mm', height: '297mm' },
  Letter: { width: '8.5in', height: '11in' },
  Legal: { width: '8.5in', height: '14in' }
};

export class PDFExporter {
  private _options: Required<PDFExportOptions>;

  constructor(options: PDFExportOptions = {}) {
    this._options = { ...DEFAULT_OPTIONS, ...options };
  }

  toHTML(nodes: INode[]): string {
    const opts = this._options;
    const page = PAGE_SIZES[opts.pageSize] ?? PAGE_SIZES.A4;
    const body = nodes.map(n => this._nodeToHTML(n)).join('\n');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${this._escape(opts.title)}</title>
${opts.author ? `<meta name="author" content="${this._escape(opts.author)}">` : ''}
${opts.includeStyles ? this._buildStyles(page, opts) : ''}
</head>
<body>
${opts.headerHTML ? `<header class="pdf-header">${opts.headerHTML}</header>` : ''}
<main class="pdf-content">
${body}
</main>
${opts.footerHTML ? `<footer class="pdf-footer">${opts.footerHTML}</footer>` : ''}
</body>
</html>`;
  }

  printInBrowser(nodes: INode[]): void {
    const html = this.toHTML(nodes);
    const win = window.open('', '_blank');
    if (!win) throw new Error('PDFExporter: popup blocked');
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
  }

  downloadAsBlob(nodes: INode[]): Blob {
    const html = this.toHTML(nodes);
    return new Blob([html], { type: 'text/html;charset=utf-8' });
  }

  private _buildStyles(
    page: { width: string; height: string },
    opts: Required<PDFExportOptions>
  ): string {
    const orient = opts.orientation === 'landscape'
      ? `size: ${page.height} ${page.width};`
      : `size: ${page.width} ${page.height};`;

    return `<style>
@page {
  ${orient}
  margin: ${opts.margins.top} ${opts.margins.right} ${opts.margins.bottom} ${opts.margins.left};
}
@media print {
  body { margin: 0; padding: 0; }
  .pdf-header, .pdf-footer { position: fixed; left: 0; right: 0; text-align: center; font-size: 10pt; color: #666; }
  .pdf-header { top: 0; }
  .pdf-footer { bottom: 0; }
}
body {
  font-family: ${opts.fontFamily};
  font-size: ${opts.fontSize};
  line-height: ${opts.lineHeight};
  color: #1a1a1a;
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem;
}
h1 { font-size: 2em; margin: 0.8em 0 0.4em; }
h2 { font-size: 1.6em; margin: 0.7em 0 0.35em; }
h3 { font-size: 1.3em; margin: 0.6em 0 0.3em; }
h4 { font-size: 1.1em; margin: 0.5em 0 0.25em; }
h5, h6 { font-size: 1em; margin: 0.5em 0 0.25em; }
p { margin: 0.5em 0; }
blockquote { border-left: 3px solid #ccc; margin: 1em 0; padding: 0.5em 1em; color: #555; }
pre { background: #f5f5f5; padding: 1em; border-radius: 4px; overflow-x: auto; font-family: "Courier New", monospace; font-size: 0.9em; }
code { background: #f0f0f0; padding: 0.15em 0.3em; border-radius: 3px; font-family: "Courier New", monospace; font-size: 0.9em; }
hr { border: none; border-top: 1px solid #ddd; margin: 1.5em 0; }
table { border-collapse: collapse; width: 100%; margin: 1em 0; }
th, td { border: 1px solid #ccc; padding: 0.5em 0.75em; text-align: left; }
th { background: #f5f5f5; font-weight: bold; }
ul, ol { margin: 0.5em 0; padding-left: 2em; }
.task-item { list-style: none; margin-left: -1.5em; }
.task-item input[type="checkbox"] { margin-right: 0.5em; }
.callout { border: 1px solid #ddd; border-radius: 6px; padding: 1em; margin: 1em 0; }
.callout-info { border-left: 4px solid #2196F3; background: #e3f2fd; }
.callout-warning { border-left: 4px solid #ff9800; background: #fff3e0; }
.callout-error { border-left: 4px solid #f44336; background: #ffebee; }
.callout-success { border-left: 4px solid #4caf50; background: #e8f5e9; }
.callout-note { border-left: 4px solid #9c27b0; background: #f3e5f5; }
.callout-tip { border-left: 4px solid #00bcd4; background: #e0f7fa; }
.callout-title { font-weight: bold; margin-bottom: 0.5em; }
.math-block { text-align: center; margin: 1em 0; padding: 0.5em; font-style: italic; }
.comment-thread { background: #fffde7; border-left: 3px solid #ffc107; padding: 0.5em 1em; margin: 0.5em 0; }
img { max-width: 100%; height: auto; }
</style>`;
  }

  private _nodeToHTML(node: INode): string {
    const stype = node.stype;

    switch (stype) {
      case 'document':
        return this._children(node);

      case 'heading': {
        const level = Math.min(Math.max(node.attributes?.level ?? 1, 1), 6);
        return `<h${level}>${this._children(node)}</h${level}>`;
      }

      case 'paragraph':
        return `<p>${this._children(node)}</p>`;

      case 'inline-text':
        return this._renderTextWithMarks(node);

      case 'blockQuote':
        return `<blockquote>${this._children(node)}</blockquote>`;

      case 'pullQuote':
        return `<blockquote class="pull-quote">${this._children(node)}</blockquote>`;

      case 'codeBlock': {
        const lang = node.attributes?.language ?? '';
        return `<pre><code${lang ? ` class="language-${this._escape(lang)}"` : ''}>${this._children(node)}</code></pre>`;
      }

      case 'horizontalRule':
        return '<hr>';

      case 'pageBreak':
        return '<div style="page-break-after: always;"></div>';

      case 'list': {
        const listType = node.attributes?.type;
        const tag = listType === 'ordered' ? 'ol' : 'ul';
        return `<${tag}>${this._children(node)}</${tag}>`;
      }

      case 'listItem':
        return `<li>${this._children(node)}</li>`;

      case 'taskItem': {
        const checked = node.attributes?.checked ? ' checked' : '';
        return `<li class="task-item"><input type="checkbox"${checked} disabled>${this._children(node)}</li>`;
      }

      case 'callout': {
        const ct = node.attributes?.type ?? 'info';
        const title = node.attributes?.title;
        return `<div class="callout callout-${this._escape(ct)}">${title ? `<div class="callout-title">${this._escape(title)}</div>` : ''}${this._children(node)}</div>`;
      }

      case 'mathBlock':
        return `<div class="math-block">${this._escape(node.attributes?.tex ?? '')}</div>`;

      case 'mathInline':
        return `<span class="math-inline">${this._escape(node.attributes?.tex ?? '')}</span>`;

      case 'commentThread':
        return `<div class="comment-thread" data-thread-id="${this._escape(node.attributes?.id ?? '')}">${this._children(node)}</div>`;

      case 'inline-image':
        return `<img src="${this._escape(node.attributes?.src ?? '')}" alt="${this._escape(node.attributes?.alt ?? '')}">`;

      case 'bTable':
        return `<table>${this._children(node)}</table>`;
      case 'bTableHeader':
        return `<thead><tr>${this._children(node)}</tr></thead>`;
      case 'bTableBody':
        return `<tbody>${this._children(node)}</tbody>`;
      case 'bTableFooter':
        return `<tfoot>${this._children(node)}</tfoot>`;
      case 'bTableRow':
        return `<tr>${this._children(node)}</tr>`;
      case 'bTableHeaderCell': {
        const hcs = (node.attributes?.colspan ?? 1) > 1 ? ` colspan="${node.attributes!.colspan}"` : '';
        const hrs = (node.attributes?.rowspan ?? 1) > 1 ? ` rowspan="${node.attributes!.rowspan}"` : '';
        return `<th${hcs}${hrs}>${this._children(node)}</th>`;
      }
      case 'bTableCell': {
        const tcs = (node.attributes?.colspan ?? 1) > 1 ? ` colspan="${node.attributes!.colspan}"` : '';
        const trs = (node.attributes?.rowspan ?? 1) > 1 ? ` rowspan="${node.attributes!.rowspan}"` : '';
        return `<td${tcs}${trs}>${this._children(node)}</td>`;
      }

      case 'bFigure':
        return `<figure>${this._children(node)}</figure>`;
      case 'bFigcaption':
        return `<figcaption>${this._children(node)}</figcaption>`;

      case 'bDetails':
        return `<details>${this._children(node)}</details>`;
      case 'bSummary':
        return `<summary>${this._children(node)}</summary>`;

      case 'hardBreak':
        return '<br>';

      case 'emoji':
        return node.attributes?.unicode ?? `:${node.attributes?.shortcode ?? ''}:`;

      default:
        if (node.text != null) return this._escape(node.text);
        return this._children(node);
    }
  }

  private _renderTextWithMarks(node: INode): string {
    let text = this._escape(node.text ?? '');
    const marks = node.marks;
    if (!marks || !Array.isArray(marks)) return text;

    for (const mark of marks) {
      const mtype = mark.stype;
      const attrs = mark.attrs ?? {};

      switch (mtype) {
        case 'bold':
          text = `<strong>${text}</strong>`;
          break;
        case 'italic':
          text = `<em>${text}</em>`;
          break;
        case 'underline':
          text = `<u>${text}</u>`;
          break;
        case 'strikethrough':
          text = `<s>${text}</s>`;
          break;
        case 'code':
          text = `<code>${text}</code>`;
          break;
        case 'link':
          text = `<a href="${this._escape(attrs.href ?? '')}">${text}</a>`;
          break;
        case 'subscript':
          text = `<sub>${text}</sub>`;
          break;
        case 'superscript':
          text = `<sup>${text}</sup>`;
          break;
        case 'highlight':
          text = `<mark style="background:${this._escape(attrs.color ?? '#ffff00')}">${text}</mark>`;
          break;
        case 'kbd':
          text = `<kbd>${text}</kbd>`;
          break;
      }
    }

    return text;
  }

  private _children(node: INode): string {
    if (!node.content || !Array.isArray(node.content)) {
      return node.text != null ? this._escape(node.text) : '';
    }
    return node.content.map((child: any) => {
      if (typeof child === 'string') return this._escape(child);
      return this._nodeToHTML(child);
    }).join('');
  }

  private _escape(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
