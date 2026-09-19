import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { exportWordDocx } from '../src/word-docx';
import { createSampleDocument } from '../src/sample-document';
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const doc = (content: unknown[]) => ({ stype: 'document', content: [{ stype: 'surface', attributes: { kind: 'flow', pageWidth: 11906, pageHeight: 16838, marginLeft: 720 }, content }] });
const parse = (bytes: Uint8Array) => {
 const files = unzipSync(bytes);
 for (const [name, value] of Object.entries(files)) { const error = new DOMParser().parseFromString(strFromU8(value), 'application/xml').querySelector('parsererror'); expect(error?.textContent, name).toBeUndefined(); }
 const xml = new DOMParser().parseFromString(strFromU8(files['word/document.xml']), 'application/xml');
 return { files, xml, all: (name: string) => [...xml.getElementsByTagNameNS(W, name)] };
};
describe('DOCX export', () => {
 it('writes a connected OOXML package, escaped text, repeated spaces, line breaks and exact mark ranges', () => {
  const source = doc([{ stype: 'paragraph', attributes: { alignment: 'center' }, content: [{ stype: 'inline-text', text: 'A<&  B\t한글\n', marks: [{ stype: 'bold', range: [1, 3] }, { stype: 'fontSize', range: [1, 3], attrs: { size: 32 } }] }] }]);
  const before = JSON.stringify(source); const { files, all } = parse(exportWordDocx(source).bytes);
  expect(strFromU8(files['_rels/.rels'])).toContain('Target="word/document.xml"');
  expect(strFromU8(files['[Content_Types].xml'])).toContain('PartName="/word/document.xml"');
  expect(all('t').map(t => t.textContent).join('')).toBe('A<&  B한글');
  expect(all('b')).toHaveLength(1); expect(all('b')[0].parentElement?.parentElement?.textContent).toBe('<&');
  expect(all('sz')[0].getAttributeNS(W, 'val')).toBe('32');
  expect(all('tab')).toHaveLength(1); expect(all('br')).toHaveLength(1);
  expect(all('jc')[0].getAttributeNS(W, 'val')).toBe('center');
  expect(all('pgMar')[0].getAttributeNS(W, 'left')).toBe('720');
  expect(JSON.stringify(source)).toBe(before);
 });
 it('preserves horizontal merged cells and keeps each cell a paragraph', () => {
  const { all } = parse(exportWordDocx(doc([{ stype: 'bTable', content: [{ stype: 'bTableHeader', content: [{ stype: 'bTableHeaderCell', attributes: { colspan: 2 }, content: [{ stype: 'inline-text', text: '합계' }] }] }, { stype: 'bTableBody', content: [{ stype: 'bTableRow', content: [1, 2].map(i => ({ stype: 'bTableCell', content: [{ stype: 'inline-text', text: String(i) }] })) }] }] }])).bytes);
  expect(all('gridCol')).toHaveLength(2); expect(all('gridSpan')[0].getAttributeNS(W, 'val')).toBe('2');
  expect(all('tc')).toHaveLength(3); expect(all('tc').every(cell => cell.lastElementChild?.localName === 'p')).toBe(true);
 });
 it('exports the full sample without modifying it and reports unsupported content', () => {
  const source = createSampleDocument(); const before = JSON.stringify(source); const result = exportWordDocx(source);
  const { all } = parse(result.bytes); expect(all('t').map(t => t.textContent).join('')).toContain('Direct formatting wins');
  expect(all('sectPr')).toHaveLength(2); expect(all('tbl')).toHaveLength(1);
  expect(result.warnings.some(w => w.includes('이미지'))).toBe(true);
  expect(JSON.stringify(source)).toBe(before);
 });
 it('rejects non-documents and empty packages', () => {
  expect(() => exportWordDocx({})).toThrow(); expect(() => exportWordDocx({ stype: 'document', content: [] })).toThrow();
 });
});
