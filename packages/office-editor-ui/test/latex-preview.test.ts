import { expect, it } from 'vitest';
import { latexPreview } from '../src/latex-editor';
it('renders inline and display math and retains accessible MathML', () => {
  expect(latexPreview('x^2', false).html).toContain('<math');
  expect(latexPreview('\\frac{a}{b}', true).html).toContain('katex-display');
});
it('refuses incomplete and oversized input with a visible error', () => {
  expect(latexPreview('\\frac{', false).error).toBeTruthy();
  expect(latexPreview('x'.repeat(10001), false).error).toBeTruthy();
});
it('does not enable trusted HTML or javascript links', () => {
  expect(latexPreview('\\href{javascript:alert(1)}{x}', false).html).not.toContain('href="javascript:');
  expect(latexPreview('\\htmlStyle{position:fixed}{x}', false).html).not.toMatch(/style="[^"]*position:fixed/);
});
