/**
 * Barocss Standard Schema presets.
 * Single source of truth for minimal and full document schema.
 * Spec: docs/specs/standard-schema.md
 */
import type { SchemaDefinition } from './types';

/**
 * Minimal schema: document, paragraph, inline-text, marks bold/italic.
 * Use for demos and minimal editors.
 */
export function getMinimalSchemaDefinition(): SchemaDefinition {
  return {
    topNode: 'document',
    nodes: {
      document: { name: 'document', group: 'document', content: 'block+' },
      paragraph: { name: 'paragraph', group: 'block', content: 'inline*' },
      'inline-text': { name: 'inline-text', group: 'inline' },
    },
    marks: {
      bold: { name: 'bold', group: 'text-style' },
      italic: { name: 'italic', group: 'text-style' },
    },
  };
}

/**
 * Full standard schema: all node types and marks used by editor-test and editor-react.
 * Use for full-featured editors. Single source of truth; apps import from @barocss/schema.
 */
export function getStandardSchemaDefinition(): SchemaDefinition {
  return {
    topNode: 'document',
    nodes: {
      document: { name: 'document', group: 'document', content: 'block+' },
      heading: { name: 'heading', group: 'block', content: 'inline*', attrs: { level: { type: 'number', required: true } } },
      paragraph: { name: 'paragraph', group: 'block', content: 'inline*', attrs: { placeholder: { type: 'string', required: false } } },
      blockQuote: { name: 'blockQuote', group: 'block', content: 'block+' },
      pullQuote: { name: 'pullQuote', group: 'block', content: 'inline*' },
      codeBlock: { name: 'codeBlock', group: 'block', content: 'text*', attrs: { language: { type: 'string', required: false } } },
      horizontalRule: { name: 'horizontalRule', group: 'block', atom: true },
      pageBreak: { name: 'pageBreak', group: 'block', atom: true },
      docSection: { name: 'docSection', group: 'block', content: 'block+' },
      columns: { name: 'columns', group: 'block', content: 'column+' },
      column: { name: 'column', group: 'block', content: 'block+', attrs: { width: { type: 'string', required: false } } },
      toc: { name: 'toc', group: 'block', atom: true },
      footnoteDef: { name: 'footnoteDef', group: 'block', content: 'inline*', attrs: { id: { type: 'string', required: true } } },
      list: { name: 'list', group: 'block', content: 'listItem+', attrs: { type: { type: 'string', default: 'bullet', options: ['bullet', 'ordered'] } } },
      listItem: { name: 'listItem', group: 'block', content: 'block+' },
      taskItem: { name: 'taskItem', group: 'block', content: 'inline*', attrs: { checked: { type: 'boolean', default: false } } },
      callout: { name: 'callout', group: 'block', content: 'block+', attrs: { type: { type: 'string', default: 'info' }, title: { type: 'string', required: false } } },
      bFigure: { name: 'bFigure', group: 'block', content: '(inline-image|bTable|codeBlock|mediaEmbed|mediaVideo|mediaAudio)+ bFigcaption?' },
      bFigcaption: { name: 'bFigcaption', group: 'block', content: 'inline*' },
      bDetails: { name: 'bDetails', group: 'block', content: 'bSummary block+' },
      bSummary: { name: 'bSummary', group: 'block', content: 'inline*' },
      descList: { name: 'descList', group: 'block', content: '(descTerm descDef)+' },
      descTerm: { name: 'descTerm', group: 'block', content: 'inline+' },
      descDef: { name: 'descDef', group: 'block', content: 'block+' },
      mathInline: { name: 'mathInline', group: 'inline', atom: true, attrs: { tex: { type: 'string', required: true }, engine: { type: 'string', default: 'katex' } } },
      mathBlock: { name: 'mathBlock', group: 'block', atom: true, attrs: { tex: { type: 'string', required: true }, engine: { type: 'string', default: 'katex' } } },
      mediaVideo: { name: 'mediaVideo', group: 'block', atom: true, attrs: { src: { type: 'string', required: true }, poster: { type: 'string', required: false }, controls: { type: 'boolean', default: true } } },
      mediaAudio: { name: 'mediaAudio', group: 'block', atom: true, attrs: { src: { type: 'string', required: true }, controls: { type: 'boolean', default: true } } },
      mediaEmbed: { name: 'mediaEmbed', group: 'block', atom: true, attrs: { provider: { type: 'string', required: true }, id: { type: 'string', required: true }, title: { type: 'string', required: false } } },
      hardBreak: { name: 'hardBreak', group: 'inline', atom: true },
      chart: { name: 'chart', group: 'block', atom: true, attrs: { title: { type: 'string', required: false }, values: { type: 'string', required: true } } },
      docHeader: { name: 'docHeader', group: 'block', content: 'inline*' },
      docFooter: { name: 'docFooter', group: 'block', content: 'inline*' },
      bibliography: { name: 'bibliography', group: 'block', content: 'block*' },
      commentThread: { name: 'commentThread', group: 'block', content: 'inline*', attrs: { id: { type: 'string', required: true } } },
      endnoteDef: { name: 'endnoteDef', group: 'block', content: 'inline*', attrs: { id: { type: 'string', required: true } } },
      indexBlock: { name: 'indexBlock', group: 'block', content: 'block*' },
      fieldPageNumber: { name: 'fieldPageNumber', group: 'inline', atom: true },
      fieldPageCount: { name: 'fieldPageCount', group: 'inline', atom: true },
      fieldDateTime: { name: 'fieldDateTime', group: 'inline', atom: true, attrs: { format: { type: 'string', required: false } } },
      fieldDocTitle: { name: 'fieldDocTitle', group: 'inline', atom: true },
      fieldAuthor: { name: 'fieldAuthor', group: 'inline', atom: true },
      bookmarkAnchor: { name: 'bookmarkAnchor', group: 'inline', atom: true, attrs: { id: { type: 'string', required: true } } },
      /**
       * A table is a block. **Its parts are not**, and that is the whole of this
       * comment: only `bTable` carries `group: 'block'`, and the six pieces
       * below are reachable through its content expression and nowhere else.
       *
       * All seven were blocks. What that said, to anything reading the schema
       * rather than the intent, was that a blockquote may contain a bare
       * `<tbody>` and a list item may contain a loose `<tr>` — because both hold
       * `block+`, and a row was a block. Nothing in either product could draw
       * that: the HTML parser moves a `<tr>` straight out of a `<div>`, leaving
       * an empty one, which is what `every-drawing-keeps-its-children` reported
       * across twelve pairs the day it was written.
       *
       * The advice was already in this repository's own spec — §9.1 of
       * `docs/specs/standard-schema.md`, about vector nodes: "do **not** put them
       * in `group: 'block'` so they cannot appear at document top level. They are
       * allowed only where a content expression references them." A table's
       * insides are the same shape of thing and had the opposite treatment.
       */
      bTable: { name: 'bTable', group: 'block', content: '(bTableHeader)? bTableBody+ (bTableFooter)?', attrs: { caption: { type: 'string', required: false } } },
      bTableHeader: { name: 'bTableHeader', content: 'bTableHeaderCell+' },
      bTableBody: { name: 'bTableBody', content: 'bTableRow+' },
      bTableFooter: { name: 'bTableFooter', content: 'bTableRow+' },
      bTableHeaderCell: { name: 'bTableHeaderCell', content: 'inline*', attrs: { colspan: { type: 'number', default: 1 }, rowspan: { type: 'number', default: 1 } } },
      // 'bTableCell*', not '+': a row entirely covered by a rowspan from above
      // legitimately owns no cells of its own. HTML and OOXML both allow this,
      // and merging a whole row would otherwise produce an invalid table.
      bTableRow: { name: 'bTableRow', content: 'bTableCell*' },
      bTableCell: { name: 'bTableCell', content: 'inline*', attrs: { colspan: { type: 'number', default: 1 }, rowspan: { type: 'number', default: 1 } } },
      'inline-image': { name: 'inline-image', group: 'inline', atom: true, attrs: { src: { type: 'string', required: true }, alt: { type: 'string', required: false } } },
      emoji: { name: 'emoji', group: 'inline', atom: true, attrs: { shortcode: { type: 'string', required: false }, unicode: { type: 'string', required: false } } },
      'inline-text': { name: 'inline-text', group: 'inline' },
    },
    marks: {
      bold: { name: 'bold', group: 'text-style', attrs: { weight: { type: 'string', default: 'bold' } } },
      italic: { name: 'italic', group: 'text-style', attrs: { style: { type: 'string', default: 'italic' } } },
      /**
       * `single`, because a character has one colour, one highlight, one size and
       * one family. Applying used to append, so red text made green carried both
       * marks and the reader kept the red. Everything else here stacks — two
       * comments overlap on the same sentence, and so do an insertion and a
       * colour.
       */
      fontColor: { name: 'fontColor', group: 'text-style', single: true, attrs: { color: { type: 'string', default: '#000000' } } },
      bgColor: { name: 'bgColor', group: 'text-style', single: true, attrs: { bgColor: { type: 'string', default: '#ffff00' } } },
      underline: { name: 'underline', group: 'text-style', attrs: { style: { type: 'string', default: 'underline' } } },
      strikethrough: { name: 'strikethrough', group: 'text-style', attrs: { style: { type: 'string', default: 'line-through' } } },
      code: { name: 'code', group: 'text-style', attrs: { language: { type: 'string', default: 'text' } } },
      link: { name: 'link', group: 'text-style', attrs: { href: { type: 'string', required: true }, title: { type: 'string', required: false } } },
      highlight: { name: 'highlight', group: 'text-style', single: true, attrs: { color: { type: 'string', default: '#ffff00' } } },
      fontSize: { name: 'fontSize', group: 'text-style', single: true, attrs: { size: { type: 'string', default: '14px' } } },
      fontFamily: { name: 'fontFamily', group: 'text-style', single: true, attrs: { family: { type: 'string', default: 'Arial' } } },
      subscript: { name: 'subscript', group: 'text-style', attrs: { position: { type: 'string', default: 'sub' } } },
      superscript: { name: 'superscript', group: 'text-style', attrs: { position: { type: 'string', default: 'super' } } },
      smallCaps: { name: 'smallCaps', group: 'text-style', attrs: { variant: { type: 'string', default: 'small-caps' } } },
      letterSpacing: { name: 'letterSpacing', group: 'text-style', single: true, attrs: { spacing: { type: 'string', default: '0.1em' } } },
      wordSpacing: { name: 'wordSpacing', group: 'text-style', attrs: { spacing: { type: 'string', default: '0.2em' } } },
      lineHeight: { name: 'lineHeight', group: 'text-style', attrs: { height: { type: 'string', default: '1.5' } } },
      textShadow: { name: 'textShadow', group: 'text-style', attrs: { shadow: { type: 'string', default: '1px 1px 2px rgba(0,0,0,0.3)' } } },
      border: { name: 'border', group: 'text-style', attrs: { style: { type: 'string', default: 'solid' }, width: { type: 'string', default: '1px' }, color: { type: 'string', default: '#000000' } } },
      spanLang: { name: 'spanLang', group: 'text-style', attrs: { lang: { type: 'string', required: true }, dir: { type: 'string', required: false } } },
      kbd: { name: 'kbd', group: 'text-style' },
      mention: { name: 'mention', group: 'text-style', attrs: { id: { type: 'string', required: true } } },
      spoiler: { name: 'spoiler', group: 'text-style', attrs: { revealed: { type: 'boolean', default: false } } },
      footnoteRef: { name: 'footnoteRef', group: 'text-style', attrs: { id: { type: 'string', required: true } } },
    },
  };
}
