import { expect, it } from 'vitest';
import { findTextRanges } from '../src/find-ranges';
import type { DocumentAccess, DocumentNode } from '../src/document-access';
const run = (sid: string, text: string): DocumentNode => ({ sid, stype: 'inline-text', text });
const doc = (content: DocumentNode[]): DocumentAccess => ({ rootId: 'root', getNode: id => id === 'root' ? { sid: id, stype: 'note', content } : undefined });
const paragraph = (...content: DocumentNode[]): DocumentNode => ({ sid: 'p', stype: 'paragraph', content });
it('finds one phrase across adjacent formatted runs with exact source offsets', () => {
  const access = doc([paragraph(run('a', '앞 출시 '), { ...run('b', '일정'), marks: [{ stype: 'bold' }] }, run('c', ' 확인'))]);
  expect(findTextRanges(access, '출시 일정')).toEqual([{ blockId: 'p', text: '앞 출시 일정 확인', parts: [{ sid: 'a', start: 2, end: 5 }, { sid: 'b', start: 0, end: 2 }] }]);
});
it('never invents a phrase across blocks, inline objects, or hidden resource definitions', () => {
  const access = doc([paragraph(run('a', '출시')), paragraph(run('b', '일정')), paragraph(run('c', '출시'), { stype: 'pageReference' }, run('d', '일정')), { stype: 'resources', content: [paragraph(run('hidden', '출시일정'))] }]);
  expect(findTextRanges(access, '출시일정')).toEqual([]);
});
it('uses literal queries and original Unicode offsets instead of case-folded string lengths', () => {
  const access = doc([paragraph(run('a', 'İ 😀 A.a a.a'))]);
  expect(findTextRanges(access, 'a.a').map(hit => hit.parts[0])).toEqual([{ sid: 'a', start: 5, end: 8 }, { sid: 'a', start: 9, end: 12 }]);
  expect(findTextRanges(access, 'a.a', { caseSensitive: true })).toHaveLength(1);
  expect(findTextRanges(access, 'a.a', { wholeWord: true })).toHaveLength(2);
});
it('finds code and closed disclosure text, respects whole words across runs, and never mutates the tree', () => {
  const value = [paragraph(run('a', '한글'), run('b', '검색 한글 검색')), { sid: 'd', stype: 'bDetails', attributes: { open: false }, content: [{ sid: 'code', stype: 'codeBlock', content: [run('code-run', '한글')] }] }];
  const before = JSON.stringify(value);
  expect(findTextRanges(doc(value), '한글', { wholeWord: true })).toHaveLength(2);
  expect(findTextRanges(doc(value), '')).toEqual([]); expect(JSON.stringify(value)).toBe(before);
});
