import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { readWordDocx } from '../src/word-docx-import';
import { exportWordDocx } from '../src/word-docx';
import { createStarterDocument } from '../src/starter-document';
import { createWordEditor } from '../src/word-kit';
import { getWordSchemaDefinition } from '../src/word-schema';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
const packageOf = (body: string) => zipSync({ 'word/document.xml': new Uint8Array(strToU8(`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`)) });
describe('DOCX import', () => {
 it('reads an independent OOXML fixture with formatting, spaces, heading and table and loads it into Word', () => {
  const file = packageOf('<w:p><w:pPr><w:pStyle w:val="Heading2"/><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="32"/></w:rPr><w:t xml:space="preserve">한글  A </w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:tcPr><w:gridSpan w:val="2"/></w:tcPr><w:p><w:r><w:t>셀</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr>');
  const result = readWordDocx(file, '외부 문서');
  expect(JSON.stringify(result.document)).toContain('한글  A ');
  expect(JSON.stringify(result.document)).toContain('"level":2');
  const schema = createSchema('word', getWordSchemaDefinition());
  const editor = createWordEditor({ editable: true, schema, dataStore: new DataStore(undefined as never, schema as never) } as never);
  expect(() => editor.loadDocument(result.document, 'word')).not.toThrow();
  expect(JSON.stringify(editor.exportDocument())).toContain('외부 문서');
 });
 it('reads exported starter content without requiring native JSON', () => {
  const source = createStarterDocument(); const result = readWordDocx(exportWordDocx(source).bytes);
  expect(result.document.stype).toBe('document'); expect(JSON.stringify(result.document)).toContain('12240');
 });
 it('rejects broken ZIP/XML, oversized files and unsupported vertical merges', () => {
  expect(() => readWordDocx(new Uint8Array([1, 2]))).toThrow();
  expect(() => readWordDocx(new Uint8Array(10 * 1024 * 1024 + 1))).toThrow();
  expect(() => readWordDocx(packageOf('<w:p>'))).toThrow();
  expect(() => readWordDocx(packageOf('<w:tbl><w:tr><w:tc><w:tcPr><w:vMerge/></w:tcPr></w:tc></w:tr></w:tbl>'))).toThrow('세로');
 });
});
