import { inlineMathAt, installMarkdownMath } from './markdown-math';
import MarkdownIt from 'markdown-it';
import { HTMLConverter, registerDefaultHTMLRules } from '@barocss/converter';
import { readNoteFile, type NoteDocument } from './note-file';

type Node = { stype: string; text?: string; attributes?: Record<string, any>; marks?: { stype: string; attrs?: Record<string, any>; range?: number[] }[]; content?: Node[] };
export type NoteExchangeFormat = 'markdown' | 'html' | 'csv';
const htmlConverter = () => { registerDefaultHTMLRules(); return new HTMLConverter(); };

/** RFC-style quoted records; an embedded newline belongs to its cell. */
export function readNoteCSV(source: string): string[][] {
  return readNoteDelimited(source, ',');
}
export function readNoteDelimited(source: string, delimiter: '\t' | ','): string[][] {
  const rows: string[][] = []; let row: string[] = [], cell = '', quoted = false, closed = false;
  source = source.replace(/^\uFEFF/, '');
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"') { if (source[i + 1] === '"') { cell += '"'; i++; } else { quoted = false; closed = true; } }
      else cell += ch;
    } else if (ch === delimiter || ch === '\n' || ch === '\r') {
      row.push(cell); cell = ''; closed = false;
      if (ch !== delimiter) { rows.push(row); row = []; if (ch === '\r' && source[i + 1] === '\n') i++; }
    } else if (ch === '"' && !cell && !closed) quoted = true;
    else { if (closed || ch === '"') throw new Error('CSV 따옴표 형식이 올바르지 않습니다.'); cell += ch; }
  }
  if (quoted) throw new Error('CSV의 닫는 따옴표가 없습니다.');
  if (cell || closed || row.length || !rows.length) { row.push(cell); rows.push(row); }
  if (rows.length > 10000 || rows.some(row => row.length > 200)) throw new Error('CSV는 10,000행, 200열까지 가져올 수 있습니다.');
  const width = Math.max(...rows.map(row => row.length));
  return rows.map(row => [...row, ...Array(width - row.length).fill('')]);
}
function safeHTML(source: string) {
  const doc = new DOMParser().parseFromString(source, 'text/html');
  doc.querySelectorAll('script,style,iframe,object,embed,base,link,meta,form').forEach(node => node.remove());
  doc.querySelectorAll('*').forEach(node => [...node.attributes].forEach(attr => {
    if (/^on/i.test(attr.name) || (['href', 'src'].includes(attr.name) && !/^(https?:|mailto:|tel:|\/|#)/i.test(attr.value))) node.removeAttribute(attr.name);
  }));
  return doc.body.innerHTML;
}
function importNode(node: Node): Node {
  const children = (node.content ?? []).map(importNode).filter(child => !(['blockQuote', 'list', 'list_item'].includes(node.stype) && child.stype === 'inline-text' && !child.text?.trim()));
  if (node.stype === 'list') return { stype: 'list', attributes: { type: node.attributes?.ordered ? 'ordered' : 'bullet' }, content: children.filter(child => child.stype === 'listItem') };
  if (node.stype === 'list_item') {
    const result: Node[] = []; let inline: Node[] = [];
    const flush = () => { if (inline.length) { result.push({ stype: 'paragraph', content: inline }); inline = []; } };
    for (const child of children) { if (['inline-text', 'hardBreak'].includes(child.stype)) inline.push(child); else { flush(); result.push(child); } } flush();
    return { stype: 'listItem', content: result.length ? result : [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: '' }] }] };
  }
  return { ...node, ...(node.content ? { content: children } : {}) };
}
export function importNoteExchange(source: string, name: string): NoteDocument {
  const extension = name.split('.').pop()?.toLowerCase();
  let content: Node[];
  if (extension === 'csv') {
    content = [{ stype: 'bTable', content: [{ stype: 'bTableBody', content: readNoteCSV(source).map(row => ({ stype: 'bTableRow', content: row.map(text => ({ stype: 'bTableCell', content: [{ stype: 'inline-text', text }] })) })) }] }];
  } else if (['md', 'markdown', 'html', 'htm'].includes(extension ?? '')) {
    const equations = new Map<string, Node>();
    const prefix = 'MATH' + crypto.randomUUID().replace(/-/g, '') + 'TOKEN';
    const md = new MarkdownIt({ html: false });
    installMarkdownMath(md, (tex, block) => { const key = prefix + equations.size + 'END'; equations.set(key, { stype: block ? 'mathBlock' : 'mathInline', attributes: { tex, engine: 'katex' } }); return key; });
    const html = extension === 'md' || extension === 'markdown' ? md.render(source) : source;
    content = (htmlConverter().parse(safeHTML(html)) as Node[]).map(importNode);
    const restore = (node: Node): Node[] => {
      if (node.stype === 'paragraph' && node.content?.length === 1) {
        const math = equations.get(node.content[0].text ?? '');
        if (math?.stype === 'mathBlock') return [math];
      }
      if (node.stype === 'inline-text' && node.text?.includes(prefix)) {
        const parts: Node[] = []; let at = 0;
        const pushText = (end: number) => { if (end > at) parts.push({ ...node, text: node.text!.slice(at, end), marks: node.marks?.flatMap(mark => {
          const [from, to] = mark.range ?? [0, node.text!.length];
          return to > at && from < end ? [{ ...mark, range: [Math.max(from, at) - at, Math.min(to, end) - at] }] : [];
        }) }); };
        for (const match of node.text.matchAll(new RegExp(prefix + '\\d+END', 'g'))) {
          const math = equations.get(match[0]); if (!math) continue;
          pushText(match.index!); parts.push(math); at = match.index! + match[0].length;
        }
        pushText(node.text.length); return parts;
      }
      return [{ ...node, ...(node.content ? { content: node.content.flatMap(restore) } : {}) }];
    };
    content = content.flatMap(restore);
  } else throw new Error('Note JSON, Markdown, HTML, CSV 파일을 선택하세요.');
  const document: NoteDocument = { stype: 'note', attributes: { title: name.replace(/\.[^.]+$/, '') || '가져온 문서' }, content: content.length ? content : [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: '' }] }] };
  const checked = readNoteFile(JSON.stringify({ format: 'barocss-note', version: 1, document }));
  if ('error' in checked) throw new Error(checked.error);
  return checked.document;
}
const textOf = (node: Node): string => node.text ?? (node.content ?? []).map(textOf).join('');
const escaped = (text: string) => text.replace(/([$\\`*_{}\[\]<>#+.!|~-])/g, '\\$1');
function inline(node: Node): string {
  if (node.stype === 'mathInline') {
    if (node.attributes?.fontSize !== undefined && node.attributes.fontSize !== 18) throw new Error('사용자 지정 수식 크기는 Markdown으로 보존할 수 없습니다. Note JSON을 사용하세요.');
    const tex = String(node.attributes?.tex ?? ''), wrapped = '$' + tex + '$';
    const parsed = inlineMathAt(wrapped, 0);
    if (!parsed || parsed.tex !== tex || parsed.end !== wrapped.length) throw new Error('이 인라인 수식은 Markdown으로 보존할 수 없습니다. Note JSON을 사용하세요.');
    return wrapped;
  }
  if (node.stype === 'hardBreak') return '  \n';
  if (node.stype !== 'inline-text') throw new Error(`Markdown에서 ${node.stype} 인라인 객체를 보존할 수 없습니다. Note JSON을 사용하세요.`);
  const text = node.text ?? '', marks = node.marks ?? [];
  const cuts = [...new Set([0, text.length, ...marks.flatMap(mark => mark.range ?? [0, text.length])])].sort((a,b) => a-b);
  return cuts.slice(0,-1).map((start, index) => {
    const end = cuts[index+1], active = marks.filter(mark => !mark.range || mark.range[0] <= start && mark.range[1] >= end);
    let value = escaped(text.slice(start,end));
    for (const mark of active) {
      if (mark.stype === 'code') { const raw = text.slice(start,end), fence = '`'.repeat(Math.max(0, ...[...raw.matchAll(/`+/g)].map(match => match[0].length)) + 1); value = `${fence} ${raw} ${fence}`; }
      else if (mark.stype === 'bold') value = `**${value}**`;
      else if (mark.stype === 'italic') value = `*${value}*`;
      else if (mark.stype === 'strikethrough') value = `~~${value}~~`;
      else if (mark.stype === 'link') value = `[${value}](${String(mark.attrs?.href ?? '').replace(/[()\s]/g, ch => encodeURIComponent(ch))})`;
      else throw new Error('Markdown으로 색상·밑줄·첨자 서식을 보존할 수 없습니다. HTML 또는 Note JSON을 사용하세요.');
    }
    return value;
  }).join('');
}
function markdown(node: Node): string {
  if (node.attributes?.alignment && node.attributes.alignment !== (node.stype === 'mathBlock' ? 'center' : 'left')) throw new Error('문단 정렬은 Markdown으로 보존할 수 없습니다. Note JSON을 사용하세요.');
  if (node.stype === 'mathBlock' && node.attributes?.fontSize !== undefined && node.attributes.fontSize !== 24) throw new Error('사용자 지정 수식 크기는 Markdown으로 보존할 수 없습니다. Note JSON을 사용하세요.');
  const children = node.content ?? [], body = () => children.map(inline).join('');
  switch (node.stype) {
    case 'mathBlock': { const tex = String(node.attributes?.tex ?? ''); if (!tex.trim() || /^\s*\$\$\s*$/m.test(tex) || tex.endsWith('\n')) throw new Error('이 수식은 Markdown으로 보존할 수 없습니다. Note JSON을 사용하세요.'); return '$$\n' + tex + '\n$$'; }
    case 'paragraph': return body();
    case 'heading': return '#'.repeat(Number(node.attributes?.level ?? 1)) + ' ' + body();
    case 'codeBlock': { const text = textOf(node), fence = '`'.repeat(Math.max(2, ...[...text.matchAll(/`+/g)].map(m => m[0].length)) + 1); return `${fence}${node.attributes?.language === 'text' ? '' : node.attributes?.language ?? ''}\n${text.endsWith('\n') ? text : text + '\n'}${fence}`; }
    case 'blockQuote': return children.map(markdown).join('\n\n').split('\n').map(line => '> ' + line).join('\n');
    case 'list': return children.map((item,i) => { const marker = node.attributes?.type === 'ordered' ? `${i+1}. ` : '- '; return marker + (item.content ?? []).map(markdown).join('\n\n').replace(/\n/g, '\n' + ' '.repeat(marker.length)); }).join('\n');
    default: throw new Error(`Markdown에서 ${node.stype} 블록을 보존할 수 없습니다. HTML 또는 Note JSON을 사용하세요.`);
  }
}
export function exportNoteExchange(document: NoteDocument, format: NoteExchangeFormat): { text: string; extension: string; mime: string } {
  const nodes = document.content as Node[];
  if (format === 'markdown') {
    const text = nodes.map(markdown).join('\n\n') + '\n';
    const expected: Record<string, string[]> = { mathInline: [], mathBlock: [] }, actual: Record<string, string[]> = { mathInline: [], mathBlock: [] };
    const collect = (node: Node) => { if (['mathInline', 'mathBlock'].includes(node.stype)) expected[node.stype].push(String(node.attributes?.tex ?? '')); node.content?.forEach(collect); };
    nodes.forEach(collect);
    const md = new MarkdownIt({ html: false });
    installMarkdownMath(md, (tex, block) => { actual[block ? 'mathBlock' : 'mathInline'].push(tex); return ''; }); md.render(text);
    if (JSON.stringify(expected) !== JSON.stringify(actual)) throw new Error('인접한 수식이나 숫자로 인해 Markdown 수식 경계를 보존할 수 없습니다. Note JSON을 사용하세요.');
    return { text, extension: 'md', mime: 'text/markdown;charset=utf-8' };
  }
  if (format === 'csv') {
    const tables = nodes.filter(node => node.stype === 'bTable');
    if (tables.length !== 1 || nodes.length !== 1) throw new Error('CSV 내보내기는 표 하나만 있는 문서에서 사용할 수 있습니다.');
    const rows = (tables[0].content ?? []).flatMap(section => section.content ?? []);
    const text = rows.map(row => (row.content ?? []).map(cell => {
      if (Number(cell.attributes?.colspan ?? 1) > 1 || Number(cell.attributes?.rowspan ?? 1) > 1) throw new Error('병합된 셀은 CSV로 보존할 수 없습니다.');
      return '"' + textOf(cell).replace(/"/g, '""') + '"';
    }).join(',')).join('\r\n');
    return { text: '\uFEFF' + text, extension: 'csv', mime: 'text/csv;charset=utf-8' };
  }
  const check = (node: Node) => { if (!['paragraph', 'heading', 'inline-text', 'hardBreak', 'list', 'listItem', 'blockQuote', 'codeBlock'].includes(node.stype)) throw new Error('이 문서의 일부 블록은 HTML로 보존할 수 없습니다. Note JSON으로 내보내세요.'); node.content?.forEach(check); };
  nodes.forEach(check);
  return { text: '<!doctype html><html><head><meta charset="utf-8"></head><body>' + nodes.map(htmlNode).join('') + '</body></html>', extension: 'html', mime: 'text/html;charset=utf-8' };
}

function htmlNode(node: Node): string {
  const children = () => (node.content ?? []).map(htmlNode).join('');
  if (node.stype === 'list') { const tag = node.attributes?.type === 'ordered' ? 'ol' : 'ul'; return `<${tag}>${children()}</${tag}>`; }
  if (node.stype === 'listItem') return `<li>${children()}</li>`;
  if (node.stype === 'blockQuote') return `<blockquote>${children()}</blockquote>`;
  if (node.stype === 'codeBlock') { const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); return `<pre><code class="language-${escape(String(node.attributes?.language ?? 'text'))}">${escape(textOf(node))}</code></pre>`; }
  return htmlConverter().convert([node] as never, 'html');
}
