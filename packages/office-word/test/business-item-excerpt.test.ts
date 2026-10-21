import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { PinnedItemExcerpt } from '../../../apps/word/src/business-pair-pin';
import { createSampleDocument } from '../src/sample-document';
import { wordFileText } from '../src/word-file';

it('shows the explicitly pinned paragraph while equal draft text remains unrelated', () => {
  const native = createSampleDocument();
  const surface = native.content!.find(node => typeof node !== 'string' && node.stype === 'surface');
  if (!surface || typeof surface === 'string') throw Error('Missing native surface');
  surface.content = [
    { stype: 'paragraph', content: [{ stype: 'bookmarkAnchor', attributes: { id: 'chosen' } }, { stype: 'inline-text', text: 'Retain exact evidence.', marks: [{ stype: 'bold', range: [0, 6] }] }] },
    { stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Retain exact evidence.' }] },
    { stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Unrelated private draft.' }] }
  ];
  const before = structuredClone(native);
  const render = () => renderToStaticMarkup(createElement(PinnedItemExcerpt, { text: wordFileText(native, ''), bookmarkId: 'chosen' }));
  expect(render()).toContain('Retain exact evidence.');
  expect(render()).not.toContain('Unrelated private draft.');
  expect(native).toStrictEqual(before);
  surface.content.push({ stype: 'paragraph', content: [{ stype: 'bookmarkAnchor', attributes: { id: 'chosen' } }, { stype: 'inline-text', text: 'Different paragraph.' }] });
  expect(render()).toContain('보관한 문단 위치를 확인할 수 없습니다.');
  expect(render()).not.toContain('Retain exact evidence.');
});
