import { describe, expect, it } from 'vitest';
import { documentFileFormat, forFile } from './document-file';

/**
 * **문서를 파일로 쓰고 되읽는 것** — 제품이 아니라 이 층이 답하는 부분.
 *
 * 이 파일이 있는 이유는 `document-file.ts` 머리말에 있고, 여기서 확인하는 것은 그중 셋이다:
 * 세션이 빌려준 이름이 파일에 안 들어가는가, 네 가지 거절이 **어느 것인지** 말하는가, 그리고
 * 쓴 것을 되읽으면 같은 문서인가.
 *
 * 브라우저가 필요 없다 — 답을 정하는 것이 전부 우리 코드다(`docs/specs/testing.md`).
 */
const WORD = documentFileFormat({
  format: 'barocss-word',
  noun: '문서',
  version: 1,
  extension: '.word.json'
});

const DECK = documentFileFormat({
  format: 'barocss-slides',
  noun: '슬라이드',
  version: 2,
  extension: '.deck.json'
});

const doc = () => ({
  sid: 'word:1',
  stype: 'document',
  content: [
    { sid: 'word:2', parentId: 'word:1', stype: 'paragraph', content: [
      { sid: 'word:3', parentId: 'word:2', stype: 'inline-text', text: '한 줄' }
    ] }
  ]
});

describe('세션이 빌려준 이름은 파일에 안 들어간다', () => {
  it('sid 와 parentId 를 트리 끝까지 걷어낸다', () => {
    const out = JSON.stringify(forFile(doc()));
    expect(out).not.toContain('sid');
    expect(out).not.toContain('parentId');
    /* 그리고 문서의 것은 남는다 — 걷어내는 것이 지우는 것이 되면 안 된다. */
    expect(out).toContain('한 줄');
    expect(out).toContain('paragraph');
  });

  it('배열 안의 것도 걷어낸다', () => {
    expect(JSON.stringify(forFile([{ sid: 'a', stype: 'x' }]))).toBe('[{"stype":"x"}]');
  });

  it('객체가 아닌 것은 그대로 돌려준다', () => {
    expect(forFile('글자')).toBe('글자');
    expect(forFile(7)).toBe(7);
    expect(forFile(null)).toBe(null);
  });
});

describe('쓴 것을 되읽으면 같은 문서다', () => {
  it('봉투에 format 과 version 이 있고 문서가 온전하다', () => {
    const read = WORD.read(WORD.text(doc()));
    expect('error' in read, 'error' in read ? read.error : '').toBe(false);
    expect((read as { version: number }).version).toBe(1);
    expect(JSON.stringify((read as { document: unknown }).document)).toBe(
      JSON.stringify(forFile(doc()))
    );
  });

  it('savedAt 은 준 때만 실린다 — 빈 값이 파일에 남지 않게', () => {
    expect(WORD.text(doc())).not.toContain('savedAt');
    expect(WORD.text(doc(), '2026-09-06')).toContain('"savedAt": "2026-09-06"');
  });

  it('사람이 읽을 수 있게 들여쓴다', () => {
    /* 풀 리퀘스트에서 diff 하고 버그 리포트에 붙이는 것이라 한 줄로 아끼지 않는다. */
    expect(WORD.text(doc())).toContain('\n  "format"');
    expect(WORD.text(doc()).endsWith('\n')).toBe(true);
  });
});

describe('거절할 때는 넷 중 어느 것인지 말한다', () => {
  const why = (read: ReturnType<typeof WORD.read>): string =>
    'error' in read ? read.error : '(거절하지 않았다)';

  it('JSON 이 아니다', () => {
    expect(why(WORD.read('{'))).toContain('JSON');
  });

  it('객체가 아니다', () => {
    expect(why(WORD.read('[1,2]'))).toBe('이 파일은 문서 파일이 아닙니다.');
  });

  it('다른 제품의 파일이다 — 그리고 독자의 낱말로 말한다', () => {
    /* 덱에서 *"문서 파일이 아닙니다"* 는 남의 프로그램 이야기다. 거절은 공용이고 낱말은 아니다. */
    expect(why(WORD.read(DECK.text(doc())))).toBe('이 파일은 Barocss 문서 파일이 아닙니다.');
    expect(why(DECK.read(WORD.text(doc())))).toBe('이 파일은 Barocss 슬라이드 파일이 아닙니다.');
  });

  it('더 새로운 버전이다 — 그리고 그 번호를 말한다', () => {
    const newer = JSON.stringify({ format: 'barocss-word', version: 9, document: forFile(doc()) });
    expect(why(WORD.read(newer))).toContain('9');
  });

  it('문서가 없다', () => {
    const empty = JSON.stringify({ format: 'barocss-word', version: 1 });
    expect(why(WORD.read(empty))).toContain('문서가 없습니다');
  });

  /**
   * **스키마는 여기서 안 본다.** `loadDocument` 가 이미 경로까지 대며 보고하고, *거의* 맞는
   * 문서는 거절이 아니라 경고로 열려야 한다 — 아니면 독자는 자기 작업을 꺼낼 수 없는 파일을
   * 손에 쥔다.
   */
  it('모르는 노드가 있어도 거절하지 않는다', () => {
    const odd = JSON.stringify({
      format: 'barocss-word',
      version: 1,
      document: { stype: 'document', content: [{ stype: '아무도모르는것' }] }
    });
    expect('error' in WORD.read(odd)).toBe(false);
  });
});

describe('내려받는 이름', () => {
  it('제목을 쓰고 확장자를 붙인다', () => {
    expect(WORD.fileName('분기 보고서', '문서')).toBe('분기 보고서.word.json');
  });

  it('플랫폼이 거절하는 글자를 지운다', () => {
    /* `/`·`\` 는 구분자이고 `:` 는 macOS 에서 구분자이면서 Windows 에서 금지다. */
    expect(WORD.fileName('a/b\\c:d*e?f"g<h>i|j', '문서')).toBe('a b c d e f g h i j.word.json');
  });

  it('제목이 전부 그런 글자면 대신할 이름을 쓴다 — 이름 없는 내려받기는 못 찾는다', () => {
    expect(WORD.fileName('///', '문서')).toBe('문서.word.json');
    expect(WORD.fileName(undefined, '문서')).toBe('문서.word.json');
  });

  it('아주 긴 제목을 자른다', () => {
    expect(WORD.fileName('가'.repeat(200), '문서').length).toBeLessThan(80);
  });

  it('앞의 점을 뗀다 — 안 그러면 유닉스에서 숨은 파일이 된다', () => {
    expect(WORD.fileName('...초안', '문서')).toBe('초안.word.json');
  });

  it('탭과 줄바꿈도 뗀다 — 제목은 가질 수 있고 파일 이름은 못 가진다', () => {
    expect(WORD.fileName('한\t줄\n둘', '문서')).toBe('한 줄 둘.word.json');
  });
});
