import { expect, it } from 'vitest';
import { importNoteExchange, exportNoteExchange, readNoteCSV } from '../src/note-exchange';
it('imports Markdown headings, bold, lists and fenced code into valid Note blocks', () => {
  const doc = importNoteExchange('# Title\n\n**bold**\n\n- One\n- Two\n\n```js\nconst x = 1;\n```', 'test.md');
  expect(doc.content.map((n: any) => n.stype)).toEqual(['heading', 'paragraph', 'list', 'codeBlock']);
  const again = importNoteExchange(exportNoteExchange(doc, 'markdown').text, 'again.md');
  expect(again.content).toEqual(doc.content);
});
it('CSV preserves quotes, commas, Korean, multiline and blank cells through export', () => {
  const source = '이름,메모,빈칸\r\n홍길동,"줄1\n줄2, ""인용""",';
  const doc = importNoteExchange(source, '표.csv');
  expect(readNoteCSV(exportNoteExchange(doc, 'csv').text)).toEqual(readNoteCSV(source));
  expect(() => readNoteCSV('a,"unterminated')).toThrow();
});
it('HTML import removes active content and preserves document text', () => {
  const doc = importNoteExchange('<h2>제목</h2><script>alert(1)</script><p><strong>본문</strong></p>', 'doc.html');
  expect(JSON.stringify(doc)).not.toContain('alert');
  const again = importNoteExchange(exportNoteExchange(doc, 'html').text, 'again.html');
  expect(again.content).toEqual(doc.content);
});
it('unsupported export does not silently discard database data', () => {
  const doc = { stype: 'note' as const, attributes: { title: 'Data' }, content: [{ stype: 'noteDatabase' }] };
  expect(() => exportNoteExchange(doc, 'markdown')).toThrow();
  expect(() => exportNoteExchange(doc, 'html')).toThrow();
  expect(() => exportNoteExchange(doc, 'csv')).toThrow();
});
it('round trips inline and block LaTeX while preserving code and literal currency', () => {
  const source = '본문 $x^2$ 끝\n\n$$\n\\frac{a}{b}\n$$\n\n`$code$` and \\$5\n\n```text\n$literal$\n```';
  const doc = importNoteExchange(source, 'math.md');
  const json = JSON.stringify(doc);
  expect(json).toContain('mathInline'); expect(json).toContain('mathBlock');
  expect(json).toContain('$code$'); expect(json).toContain('$literal$');
  const again = importNoteExchange(exportNoteExchange(doc, 'markdown').text, 'again.md');
  expect(again.content).toEqual(doc.content);
});
it('preserves math inside lists, quotes and surrounding formatted text', () => {
  const doc = importNoteExchange('- before $a+b$ after\n\n> $$\n> x^2\n> $$\n\n**before $z$ after**', 'nested.md');
  expect(JSON.stringify(doc)).not.toContain('TOKEN');
  expect(importNoteExchange(exportNoteExchange(doc, 'markdown').text, 'again.md').content).toEqual(doc.content);
});

it('refuses Markdown math when adjacency or custom presentation would lose meaning', () => {
  const inline = { stype: 'mathInline', attributes: { tex: 'x' } };
  for (const content of [[inline, inline], [inline, { stype: 'inline-text', text: '2' }]]) {
    expect(() => exportNoteExchange({ stype: 'note', attributes: { title: 'Math boundary' }, content: [{ stype: 'paragraph', content }] }, 'markdown')).toThrow();
  }
  expect(() => exportNoteExchange({ stype: 'note', attributes: { title: 'Math boundary' }, content: [{ stype: 'mathBlock', attributes: { tex: 'x', fontSize: 40 } }] }, 'markdown')).toThrow();
});
