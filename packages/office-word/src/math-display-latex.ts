import { toLatex } from '@barocss/math-editor/core';
import { wordToMathEditor, type WordMathNode } from './math-editor-bridge';

/** Display can preserve run formatting that the interactive bridge cannot edit. */
export function wordMathDisplayLatex(math: WordMathNode): string {
  const runs: string[] = [];
  const prepare = (source: WordMathNode): WordMathNode => {
    if (source.stype !== 'mathRun') return { ...source, content: source.content?.map(prepare) };
    const { literal, style, script, ...attributes } = source.attributes ?? {};
    if (literal !== undefined && typeof literal !== 'boolean') throw new Error('Unsupported literal style');
    if (style !== undefined && !['p', 'b', 'i', 'bi'].includes(String(style))) throw new Error('Unsupported math style');
    const fonts: Record<string, string> = { roman: '', script: 'mathcal', fraktur: 'mathfrak', 'double-struck': 'mathbb', 'sans-serif': 'mathsf', monospace: 'mathtt' };
    if (script !== undefined && !(String(script) in fonts)) throw new Error('Unsupported math font');
    // Literal runs use text mode so spaces and punctuation survive display.
    let latex = toLatex(wordToMathEditor({ stype: 'oMath', content: [{ ...source, attributes: { ...attributes, ...(literal === true ? { literal: true } : {}) } }] }));
    const font = fonts[String(script ?? 'roman')];
    if (font) latex = `\\${font}{${latex}}`;
    else if (literal !== true && style === 'p') latex = `\\mathrm{${latex}}`;
    else if (literal !== true && style === 'b') latex = `\\mathbf{${latex}}`;
    // A nested \mathrm overrides \boldsymbol in KaTeX. Use \mathbf directly
    // for upright bold, and textbf for literal runs so spaces remain text.
    if (literal === true && style === 'b' && !font) latex = latex.replace(/^\\text\{/, '\\textbf{');
    else if (style === 'bi' || style === 'b' && !!font) latex = `\\boldsymbol{${latex}}`;
    const index = runs.push(latex) - 1;
    return { stype: 'mathRun', content: [{ stype: 'inline-text', text: `BAROCSSMATHRUN${index}END` }] };
  };
  return toLatex(wordToMathEditor(prepare(math))).replace(/BAROCSSMATHRUN(\d+)END/g, (_, index) => runs[Number(index)]);
}
