import type { ModelData } from '@barocss/dsl';

/** Document data: same as editor-test for comparison (content before the commented block in editor-test). */
export const initialTree: ModelData = {
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
  ]
};
