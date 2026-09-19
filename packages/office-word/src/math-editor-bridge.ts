import { row, textNode, mathStructures, type StructureKind, type MathDocument, type MathRow, type MathNode } from '@barocss/math-editor/core';
const supportedStructures = new Set<StructureKind>(['fraction', 'root', 'indexedRoot', 'scripts', 'superscript', 'subscript', 'parentheses', 'brackets', 'absolute', 'norm', 'braces', 'angle', 'sum', 'product', 'integral', 'matrix', 'textGroup', 'roman', 'bold']);
/** Hide tools that cannot round-trip through Word. Imports still validate on Apply. */
export const wordMathExcludedStructures = mathStructures.flatMap(item => item.kind && !supportedStructures.has(item.kind) ? [item.kind] : []);
export interface WordMathNode { stype: string; text?: string; attributes?: Record<string, unknown>; marks?: unknown[]; content?: WordMathNode[] }
const node = (stype: string, content: WordMathNode[] = [], attributes?: Record<string, unknown>): WordMathNode => ({ stype, content, ...(attributes ? { attributes } : {}) });
const unsupported = () => new Error('이 수식의 구조 또는 서식은 팝업에서 아직 보존할 수 없습니다. 문서 안에서 직접 편집해 주세요.');
const runFormats = { textGroup: { literal: true }, roman: { style: 'p' }, bold: { style: 'b' } } as const;
const slots: Record<string, [string, string[]]> = {
 fraction: ['mathFraction', ['mathNum', 'mathDen']], root: ['mathRadical', ['mathElement']],
 superscript: ['mathSuperscript', ['mathElement', 'mathSup']], subscript: ['mathSubscript', ['mathElement', 'mathSub']],
 scripts: ['mathSubSup', ['mathElement', 'mathSub', 'mathSup']]
};
/** No LaTeX round-trip: translate editable slots directly to Word's OMML-shaped model. */
export function mathEditorToWord(document: MathDocument): WordMathNode {
 function convertRow(r: MathRow): WordMathNode[] { return r.children.map(convert); }
 function convert(n: MathNode): WordMathNode {
  if ('mathStyle' in n && n.mathStyle) throw new Error('분수의 개별 표시 크기는 아직 Word 변환을 지원하지 않습니다. \\frac 구문을 사용해 주세요.');
  if (n.type === 'text') return node('mathRun', [{ stype: 'inline-text', text: n.text }]);
  if (n.type === 'textGroup' || n.type === 'roman' || n.type === 'bold') {
   // Word stores these formats on runs, not on a container. Preserve a single
   // text group exactly; do not flatten nested structures or overwrite styles.
   if (n.slots.length !== 1 || n.slots[0].children.some(child => child.type !== 'text')) throw new Error('수식 글꼴 서식은 텍스트에 적용할 수 있습니다. 서식 안의 분수·첨자·중첩 서식을 밖으로 옮겨 주세요.');
   return node('mathRun', [{ stype: 'inline-text', text: n.slots[0].children.map(child => (child as ReturnType<typeof textNode>).text).join('') }], runFormats[n.type]);
  }
  if (n.type === 'indexedRoot') return node('mathRadical', [node('mathDeg', convertRow(n.slots[0])), node('mathElement', convertRow(n.slots[1]))], { hideDegree: false });
  const spec = slots[n.type];
  if (spec) {
   const children = spec[1].map((name, i) => node(name, convertRow(n.slots[i])));
   if (n.type === 'root') children.unshift(node('mathDeg'));
   return node(spec[0], children, n.type === 'root' ? { hideDegree: true } : undefined);
  }
  const delimiters = { parentheses: ['(', ')'], brackets: ['[', ']'], absolute: ['|', '|'], norm: ['‖', '‖'], braces: ['{', '}'], angle: ['⟨', '⟩'] };
  if (n.type in delimiters) {
   const [open, close] = delimiters[n.type as keyof typeof delimiters];
   return node('mathDelimiter', [node('mathElement', convertRow(n.slots[0]))], { open, close });
  }
  if (n.type === 'sum' || n.type === 'product' || n.type === 'integral') return node('mathNary', ['mathSub', 'mathSup', 'mathElement'].map((name, i) => node(name, convertRow(n.slots[i]))), { char: { sum: '∑', product: '∏', integral: '∫' }[n.type] });
  if (n.type === 'matrix') {
   const rows: WordMathNode[] = [];
   for (let i = 0; i < n.slots.length; i += n.columns) rows.push(node('mathRow', n.slots.slice(i, i + n.columns).map(r => node('mathElement', convertRow(r)))));
   const matrix = node('mathMatrix', rows);
   if (n.environment === 'matrix') return matrix;
   const [open, close] = ({ pmatrix: ['(', ')'], bmatrix: ['[', ']'], Bmatrix: ['{', '}'], vmatrix: ['|', '|'], Vmatrix: ['‖', '‖'] })[n.environment];
   return node('mathDelimiter', [node('mathElement', [matrix])], { open, close });
  }
  throw new Error('이 수식 구조는 아직 Word 변환을 지원하지 않습니다. 초안을 수정하거나 취소해 주세요.');
 }
 if (document.additionalLines?.length) throw new Error('현재 Word 수식 팝업은 한 줄 수식을 지원합니다. 추가 줄을 정리한 뒤 적용하세요.');
 return node('oMath', convertRow(document.root));
}

/** Fail closed when a source construct or formatting cannot survive the popup. */
export function wordToMathEditor(math: WordMathNode): MathDocument {
 function readRow(content: WordMathNode[] = []): MathRow {
  const result = row(); result.children = [];
  for (const n of content) {
   const value = read(n);
   if (value.type !== 'text' && result.children.at(-1)?.type !== 'text') result.children.push(textNode());
   if (value.type === 'text' && result.children.at(-1)?.type === 'text') (result.children.at(-1) as ReturnType<typeof textNode>).text += value.text;
   else result.children.push(value);
  }
  if (result.children.at(-1)?.type !== 'text') result.children.push(textNode());
  return result;
 }
 function hasText(n?: WordMathNode): boolean { return !!n && (!!n.text || (n.content ?? []).some(hasText)); }
 function read(n: WordMathNode): MathNode {
  const a = n.attributes ?? {}, children = n.content ?? [];
  const plainAttrs: Record<string, unknown> = { type: 'bar', hideDegree: true, literal: false, style: 'i', script: 'roman', grow: true, shape: 'centered', separator: '|', limitLocation: 'undOvr', hideSub: false, hideSup: false, columnAlignment: 'center', plcHide: false };
  for (const [key, value] of Object.entries(a)) {
   if (['char', 'open', 'close'].includes(key)) continue;
   if (n.stype === 'mathRadical' && key === 'hideDegree' && value === false) continue;
   if (n.stype === 'mathRun' && (key === 'literal' && value === true || key === 'style' && (value === 'p' || value === 'b'))) continue;
   if (value !== undefined && plainAttrs[key] !== value) throw unsupported();
  }
  if (n.marks?.length) throw unsupported();
  if (n.stype === 'mathRun') {
   if (children.some(c => c.stype !== 'inline-text' || c.marks?.length || Object.keys(c.attributes ?? {}).length)) throw unsupported();
   const text = children.map(c => c.text ?? '').join('');
   if (a.literal === true && a.style !== undefined && a.style !== 'i') throw unsupported();
   const type = a.literal === true ? 'textGroup' : a.style === 'p' ? 'roman' : a.style === 'b' ? 'bold' : undefined;
   return type ? { id: row().id, type, slots: [row(text)] } : textNode(text);
  }
  for (const [type, [stype, names]] of Object.entries(slots)) if (n.stype === stype) {
   if (type === 'root') {
    const degree = children.find(c => c.stype === 'mathDeg');
    const element = children.find(c => c.stype === 'mathElement');
    if (a.hideDegree === false) {
     if (!degree || !element) throw unsupported();
     return { id: row().id, type: 'indexedRoot', slots: [readRow(degree.content), readRow(element.content)] };
    }
    // A hidden degree may still contain source data; never discard it on Apply.
    if (hasText(degree)) throw unsupported();
   }
   const parts = names.map(name => { const found = children.find(c => c.stype === name); if (!found) throw unsupported(); return readRow(found.content); });
   return { id: row().id, type: type as 'fraction' | 'root' | 'superscript' | 'subscript' | 'scripts', slots: parts };
  }
  if (n.stype === 'mathDelimiter') {
   if (children.length !== 1) throw unsupported();
   const pair = `${a.open ?? '('}${a.close ?? ')'}`;
   if (children[0].content?.length === 1 && children[0].content[0].stype === 'mathMatrix') {
    const matrix = read(children[0].content[0]);
    const environment = ({ '()': 'pmatrix', '[]': 'bmatrix', '{}': 'Bmatrix', '||': 'vmatrix', '‖‖': 'Vmatrix' } as const)[pair];
    if (matrix.type !== 'matrix' || !environment) throw unsupported();
    return { ...matrix, environment };
   }
   const type = ({ '()': 'parentheses', '[]': 'brackets', '||': 'absolute', '‖‖': 'norm', '{}': 'braces', '⟨⟩': 'angle' } as const)[pair];
   if (!type) throw unsupported();
   return { id: row().id, type, slots: [readRow(children[0].content)] };
  }
  if (n.stype === 'mathNary') {
   const type = ({ '∑': 'sum', '∏': 'product', '∫': 'integral' } as const)[String(a.char ?? '∑')]; if (!type) throw unsupported();
   return { id: row().id, type, slots: ['mathSub', 'mathSup', 'mathElement'].map(name => readRow(children.find(c => c.stype === name)?.content)) };
  }
  if (n.stype === 'mathMatrix') {
   const columns = children[0]?.content?.length ?? 0;
   if (!columns || children.some(r => r.stype !== 'mathRow' || r.content?.length !== columns)) throw unsupported();
   return { id: row().id, type: 'matrix', columns, environment: 'matrix', slots: children.flatMap(r => r.content!.map(c => readRow(c.content))) };
  }
  throw unsupported();
 }
 if (math.stype !== 'oMath') throw unsupported();
 return { version: 1, root: readRow(math.content) };
}
