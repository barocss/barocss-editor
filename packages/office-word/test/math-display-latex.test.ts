import { describe, expect, it } from 'vitest';
import { wordMathDisplayLatex } from '../src/math-display-latex';
import { wordToMathEditor } from '../src/math-editor-bridge';

describe('math display conversion', () => {
  it('preserves literal and bold fonts without relaxing the editing bridge', () => {
    const math = { stype: 'oMath', content: [{ stype: 'mathRun', attributes: { literal: true, style: 'b' }, content: [{ stype: 'inline-text', text: 'sin' }] }] };
    const before = JSON.stringify(math);
    expect(wordMathDisplayLatex(math)).toContain('\\textbf{sin}');
    expect(JSON.stringify(math)).toBe(before);
    expect(() => wordToMathEditor(math)).toThrow();
  });
  it('uses upright bold without an inner roman font overriding it', () => {
    expect(wordMathDisplayLatex({ stype: 'oMath', content: [{ stype: 'mathRun', attributes: { style: 'b' }, content: [{ stype: 'inline-text', text: 'AB' }] }] })).toBe(String.raw`\mathbf{AB}`);
  });
  it('escapes source text and does not interpret it as a LaTeX command', () => {
    const math = { stype: 'oMath', content: [{ stype: 'mathRun', content: [{ stype: 'inline-text', text: '\\href{bad}' }] }] };
    expect(wordMathDisplayLatex(math)).toContain('\\backslash href\\{bad\\}');
  });
  it('keeps unknown run formatting on the native fallback path', () => {
    expect(() => wordMathDisplayLatex({ stype: 'oMath', content: [{ stype: 'mathRun', attributes: { futureFormatting: true }, content: [] }] })).toThrow();
  });
});
