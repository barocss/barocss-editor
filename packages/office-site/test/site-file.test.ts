import { describe, expect, it } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import { getSiteSchemaDefinition } from '../src/site-schema';
import { createSampleSite } from '../src/sample-site';
import { createSiteEditor } from '../src/site-kit';
import { pageCount, readSiteFile, siteFileName, siteFileText, siteTitle, SITE_FORMAT } from '../src/site-file';

/**
 * **사이트가 자기 작업을 지킬 수 있는가** — 이 제품이 오늘까지 못 하던 것.
 *
 * `apps/site/src/main.tsx:63` 은 새로고침마다 샘플을 다시 실었다. 독자가 무엇을 만들든 돌아오면
 * 없었고, 갖고 있는 파일을 열 방법도 없었다.
 *
 * 형식과 보관은 `@barocss/shared` 의 것이고 여기서 재는 것은 **사이트가 대는 넷**이다. 그것이
 * 이 회차의 주장이다 — 둘째 제품이 넉 줄이었으면 셋째도 넉 줄이어야 한다.
 */
const open = () => {
  const schema = createSchema('site', getSiteSchemaDefinition());
  const store = new DataStore(undefined as never, schema as never);
  const editor = createSiteEditor({ editable: true, schema, dataStore: store } as never);
  editor.loadDocument(createSampleSite() as never, 'site');
  return { store, editor };
};

describe('사이트가 파일을 왕복한다', () => {
  it('쓴 것을 되읽으면 문서가 온전하다', () => {
    const { editor } = open();
    const read = readSiteFile(siteFileText(editor.exportDocument()));
    expect('error' in read, 'error' in read ? read.error : '').toBe(false);
    expect(JSON.stringify((read as { document: unknown }).document)).toContain('docTitle');
  });

  it('세션이 빌려준 이름은 안 실린다', () => {
    const { editor } = open();
    const written = siteFileText(editor.exportDocument());
    expect(written).not.toContain('"sid"');
    expect(written).not.toContain('"parentId"');
  });

  it('덱이나 워드의 파일을 열려고 하면 사이트의 낱말로 말한다', () => {
    const alien = JSON.stringify({ format: 'barocss-word', version: 1, document: { stype: 'document' } });
    const read = readSiteFile(alien);
    expect('error' in read && read.error).toBe('이 파일은 Barocss 사이트 파일이 아닙니다.');
  });

  it('자기 이름을 파일에 적는다', () => {
    const { editor } = open();
    expect(siteFileText(editor.exportDocument())).toContain(`"format": "${SITE_FORMAT}"`);
  });
});

describe('사이트가 무엇에 대한 것인가', () => {
  it('docMeta 의 docTitle 을 읽는다 — Word 와 같은 자리', () => {
    const { store } = open();
    expect(siteTitle(store as never)).toBe('바로 사이트');
    expect(siteFileName(siteTitle(store as never))).toBe('바로 사이트.site.json');
  });

  /**
   * **페이지를 센다 — 브라우저의 쪽이 아니라.** `page` 는 문서의 노드이고 독자가 거기 둔
   * 것이므로, 목록이 *"7 페이지"* 라고 적으면 브라우저가 무엇을 하든 맞다. Word 는 반대라서
   * 흐름 표면을 세고, `word-library.ts` 가 그 이유를 적어 두었다.
   */
  it('문서가 담은 페이지를 센다', () => {
    const { store } = open();
    expect(pageCount(store as never)).toBeGreaterThan(0);
  });

  it('문서가 없으면 0 이고 제목도 없다', () => {
    const schema = createSchema('site', getSiteSchemaDefinition());
    const store = new DataStore(undefined as never, schema as never);
    expect(pageCount(store as never)).toBe(0);
    expect(siteTitle(store as never)).toBeUndefined();
    expect(siteFileName(undefined)).toBe('사이트.site.json');
  });
});
