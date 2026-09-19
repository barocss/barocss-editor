import { describe, expect, it } from 'vitest';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import { createStyleResolver } from '@barocss/office-text';
import { exportWordDocx } from '../src/word-docx';
import { readWordDocx } from '../src/word-docx-import';
import { createWordEditor } from '../src/word-kit';
import { getWordSchemaDefinition } from '../src/word-schema';
import { paragraphStyleFormat } from '../src/paragraph-styles';
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const P = 'http://schemas.openxmlformats.org/package/2006/relationships';
const pack = (body: string, styles: string, target = 'styles.xml') => zipSync(Object.fromEntries(Object.entries({
  'word/document.xml': `<w:document xmlns:w="${W}"><w:body>${body}</w:body></w:document>`,
  'word/_rels/document.xml.rels': `<Relationships xmlns="${P}"><Relationship Id="styles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="${target}"/></Relationships>`,
  [`word/${target}`]: `<w:styles xmlns:w="${W}">${styles}</w:styles>`,
}).map(([name, text]) => [name, new Uint8Array(strToU8(text))])));
const resources = (doc: any) => doc.content.find((n: any) => n.stype === 'resources').content as any[];
const paragraphs = (doc: any) => doc.content.find((n: any) => n.stype === 'surface').content as any[];
const style = (doc: any, id: string) => resources(doc).find(n => n.attributes?.id === id)?.attributes;
function editorFor(document: any) {
  const schema = createSchema('word', getWordSchemaDefinition());
  const editor = createWordEditor({ editable: true, schema, dataStore: new DataStore(undefined as never, schema as never) } as never);
  editor.loadDocument(document, 'word'); return editor;
}
describe('DOCX style exchange', () => {
  it('keeps named styles, inheritance, next style and direct formatting editable after a round trip', async () => {
    const source = { stype: 'document', content: [
      { stype: 'resources', content: [
        { stype: 'docDefaults', attributes: { fontSize: 22, fontFamily: 'Arial', spacingLine: 276 } },
        { stype: 'styleDef', attributes: { id: 'Normal', name: 'Normal', type: 'paragraph', bold: true } },
        { stype: 'styleDef', attributes: { id: 'Report', name: '보고서 & 본문', type: 'paragraph', basedOn: 'Normal', next: 'Report', bold: false, fontSize: 26, indentLeft: 360, indentHanging: 120, spacingAfter: 240, spacingLine: 360, spacingLineRule: 'auto' } },
      ] },
      { stype: 'surface', attributes: { kind: 'flow' }, content: [
        { stype: 'paragraph', attributes: { styleId: 'Report' }, content: [{ stype: 'inline-text', text: '첫  문단 ', marks: [{ stype: 'italic', range: [0, 1] }] }] },
        { stype: 'paragraph', attributes: { styleId: 'Report', alignment: 'right' }, content: [{ stype: 'inline-text', text: '둘째 문단' }] },
      ] },
    ] };
    const before = JSON.stringify(source); const exported = exportWordDocx(source);
    const files = unzipSync(exported.bytes);
    expect(strFromU8(files['word/_rels/document.xml.rels'])).toContain('Target="styles.xml"');
    expect(strFromU8(files['[Content_Types].xml'])).toContain('/word/styles.xml');
    const documentXml = new DOMParser().parseFromString(strFromU8(files['word/document.xml']), 'application/xml');
    expect(documentXml.getElementsByTagNameNS(W, 'sz')).toHaveLength(0); // inherited size must not become direct formatting
    expect(documentXml.getElementsByTagNameNS(W, 'pStyle')).toHaveLength(2);
    const imported = readWordDocx(exported.bytes).document;
    expect(style(imported, 'Report')).toMatchObject({ name: '보고서 & 본문', basedOn: 'Normal', next: 'Report', bold: false, indentLeft: 360, indentHanging: 120, fontSize: 26 });
    expect(paragraphs(imported)[0].content.map((n: any) => n.text).join('')).toBe('첫  문단 ');
    expect(paragraphs(imported)[0].attributes).not.toHaveProperty('fontSize');
    expect(paragraphs(imported)[1].attributes).toMatchObject({ styleId: 'Report', alignment: 'right' });
    const editor = editorFor(imported);
    const format = paragraphStyleFormat(editor, 'Report');
    expect(format.bold).toBe(false);
    expect(await editor.run('updateParagraphStyle', { id: 'Report', name: '새 보고서', format: { ...format, fontSize: 36 } })).toBe(true);
    expect(style(editor.exportDocument(), 'Report').fontSize).toBe(36);
    await editor.run('undo'); expect(style(editor.exportDocument(), 'Report').fontSize).toBe(26);
    expect(JSON.stringify(source)).toBe(before);
    editor.destroy();
  });

  it('loads an external style relationship, default style and inherited heading outline', () => {
    const file = pack('<w:p><w:r><w:t>기본</w:t></w:r></w:p><w:p><w:pPr><w:pStyle w:val="Chapter"/></w:pPr><w:r><w:t>장 제목</w:t></w:r></w:p>',
      '<w:style w:type="paragraph" w:styleId="Main" w:default="1"><w:name w:val="본문"/><w:rPr><w:sz w:val="30"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="ChapterBase"><w:pPr><w:outlineLvl w:val="1"/></w:pPr></w:style><w:style w:type="paragraph" w:styleId="Chapter"><w:basedOn w:val="ChapterBase"/><w:rPr><w:sz w:val="40"/></w:rPr></w:style>', 'format/custom.xml');
    const result = readWordDocx(file).document;
    expect(paragraphs(result)[0].attributes.styleId).toBe('Main');
    expect(paragraphs(result)[1]).toMatchObject({ stype: 'heading', attributes: { styleId: 'Chapter', level: 2 } });
    const output = unzipSync(exportWordDocx(result).bytes);
    const xml = new DOMParser().parseFromString(strFromU8(output['word/document.xml']), 'application/xml');
    expect(xml.getElementsByTagNameNS(W, 'outlineLvl')).toHaveLength(1);
    const editor = editorFor(result); expect(paragraphStyleFormat(editor, 'Main').fontSize).toBe(30); editor.destroy();
  });

  it('preserves character style links and explicit non-bold text inside a bold paragraph', () => {
    const file = pack('<w:p><w:pPr><w:pStyle w:val="Strong"/></w:pPr><w:r><w:rPr><w:rStyle w:val="Accent"/></w:rPr><w:t>A</w:t></w:r><w:r><w:rPr><w:rStyle w:val="Accent"/><w:b w:val="0"/></w:rPr><w:t>B</w:t></w:r></w:p>',
      '<w:style w:type="paragraph" w:styleId="Strong"><w:rPr><w:b/></w:rPr></w:style><w:style w:type="character" w:styleId="Accent"><w:name w:val="강조"/><w:rPr><w:color w:val="2255AA"/><w:sz w:val="32"/></w:rPr></w:style>');
    const document = readWordDocx(file).document;
    const text = paragraphs(document)[0].content;
    expect(text[0].marks[0]).toMatchObject({ stype: 'charStyle', attrs: { styleId: 'Accent' } });
    const override = style(document, text[1].marks[0].attrs.styleId);
    expect(override).toMatchObject({ basedOn: 'Accent', bold: false });
    const exported = exportWordDocx(document);
    const xml = new DOMParser().parseFromString(strFromU8(unzipSync(exported.bytes)['word/document.xml']), 'application/xml');
    expect(xml.getElementsByTagNameNS(W, 'b')[0].getAttributeNS(W, 'val')).toBe('0');
    const again = readWordDocx(exported.bytes).document;
    expect(resources(again).filter(n => n.attributes?.type === 'character')).toHaveLength(resources(document).filter(n => n.attributes?.type === 'character').length);
    const editor = editorFor(again);
    const resolver = createStyleResolver({ rootId: editor.getRootId()!, getNode: id => editor.dataStore.getNode(id) });
    expect(resolver.resolveStyle(style(again, paragraphs(again)[0].content[1].marks[0].attrs.styleId).id, 'character')).toMatchObject({ color: '2255AA', fontSize: 32, bold: false });
    editor.destroy();
  });

  it('rejects malformed, declared-entity, missing, external and oversized style parts', () => {
    const base = pack('<w:p/>', '');
    const files = unzipSync(base);
    for (const source of ['<broken', `<!DOCTYPE styles [<!ENTITY x "bad">]><w:styles xmlns:w="${W}"/>`, `<w:document xmlns:w="${W}"/>`]) {
      expect(() => readWordDocx(zipSync({ ...files, 'word/styles.xml': new Uint8Array(strToU8(source)) }))).toThrow();
    }
    const { ['word/styles.xml']: _, ...missing } = files;
    expect(() => readWordDocx(zipSync(missing))).toThrow('찾지 못했습니다');
    expect(() => readWordDocx(pack('<w:p/>', '', 'https://example.com/styles.xml'))).toThrow('외부');
    expect(() => readWordDocx(zipSync({ ...files, 'word/styles.xml': new Uint8Array(2 * 1024 * 1024 + 1) }))).toThrow();
    const deepStyles = Array.from({ length: 257 }, (_, i) => `<w:style w:styleId="S${i}">${i ? `<w:basedOn w:val="S${i - 1}"/>` : ''}</w:style>`).join('');
    expect(() => readWordDocx(pack('<w:p/>', deepStyles))).toThrow('상속 단계');
  });

  it('breaks cyclic inheritance and reports duplicate definitions without changing the source', () => {
    const file = pack('<w:p><w:pPr><w:pStyle w:val="A"/></w:pPr><w:r><w:t>본문</w:t></w:r></w:p>',
      '<w:style w:styleId="A"><w:basedOn w:val="B"/></w:style><w:style w:styleId="B"><w:basedOn w:val="A"/></w:style><w:style w:styleId="A"/>');
    const result = readWordDocx(file);
    expect(result.warnings.some(w => w.includes('순환'))).toBe(true);
    expect(result.warnings.some(w => w.includes('중복'))).toBe(true);
    expect(style(result.document, 'A').basedOn).toBeUndefined();
    expect(() => editorFor(result.document).destroy()).not.toThrow();
  });
});
