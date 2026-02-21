import { DataStore } from '@barocss/datastore';
import { Editor } from '@barocss/editor-core';
import { createCoreExtensions, createBasicExtensions } from '@barocss/extensions';
import { buildTextRunIndex, EditorViewDOM } from '@barocss/editor-view-dom';
import { createSchema, getStandardSchemaDefinition } from '@barocss/schema';
import { define, element, slot, data, when, defineMark, getGlobalRegistry, attr, text } from '@barocss/dsl';
import { Devtool } from '@barocss/devtool';
import katex from 'katex';
import 'katex/dist/katex.min.css';

function _renderMathToElement(el: HTMLElement, tex: string, displayMode: boolean): void {
  if (!tex) { el.textContent = displayMode ? '(empty equation)' : ''; return; }
  try {
    katex.render(tex, el, { displayMode, throwOnError: false });
  } catch {
    el.textContent = tex;
  }
}

function bootstrap() {
  console.log('[editor-test] bootstrap:start');
  
  const container = document.getElementById('editor-container');
  if (!container) {
    throw new Error('Missing #editor-container');
  }
  
  // Skip if editor is already mounted (prevent HMR)
  if (container.hasAttribute('data-bootstrap-executed')) {
    console.log('[editor-test] bootstrap: SKIP (already executed, HMR detected)');
    return;
  }
  container.setAttribute('data-bootstrap-executed', 'true');

  const schema = createSchema("test", getStandardSchemaDefinition());
  const dataStore = new DataStore(undefined, schema);
  const initialTree = {
    sid: 'doc-1',
    stype: 'document',
    content: [
      {
        sid: 'h-1',
        stype: 'heading',
        attributes: { level: 1 },
        content: [
          { sid: 'text-h1', stype: 'inline-text', text: 'BaroCSS Editor Demo' }
        ]
      },
      {
        sid: 'h-2',
        stype: 'heading',
        attributes: { level: 2 },
        content: [
          { sid: 'text-h2', stype: 'inline-text', text: 'Rich Text Features' }
        ]
      },
      {
        sid: 'p-1',
        stype: 'paragraph',
        content: [
          { sid: 'text-1', stype: 'inline-text', text: 'This is a ' },
          { sid: 'text-bold', stype: 'inline-text', text: 'bold text', marks: [{ stype: 'bold', range: [0, 9] }] },
          { sid: 'text-2', stype: 'inline-text', text: ' and this is ' },
          { sid: 'text-italic', stype: 'inline-text', text: 'italic text', marks: [{ stype: 'italic', range: [0, 11] }] },
          { sid: 'text-3', stype: 'inline-text', text: '. You can also combine them: ' },
          { sid: 'text-bold-italic', stype: 'inline-text', text: 'bold and italic', marks: [{ stype: 'bold', range: [0, 15] }, { stype: 'italic', range: [0, 15] }] },
          { sid: 'text-4', stype: 'inline-text', text: '. Now with colors: ' },
          { sid: 'text-red', stype: 'inline-text', text: 'red text', marks: [{ stype: 'fontColor', range: [0, 8], attrs: { color: '#ff0000' } }] },
          { sid: 'text-5', stype: 'inline-text', text: ' and ' },
          { sid: 'text-yellow-bg', stype: 'inline-text', text: 'yellow background', marks: [{ stype: 'bgColor', range: [0, 16], attrs: { bgColor: '#ffff00' } }] },
          { sid: 'text-6', stype: 'inline-text', text: '.' }
        ]
      },
      {
        sid: 'p-2',
        stype: 'paragraph',
        content: [
          { sid: 'text-p2-1', stype: 'inline-text', text: 'Here is an inline image: ' },
          { sid: 'img-1', stype: 'inline-image', attributes: { src: 'https://dummyimage.com/32x32/4CAF50/white?text=✓', alt: 'checkmark' } },
          { sid: 'text-p2-2', stype: 'inline-text', text: ' and some ' },
          { sid: 'text-bold-after-img', stype: 'inline-text', text: 'bold text after image', marks: [{ stype: 'bold' }] },
          { sid: 'text-p2-3', stype: 'inline-text', text: '.' }
        ]
      }
      // Model reduced: removed remaining content for testing
      /*
      ,{
        sid: 'h-3',
        stype: 'heading',
        attributes: { level: 3 },
        content: [
          { sid: 'text-h3', stype: 'inline-text', text: 'Complex Mark Combinations' }
        ]
      },
      {
        sid: 'doc-header-1',
        stype: 'docHeader',
        content: [
          { sid: 'dh-title', stype: 'inline-text', text: 'Document Header — Page ' },
          { sid: 'dh-page', stype: 'fieldPageNumber' },
          { sid: 'dh-sep', stype: 'inline-text', text: ' / ' },
          { sid: 'dh-count', stype: 'fieldPageCount' }
        ]
      },
      {
        sid: 'p-3',
        stype: 'paragraph',
        content: [
          { sid: 'text-8', stype: 'inline-text', text: 'Multiple marks on same text: ' },
          { sid: 'text-complex', stype: 'inline-text', text: 'Bold+Italic', marks: [{ stype: 'bold' }, { stype: 'italic' }] },
          { sid: 'text-9', stype: 'inline-text', text: '. Color combinations: ' },
          { sid: 'text-red-bold', stype: 'inline-text', text: 'Red Bold', marks: [{ stype: 'bold', range: [0, 8] }, { stype: 'fontColor', range: [0, 8], attrs: { color: '#ff0000' } }] },
          { sid: 'text-10', stype: 'inline-text', text: ', ' },
          { sid: 'text-blue-bg', stype: 'inline-text', text: 'Blue Background', marks: [{ stype: 'bgColor', range: [0, 15], attrs: { bgColor: '#007bff' } }] },
          { sid: 'text-11', stype: 'inline-text', text: ', ' },
          { sid: 'text-complex-color', stype: 'inline-text', text: 'Bold+Red+Yellow', marks: [{ stype: 'bold', range: [0, 15] }, { stype: 'fontColor', range: [0, 15], attrs: { color: '#ff0000' } }, { stype: 'bgColor', range: [0, 15], attrs: { bgColor: '#ffff00' } }] },
          { sid: 'text-12', stype: 'inline-text', text: '.' }
        ]
      },
      {
        sid: 'p-4',
        stype: 'paragraph',
        content: [
          { sid: 'text-p4-1', stype: 'inline-text', text: 'Text decorations: ' },
          { sid: 'text-underline', stype: 'inline-text', text: 'underlined', marks: [{ stype: 'underline', range: [0, 10] }] },
          { sid: 'text-p4-2', stype: 'inline-text', text: ', ' },
          { sid: 'text-strike', stype: 'inline-text', text: 'strikethrough', marks: [{ stype: 'strikethrough', range: [0, 13] }] },
          { sid: 'text-13', stype: 'inline-text', text: ', ' },
          { sid: 'text-code', stype: 'inline-text', text: 'code snippet', marks: [{ stype: 'code', range: [0, 13], attrs: { language: 'javascript' } }] },
          { sid: 'text-14', stype: 'inline-text', text: '.' }
        ]
      },
      {
        sid: 'p-4b',
        stype: 'paragraph',
        content: [
          { sid: 'text-15', stype: 'inline-text', text: 'Links and highlights: ' },
          { sid: 'text-link', stype: 'inline-text', text: 'Visit Google', marks: [{ stype: 'link', range: [0, 12], attrs: { href: 'https://google.com', title: 'Google Search' } }] },
          { sid: 'text-16', stype: 'inline-text', text: ', ' },
          { sid: 'text-highlight', stype: 'inline-text', text: 'highlighted text', marks: [{ stype: 'highlight', range: [0, 15], attrs: { color: '#ffeb3b' } }] },
          { sid: 'text-p4b-3', stype: 'inline-text', text: '.' }
        ]
      },
      {
        sid: 'p-4c',
        stype: 'paragraph',
        content: [
          { sid: 'text-p4c-1', stype: 'inline-text', text: 'Font variations: ' },
          { sid: 'text-large', stype: 'inline-text', text: 'Large text', marks: [{ stype: 'fontSize', range: [0, 10], attrs: { size: '24px' } }] },
          { sid: 'text-p4c-2', stype: 'inline-text', text: ', ' },
          { sid: 'text-small', stype: 'inline-text', text: 'Small text', marks: [{ stype: 'fontSize', range: [0, 10], attrs: { size: '10px' } }] },
          { sid: 'text-p4c-3', stype: 'inline-text', text: ', ' },
          { sid: 'text-comic', stype: 'inline-text', text: 'Comic Sans', marks: [{ stype: 'fontFamily', range: [0, 10], attrs: { family: 'Comic Sans MS' } }] },
          { sid: 'text-p4c-4', stype: 'inline-text', text: '.' }
        ]
      },
      {
        sid: 'p-5',
        stype: 'paragraph',
        content: [
          { sid: 'text-p5-1', stype: 'inline-text', text: 'Complex combinations: ' },
          { sid: 'text-complex1', stype: 'inline-text', text: 'Bold+Underline+Code', marks: [{ stype: 'bold', range: [0, 20] }, { stype: 'underline', range: [0, 20] }, { stype: 'code', range: [0, 20], attrs: { language: 'typescript' } }] },
          { sid: 'text-p5-2', stype: 'inline-text', text: ', ' },
          { sid: 'text-complex2', stype: 'inline-text', text: 'Link+Highlight', marks: [{ stype: 'link', range: [0, 13], attrs: { href: 'https://example.com' } }, { stype: 'highlight', range: [0, 13], attrs: { color: '#e8f5e8' } }] },
          { sid: 'text-p5-3', stype: 'inline-text', text: ', ' },
          { sid: 'text-complex3', stype: 'inline-text', text: 'Large+Red+Strike', marks: [{ stype: 'fontSize', range: [0, 15], attrs: { size: '20px' } }, { stype: 'fontColor', range: [0, 15], attrs: { color: '#ff0000' } }, { stype: 'strikethrough', range: [0, 15] }] },
          { sid: 'text-p5-4', stype: 'inline-text', text: '.' }
        ]
      },
      {
        sid: 'p-5b',
        stype: 'paragraph',
        content: [
          { sid: 'text-17b', stype: 'inline-text', text: 'Scientific notation: H' },
          { sid: 'text-sub', stype: 'inline-text', text: '2', marks: [{ stype: 'subscript', range: [0, 1] }] },
          { sid: 'text-18b', stype: 'inline-text', text: 'O, E=mc' },
          { sid: 'text-sup', stype: 'inline-text', text: '2', marks: [{ stype: 'superscript', range: [0, 1] }] },
          { sid: 'text-19b', stype: 'inline-text', text: ', x' },
          { sid: 'text-sup2', stype: 'inline-text', text: '3', marks: [{ stype: 'superscript', range: [0, 1] }] },
          { sid: 'text-20b', stype: 'inline-text', text: ' + y' },
          { sid: 'text-sup3', stype: 'inline-text', text: '2', marks: [{ stype: 'superscript', range: [0, 1] }] },
          { sid: 'text-21b', stype: 'inline-text', text: ' = z' },
          { sid: 'text-sup4', stype: 'inline-text', text: '2', marks: [{ stype: 'superscript', range: [0, 1] }] },
          { sid: 'text-22b', stype: 'inline-text', text: '.' }
        ]
      },
      {
        sid: 'p-5c',
        stype: 'paragraph',
        content: [
          { sid: 'text-23b', stype: 'inline-text', text: 'Typography effects: ' },
          { sid: 'text-smallcaps', stype: 'inline-text', text: 'Small Caps Text', marks: [{ stype: 'smallCaps', range: [0, 15] }] },
          { sid: 'text-24b', stype: 'inline-text', text: ', ' },
          { sid: 'text-letterspacing', stype: 'inline-text', text: 'Wide Letters', marks: [{ stype: 'letterSpacing', range: [0, 12], attrs: { spacing: '0.3em' } }] },
          { sid: 'text-25b', stype: 'inline-text', text: ', ' },
          { sid: 'text-wordspacing', stype: 'inline-text', text: 'Wide Words', marks: [{ stype: 'wordSpacing', range: [0, 10], attrs: { spacing: '0.5em' } }] },
          { sid: 'text-26b', stype: 'inline-text', text: '.' }
        ]
      },
      {
        sid: 'p-5d',
        stype: 'paragraph',
        content: [
          { sid: 'text-27b', stype: 'inline-text', text: 'Advanced styling: ' },
          { sid: 'text-shadow', stype: 'inline-text', text: 'Shadow Text', marks: [{ stype: 'textShadow', range: [0, 11], attrs: { shadow: '2px 2px 4px rgba(0,0,0,0.5)' } }] },
          { sid: 'text-28b', stype: 'inline-text', text: ', ' },
          { sid: 'text-border', stype: 'inline-text', text: 'Bordered Text', marks: [{ stype: 'border', range: [0, 13], attrs: { style: 'dashed', width: '2px', color: '#ff0000' } }] },
          { sid: 'text-29b', stype: 'inline-text', text: ', ' },
          { sid: 'text-lineheight', stype: 'inline-text', text: 'Tall Lines', marks: [{ stype: 'lineHeight', range: [0, 10], attrs: { height: '2.5' } }] },
          { sid: 'text-30b', stype: 'inline-text', text: '.' }
        ]
      },
      {
        sid: 'p-5e',
        stype: 'paragraph',
        content: [
          { sid: 'text-31b', stype: 'inline-text', text: 'Multilingual content: ' },
          { sid: 'text-korean', stype: 'inline-text', text: '안녕하세요', marks: [{ stype: 'bold', range: [0, 5] }] },
          { sid: 'text-32b', stype: 'inline-text', text: ' (Korean), ' },
          { sid: 'text-japanese', stype: 'inline-text', text: 'こんにちは', marks: [{ stype: 'italic', range: [0, 5] }] },
          { sid: 'text-33b', stype: 'inline-text', text: ' (Japanese), ' },
          { sid: 'text-chinese', stype: 'inline-text', text: '你好', marks: [{ stype: 'bold', range: [0, 2] }, { stype: 'italic', range: [0, 2] }] },
          { sid: 'text-34b', stype: 'inline-text', text: ' (Chinese), and emojis: 😀 🚀 ✨' }
        ]
      },
      {
        sid: 'p-6',
        stype: 'paragraph',
        content: [
          { sid: 'text-p6-1', stype: 'inline-text', text: 'Ultimate combinations: ' },
          { sid: 'text-ultimate1', stype: 'inline-text', text: 'Bold+Sub+Shadow', marks: [{ stype: 'bold', range: [0, 16] }, { stype: 'subscript', range: [5, 8] }, { stype: 'textShadow', range: [0, 16], attrs: { shadow: '1px 1px 3px rgba(0,0,0,0.4)' } }] },
          { sid: 'text-22', stype: 'inline-text', text: ', ' },
          { sid: 'text-ultimate2', stype: 'inline-text', text: 'Sup+Italic+Border', marks: [{ stype: 'superscript', range: [0, 3] }, { stype: 'italic', range: [0, 18] }, { stype: 'border', range: [0, 18], attrs: { style: 'solid', width: '1px', color: '#00ff00' } }] },
          { sid: 'text-23', stype: 'inline-text', text: '.' }
        ]
      },
      {
        sid: 'p-6b',
        stype: 'paragraph',
        content: [
          { sid: 'text-p6b-1', stype: 'inline-text', text: 'Special characters: ' },
          { sid: 'text-special', stype: 'inline-text', text: '& < > " \' `', marks: [{ stype: 'bold' }] },
          { sid: 'text-p6b-2', stype: 'inline-text', text: ' and ' },
          { sid: 'text-special2', stype: 'inline-text', text: 'HTML entities', marks: [{ stype: 'italic' }] },
          { sid: 'text-p6b-3', stype: 'inline-text', text: '.' }
        ]
      },
      {
        sid: 'p-7',
        stype: 'paragraph',
        content: [
          { sid: 'text-p7-1', stype: 'inline-text', text: 'Long paragraph with ' },
          { sid: 'text-long-bold', stype: 'inline-text', text: 'multiple bold sections', marks: [{ stype: 'bold' }] },
          { sid: 'text-p7-2', stype: 'inline-text', text: ' and ' },
          { sid: 'text-long-italic', stype: 'inline-text', text: 'multiple italic sections', marks: [{ stype: 'italic' }] },
          { sid: 'text-p7-3', stype: 'inline-text', text: ' interspersed with normal text. This creates a realistic test case for ' },
          { sid: 'text-complex-long', stype: 'inline-text', text: 'complex mark rendering', marks: [{ stype: 'bold' }, { stype: 'italic' }] },
          { sid: 'text-27', stype: 'inline-text', text: ' in a longer paragraph that might wrap to multiple lines and test the rendering system thoroughly.' }
        ]
      },
      {
        sid: 'p-image-only',
        stype: 'paragraph',
        content: [
          { sid: 'img-2', stype: 'inline-image', attributes: { src: 'https://dummyimage.com/200x100/2196F3/white?text=Wide+Image', alt: 'wide banner' } }
        ]
      },
      {
        sid: 'p-8',
        stype: 'paragraph',
        content: [
          { sid: 'text-28', stype: 'inline-text', text: 'Final paragraph with ' },
          { sid: 'img-3', stype: 'inline-image', attributes: { src: 'https://dummyimage.com/16x16/FF9800/white?text=•', alt: 'bullet' } },
          { sid: 'text-29', stype: 'inline-text', text: ' inline image and ' },
          { sid: 'text-final', stype: 'inline-text', text: 'final bold text', marks: [{ stype: 'bold' }] },
          { sid: 'text-30', stype: 'inline-text', text: '.' }
        ]
      },
      {
        sid: 'p-8b',
        stype: 'paragraph',
        content: [
          { sid: 't8b-1', stype: 'inline-text', text: 'Use ' },
          { sid: 't8b-kbd', stype: 'inline-text', text: 'Esc', marks: [{ stype: 'kbd', range: [0, 3] }] },
          { sid: 't8b-2', stype: 'inline-text', text: ' to close. Say hi to ' },
          { sid: 't8b-mention', stype: 'inline-text', text: '@alice', marks: [{ stype: 'mention', range: [0, 6], attrs: { id: 'u1' } }] },
          { sid: 't8b-3', stype: 'inline-text', text: '. Spoiler: ' },
          { sid: 't8b-spoiler', stype: 'inline-text', text: 'secret', marks: [{ stype: 'spoiler', range: [0, 6], attrs: { revealed: false } }] }
        ]
      },
      // New: section with columns/column, blockQuote/pullQuote, codeFence, pageBreak, toc, footnotes
      {
        sid: 'toc-1',
        stype: 'toc'
      },
      {
        sid: 'section-1',
        stype: 'docSection',
        content: [
          { sid: 'columns-1', stype: 'columns', content: [
            { sid: 'col-1', stype: 'column', attributes: { width: '60%' }, content: [
              { sid: 'bq-1', stype: 'blockQuote', content: [ { sid: 'bq-p', stype: 'paragraph', content: [ { sid: 'bq-t', stype: 'inline-text', text: 'A famous quote inside a blockQuote.' } ] } ] }
            ] },
            { sid: 'col-2', stype: 'column', attributes: { width: '40%' }, content: [
              { sid: 'pq-1', stype: 'pullQuote', content: [ { sid: 'pq-t', stype: 'inline-text', text: 'Short pull-quote.' } ] }
            ] }
          ] }
        ]
      },
      {
        sid: 'codef-1',
        stype: 'codeBlock',
        attributes: { language: 'ts' },
        text: `type User = { id: string; name: string };\nconst u: User = { id: '1', name: 'Alice' };`
      },
      {
        sid: 'pb-1',
        stype: 'pageBreak'
      },
      {
        sid: 'doc-footer-1',
        stype: 'docFooter',
        content: [
          { sid: 'df-author-label', stype: 'inline-text', text: 'Author: ' },
          { sid: 'df-author', stype: 'fieldAuthor' },
          { sid: 'df-sep', stype: 'inline-text', text: ' | ' },
          { sid: 'df-date', stype: 'fieldDateTime', attributes: { format: 'YYYY-MM-DD' } }
        ]
      },
      {
        sid: 'p-footnote-ref',
        stype: 'paragraph',
        content: [
          { sid: 'fnr-text-1', stype: 'inline-text', text: 'Here is a footnote' },
          { sid: 'fnr-space', stype: 'inline-text', text: ' ' },
          { sid: 'fnr-mark', stype: 'inline-text', text: '1', marks: [{ stype: 'footnoteRef', range: [0,1], attrs: { id: '1' } }] }
        ]
      },
      {
        sid: 'fn-1',
        stype: 'footnoteDef',
        attributes: { id: '1' },
        content: [ { sid: 'fn-1-text', stype: 'inline-text', text: 'This is the footnote content.' } ]
      },
      // 새로운 섹션들 시작 - blockquote 테스트
      {
        sid: 'h-4',
        stype: 'heading',
        attributes: { level: 2 },
        content: [
          { sid: 'text-h4', stype: 'inline-text', text: 'Document Structure Examples' }
        ]
      },
      {
        sid: 'blockquote-1',
        stype: 'blockQuote',
        content: [
          {
            sid: 'p-quote',
            stype: 'paragraph',
            content: [
              { sid: 'text-quote', stype: 'inline-text', text: 'This is a blockquote example. It demonstrates how quoted text can be styled differently from regular paragraphs.' }
            ]
          }
        ]
      },
      {
        sid: 'code-block-1',
        stype: 'codeBlock',
        attributes: { language: 'javascript' },
        text: `function renderDocument(model) {
  const renderer = new DOMRenderer();
  return renderer.render(container, model);
}

// This is a code block example
const result = renderDocument(initialTree);`
      },
      {
        sid: 'hr-1',
        stype: 'horizontalRule'
      },
      {
        sid: 'h-5',
        stype: 'heading',
        attributes: { level: 3 },
        content: [
          { sid: 'text-h5', stype: 'inline-text', text: 'Lists and Tables' }
        ]
      },
      {
        sid: 'list-1',
        stype: 'list',
        attributes: { type: 'bullet' },
        content: [
          {
            sid: 'list-item-1',
            stype: 'listItem',
            content: [
              {
                sid: 'p-list-1',
                stype: 'paragraph',
                content: [
                  { sid: 'text-list-1', stype: 'inline-text', text: 'First bullet point with ' },
                  { sid: 'text-list-bold', stype: 'inline-text', text: 'bold text', marks: [{ stype: 'bold', range: [0, 9] }] }
                ]
              }
            ]
          },
          {
            sid: 'list-item-2',
            stype: 'listItem',
            content: [
              {
                sid: 'p-list-2',
                stype: 'paragraph',
                content: [
                  { sid: 'text-list-2', stype: 'inline-text', text: 'Second bullet point with ' },
                  { sid: 'text-list-italic', stype: 'inline-text', text: 'italic text', marks: [{ stype: 'italic', range: [0, 10] }] }
                ]
              }
            ]
          }
        ]
      },
      {
        sid: 'list-tasks',
        stype: 'list',
        attributes: { type: 'bullet' },
        content: [
          { sid: 'task-1', stype: 'taskItem', attributes: { checked: true }, content: [ { sid: 'task-1-text', stype: 'inline-text', text: 'Completed task' } ] },
          { sid: 'task-2', stype: 'taskItem', attributes: { checked: false }, content: [ { sid: 'task-2-text', stype: 'inline-text', text: 'Open task' } ] }
        ]
      },
      {
        sid: 'list-2',
        stype: 'list',
        attributes: { type: 'ordered' },
        content: [
          {
            sid: 'list-item-4',
            stype: 'listItem',
            content: [
              {
                sid: 'p-list-4',
                stype: 'paragraph',
                content: [
                  { sid: 'text-list-4', stype: 'inline-text', text: 'First numbered item' }
                ]
              }
            ]
          },
          {
            sid: 'list-item-5',
            stype: 'listItem',
            content: [
              {
                sid: 'p-list-5',
                stype: 'paragraph',
                content: [
                  { sid: 'text-list-5', stype: 'inline-text', text: 'Second numbered item with ' },
                  { sid: 'text-list-link', stype: 'inline-text', text: 'a link', marks: [{ stype: 'link', range: [0, 6], attrs: { href: 'https://example.com' } }] }
                ]
              },
              {
                sid: 'list-2-nested',
                stype: 'list',
                attributes: { type: 'bullet' },
                content: [
                  {
                    sid: 'list-2-nested-item-1',
                    stype: 'listItem',
                    content: [
                      { sid: 'p-list-2-nested-1', stype: 'paragraph', content: [ { sid: 'text-list-2-nested-1', stype: 'inline-text', text: 'Nested bullet A' } ] }
                    ]
                  },
                  {
                    sid: 'list-2-nested-item-2',
                    stype: 'listItem',
                    content: [
                      { sid: 'p-list-2-nested-2', stype: 'paragraph', content: [ { sid: 'text-list-2-nested-2', stype: 'inline-text', text: 'Nested bullet B' } ] }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      },
      {
        sid: 'list-3',
        stype: 'list',
        attributes: { type: 'ordered' },
        content: [
          {
            sid: 'list-item-6',
            stype: 'listItem',
            content: [
              { sid: 'p-list-6', stype: 'paragraph', content: [ { sid: 'text-list-6', stype: 'inline-text', text: 'Third numbered item' } ] }
            ]
          },
          {
            sid: 'list-item-7',
            stype: 'listItem',
            content: [
              { sid: 'p-list-7', stype: 'paragraph', content: [ { sid: 'text-list-7', stype: 'inline-text', text: 'Fourth numbered item' } ] }
            ]
          }
        ]
      },
      {
        sid: 'table-1',
        stype: 'bTable',
        attributes: { caption: 'Sample Table' },
        content: [
          { sid: 'table-head-1', stype: 'bTableHeader', content: [
            { sid: 'table-hcell-1', stype: 'bTableHeaderCell', content: [ { sid: 'p-th-1', stype: 'paragraph', content: [ { sid: 't-th-1', stype: 'inline-text', text: 'Header 1' } ] } ] },
            { sid: 'table-hcell-2', stype: 'bTableHeaderCell', content: [ { sid: 'p-th-2', stype: 'paragraph', content: [ { sid: 't-th-2', stype: 'inline-text', text: 'Header 2' } ] } ] },
            { sid: 'table-hcell-3', stype: 'bTableHeaderCell', content: [ { sid: 'p-th-3', stype: 'paragraph', content: [ { sid: 't-th-3', stype: 'inline-text', text: 'Header 3' } ] } ] }
          ] },
          { sid: 'table-body-1', stype: 'bTableBody', content: [
            { sid: 'table-row-2', stype: 'bTableRow', content: [
              {
                sid: 'table-cell-4',
                stype: 'bTableCell',
                content: [
                  {
                    sid: 'p-table-4',
                    stype: 'paragraph',
                    content: [
                      { sid: 'text-table-4', stype: 'inline-text', text: 'Cell 1,1' }
                    ]
                  }
                ]
              },
              {
                sid: 'table-cell-5',
                stype: 'bTableCell',
                content: [
                  {
                    sid: 'p-table-5',
                    stype: 'paragraph',
                    content: [
                      { sid: 'text-table-5', stype: 'inline-text', text: 'Cell 1,2 with ' },
                      { sid: 'text-table-bold', stype: 'inline-text', text: 'bold', marks: [{ stype: 'bold', range: [0, 4] }] }
                    ]
                  }
                ]
              },
              {
                sid: 'table-cell-6',
                stype: 'bTableCell',
                content: [
                  {
                    sid: 'p-table-6',
                    stype: 'paragraph',
                    content: [
                      { sid: 'text-table-6', stype: 'inline-text', text: 'Cell 1,3 with ' },
                      { sid: 'text-table-italic', stype: 'inline-text', text: 'italic', marks: [{ stype: 'italic', range: [0, 6] }] }
                    ]
                  }
                ]
              }
            ] },
            { sid: 'table-row-3', stype: 'bTableRow', content: [
              {
                sid: 'table-cell-7',
                stype: 'bTableCell',
                content: [
                  {
                    sid: 'p-table-7',
                    stype: 'paragraph',
                    content: [
                      { sid: 'text-table-7', stype: 'inline-text', text: 'Cell 2,1' }
                    ]
                  }
                ]
              },
              {
                sid: 'table-cell-8',
                stype: 'bTableCell',
                attributes: { colspan: 2 },
                content: [
                  {
                    sid: 'p-table-8',
                    stype: 'paragraph',
                    content: [
                      { sid: 'text-table-8', stype: 'inline-text', text: 'Merged cell spanning 2 columns' }
                    ]
                  }
                ]
              }
            ] }
          ]}
        ]
      },
      {
        sid: 'h-6',
        stype: 'heading',
        attributes: { level: 3 },
        content: [
          { sid: 'text-h6', stype: 'inline-text', text: 'Advanced Table' }
        ]
      },
      {
        sid: 'table-2',
        stype: 'bTable',
        attributes: { caption: 'Rowspan Example' },
        content: [
          { sid: 'table2-head', stype: 'bTableHeader', content: [
            { sid: 'table2-hcell-1', stype: 'bTableHeaderCell', content: [ { sid: 'p-t2hh1', stype: 'paragraph', content: [ { sid: 't2hh1', stype: 'inline-text', text: 'Name' } ] } ] },
            { sid: 'table2-hcell-2', stype: 'bTableHeaderCell', content: [ { sid: 'p-t2hh2', stype: 'paragraph', content: [ { sid: 't2hh2', stype: 'inline-text', text: 'Group' } ] } ] },
            { sid: 'table2-hcell-3', stype: 'bTableHeaderCell', content: [ { sid: 'p-t2hh3', stype: 'paragraph', content: [ { sid: 't2hh3', stype: 'inline-text', text: 'Notes' } ] } ] }
          ] },
          { sid: 'table2-body', stype: 'bTableBody', content: [
            { sid: 'table2-row-2', stype: 'bTableRow', content: [
              { sid: 'table2-c-1', stype: 'bTableCell', attributes: { rowspan: 2 }, content: [ { sid: 'p-t2c1', stype: 'paragraph', content: [ { sid: 't2c1', stype: 'inline-text', text: 'Alice' } ] } ] },
              { sid: 'table2-c-2', stype: 'bTableCell', content: [ { sid: 'p-t2c2', stype: 'paragraph', content: [ { sid: 't2c2', stype: 'inline-text', text: 'A' } ] } ] },
              { sid: 'table2-c-3', stype: 'bTableCell', content: [ { sid: 'p-t2c3', stype: 'paragraph', content: [ { sid: 't2c3', stype: 'inline-text', text: 'Rowspan starts here' } ] } ] }
            ] },
            { sid: 'table2-row-3', stype: 'bTableRow', content: [
              { sid: 'table2-c-5', stype: 'bTableCell', content: [ { sid: 'p-t2c5', stype: 'paragraph', content: [ { sid: 't2c5', stype: 'inline-text', text: 'A' } ] } ] },
              { sid: 'table2-c-6', stype: 'bTableCell', content: [ { sid: 'p-t2c6', stype: 'paragraph', content: [ { sid: 't2c6', stype: 'inline-text', text: 'Continues under Alice' } ] } ] }
            ] }
          ]}
        ]
      },
      {
        sid: 'figure-1',
        stype: 'bFigure',
        content: [
          { sid: 'fig-img', stype: 'inline-image', attributes: { src: 'https://dummyimage.com/300x120/555/fff?text=Figure', alt: 'figure' } },
          { sid: 'fig-cap', stype: 'bFigcaption', content: [ { sid: 'fig-cap-text', stype: 'inline-text', text: 'An example figure with caption.' } ] }
        ]
      },
      {
        sid: 'chart-1',
        stype: 'chart',
        attributes: { title: 'Visitors (last 5 days)', values: '12, 35, 28, 44, 18' }
      },
      {
        sid: 'comment-1',
        stype: 'commentThread',
        attributes: { id: 'cmt-1' },
        content: [ { sid: 'cmt-text', stype: 'inline-text', text: 'Review this table caption.' } ]
      },
      {
        sid: 'callout-1',
        stype: 'callout',
        attributes: { type: 'warning', title: 'Caution' },
        content: [ { sid: 'callout-p', stype: 'paragraph', content: [ { sid: 'callout-text', stype: 'inline-text', text: 'Be careful when editing complex tables.' } ] } ]
      },
      {
        sid: 'details-1',
        stype: 'bDetails',
        content: [
          { sid: 'summary-1', stype: 'bSummary', content: [ { sid: 'summary-text', stype: 'inline-text', text: 'More information' } ] },
          { sid: 'details-p', stype: 'paragraph', content: [ { sid: 'details-text', stype: 'inline-text', text: 'Hidden details shown when expanded.' } ] }
        ]
      },
      {
        sid: 'dl-1',
        stype: 'descList',
        content: [
          { sid: 'dt-1', stype: 'descTerm', content: [ { sid: 'dt1-text', stype: 'inline-text', text: 'Term' } ] },
          { sid: 'dd-1', stype: 'descDef', content: [ { sid: 'dd1-p', stype: 'paragraph', content: [ { sid: 'dd1-text', stype: 'inline-text', text: 'Definition of the term.' } ] } ] }
        ]
      },
      {
        sid: 'media-1',
        stype: 'mediaVideo',
        attributes: { src: 'https://www.w3schools.com/html/mov_bbb.mp4', poster: '', controls: true }
      },
      {
        sid: 'media-2',
        stype: 'mediaAudio',
        attributes: { src: 'https://www.w3schools.com/html/horse.mp3', controls: true }
      },
      {
        sid: 'embed-1',
        stype: 'mediaEmbed',
        attributes: { provider: 'youtube', id: 'dQw4w9WgXcQ', title: 'YouTube' }
      },
      {
        sid: 'math-1',
        stype: 'mathBlock',
        attributes: { tex: 'E=mc^2', engine: 'katex' }
      },
      {
        sid: 'p-lang',
        stype: 'paragraph',
        content: [
          { sid: 'lang-1', stype: 'inline-text', text: 'مرحبا', marks: [{ stype: 'spanLang', range: [0, 5], attrs: { lang: 'ar', dir: 'rtl' } }] },
          { sid: 'lang-2', stype: 'inline-text', text: ' — mixed language demo with references ' },
          { sid: 'bm-anchor', stype: 'bookmarkAnchor', attributes: { id: 'ref-1' } },
          { sid: 'xref-text', stype: 'inline-text', text: 'see ' },
          { sid: 'xref-mark', stype: 'inline-text', text: 'reference', marks: [{ stype: 'xref', range: [0, 9], attrs: { target: 'ref-1', label: 'reference' } }] }
        ]
      },
      {
        sid: 'idx-1',
        stype: 'indexBlock',
        content: [
          { sid: 'idx-h', stype: 'paragraph', content: [ { sid: 'idx-ht', stype: 'inline-text', text: 'Index (sample terms)' } ] }
        ]
      }
      */
    ]
  } as any;
  
  // Reuse existing Editor instance if it exists (prevent HMR)
  let editor: Editor;
  if (window.__editor) {
    editor = window.__editor;
  } else {
    // Register all Extensions (basic editing features + additional features)
    const coreExtensions = createCoreExtensions();
    const basicExtensions = createBasicExtensions();
    
    editor = new Editor({ 
      editable: true, 
      schema, 
      dataStore,
      extensions: [...coreExtensions, ...basicExtensions]
    });
    editor.loadDocument(initialTree, 'editor-test');
    window.__editor = editor;
  }

  // define is immediately registered in global registry
  define('document', element('div', {className: 'document'}, [slot('content')]));
  define('heading', element((model: any) => `h${model.attributes.level || 1}`, { className: 'heading' }, [slot('content')]));
  define('paragraph', element('p', { className: 'paragraph', 'data-placeholder': attr('placeholder', '') }, [slot('content')]));
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
  define('emoji', element('span', {
    className: 'emoji',
    'data-emoji': 'true',
    'data-shortcode': attr('shortcode', ''),
    'data-unicode': attr('unicode', ''),
  }, [text((d: any) => (d?.attributes?.unicode ?? d?.attributes?.shortcode ?? ''))]));
  
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

  define('mathInline', {
    managesDOM: true,
    mount(props: any, container: HTMLElement) {
      const tex = props?.attributes?.tex ?? '';
      const el = document.createElement('span');
      el.className = 'math-inline';
      el.setAttribute('data-engine', props?.attributes?.engine ?? 'katex');
      _renderMathToElement(el, tex, false);
      container.appendChild(el);
      return el;
    },
    unmount(instance: any) { (instance?.element as HTMLElement)?.remove?.(); }
  } as any);
  define('mathBlock', {
    managesDOM: true,
    mount(props: any, container: HTMLElement) {
      const tex = props?.attributes?.tex ?? '';
      const el = document.createElement('div');
      el.className = 'math-block';
      el.setAttribute('data-engine', props?.attributes?.engine ?? 'katex');
      _renderMathToElement(el, tex, true);
      container.appendChild(el);
      return el;
    },
    unmount(instance: any) { (instance?.element as HTMLElement)?.remove?.(); }
  } as any);

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

  // Reuse existing EditorViewDOM instance if it exists (prevent HMR)
  let view: EditorViewDOM;
  if (window.__editorViewDOM) {
    view = window.__editorViewDOM;
  } else {
    view = new EditorViewDOM(editor, { container, registry: getGlobalRegistry() });
  view.render();
    window.__editorViewDOM = view;
  }
  
  // Expose editor instance globally for debugging
  (window as any).editor = editor;
  (window as any).editorView = view;
  
  // Initialize Devtool (Auto Tracing enabled)
  const devtoolContainer = document.getElementById('devtool-container');
  const devtool = new Devtool({
    editor,
    maxEvents: 500,
    debug: false,
    enableAutoTracing: true,  // Enable Auto Tracing
    container: devtoolContainer || undefined,
  });
  (window as any).devtool = devtool;

  console.log('[editor-test] Devtool initialized with Auto Tracing enabled');

  // Toolbar for manual testing (Bold, Italic, Heading, Paragraph, etc.)
  // Click + save/restore selection: on mousedown (on each format button) save selection; on click restore then run command.
  const toolbarEl = document.getElementById('editor-toolbar');
  if (toolbarEl) {
    let savedSelection: any = null;
    const contentLayer = view.layers?.content;
    const commands: { label: string; command: string; title?: string }[] = [
      { label: 'B', command: 'toggleBold', title: 'Bold (Ctrl+B)' },
      { label: 'I', command: 'toggleItalic', title: 'Italic (Ctrl+I)' },
      { label: 'H1', command: 'setHeading1', title: 'Heading 1' },
      { label: 'H2', command: 'setHeading2', title: 'Heading 2' },
      { label: 'H3', command: 'setHeading3', title: 'Heading 3' },
      { label: 'P', command: 'setParagraph', title: 'Paragraph' },
    ];
    commands.forEach(({ label, command, title }) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = label;
      if (title) btn.title = title;
      btn.addEventListener('mousedown', () => {
        const sel = (editor as any).selection;
        savedSelection = sel ? { ...sel } : null;
      });
      btn.addEventListener('click', () => {
        if (contentLayer) contentLayer.focus();
        if (savedSelection) (editor as any).updateSelection?.(savedSelection);
        (editor as any).executeCommand?.(command);
        savedSelection = null;
      });
      toolbarEl.appendChild(btn);
    });
    const sep = document.createElement('span');
    sep.className = 'toolbar-sep';
    sep.setAttribute('aria-hidden', 'true');
    toolbarEl.appendChild(sep);
    const undoBtn = document.createElement('button');
    undoBtn.type = 'button';
    undoBtn.textContent = 'Undo';
    undoBtn.title = 'Undo (Ctrl+Z)';
    undoBtn.addEventListener('click', () => (editor as any).undo?.());
    toolbarEl.appendChild(undoBtn);
    const redoBtn = document.createElement('button');
    redoBtn.type = 'button';
    redoBtn.textContent = 'Redo';
    redoBtn.title = 'Redo (Ctrl+Shift+Z)';
    redoBtn.addEventListener('click', () => (editor as any).redo?.());
    toolbarEl.appendChild(redoBtn);
  }

  // // Model coordinate-based selection test buttons
  // const testSelectionButton = document.getElementById('test-selection');
  // testSelectionButton?.addEventListener('click', () => {
  //   console.log('=== Model coordinate-based Selection test ===');
    
  //   // 1. Simple text selection (text-1: "This is a ")
  //   const simpleSelection = {
  //     type: 'text',
  //     anchor: { nodeId: 'text-1', offset: 0 },
  //     focus: { nodeId: 'text-1', offset: 9 }
  //   };
  //   console.log('1. Simple text selection:', simpleSelection);
  //   view.selectionHandler?.convertModelSelectionToDOM(simpleSelection);
    
  //   setTimeout(() => {
  //     const selection = window.getSelection();
  //     console.log('Selection result:', {
  //       rangeCount: selection?.rangeCount,
  //       text: selection?.toString(),
  //       anchorNode: selection?.anchorNode,
  //       anchorOffset: selection?.anchorOffset,
  //       focusNode: selection?.focusNode,
  //       focusOffset: selection?.focusOffset
  //     });
  //   }, 100);
  // });

  // const testBoldSelectionButton = document.getElementById('test-bold-selection');
  // testBoldSelectionButton?.addEventListener('click', () => {
  //   console.log('=== Selection test with marked text ===');
    
  //   // 2. Text selection with marks (text-bold: "bold text")
  //   const boldSelection = {
  //     type: 'text',
  //     anchor: { nodeId: 'text-bold', offset: 0 },
  //     focus: { nodeId: 'text-bold', offset: 9 }
  //   };
  //   console.log('2. Text selection with marks:', boldSelection);
  //   view.selectionHandler?.convertModelSelectionToDOM(boldSelection);
    
  //   setTimeout(() => {
  //     const selection = window.getSelection();
  //     console.log('Selection result:', {
  //       rangeCount: selection?.rangeCount,
  //       text: selection?.toString(),
  //       anchorNode: selection?.anchorNode,
  //       anchorOffset: selection?.anchorOffset,
  //       focusNode: selection?.focusNode,
  //       focusOffset: selection?.focusOffset
  //     });
  //   }, 100);
  // });

  // const testComplexSelectionButton = document.getElementById('test-complex-selection');
  // testComplexSelectionButton?.addEventListener('click', () => {
  //   console.log('=== Complex mark text Selection test ===');
    
  //   // 3. Text selection with complex marks (text-bold-italic: "bold and italic")
  //   const complexSelection = {
  //     type: 'text',
  //     anchor: { nodeId: 'text-bold-italic', offset: 0 },
  //     focus: { nodeId: 'text-bold-italic', offset: 15 }
  //   };
  //   console.log('3. Complex mark text selection:', complexSelection);
  //   view.selectionHandler?.convertModelSelectionToDOM(complexSelection);
    
  //   setTimeout(() => {
  //     const selection = window.getSelection();
  //     console.log('Selection result:', {
  //       rangeCount: selection?.rangeCount,
  //       text: selection?.toString(),
  //       anchorNode: selection?.anchorNode,
  //       anchorOffset: selection?.anchorOffset,
  //       focusNode: selection?.focusNode,
  //       focusOffset: selection?.focusOffset
  //     });
  //   }, 100);
  // });

  // const testCrossNodeSelectionButton = document.getElementById('test-cross-node-selection');
  // testCrossNodeSelectionButton?.addEventListener('click', () => {
  //   console.log('=== 다른 노드 간 Selection 테스트 ===');
    
  //   // 4. 다른 텍스트 노드 간 선택
  //   const crossNodeSelection = {
  //     type: 'text',
  //     anchor: { nodeId: 'text-1', offset: 5 }, // "This is a "에서 "is a "
  //     focus: { nodeId: 'text-bold', offset: 4 } // "bold text"에서 "d text"
  //   };
  //   console.log('4. 다른 노드 간 선택:', crossNodeSelection);
  //   view.selectionHandler?.convertModelSelectionToDOM(crossNodeSelection);
    
  //   setTimeout(() => {
  //     const selection = window.getSelection();
  //     console.log('선택 결과:', {
  //       rangeCount: selection?.rangeCount,
  //       text: selection?.toString(),
  //       anchorNode: selection?.anchorNode,
  //       anchorOffset: selection?.anchorOffset,
  //       focusNode: selection?.focusNode,
  //       focusOffset: selection?.focusOffset
  //     });
  //   }, 100);
  // });

  // const testNodeSelectionButton = document.getElementById('test-node-selection');
  // testNodeSelectionButton?.addEventListener('click', () => {
  //   console.log('=== 노드 전체 Selection 테스트 ===');
    
  //   // 5. 노드 전체 선택
  //   const nodeSelection = {
  //     type: 'node',
  //     nodeId: 'text-bold'
  //   };
  //   console.log('5. 노드 전체 선택:', nodeSelection);
  //   view.selectionHandler?.convertModelSelectionToDOM(nodeSelection);
    
  //   setTimeout(() => {
  //     const selection = window.getSelection();
  //     console.log('선택 결과:', {
  //       rangeCount: selection?.rangeCount,
  //       text: selection?.toString(),
  //       anchorNode: selection?.anchorNode,
  //       anchorOffset: selection?.anchorOffset,
  //       focusNode: selection?.focusNode,
  //       focusOffset: selection?.focusOffset
  //     });
  //   }, 100);
  // });

  // const testLinkSelectionButton = document.getElementById('test-link-selection');
  // testLinkSelectionButton?.addEventListener('click', () => {
  //   console.log('=== 링크가 있는 텍스트 Selection 테스트 ===');
    
  //   // 6. 링크가 있는 텍스트 선택 (text-link: "Visit Google")
  //   const linkSelection = {
  //     type: 'text',
  //     anchor: { nodeId: 'text-link', offset: 0 },
  //     focus: { nodeId: 'text-link', offset: 12 }
  //   };
  //   console.log('6. 링크가 있는 텍스트 선택:', linkSelection);
  //   view.selectionHandler?.convertModelSelectionToDOM(linkSelection);
    
  //   setTimeout(() => {
  //     const selection = window.getSelection();
  //     console.log('선택 결과:', {
  //       rangeCount: selection?.rangeCount,
  //       text: selection?.toString(),
  //       anchorNode: selection?.anchorNode,
  //       anchorOffset: selection?.anchorOffset,
  //       focusNode: selection?.focusNode,
  //       focusOffset: selection?.focusOffset
  //     });
  //   }, 100);
  // });

  // const testLinkNodeSelectionButton = document.getElementById('test-link-node-selection');
  // testLinkNodeSelectionButton?.addEventListener('click', () => {
  //   console.log('=== 링크 노드 전체 Selection 테스트 ===');
    
  //   // 7. 링크 노드 전체 선택
  //   const linkNodeSelection = {
  //     type: 'node',
  //     nodeId: 'text-link'
  //   };
  //   console.log('7. 링크 노드 전체 선택:', linkNodeSelection);
  //   view.selectionHandler?.convertModelSelectionToDOM(linkNodeSelection);
    
  //   setTimeout(() => {
  //     const selection = window.getSelection();
  //     console.log('선택 결과:', {
  //       rangeCount: selection?.rangeCount,
  //       text: selection?.toString(),
  //       anchorNode: selection?.anchorNode,
  //       anchorOffset: selection?.anchorOffset,
  //       focusNode: selection?.focusNode,
  //       focusOffset: selection?.focusOffset
  //     });
  //   }, 100);
  // });

  // // 경계값 테스트 버튼들
  // const testFirstCharButton = document.getElementById('test-first-char');
  // testFirstCharButton?.addEventListener('click', () => {
  //   console.log('=== 첫 번째 문자 선택 테스트 ===');
  //   const firstCharSelection = {
  //     type: 'text',
  //     anchor: { nodeId: 'text-1', offset: 0 },
  //     focus: { nodeId: 'text-1', offset: 1 }
  //   };
  //   console.log('첫 번째 문자 선택:', firstCharSelection);
  //   view.selectionHandler?.convertModelSelectionToDOM(firstCharSelection);
    
  //   setTimeout(() => {
  //     const selection = window.getSelection();
  //     console.log('선택 결과:', {
  //       rangeCount: selection?.rangeCount,
  //       text: selection?.toString(),
  //       anchorOffset: selection?.anchorOffset,
  //       focusOffset: selection?.focusOffset
  //     });
  //   }, 100);
  // });

  // const testLastCharButton = document.getElementById('test-last-char');
  // testLastCharButton?.addEventListener('click', () => {
  //   console.log('=== 마지막 문자 선택 테스트 ===');
    
  //   // 먼저 text-1 요소의 정보를 확인
  //   const text1Element = document.querySelector('[data-bc-sid="text-1"]');
  //   if (text1Element) {
  //     console.log('text-1 요소 정보:', {
  //       textContent: text1Element.textContent,
  //       textLength: text1Element.textContent?.length,
  //       innerHTML: text1Element.innerHTML
  //     });
      
  //     // Text Run Index도 확인
  //     try {
  //       const runs = buildTextRunIndex(text1Element);
  //       console.log('Text Run Index:', {
  //         total: runs.total,
  //         runs: runs.runs.map(run => ({
  //           start: run.start,
  //           end: run.end,
  //           text: run.domTextNode.textContent
  //         }))
  //       });
  //     } catch (error) {
  //       console.error('Text Run Index 생성 실패:', error);
  //     }
  //   }
    
  //   const lastCharSelection = {
  //     type: 'text',
  //     anchor: { nodeId: 'text-1', offset: 8 },
  //     focus: { nodeId: 'text-1', offset: 9 }
  //   };
  //   console.log('마지막 문자 선택:', lastCharSelection);
  //   view.selectionHandler?.convertModelSelectionToDOM(lastCharSelection);
    
  //   setTimeout(() => {
  //     const selection = window.getSelection();
  //     console.log('선택 결과:', {
  //       rangeCount: selection?.rangeCount,
  //       text: selection?.toString(),
  //       anchorOffset: selection?.anchorOffset,
  //       focusOffset: selection?.focusOffset
  //     });
  //   }, 100);
  // });

  // const testCollapsedSelectionButton = document.getElementById('test-collapsed-selection');
  // testCollapsedSelectionButton?.addEventListener('click', () => {
  //   console.log('=== 빈 선택 (Collapsed) 테스트 ===');
  //   const collapsedSelection = {
  //     type: 'text',
  //     anchor: { nodeId: 'text-1', offset: 5 },
  //     focus: { nodeId: 'text-1', offset: 5 }
  //   };
  //   console.log('빈 선택:', collapsedSelection);
  //   view.selectionHandler?.convertModelSelectionToDOM(collapsedSelection);
    
  //   setTimeout(() => {
  //     const selection = window.getSelection();
  //     console.log('선택 결과:', {
  //       rangeCount: selection?.rangeCount,
  //       text: selection?.toString(),
  //       anchorOffset: selection?.anchorOffset,
  //       focusOffset: selection?.focusOffset,
  //       collapsed: selection?.getRangeAt(0)?.collapsed
  //     });
  //   }, 100);
  // });

  // // 복잡한 시나리오 테스트 버튼들
  // const testLongTextButton = document.getElementById('test-long-text');
  // testLongTextButton?.addEventListener('click', () => {
  //   console.log('=== 긴 텍스트 중간 선택 테스트 ===');
  //   const longTextSelection = {
  //     type: 'text',
  //     anchor: { nodeId: 'text-27', offset: 10 },
  //     focus: { nodeId: 'text-27', offset: 50 }
  //   };
  //   console.log('긴 텍스트 중간 선택:', longTextSelection);
  //   view.selectionHandler?.convertModelSelectionToDOM(longTextSelection);
    
  //   setTimeout(() => {
  //     const selection = window.getSelection();
  //     console.log('선택 결과:', {
  //       rangeCount: selection?.rangeCount,
  //       text: selection?.toString(),
  //       anchorOffset: selection?.anchorOffset,
  //       focusOffset: selection?.focusOffset
  //     });
  //   }, 100);
  // });

  // const testTableTextButton = document.getElementById('test-table-text');
  // testTableTextButton?.addEventListener('click', () => {
  //   console.log('=== 테이블 셀 텍스트 선택 테스트 ===');
  //   const tableTextSelection = {
  //     type: 'text',
  //     anchor: { nodeId: 'text-table-4', offset: 0 },
  //     focus: { nodeId: 'text-table-4', offset: 7 }
  //   };
  //   console.log('테이블 셀 텍스트 선택:', tableTextSelection);
  //   view.selectionHandler?.convertModelSelectionToDOM(tableTextSelection);
    
  //   setTimeout(() => {
  //     const selection = window.getSelection();
  //     console.log('선택 결과:', {
  //       rangeCount: selection?.rangeCount,
  //       text: selection?.toString(),
  //       anchorOffset: selection?.anchorOffset,
  //       focusOffset: selection?.focusOffset
  //     });
  //   }, 100);
  // });

  // const testListTextButton = document.getElementById('test-list-text');
  // testListTextButton?.addEventListener('click', () => {
  //   console.log('=== 리스트 아이템 텍스트 선택 테스트 ===');
  //   const listTextSelection = {
  //     type: 'text',
  //     anchor: { nodeId: 'text-list-1', offset: 0 },
  //     focus: { nodeId: 'text-list-1', offset: 20 }
  //   };
  //   console.log('리스트 아이템 텍스트 선택:', listTextSelection);
  //   view.selectionHandler?.convertModelSelectionToDOM(listTextSelection);
    
  //   setTimeout(() => {
  //     const selection = window.getSelection();
  //     console.log('선택 결과:', {
  //       rangeCount: selection?.rangeCount,
  //       text: selection?.toString(),
  //       anchorOffset: selection?.anchorOffset,
  //       focusOffset: selection?.focusOffset
  //     });
  //   }, 100);
  // });

  // // 에러 케이스 테스트 버튼들
  // const testInvalidNodeButton = document.getElementById('test-invalid-node');
  // testInvalidNodeButton?.addEventListener('click', () => {
  //   console.log('=== 잘못된 노드 선택 테스트 ===');
  //   const invalidNodeSelection = {
  //     type: 'text',
  //     anchor: { nodeId: 'invalid-node-id', offset: 0 },
  //     focus: { nodeId: 'invalid-node-id', offset: 5 }
  //   };
  //   console.log('잘못된 노드 선택:', invalidNodeSelection);
  //   view.selectionHandler?.convertModelSelectionToDOM(invalidNodeSelection);
    
  //   setTimeout(() => {
  //     const selection = window.getSelection();
  //     console.log('선택 결과:', {
  //       rangeCount: selection?.rangeCount,
  //       text: selection?.toString()
  //     });
  //   }, 100);
  // });

  // const testOutOfRangeButton = document.getElementById('test-out-of-range');
  // testOutOfRangeButton?.addEventListener('click', () => {
  //   console.log('=== 범위 초과 선택 테스트 ===');
  //   const outOfRangeSelection = {
  //     type: 'text',
  //     anchor: { nodeId: 'text-1', offset: 0 },
  //     focus: { nodeId: 'text-1', offset: 1000 }
  //   };
  //   console.log('범위 초과 선택:', outOfRangeSelection);
  //   view.selectionHandler?.convertModelSelectionToDOM(outOfRangeSelection);
    
  //   setTimeout(() => {
  //     const selection = window.getSelection();
  //     console.log('선택 결과:', {
  //       rangeCount: selection?.rangeCount,
  //       text: selection?.toString()
  //     });
  //   }, 100);
  // });

  // const testNegativeOffsetButton = document.getElementById('test-negative-offset');
  // testNegativeOffsetButton?.addEventListener('click', () => {
  //   console.log('=== 음수 offset 선택 테스트 ===');
  //   const negativeOffsetSelection = {
  //     type: 'text',
  //     anchor: { nodeId: 'text-1', offset: -5 },
  //     focus: { nodeId: 'text-1', offset: 5 }
  //   };
  //   console.log('음수 offset 선택:', negativeOffsetSelection);
  //   view.selectionHandler?.convertModelSelectionToDOM(negativeOffsetSelection);
    
  //   setTimeout(() => {
  //     const selection = window.getSelection();
  //     console.log('선택 결과:', {
  //       rangeCount: selection?.rangeCount,
  //       text: selection?.toString()
  //     });
  //   }, 100);
  // });

  // // 실용적인 시나리오 테스트 버튼들
  // const testWordSelectionButton = document.getElementById('test-word-selection');
  // testWordSelectionButton?.addEventListener('click', () => {
  //   console.log('=== 단어 단위 선택 테스트 ===');
  //   const wordSelection = {
  //     type: 'text',
  //     anchor: { nodeId: 'text-1', offset: 0 },
  //     focus: { nodeId: 'text-1', offset: 4 }
  //   };
  //   console.log('단어 단위 선택 (This):', wordSelection);
  //   view.selectionHandler?.convertModelSelectionToDOM(wordSelection);
    
  //   setTimeout(() => {
  //     const selection = window.getSelection();
  //     console.log('선택 결과:', {
  //       rangeCount: selection?.rangeCount,
  //       text: selection?.toString(),
  //       anchorOffset: selection?.anchorOffset,
  //       focusOffset: selection?.focusOffset
  //     });
  //   }, 100);
  // });

  // const testSentenceSelectionButton = document.getElementById('test-sentence-selection');
  // testSentenceSelectionButton?.addEventListener('click', () => {
  //   console.log('=== 문장 단위 선택 테스트 ===');
  //   const sentenceSelection = {
  //     type: 'text',
  //     anchor: { nodeId: 'text-1', offset: 0 },
  //     focus: { nodeId: 'text-1', offset: 10 }
  //   };
  //   console.log('문장 단위 선택 (This is a ):', sentenceSelection);
  //   view.selectionHandler?.convertModelSelectionToDOM(sentenceSelection);
    
  //   setTimeout(() => {
  //     const selection = window.getSelection();
  //     console.log('선택 결과:', {
  //       rangeCount: selection?.rangeCount,
  //       text: selection?.toString(),
  //       anchorOffset: selection?.anchorOffset,
  //       focusOffset: selection?.focusOffset
  //     });
  //   }, 100);
  // });

  // const clearSelectionButton = document.getElementById('clear-selection');
  // clearSelectionButton?.addEventListener('click', () => {
  //   console.log('=== 선택 해제 ===');
  //   view.selectionHandler?.convertModelSelectionToDOM({ type: 'none' });
    
  //   setTimeout(() => {
  //     const selection = window.getSelection();
  //     console.log('선택 해제 결과:', {
  //       rangeCount: selection?.rangeCount,
  //       text: selection?.toString()
  //     });
  //   }, 100);
  // });

  // // 복잡한 중첩 마크 테스트
  // const testNestedMarksButton = document.getElementById('test-nested-marks');
  // testNestedMarksButton?.addEventListener('click', () => {
  //   console.log('=== 중첩 마크 선택 테스트 ===');
  //   // Bold+Superscript+Italic+Border 조합 선택
  //   const nestedMarksSelection = {
  //     type: 'text',
  //     anchor: { nodeId: 'text-ultimate-1', offset: 0 },
  //     focus: { nodeId: 'text-ultimate-1', offset: 15 }
  //   };
  //   console.log('중첩 마크 선택:', nestedMarksSelection);
  //   view.selectionHandler?.convertModelSelectionToDOM(nestedMarksSelection);
    
  //   setTimeout(() => {
  //     const selection = window.getSelection();
  //     console.log('선택 결과:', {
  //       rangeCount: selection?.rangeCount,
  //       text: selection?.toString(),
  //       anchorOffset: selection?.anchorOffset,
  //       focusOffset: selection?.focusOffset
  //     });
  //   }, 100);
  // });

  // const testUltimateCombinationButton = document.getElementById('test-ultimate-combination');
  // testUltimateCombinationButton?.addEventListener('click', () => {
  //   console.log('=== 최고 복합 마크 선택 테스트 ===');
  //   // Bold+Underline+Code 조합 선택
  //   const ultimateSelection = {
  //     type: 'text',
  //     anchor: { nodeId: 'text-complex-1', offset: 0 },
  //     focus: { nodeId: 'text-complex-1', offset: 20 }
  //   };
  //   console.log('최고 복합 마크 선택:', ultimateSelection);
  //   view.selectionHandler?.convertModelSelectionToDOM(ultimateSelection);
    
  //   setTimeout(() => {
  //     const selection = window.getSelection();
  //     console.log('선택 결과:', {
  //       rangeCount: selection?.rangeCount,
  //       text: selection?.toString(),
  //       anchorOffset: selection?.anchorOffset,
  //       focusOffset: selection?.focusOffset
  //     });
  //   }, 100);
  // });

  // // 동적 콘텐츠 테스트
  // const testDynamicContentButton = document.getElementById('test-dynamic-content');
  // testDynamicContentButton?.addEventListener('click', () => {
  //   console.log('=== 동적 콘텐츠 테스트 ===');
    
  //   // 1. 먼저 현재 선택 상태 확인
  //   const currentSelection = window.getSelection();
  //   console.log('현재 선택 상태:', {
  //     rangeCount: currentSelection?.rangeCount,
  //     text: currentSelection?.toString()
  //   });
    
  //   // 2. 간단한 텍스트 선택
  //   const dynamicSelection = {
  //     type: 'text',
  //     anchor: { nodeId: 'text-1', offset: 0 },
  //     focus: { nodeId: 'text-1', offset: 5 }
  //   };
  //   console.log('동적 선택 적용:', dynamicSelection);
  //   view.selectionHandler?.convertModelSelectionToDOM(dynamicSelection);
    
  //   setTimeout(() => {
  //     const selection = window.getSelection();
  //     console.log('동적 선택 결과:', {
  //       rangeCount: selection?.rangeCount,
  //       text: selection?.toString(),
  //       anchorOffset: selection?.anchorOffset,
  //       focusOffset: selection?.focusOffset
  //     });
  //   }, 100);
  // });

  // const testContentChangeButton = document.getElementById('test-content-change');
  // testContentChangeButton?.addEventListener('click', () => {
  //   console.log('=== 콘텐츠 변경 후 선택 테스트 ===');
    
  //   // 1. 먼저 선택 해제
  //   view.selectionHandler?.convertModelSelectionToDOM({ type: 'none' });
    
  //   setTimeout(() => {
  //     // 2. 콘텐츠 변경 시뮬레이션 (실제로는 에디터에서 텍스트를 수정)
  //     console.log('콘텐츠 변경 시뮬레이션...');
      
  //     // 3. 변경된 콘텐츠에서 선택
  //     const changedContentSelection = {
  //       type: 'text',
  //       anchor: { nodeId: 'text-2', offset: 0 },
  //       focus: { nodeId: 'text-2', offset: 9 }
  //     };
  //     console.log('변경된 콘텐츠에서 선택:', changedContentSelection);
  //     view.selectionHandler?.convertModelSelectionToDOM(changedContentSelection);
      
  //     setTimeout(() => {
  //       const selection = window.getSelection();
  //       console.log('콘텐츠 변경 후 선택 결과:', {
  //         rangeCount: selection?.rangeCount,
  //         text: selection?.toString(),
  //         anchorOffset: selection?.anchorOffset,
  //         focusOffset: selection?.focusOffset
  //       });
  //     }, 100);
  //   }, 200);
  // });

  // debug overlay disabled
}

bootstrap();
