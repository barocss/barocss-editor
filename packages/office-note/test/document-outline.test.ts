import { expect, it } from 'vitest';
import { noteHeadings } from '../src/document-outline';
import type { DocumentNode } from '@barocss/office-text';
it('keeps heading order and levels in nested blocks but excludes other item bodies', () => {
  const heading = (sid: string, level: number, text: string): DocumentNode => ({ sid, stype: 'heading', attributes: { level }, content: [{ stype: 'inline-text', text }] });
  const root = { stype: 'note', content: [heading('a', 1, '개요'), { stype: 'bDetails', content: [heading('b', 3, '')] }, { stype: 'resources', content: [heading('item', 1, '다른 본문')] }, heading('c', 2, '다음 단계')] };
  expect(noteHeadings({ rootId: 'root', getNode: id => id === 'root' ? root : undefined })).toEqual([{ id: 'a', level: 1, label: '개요' }, { id: 'b', level: 3, label: '제목 없음' }, { id: 'c', level: 2, label: '다음 단계' }]);
});
