import { describe, it, expect } from 'vitest';
import type { DocumentAccess } from '@barocss/office-text';
import { documentFontFamilies } from '../src/fonts';

/**
 * **이 문서가 실제로 쓰는 글꼴.**
 *
 * 카탈로그 쪽 검사는 `office-controls/test/fonts.test.ts` 로 모듈과 함께 갔다. 여기 남은 것은
 * *문서를 훑는* 질문이고, 그건 이 패키지의 것이다.
 */
const docOf = (nodes: Record<string, any>, rootId = 'root'): DocumentAccess => ({
  getNode: (id: string) => nodes[id],
  rootId
});

describe('what a document names', () => {
  it('finds fonts named by a style and by direct formatting alike', () => {
    const doc = docOf({
      root: { sid: 'root', content: ['res', 'body'] },
      res: { sid: 'res', stype: 'resources', content: ['s1'] },
      s1: { sid: 's1', stype: 'styleDef', attributes: { fontFamily: 'Merriweather' } },
      body: { sid: 'body', content: ['t1'] },
      t1: {
        sid: 't1',
        stype: 'inline-text',
        text: 'hello',
        marks: [{ stype: 'fontFamily', range: [0, 5], attrs: { family: 'Inter' } }]
      }
    });
    expect(documentFontFamilies(doc).sort()).toEqual(['Inter', 'Merriweather']);
  });

  it('reduces a stack to the family that has to be fetched', () => {
    const doc = docOf({
      root: { sid: 'root', content: ['s1'] },
      s1: { sid: 's1', stype: 'styleDef', attributes: { fontFamily: '"Lora", Georgia, serif' } }
    });
    expect(documentFontFamilies(doc)).toEqual(['Lora']);
  });

  it('leaves out what needs no fetching', () => {
    // A document set entirely in system fonts costs no requests, which is the
    // usual case and has to stay free.
    const doc = docOf({
      root: { sid: 'root', content: ['s1'] },
      s1: { sid: 's1', stype: 'styleDef', attributes: { fontFamily: 'Georgia, serif' } }
    });
    expect(documentFontFamilies(doc)).toEqual([]);
  });

  it('survives a document that is cyclic or empty', () => {
    expect(documentFontFamilies(docOf({ root: { sid: 'root' } }))).toEqual([]);
    const cyclic = docOf({ root: { sid: 'root', content: ['a'] }, a: { sid: 'a', content: ['a'] } });
    expect(documentFontFamilies(cyclic)).toEqual([]);
  });
});
