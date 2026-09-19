import { describe, it, expect } from 'vitest';
import { strToU8, strFromU8, zipSync, unzipSync } from 'fflate';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import { createFieldResolver, documentBookmarks } from '@barocss/office-text';
import { createWordEditor } from '../src/word-kit';
import { getWordSchemaDefinition } from '../src/word-schema';
import { exportWordDocx } from '../src/word-docx';
import { readWordDocx } from '../src/word-docx-import';
import { parseDocxReference, type DocxNode } from '../src/word-docx-references';
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const text = (value: string, name?: string, range?: [number, number]): DocxNode => ({ stype: 'inline-text', text: value, ...(name ? { marks: [{ stype: 'bookmark', attrs: { name }, range: range ?? [0, value.length] }] } : {}) });
const ref = (targetId: string, format = 'text', useHyperlink = true): DocxNode => ({ stype: 'fieldRef', attributes: { targetId, format, useHyperlink } });
const paragraph = (...content: DocxNode[]): DocxNode => ({ stype: 'paragraph', content });
const document = (...content: DocxNode[]): DocxNode => ({ stype: 'document', content: [{ stype: 'surface', attributes: { kind: 'flow' }, content }] });
const nodes = (node: any): any[] => node.stype === 'docMeta' ? [] : [node, ...(node.content ?? []).flatMap(nodes)];
const pack = (body: string) => zipSync({ 'word/document.xml': new Uint8Array(strToU8(`<w:document xmlns:w="${W}"><w:body>${body}</w:body></w:document>`)) });
const run = (text: string) => `<w:r><w:t xml:space="preserve">${text}</w:t></w:r>`;
const marker = (kind: string) => `<w:r><w:fldChar w:fldCharType="${kind}"/></w:r>`;
const code = (instruction: string) => `<w:r><w:instrText xml:space="preserve">${instruction}</w:instrText></w:r>`;
function loaded(doc: any) {
  const schema = createSchema('word', getWordSchemaDefinition());
  const editor = createWordEditor({ editable: true, schema, dataStore: new DataStore(undefined as never, schema as never) } as never);
  editor.loadDocument(doc, 'word');
  const access = { rootId: editor.getRootId()!, getNode: (id: string) => editor.dataStore.getNode(id) };
  return { editor, bookmarks: documentBookmarks(access), fields: createFieldResolver(access) };
}

describe('DOCX bookmarks and references', () => {
  it('keeps multi-run ranges, exact point positions, REF switches and unresolved targets through repeated exchange', () => {
    const source = document(paragraph(ref('목표', 'aboveBelow')), paragraph(text('앞 '), text('Alpha ', '목표'), text('Beta', '목표'), text(' 뒤')),
      paragraph(text('전'), { stype: 'bookmarkAnchor', attributes: { id: '위치' } }, text('후')),
      paragraph(text('참조 '), ref('목표'), text(' / '), ref('위치', 'aboveBelow', false), ref('Missing')));
    const before = JSON.stringify(source); const output = exportWordDocx(source);
    const xml = new DOMParser().parseFromString(strFromU8(unzipSync(output.bytes)['word/document.xml']), 'application/xml');
    expect(xml.querySelector('parsererror')).toBeNull();
    expect(xml.getElementsByTagNameNS(W, 'bookmarkStart')).toHaveLength(2);
    expect(xml.getElementsByTagNameNS(W, 'bookmarkEnd')).toHaveLength(2);
    expect(xml.getElementsByTagNameNS(W, 'fldSimple')).toHaveLength(4);
    expect(xml.getElementsByTagNameNS(W, 'fldSimple')[0].textContent).toBe('below');
    const first = readWordDocx(output.bytes).document;
    const roundtrip = readWordDocx(exportWordDocx(first).bytes).document;
    const { editor, bookmarks, fields } = loaded(roundtrip);
    expect(bookmarks.map(b => [b.name, b.text, b.kind])).toEqual([['목표', 'Alpha Beta', 'range'], ['위치', '위치', 'point']]);
    expect(fields.reference('목표', 'text')).toBe('Alpha Beta'); expect(fields.reference('Missing', 'text')).toBeUndefined();
    expect(nodes(roundtrip).filter(n => n.stype === 'fieldRef')).toHaveLength(4);
    const pointParagraph = nodes(roundtrip).find(n => n.content?.some((c: any) => c.stype === 'bookmarkAnchor'));
    expect(pointParagraph.content.map((n: any) => n.text ?? n.stype)).toEqual(['전', 'bookmarkAnchor', '후']);
    expect(nodes(roundtrip).filter(n => n.stype === 'inline-text').map(n => n.text).join('')).not.toContain('Error!');
    expect(JSON.stringify(source)).toBe(before); editor.destroy();
  });

  it('reads independent complex REF fields with split instructions and ignores stale cached text', () => {
    const body = `<w:p>${run('before ')}${marker('begin')}${code(' RE')}${code('F &quot;Goal&quot; \\h \\p \\* MERGEFORMAT ')}${marker('separate')}${run('outdated')}${marker('end')}${run(' after')}</w:p><w:p><w:bookmarkStart w:id="4" w:name="Goal"/>${run('새로운 ')}${run('목표')}<w:bookmarkEnd w:id="4"/></w:p>`;
    const doc = readWordDocx(pack(body)).document;
    expect(nodes(doc).filter(n => n.stype === 'fieldRef')).toMatchObject([{ attributes: { targetId: 'Goal', format: 'aboveBelow', useHyperlink: true } }]);
    expect(nodes(doc).filter(n => n.stype === 'inline-text').map(n => n.text).join('')).toBe('before  after새로운 목표');
    const { editor, fields } = loaded(doc); expect(fields.reference('Goal', 'text')).toBe('새로운 목표'); editor.destroy();
  });

  it('keeps only cached results of unsupported, nested and unfinished fields', () => {
    const unsupported = `<w:fldSimple w:instr="REF Goal \\n">${run('번호')}</w:fldSimple>`;
    const nested = marker('begin') + code('IF ') + marker('begin') + code('REF Goal') + marker('separate') + run('내부') + marker('end') + marker('separate') + run('외부') + marker('end');
    const unfinished = marker('begin') + code('INCLUDETEXT https://example.com/private') + marker('separate') + run('기존 값');
    const result = readWordDocx(pack(`<w:p>${unsupported}${nested}${unfinished}</w:p>`));
    expect(nodes(result.document).filter(n => n.stype === 'fieldRef')).toHaveLength(0);
    expect(nodes(result.document).filter(n => n.stype === 'inline-text').map(n => n.text).join('')).toBe('번호외부기존 값');
    expect(result.warnings.some(w => w.includes('표시 텍스트'))).toBe(true);
    for (const instruction of ['INCLUDETEXT http://example.com', 'REF Goal \\n', 'REF Goal extra', 'REF Goal \\h HYPERLINK evil']) expect(parseDocxReference(instruction)).toBeUndefined();
  });

  it('rejects malformed, duplicate and cross-paragraph bookmark ranges without deleting text', () => {
    const body = `<w:p><w:bookmarkStart w:id="1" w:name="Across"/>${run('A')}<w:bookmarkStart w:id="2" w:name="Missing"/>${run('B')}</w:p><w:p>${run('C')}<w:bookmarkEnd w:id="1"/><w:bookmarkEnd w:id="9"/></w:p>`;
    const result = readWordDocx(pack(body));
    const { editor, bookmarks } = loaded(result.document); expect(bookmarks).toHaveLength(0); editor.destroy();
    expect(nodes(result.document).filter(n => n.stype === 'inline-text').map(n => n.text).join('')).toBe('ABC');
    expect(result.warnings.some(w => w.includes('책갈피'))).toBe(true);
    const bad = document(paragraph(text('A', 'Gap'), text('not selected'), text('B', 'Gap'), ref('Gap')));
    expect(exportWordDocx(bad).warnings.some(w => w.includes('분리'))).toBe(true);
  });

  it('normalizes incompatible names without binding a reference to a different bookmark', () => {
    const a = '새 목표', b = '새_목표';
    const source = document(paragraph(text('A', a), text('B', b), ref(a), ref(b)));
    const result = exportWordDocx(source); expect(result.warnings.some(w => w.includes('이름'))).toBe(true);
    const { editor, fields, bookmarks } = loaded(readWordDocx(result.bytes).document);
    expect(bookmarks.map(b => b.name)).toEqual(['새_목표', '새_목표_1']);
    expect(fields.reference('새_목표', 'text')).toBe('A'); expect(fields.reference('새_목표_1', 'text')).toBe('B'); editor.destroy();
  });

  it('retains overlapping ranges, formatting and editable positions around point-only paragraphs', () => {
    const source = document(paragraph({ stype: 'inline-text', text: 'ABCD', marks: [
      { stype: 'bookmark', attrs: { name: 'First' }, range: [0, 3] }, { stype: 'bookmark', attrs: { name: 'Second' }, range: [1, 4] }, { stype: 'bold', range: [1, 2] },
    ] }), paragraph({ stype: 'bookmarkAnchor', attributes: { id: 'Point' } }));
    const doc = readWordDocx(exportWordDocx(source).bytes).document;
    const { editor, fields } = loaded(doc);
    expect(fields.reference('First', 'text')).toBe('ABC'); expect(fields.reference('Second', 'text')).toBe('BCD');
    expect(nodes(doc).find(n => n.text === 'B').marks.some((m: any) => m.stype === 'bold')).toBe(true);
    const point = nodes(doc).find(n => n.content?.some((c: any) => c.stype === 'bookmarkAnchor'));
    expect(point.content.map((n: any) => n.stype)).toEqual(['inline-text', 'bookmarkAnchor', 'inline-text']); editor.destroy();
  });

  it('does not recalculate locked REF fields and handles unmatched markers inside simple fields', () => {
    const body = `<w:p><w:fldSimple w:instr="REF Goal" w:fldLock="1">${run('잠긴 값')}</w:fldSimple><w:fldSimple w:instr="DATE">${marker('end')}${run('날짜')}${marker('begin')}${code('REF Goal')}${marker('separate')}${run('이전 값')}</w:fldSimple>${run('뒤')}</w:p>`;
    const result = readWordDocx(pack(body));
    expect(nodes(result.document).filter(n => n.stype === 'fieldRef')).toHaveLength(0);
    expect(nodes(result.document).filter(n => n.stype === 'inline-text').map(n => n.text).join('')).toBe('잠긴 값날짜이전 값뒤');
    expect(result.warnings.some(w => w.includes('표시 텍스트'))).toBe(true);
  });

  it('does not bind duplicated bookmark IDs and refuses excessive field nesting', () => {
    const body = `<w:p><w:bookmarkStart w:id="1" w:name="A"/><w:bookmarkStart w:id="1" w:name="B"/>${run('내용')}<w:bookmarkEnd w:id="1"/></w:p>`;
    const result = readWordDocx(pack(body));
    const { editor, bookmarks } = loaded(result.document); expect(bookmarks).toHaveLength(0); editor.destroy();
    expect(result.warnings.some(w => w.includes('중복'))).toBe(true);
    expect(() => readWordDocx(pack(`<w:p>${marker('begin').repeat(65)}</w:p>`))).toThrow('중첩');
  });
});
