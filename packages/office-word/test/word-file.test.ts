import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import { getWordSchemaDefinition } from '../src/word-schema';
import { createSampleDocument } from '../src/sample-document';
import { createWordEditor } from '../src/word-kit';
import { readWordFile, wordFileName, wordFileText, wordTitle, WORD_FORMAT } from '../src/word-file';
import { surfaceCount } from '../src/word-library';
import { createStarterDocument } from '../src/starter-document';

/**
 * **Word 가 문서를 지킬 수 있는가** — 이 제품이 오늘까지 못 하던 것.
 *
 * `apps/word/src/main.tsx` 는 새로고침마다 샘플을 다시 실었다. 독자가 무엇을 쓰든 돌아오면
 * 없었고, 갖고 있는 파일을 열 방법도 없었다. 덱은 둘 다 할 수 있었다 — 덱이 그 전부를 혼자
 * 만들었기 때문이다.
 *
 * 그래서 이 파일이 재는 것은 두 가지다: **왕복이 문서를 온전히 지키는가**, 그리고 **제품이
 * 자기 몫만 말하는가.** 두 번째가 이 회차의 주장이다 — 파일 형식은 `@barocss/shared` 의
 * 200줄이고 Word 의 것은 넷뿐이다.
 *
 * 브라우저가 필요 없다. 직렬화도 제목을 읽는 것도 우리 코드가 답을 정한다.
 */
const open = () => {
  const schema = createSchema('word', getWordSchemaDefinition());
  const store = new DataStore(undefined as never, schema as never);
  const editor = createWordEditor({ editable: true, schema, dataStore: store } as never);
  /*
   * 캐스트로 걷어내지 않는다 — `loadDocument` 도 `exportDocument` 도 `Editor` 에 있는 메서드다.
   * `editor-is-typed` 톱니가 이것을 세고, 이 파일이 처음 쓰였을 때 357 을 361 로 만들었다.
   */
  editor.loadDocument(createSampleDocument(), 'word');
  return { store, editor };
};

describe('Word 의 문서가 파일을 왕복한다', () => {
  it('쓴 것을 되읽으면 문서가 온전하다', () => {
    const { editor } = open();
    const written = wordFileText(editor.exportDocument());
    const read = readWordFile(written);

    expect('error' in read, 'error' in read ? read.error : '').toBe(false);
    const back = (read as { document: { stype?: string; content?: unknown[] } }).document;
    expect(back.stype).toBe('document');
    /* 샘플의 것이 실제로 실려 있다 — 봉투만 왕복하고 속이 비면 통과할 자리다. */
    expect(JSON.stringify(back)).toContain('Direct formatting wins');
    expect(JSON.stringify(back)).toContain('docTitle');
  });

  it('세션이 빌려준 이름은 안 실린다', () => {
    const { editor } = open();
    const written = wordFileText(editor.exportDocument());
    /* `word:12` 같은 것 — 다른 세션에서 뜻이 없고 같은 세션에서 부딪친다. */
    expect(written).not.toContain('"sid"');
    expect(written).not.toContain('"parentId"');
  });

  it('덱의 파일을 열려고 하면 그렇게 말한다', () => {
    const alien = JSON.stringify({ format: 'barocss-slides', version: 1, document: { stype: 'document' } });
    const read = readWordFile(alien);
    expect('error' in read && read.error).toBe('이 파일은 Barocss 문서 파일이 아닙니다.');
  });

  it('자기 이름을 파일에 적는다', () => {
    const { editor } = open();
    expect(wordFileText(editor.exportDocument())).toContain(`"format": "${WORD_FORMAT}"`);
  });
});

describe('문서가 무엇에 대한 것인가', () => {
  it('docMeta 의 docTitle 을 읽는다 — 첫 제목이 아니라', () => {
    const { store } = open();
    /* 샘플의 첫 흐름 노드는 `Contents` 라는 heading 이다. 그것이 답이면 안 된다. */
    expect(wordTitle(store as never)).toBe('Barocss Word');
  });

  it('제목이 없으면 없다고 한다 — 지어내지 않는다', () => {
    const schema = createSchema('word', getWordSchemaDefinition());
    const store = new DataStore(undefined as never, schema as never);
    expect(wordTitle(store as never)).toBeUndefined();
  });

  it('제목으로 내려받는 이름을 만든다', () => {
    const { store } = open();
    expect(wordFileName(wordTitle(store as never))).toBe('Barocss Word.word.json');
  });

  it('제목이 없으면 대신할 이름을 쓴다 — 이름 없는 내려받기는 못 찾는다', () => {
    expect(wordFileName(undefined)).toBe('문서.word.json');
  });
});

describe('제품이 자기 몫만 말한다', () => {
  /**
   * **이 검사가 이 회차의 주장이다.**
   *
   * 파일 형식은 공용 층의 것이고 제품은 넷만 댄다: 자기 이름, 독자가 부르는 낱말, 판 번호,
   * 제목이 어디 있는가. 이 파일이 봉투를 다시 만들거나 거절 문구를 다시 적기 시작하면 그것은
   * 덱과 갈라지기 시작했다는 뜻이고, 그 드리프트가 바로 공용 층을 만든 이유다.
   */
  it('Word 의 파일 모듈이 형식을 다시 쓰지 않는다', () => {
    /*
     * `__dirname` 이지 `import.meta.url` 이 아니다 — vitest 의 변환을 거치면 그것은 `file:` URL 이
     * 아니고 `readFileSync` 가 거부한다. 이 저장소에서 이미 한 번 겪은 자리다.
     */
    const source = readFileSync(join(__dirname, '..', 'src', 'word-file.ts'), 'utf8');
    /*
     * 넘겨주는 것과 다시 적는 것을 갈라야 한다. 첫 판은 `savedAt` 을 셌는데 그것은 인자
     * 이름이라 **넘겨주는** 자리였고, 이 검사가 자기 이름값을 못 하고 물었다.
     *
     * 다시 적는다는 표시는 둘뿐이다: 직렬화를 스스로 하는가(`JSON.`), 거절 문구를 스스로
     * 적는가(`이 파일은`). 둘 다 공용 층의 것이다.
     */
    for (const restated of ['JSON.', '이 파일은']) {
      expect(source.includes(restated), `word-file.ts 가 ${restated} 를 다시 적었습니다`).toBe(false);
    }
    /* 그리고 실제로 공용 층을 부른다 — 위의 것이 "아무것도 안 한다"로도 통과하지 않게. */
    expect(source).toContain('documentFileFormat');
  });
});

describe('문서가 라이브러리에서 무엇으로 보이나', () => {
  /**
   * 보관 자체(IndexedDB)는 여기서 안 잰다 — 브라우저가 답을 정하는 자리이고, `office-slides` 도
   * 그 절반에는 검사를 두지 않았다. 잴 수 있는 것은 **목록이 무엇을 말하는가** 다.
   */
  it('흐름 표면을 센다 — 인쇄된 쪽 수가 아니라', () => {
    const { store } = open();
    /*
     * 쪽 수는 조판이 정하고 조판에는 브라우저와 폭이 필요하다. 목록이 *"12쪽"* 이라고 적었다가
     * 열어 보니 아니면 안 적은 것만 못하다. 그래서 문서가 실제로 담은 것을 세고 이름도 그렇게
     * 붙인다.
     */
    expect(surfaceCount(store as never)).toBeGreaterThan(0);
  });

  it('문서가 없으면 0 이다', () => {
    const schema = createSchema('word', getWordSchemaDefinition());
    const store = new DataStore(undefined as never, schema as never);
    expect(surfaceCount(store as never)).toBe(0);
  });
});

describe('새 문서가 무엇인가', () => {
  /**
   * 이 앱은 새 문서를 못 만들었다. 부팅에 샘플을 싣고 그것이 유일한 문서라서, 시작한다는 것은
   * 각주·콘텐츠 컨트롤·변경 추적·병합된 셀을 시험하려고 만든 픽스처에서 **남의 쪽을 지우는
   * 일**이었다.
   */
  it('제목·표면·빈 문단, 그리고 그뿐이다', () => {
    const schema = createSchema('word', getWordSchemaDefinition());
    const store = new DataStore(undefined as never, schema as never);
    const editor = createWordEditor({ editable: true, schema, dataStore: store } as never);
    editor.loadDocument(createStarterDocument(), 'word');

    /* 지울 것이 없다 — 지워야 시작할 수 있는 산문은 픽스처 문제의 축소판이다. */
    const text = JSON.stringify(editor.exportDocument());
    expect(text).not.toContain('Barocss Word');
    expect(text).not.toContain('Contents');

    /* 그리고 캐럿이 들어갈 자리는 있다. */
    expect(surfaceCount(store as never)).toBe(1);
  });

  it('제목이 비어 있고, 그래서 저장이 문서라고 부른다', () => {
    const schema = createSchema('word', getWordSchemaDefinition());
    const store = new DataStore(undefined as never, schema as never);
    const editor = createWordEditor({ editable: true, schema, dataStore: store } as never);
    editor.loadDocument(createStarterDocument(), 'word');

    /*
     * 없는 것이 아니라 **빈** `docTitle` 이다: 제목 줄은 찾은 노드를 고치므로, `docTitle` 이 없는
     * 문서는 독자가 이름 붙일 수 없는 문서다.
     */
    expect(JSON.stringify(editor.exportDocument())).toContain('docTitle');
    expect(wordTitle(store as never)).toBeUndefined();
    expect(wordFileName(wordTitle(store as never))).toBe('문서.word.json');
  });
});
