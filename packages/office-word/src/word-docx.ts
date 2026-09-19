import { strToU8, zipSync } from 'fflate';
import { prepareDocxReferences } from './word-docx-references';

/** Browser-independent, deliberately bounded WordprocessingML export. */
type Attrs = Record<string, unknown>;
interface Mark { stype: string; range?: [number, number]; attrs?: Attrs }
interface Node { stype?: string; text?: string; attributes?: Attrs; marks?: Mark[]; content?: Node[] }
export interface WordDocx { bytes: Uint8Array; warnings: string[] }
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const esc = (value: unknown) => String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]!));
const val = (tag: string, value: unknown) => value == null ? '' : `<w:${tag} w:val="${esc(value)}"/>`;
const xml = (body: string) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${body}`;
const color = (value: unknown) => /^[0-9a-f]{6}$/i.test(String(value).replace(/^#/, '')) ? String(value).replace(/^#/, '') : undefined;

function runProperties(a: Attrs): string {
  return (a.fontFamily ? `<w:rFonts w:ascii="${esc(a.fontFamily)}" w:hAnsi="${esc(a.fontFamily)}" w:eastAsia="${esc(a.fontFamily)}"/>` : '')
    + ['bold', 'italic', 'strike'].map((key, i) => a[key] == null ? '' : val(['b', 'i', 'strike'][i], a[key] ? 1 : 0)).join('')
    + val('color', color(a.color)) + val('sz', a.fontSize)
    + (a.underline != null ? val('u', typeof a.underline === 'string' ? a.underline : a.underline ? 'single' : 'none') : '')
    + (color(a.backgroundColor ?? a.shadingFill) ? `<w:shd w:val="clear" w:fill="${color(a.backgroundColor ?? a.shadingFill)}"/>` : '');
}
function paragraphProperties(a: Attrs): string {
  const spacing = [['before', 'spacingBefore'], ['after', 'spacingAfter'], ['line', 'spacingLine'], ['lineRule', 'spacingLineRule']]
    .filter(([, key]) => a[key] != null).map(([name, key]) => ` w:${name}="${esc(a[key])}"`).join('');
  const indent = [['left', 'indentLeft'], ['right', 'indentRight'], ['firstLine', 'indentFirstLine'], ['hanging', 'indentHanging']]
    .filter(([, key]) => a[key] != null && !(key === 'indentFirstLine' && Number(a.indentHanging) > 0) && !(key === 'indentHanging' && !a.indentHanging && Number(a.indentFirstLine) > 0)).map(([name, key]) => ` w:${name}="${esc(a[key])}"`).join('');
  return (a.keepNext != null ? val('keepNext', a.keepNext ? 1 : 0) : '')
    + ['keepLines', 'pageBreakBefore', 'widowControl'].map(key => a[key] == null ? '' : val(key, a[key] ? 1 : 0)).join('')
    + (spacing ? `<w:spacing${spacing}/>` : '')
    + (indent ? `<w:ind${indent}/>` : '')
    + val('jc', a.alignment === 'justify' ? 'both' : a.alignment)
    + val('outlineLvl', a.outlineLevel);
}

/** Keeps source unchanged. Unsupported structures are reported, never silently called lossless. */
export function exportWordDocx(document: unknown): WordDocx {
  const root = document as Node;
  if (root?.stype !== 'document') throw new Error('Word 문서가 아닙니다.');
  const warnings = new Set<string>();
  const styles = new Map<string, Attrs>();
  let defaults: Attrs = {};
  const label = (type?: string): string => ({ 'inline-image': '이미지', tableOfContents: '목차', contentControl: '입력 영역', link: '링크', code: '인라인 코드', bookmark: '책갈피', bookmarkAnchor: '위치 책갈피', fieldRef: '상호 참조', commentRange: '댓글 범위', math: '수식', mathInline: '수식', omath: '수식' }[type ?? ''] ?? '일부 객체 또는 서식');
  function collect(n: Node) {
    if (n.stype === 'docDefaults') defaults = n.attributes ?? {};
    if (n.stype === 'styleDef' && n.attributes?.id && ['paragraph', 'character'].includes(String(n.attributes.type ?? 'paragraph'))) styles.set(String(n.attributes.id), n.attributes);
    n.content?.forEach(collect);
  }
  collect(root);
  function style(id: unknown, seen = new Set<string>()): Attrs {
    if (seen.size >= 256) throw new Error('스타일 상속 단계가 지원 한도를 초과합니다.');
    if (!id || seen.has(String(id))) return {};
    seen.add(String(id)); const a = styles.get(String(id));
    return a ? { ...style(a.basedOn, seen), ...a } : {};
  }
  // A broken inheritance chain must not create recursive work or cyclic OOXML.
  for (const [id, a] of styles) {
    const seen = new Set([id]); let parent = a.basedOn;
    while (parent && styles.has(String(parent))) {
      if (seen.has(String(parent))) {
        styles.set(id, { ...a, basedOn: undefined });
        warnings.add('순환 스타일 상속 연결을 해제했습니다.'); break;
      }
      seen.add(String(parent)); parent = styles.get(String(parent))?.basedOn;
    }
  }
  const references = prepareDocxReferences(root, warnings, esc);
  const plain = (n: Node): string => n.text ?? (n.content ?? []).map(plain).join('');
  function textRuns(n: Node, inherited: Attrs): string {
    if (n.stype !== 'inline-text') {
      if (n.stype === 'bookmarkAnchor') return references.anchor(n);
      if (n.stype === 'fieldRef') { const field = references.field(n); if (field) return field; }
      if (n.stype === 'lineBreak') return '<w:r><w:br/></w:r>';
      warnings.add(`미지원 본문 요소: ${label(n.stype)} (텍스트 또는 대체 문구로 변환)`);
      const text = plain(n) || `[${n.attributes?.alt ?? label(n.stype)}]`;
      return `<w:r><w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
    }
    const text = n.text ?? '';
    const marks = n.marks ?? [];
    const points = [...new Set([0, text.length, ...references.offsets(n), ...marks.flatMap(m => m.range ?? [0, text.length])])]
      .filter(x => x >= 0 && x <= text.length).sort((a, b) => a - b);
    return points.slice(0, -1).map((start, i) => {
      const end = points[i + 1]; const a = { ...inherited, ...n.attributes };
      let runStyle: unknown;
      for (const mark of marks.filter(m => !m.range || (m.range[0] <= start && m.range[1] >= end))) {
        const attrs = mark.attrs ?? {};
        switch (mark.stype) {
          case 'bookmark': break;
          case 'bold': case 'italic': case 'underline': case 'strike': a[mark.stype] = true; break;
          case 'fontSize': a.fontSize = attrs.size; break;
          case 'fontColor': a.color = attrs.color; break;
          case 'strikethrough': a.strike = true; break;
          case 'bgColor': a.backgroundColor = attrs.bgColor; break;
          case 'fontFamily': a.fontFamily = attrs.family; break;
          case 'charStyle':
            if (styles.get(String(attrs.styleId))?.type === 'character') runStyle = attrs.styleId;
            else warnings.add('정의가 없는 글자 스타일은 보존하지 못했습니다.');
            break;
          default: warnings.add(`미지원 글자 서식: ${label(mark.stype)} (표시 텍스트만 유지)`);
        }
      }
      // The model's character styles set absolute booleans, even inside a bold
      // paragraph. OOXML toggles in rStyle cannot express that alone.
      if (runStyle) {
        const character = style(runStyle);
        for (const key of ['bold', 'italic', 'strike']) if (a[key] == null && character[key] != null) a[key] = character[key];
      }
      // XML whitespace preservation is essential for repeated/trailing spaces.
      const body = text.slice(start, end).split(/([\t\n])/).map(part => part === '\t' ? '<w:tab/>' : part === '\n' ? '<w:br/>' : `<w:t xml:space="preserve">${esc(part)}</w:t>`).join('');
      return references.at(n, start) + `<w:r><w:rPr>${val('rStyle', runStyle)}${runProperties(a)}</w:rPr>${body}</w:r>`;
    }).join('') + references.at(n, text.length);
  }
  function paragraph(n: Node): string {
    const a = n.attributes ?? {};
    const styleId = a.styleId ?? (n.stype === 'heading' ? `Heading${a.level ?? 1}` : styles.has('Normal') ? 'Normal' : undefined);
    if (a.numId != null) warnings.add('목록 번호와 들여쓰기는 보존되지 않습니다.');
    const heading = n.stype === 'heading' && a.outlineLevel == null ? val('outlineLvl', Math.max(0, Math.min(8, Number(a.level ?? 1) - 1))) : '';
    return `<w:p><w:pPr>${val('pStyle', styleId)}${paragraphProperties(a)}${heading}</w:pPr>${(n.content ?? []).map(c => textRuns(c, a)).join('')}</w:p>`;
  }
  function table(n: Node): string {
    const rows = (n.content ?? []).flatMap(c => c.stype === 'bTableBody' ? c.content ?? [] : [c]);
    warnings.add('표는 기본 격자로 내보냅니다. 테마·셀 색·세로 병합·개별 열 너비는 보존되지 않습니다.');
    // Vertical merges need continuation cells; flattening to ordinary cells must be explicit.
    const count = Math.max(1, ...rows.map(row => (row.content ?? []).reduce((sum, cell) => sum + Math.max(1, Number(cell.attributes?.colspan) || 1), 0)));
    const borders = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(side => `<w:${side} w:val="single" w:sz="4" w:color="B8B8B8"/>`).join('');
    return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>${borders}</w:tblBorders></w:tblPr><w:tblGrid>${'<w:gridCol w:w="2400"/>'.repeat(count)}</w:tblGrid>${rows.map(row => `<w:tr>${row.stype === 'bTableHeader' ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}${(row.content ?? []).map(cell => {
      const span = Math.max(1, Number(cell.attributes?.colspan) || 1);
      return `<w:tc><w:tcPr>${span > 1 ? val('gridSpan', span) : ''}</w:tcPr>${paragraph(cell)}</w:tc>`;
    }).join('')}</w:tr>`).join('')}</w:tbl>`;
  }
  function block(n: Node): string {
    if (n.stype === 'paragraph' || n.stype === 'heading') return paragraph(n);
    if (n.stype === 'bTable') return table(n);
    if (n.stype === 'pageBreak') return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
    warnings.add(`미지원 블록: ${label(n.stype)} (텍스트 또는 대체 문구로 변환)`);
    return `<w:p><w:r><w:t xml:space="preserve">${esc(plain(n) || `[${label(n.stype)}]`)}</w:t></w:r></w:p>`;
  }
  function section(a: Attrs): string {
    return `<w:sectPr><w:pgSz w:w="${esc(a.pageWidth ?? 12240)}" w:h="${esc(a.pageHeight ?? 15840)}"/><w:pgMar w:top="${esc(a.marginTop ?? 1440)}" w:right="${esc(a.marginRight ?? 1440)}" w:bottom="${esc(a.marginBottom ?? 1440)}" w:left="${esc(a.marginLeft ?? 1440)}" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>`;
  }
  const surfaces = (root.content ?? []).filter(n => n.stype === 'surface' && n.attributes?.kind !== 'canvas');
  if (!surfaces.length) throw new Error('내보낼 본문 구역이 없습니다.');
  // Scope notice is unconditional: attribute-level fidelity is not fully implemented yet.
  warnings.add('기본 DOCX 내보내기: 다중 문단 책갈피·고급 필드·고급 문단 서식·머리글/바닥글·각주·댓글·변경 이력·수식·이미지·목록은 원형 보존 대상이 아닙니다. 원본은 .word.json으로 보관하세요.');
  const body = surfaces.map((s, i) => (s.content ?? []).map(block).join('') + (i === surfaces.length - 1 ? section(s.attributes ?? {}) : `<w:p><w:pPr>${section(s.attributes ?? {})}</w:pPr></w:p>`)).join('');
  const styleXml = [...styles].map(([id, a]) => {
    // OOXML style booleans toggle inherited values; the editor stores absolute values.
    const parent = { ...defaults, ...style(a.basedOn) };
    const format = { ...a };
    for (const key of ['bold', 'italic', 'strike']) if (a[key] != null) format[key] = Boolean(a[key]) !== Boolean(parent[key]);
    return `<w:style w:type="${esc(a.type ?? 'paragraph')}" w:styleId="${esc(id)}"${a.isDefault || id === 'Normal' ? ' w:default="1"' : ''}>${val('name', a.name ?? id)}${val('basedOn', a.basedOn)}${val('next', a.next)}${val('link', a.link)}<w:pPr>${paragraphProperties(a)}</w:pPr><w:rPr>${runProperties(format)}</w:rPr></w:style>`;
  }).join('');
  const files = {
    '[Content_Types].xml': xml('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>'),
    '_rels/.rels': xml('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
    'word/_rels/document.xml.rels': xml('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'),
    'word/styles.xml': xml(`<w:styles xmlns:w="${W}"><w:docDefaults><w:rPrDefault><w:rPr>${runProperties(defaults)}</w:rPr></w:rPrDefault><w:pPrDefault><w:pPr>${paragraphProperties(defaults)}</w:pPr></w:pPrDefault></w:docDefaults>${styleXml}</w:styles>`),
    'word/document.xml': xml(`<w:document xmlns:w="${W}"><w:body>${body}</w:body></w:document>`)
  };
  return { bytes: zipSync(Object.fromEntries(Object.entries(files).map(([name, text]) => [name, new Uint8Array(strToU8(text))]))), warnings: [...warnings] };
}
