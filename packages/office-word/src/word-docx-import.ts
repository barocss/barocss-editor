import { strFromU8, unzipSync } from 'fflate';
import { docxBookmarkPairs, readDocxInlines } from './word-docx-references';
import type { INode } from '@barocss/datastore';
import { withWordDefaults } from './default-styles';
import { createStarterDocument } from './starter-document';
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const children = (e: Element, name: string) => [...e.children].filter(c => c.namespaceURI === W && c.localName === name);
const child = (e: Element | undefined, name: string) => e && children(e, name)[0];
const attr = (e: Element | undefined, name = 'val') => e?.getAttributeNS(W, name) ?? undefined;
const number = (e: Element | undefined, name = 'val') => { const value = attr(e, name); return value !== undefined && /^-?\d+$/.test(value) ? Number(value) : undefined; };
const on = (e: Element | undefined) => !!e && !['false', '0', 'off'].includes(attr(e) ?? 'true');
type N = { stype: string; text?: string; attributes?: Record<string, unknown>; marks?: { stype: string; range: [number, number]; attrs?: Record<string, unknown> }[]; content?: N[] };
/** Bounded browser import; never modifies the active editor while decoding an untrusted file. */
export function readWordDocx(bytes: Uint8Array, title = '가져온 문서'): { document: INode; warnings: string[] } {
 if (bytes.byteLength > 10 * 1024 * 1024) throw new Error('DOCX 파일은 10MB 이하로 선택하세요.');
 let files: Record<string, Uint8Array>;
 try { files = unzipSync(bytes, { filter: file => {
  if (!['word/document.xml', 'word/styles.xml', 'word/_rels/document.xml.rels'].includes(file.name)) return false;
  if (file.originalSize > (file.name === 'word/document.xml' ? 10 : 2) * 1024 * 1024) throw new Error('문서 본문이 너무 큽니다.');
  return true;
 } }); } catch { throw new Error('DOCX 압축 파일을 읽지 못했습니다. 손상되었거나 지원 크기를 초과했습니다.'); }
 if (!files['word/document.xml']) throw new Error('지원하는 DOCX 본문을 찾지 못했습니다.');
 function parsePart(name: string, rootName: string, namespace = W): Element | undefined {
  const data = files[name]; if (!data) return;
  const source = strFromU8(data);
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error('이 XML 선언이 포함된 문서는 지원하지 않습니다.');
  const xml = new DOMParser().parseFromString(source, 'application/xml');
  if (xml.querySelector('parsererror')) throw new Error('DOCX XML이 손상되었습니다.');
  if (xml.documentElement.namespaceURI !== namespace || xml.documentElement.localName !== rootName) throw new Error('지원하는 WordprocessingML 문서가 아닙니다.');
  return xml.documentElement;
 }
 const xml = parsePart('word/document.xml', 'document')!;
 const body = child(xml, 'body'); if (!body) throw new Error('문서 본문이 없습니다.');
 const warnings = new Set(['기본 가져오기: 문단·글자 스타일, 본문 책갈피·REF 참조, 직접 서식·기본 표·용지 설정을 읽습니다. 다중 문단 책갈피·고급 필드·테마 글꼴·목록·이미지·수식·머리글/바닥글·댓글·변경 추적·고급 표 서식은 원형 보존하지 않습니다. 원본 DOCX를 보관하세요.']);
 const relNamespace = 'http://schemas.openxmlformats.org/package/2006/relationships';
 const relations = parsePart('word/_rels/document.xml.rels', 'Relationships', relNamespace);
 const styleRelation = relations && [...relations.children].find(e => e.namespaceURI === relNamespace && e.localName === 'Relationship' && e.getAttribute('Type') === 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles');
 let stylePath = 'word/styles.xml';
 if (styleRelation) {
  const target = styleRelation.getAttribute('Target') ?? '';
  // Resolve package paths only. Relationships never cause network access.
  const parts = target.startsWith('/') ? [] : ['word'];
  if (styleRelation.getAttribute('TargetMode') === 'External' || /[:\\?#]/.test(target)) throw new Error('외부 스타일 연결은 지원하지 않습니다.');
  for (const part of target.split('/')) {
   if (!part || part === '.') continue;
   if (part === '..') { if (!parts.length) throw new Error('스타일 파일 경로가 잘못되었습니다.'); parts.pop(); }
   else parts.push(part);
  }
  stylePath = parts.join('/');
  if (!files[stylePath]) {
   try { Object.assign(files, unzipSync(bytes, { filter: file => {
    if (file.name !== stylePath) return false;
    if (file.originalSize > 2 * 1024 * 1024) throw new Error('스타일 정의가 너무 큽니다.');
    return true;
   } })); } catch { throw new Error('DOCX 스타일 파일을 읽지 못했습니다.'); }
  }
  if (!files[stylePath]) throw new Error('연결된 DOCX 스타일 파일을 찾지 못했습니다.');
 }
 const stylesRoot = parsePart(stylePath, 'styles');
 const resourceNodes: N[] = [];
 const definitions = new Map<string, N>();
 function runFormat(props?: Element): Record<string, unknown> {
  const a: Record<string, unknown> = {};
  for (const [tag, key] of [['b','bold'], ['i','italic'], ['strike','strike']]) { const e = child(props, tag); if (e) a[key] = on(e); }
  const underline = child(props, 'u'); if (underline) a.underline = attr(underline) ?? 'single';
  const size = number(child(props, 'sz')); if (size && size > 0) a.fontSize = size;
  const color = attr(child(props, 'color')); if (color && /^[a-f\d]{6}$/i.test(color)) a.color = color;
  const background = attr(child(props, 'shd'), 'fill'); if (background && /^[a-f\d]{6}$/i.test(background)) a.shadingFill = background;
  const family = attr(child(props, 'rFonts'), 'ascii') ?? attr(child(props, 'rFonts'), 'hAnsi'); if (family) a.fontFamily = family;
  return a;
 }
 function paragraphFormat(props?: Element): Record<string, unknown> {
  const a: Record<string, unknown> = {};
  const alignment = attr(child(props, 'jc')); if (['left','center','right','both'].includes(alignment ?? '')) a.alignment = alignment === 'both' ? 'justify' : alignment;
  for (const [tag, pairs] of [
   ['spacing', [['spacingBefore','before'], ['spacingAfter','after'], ['spacingLine','line']]],
   ['ind', [['indentLeft','left'], ['indentRight','right'], ['indentFirstLine','firstLine'], ['indentHanging','hanging']]],
  ] as const) for (const [key, name] of pairs) { const value = number(child(props, tag), name); if (value !== undefined) a[key] = value; }
  const rule = attr(child(props, 'spacing'), 'lineRule'); if (['auto','exact','atLeast'].includes(rule ?? '')) a.spacingLineRule = rule;
  for (const key of ['keepNext','keepLines','pageBreakBefore','widowControl']) { const e = child(props, key); if (e) a[key] = on(e); }
  const outline = number(child(props, 'outlineLvl')); if (outline !== undefined && outline >= 0 && outline <= 9) a.outlineLevel = outline;
  return a;
 }
 let defaults: Record<string, unknown> = {};
 if (stylesRoot) {
  const d = child(stylesRoot, 'docDefaults');
  defaults = { ...paragraphFormat(child(child(d, 'pPrDefault'), 'pPr')), ...runFormat(child(child(d, 'rPrDefault'), 'rPr')) };
  resourceNodes.push({ stype: 'docDefaults', attributes: defaults });
  for (const element of children(stylesRoot, 'style')) {
   const id = attr(element, 'styleId'), type = attr(element, 'type') ?? 'paragraph';
   if (!id || !['paragraph', 'character'].includes(type)) continue;
   if (definitions.has(id)) { warnings.add('중복된 스타일 ID는 첫 정의를 사용했습니다.'); continue; }
   const a = { id, type, name: attr(child(element, 'name')) ?? id,
    ...(attr(element, 'default') === '1' || attr(element, 'default') === 'true' ? { isDefault: true } : {}),
    ...Object.fromEntries(['basedOn','next','link'].flatMap(key => { const value = attr(child(element, key)); return value ? [[key, value]] : []; })),
    ...paragraphFormat(child(element, 'pPr')), ...runFormat(child(element, 'rPr')) };
   const node = { stype: 'styleDef', attributes: a }; definitions.set(id, node); resourceNodes.push(node);
  }
 }
 const resolved = new Set<string>();
 const effectiveStyles = new Map<string, Record<string, unknown>>();
 const styleDepth = new Map<string, number>();
 function resolveDefinition(id: string, visiting = new Set<string>()): Record<string, unknown> {
  const cached = effectiveStyles.get(id); if (cached) return cached;
  if (visiting.size >= 256) throw new Error('스타일 상속 단계가 지원 한도를 초과합니다.');
  const node = definitions.get(id); if (!node) return defaults;
  const a = node.attributes!;
  if (visiting.has(id)) { delete a.basedOn; warnings.add('순환 스타일 상속 연결을 해제했습니다.'); return defaults; }
  visiting.add(id);
  const inherited = a.basedOn ? resolveDefinition(String(a.basedOn), visiting) : defaults;
  const parent = a.basedOn ? inherited : defaults;
  visiting.delete(id);
  const depth = 1 + (a.basedOn ? styleDepth.get(String(a.basedOn)) ?? 0 : 0);
  if (depth > 256) throw new Error('스타일 상속 단계가 지원 한도를 초과합니다.');
  styleDepth.set(id, depth);
  if (!resolved.has(id)) {
   for (const key of ['bold','italic','strike']) if (a[key] != null) a[key] = Boolean(a[key]) !== Boolean(parent[key]);
   resolved.add(id);
  }
  const effective = { ...parent, ...a }; effectiveStyles.set(id, effective); return effective;
 }
 for (const id of definitions.keys()) resolveDefinition(id);
 const defaultParagraphStyle = [...definitions.values()].find(n => n.attributes?.type === 'paragraph' && n.attributes.isDefault)?.attributes?.id;
 const directStyles = new Map<string, string>();
 function directRunStyle(format: Record<string, unknown>, basedOn?: string): string {
  const key = JSON.stringify([basedOn, format]); const found = directStyles.get(key); if (found) return found;
  let id = `DocxRun${directStyles.size + 1}`; while (definitions.has(id)) id += '_';
  const node = { stype: 'styleDef', attributes: { id, name: 'Imported run format', type: 'character', ...(basedOn ? { basedOn } : {}), ...format } };
  definitions.set(id, node); resourceNodes.push(node); directStyles.set(key, id); return id;
 }
 function readRun(e: Element, text: string): N {
    const props = child(e, 'rPr');
    const marks: NonNullable<N['marks']> = [];
    const add = (stype: string, attrs?: Record<string, unknown>) => marks.push({ stype, range: [0, text.length], ...(attrs ? { attrs } : {}) });
    const format = runFormat(props);
    const styleId = attr(child(props, 'rStyle'));
    // A charStyle can express explicit false (e.g. non-bold text inside a heading).
    // Ordinary positive marks stay native so existing formatting controls can edit them.
    const reset = Object.values(format).includes(false) || format.underline === 'none';
    if (reset) {
     const inherited = styleId ? resolveDefinition(styleId) : undefined;
     const matches = inherited && Object.entries(format).every(([key, value]) => inherited[key] === value);
     add('charStyle', { styleId: matches ? styleId : directRunStyle(format, styleId) });
    }
    else {
     if (styleId) add('charStyle', { styleId });
     for (const [key, mark] of [['bold','bold'], ['italic','italic'], ['strike','strikethrough']]) if (format[key]) add(mark);
     if (format.underline) add('underline');
     if (format.fontSize) add('fontSize', { size: format.fontSize });
     if (format.color) add('fontColor', { color: format.color });
     if (format.shadingFill) add('bgColor', { bgColor: format.shadingFill });
     if (format.fontFamily) add('fontFamily', { family: format.fontFamily });
    }
    return { stype: 'inline-text', text, marks };
 }
 const bookmarkPairs = docxBookmarkPairs(body, warnings);
 const runs = (p: Element): N[] => readDocxInlines(p, readRun, bookmarkPairs, warnings) as N[];
 function paragraph(p: Element): N {
  const props = child(p, 'pPr');
  const styleId = attr(child(props, 'pStyle')) ?? defaultParagraphStyle;
  const attributes: Record<string, unknown> = { ...(styleId ? { styleId } : {}), ...paragraphFormat(props) };
  const inherited = styleId ? resolveDefinition(String(styleId)) : {};
  const outline = attributes.outlineLevel ?? inherited.outlineLevel;
  const namedHeading = String(styleId ?? '').match(/^Heading([1-6])$/i);
  const level = typeof outline === 'number' ? outline >= 0 && outline < 6 ? outline + 1 : undefined : namedHeading ? Number(namedHeading[1]) : undefined;
  return { stype: level ? 'heading' : 'paragraph', attributes: { ...attributes, ...(level ? { level } : {}) }, content: runs(p) };
 }
 function table(t: Element): N {
  const rows = children(t, 'tr').map(r => ({ stype: 'bTableRow', content: children(r, 'tc').map(c => {
   if (child(child(c, 'tcPr'), 'vMerge')) throw new Error('세로로 병합된 표는 아직 가져올 수 없습니다. 원본에서 병합을 해제한 사본을 선택하세요.');
   if (children(c, 'tbl').length) throw new Error('중첩 표는 아직 가져올 수 없습니다.');
   const colspan = number(child(child(c, 'tcPr'), 'gridSpan')) ?? 1;
   if (colspan < 1 || colspan > 100) throw new Error('표의 병합 범위가 지원 한도를 초과합니다.');
   const paragraphs = children(c, 'p'); const content = paragraphs.flatMap((p, i) => [...(i ? [{ stype: 'inline-text', text: '\n' }] : []), ...runs(p)]);
   return { stype: 'bTableCell', attributes: { colspan, rowspan: 1 }, content: content.length ? content : [{ stype: 'inline-text', text: '' }] };
  }) }));
  if (!rows.length || rows.some(r => !r.content.length)) throw new Error('비어 있는 표 구조는 지원하지 않습니다.');
  return { stype: 'bTable', content: [{ stype: 'bTableBody', content: rows }] };
 }
 const doc = createStarterDocument() as unknown as N;
 doc.content![0].content![0].content![0].text = title;
 const base = doc.content![1]; const surfaces: N[] = []; let blocks: N[] = [];
 function finish(section?: Element) {
  const attributes = { ...base.attributes };
  const size = child(section, 'pgSz'), margins = child(section, 'pgMar');
  for (const [key, name, e] of [['pageWidth', 'w', size], ['pageHeight', 'h', size], ['marginTop', 'top', margins], ['marginBottom', 'bottom', margins], ['marginLeft', 'left', margins], ['marginRight', 'right', margins]] as const) {
   const value = number(e, name); if (value !== undefined && value >= 0) attributes[key] = value;
  }
  surfaces.push({ stype: 'surface', attributes, content: blocks.length ? blocks : [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: '' }] }] }); blocks = [];
 }
 for (const element of body.children) {
  if (element.namespaceURI !== W) { warnings.add('독립 수식 또는 객체는 가져오지 못했습니다.'); continue; }
  if (element.localName === 'p') { blocks.push(paragraph(element)); const section = child(child(element, 'pPr'), 'sectPr'); if (section) finish(section); }
  else if (element.localName === 'tbl') blocks.push(table(element));
  else if (element.localName === 'sectPr') finish(element);
  else warnings.add('지원하지 않는 본문 블록은 가져오지 못했습니다.');
 }
 if (blocks.length || !surfaces.length) finish();
 doc.content = [doc.content![0], ...surfaces, { stype: 'resources', content: resourceNodes }];
 return { document: withWordDefaults(doc as unknown as INode), warnings: [...warnings] };
}
