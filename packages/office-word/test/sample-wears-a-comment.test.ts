import { describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { createSchema } from '@barocss/schema';
import { DataStore } from '@barocss/datastore';
import { EditorViewDOM } from '@barocss/editor-view-dom';
import {
  commentThreads,
  createSampleDocument,
  createWordEditor,
  freeThreadId,
  getWordSchemaDefinition,
  registerWordRenderers
} from '../src/index';
import { ANCHOR_STYPE, CommentsPane } from '../src/ui';

/**
 * **픽스처는 자기가 검사하는 것을 입고 있어야 한다.**
 *
 * Word 샘플에 주석 달린 글자가 없었고, 그래서 브라우저 검사 하나가 조건부로 스킵됐다 —
 * `apps/word/tests/word-outline.spec.ts:173`, *"the sample has no commented text to mark"*.
 * 저장소의 조건부 스킵 스물하나 중 **발동하는 것이 그 하나**였다.
 *
 * ## 픽스처를 두껍게 하니 나온 것
 *
 * 샘플이 주석을 입자 **그 검사는 여전히 안 돈다.** 스킵의 조건이 픽스처가 아니라 **선택자**였기
 * 때문이다:
 *
 * | 그 검사가 세는 것 | 실제로 그려지는 것 |
 * |---|---|
 * | `.w-comment-anchor` | `w-comment-anchor` 는 **데코레이터의 stype** 이지 클래스가 아니다 |
 * | `[data-bc-decorator*="comment"]` | 그 속성의 값은 `'layer'`·`'inline'`·`'block'` 셋뿐이다 |
 * | | 실제 클래스는 **`w-comment-hit`** (`apps/word/src/main.tsx` 의 데코레이터 템플릿) |
 *
 * 같은 저장소의 `apps/word/tests/word-review.spec.ts:160` 은 `.w-comment-hit` 를 쓴다 — **옆
 * 파일이 맞는 이름을 알고 있었다.** 스킵의 메시지가 픽스처를 탓하는 동안 아무도 선택자를 안
 * 봤고, 볼 이유도 없었다: 스킵은 초록색이다.
 *
 * 그러므로 이 파일이 그 검사가 물으려던 것을 **밀리초에** 답한다. 브라우저 쪽은 선택자를 고쳐야
 * 비로소 돌기 시작한다(`/tmp/keys-backlog.md`).
 */
const wordEditor = () => {
  const schema = createSchema('word', getWordSchemaDefinition());
  const dataStore = new DataStore(undefined as never, schema as never);
  const editor = createWordEditor({
    editable: true,
    schema,
    dataStore,
    author: { name: 'Jinho', date: () => '2026-08-10' }
  } as never);
  editor.loadDocument(createSampleDocument(), 'word');

  /** `commentThreads` 가 읽는 모양 — 노드 하나를 주는 것과 뿌리가 무엇인지. */
  const doc = {
    getNode: (id: string) => editor.dataStore.getNode(id),
    rootId: editor.getRootId() as string
  };
  return { editor, doc };
};

describe('Word 샘플의 주석', () => {
  it('닻과 몸통이 둘 다 있다 — 한쪽만 있으면 주석이 아니다', () => {
    const { doc } = wordEditor();
    const threads = commentThreads(doc as never);

    expect(threads.length).toBe(1);
    const [thread] = threads;
    expect(thread.resolved).toBe(false);
    // 몸통: 누가 언제 무엇을 말했는가. 셋 다 없으면 칸이 그릴 것이 없다.
    expect(thread.entries.length).toBe(1);
    expect(thread.entries[0].author).not.toBe('');
    expect(thread.entries[0].date).not.toBe('');
    expect(thread.entries[0].text.length).toBeGreaterThan(0);
    // 닻: 마크가 살아 있어야 어디에 대한 말인지 알 수 있다.
    expect(thread.anchor).toBeDefined();
  });

  /**
   * **닻이 런 전체가 아니라 그 안의 한 조각이다.**
   *
   * 픽스처가 런 전체를 덮으면 *범위를 옮기는 일* 과 *런을 옮기는 일* 이 같은 답을 낸다 — 그리고
   * 주석 닻의 결함은 정확히 그 차이에 산다.
   */
  it('덮는 글자가 실제로 그 문장의 한 조각이다', () => {
    const { doc } = wordEditor();
    const [thread] = commentThreads(doc as never);
    const run = doc.getNode(thread.anchor!.sid) as { text?: string } | undefined;
    const text = String(run?.text ?? '');

    expect(text.length).toBeGreaterThan(0);
    expect(thread.anchor!.start).toBeGreaterThanOrEqual(0);
    expect(thread.anchor!.end).toBeLessThanOrEqual(text.length);
    expect(thread.anchor!.end - thread.anchor!.start).toBeLessThan(text.length);
    // 위의 셋이 이 검사의 성질이고(범위 안, 런보다 짧음), 이 줄은 닻이 **뜻이 있는 낱말**을
    // 덮는지를 못 박는다 — 아무 데나 자른 조각이 아니라.
    //
    // 처음에는 `'Direct formatting'` 이었다. 그 문단은 `.w-paragraph[1]` 이고 입력 스펙 열두
    // 개가 *"두 번째 문단의 첫 텍스트 노드"* 를 잡아 IME 를 치는데, 부분 범위를 표시하면 런이
    // 쪼개져 그 첫 노드가 열일곱 자짜리 조각이 된다. 브라우저 검사 **마흔여덟 개**가 그렇게
    // 깨졌다. 닻은 이미 런이 넷인 문단으로 옮겼다.
    expect(text.slice(thread.anchor!.start, thread.anchor!.end)).toBe('Revisions');
  });

  /**
   * 픽스처가 주석을 입으면 **다음 주석의 id 가 달라진다.** `freeThreadId` 가 그것을 세는데,
   * 샘플의 id 를 손으로 적은 이상 그 둘이 부딪히지 않는지 여기서 못 박는다 — 부딪히면 두
   * 스레드가 같은 닻을 갖고 `anchorsOf` 의 *"첫 번째가 이긴다"* 가 조용히 발동한다.
   */
  it('샘플이 쓴 id 가 다음 주석의 id 를 막지 않는다', () => {
    const { doc } = wordEditor();
    expect(commentThreads(doc as never)[0].id).toBe('comment-1');
    expect(freeThreadId(doc as never)).toBe('comment-2');
  });

  /**
   * **그 브라우저 검사가 물으려던 것** — *칸을 닫으면 이야기가 치워지지, 이야기가 있다는 표시가
   * 치워지는 것이 아니다.*
   *
   * 칸이 닫히면 컴포넌트는 띠 하나로 줄어들지만 **훅은 그 전에 돈다.** 그래서 닻 데코레이터는
   * 그대로 남고, 남는다는 것이 이 검사다. 조건부 스킵이 덮고 있던 주장이 이것이었다.
   */
  it('칸을 닫아도 글자에 남은 표시는 그대로다', async () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    registerWordRenderers();

    const { editor } = wordEditor();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const view = new EditorViewDOM(editor, { container: host });

    /** 뷰에 실제로 걸린 닻의 수. 마지막으로 세운 것이 남아 있는 것이다. */
    let anchors = 0;
    const setDecorators = view.setDecorators.bind(view);
    view.setDecorators = (stype: string, list: never[]) => {
      if (stype === ANCHOR_STYPE) anchors = list.length;
      return setDecorators(stype, list);
    };

    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const root = createRoot(mount);

    const pane = (open: boolean) =>
      createElement(CommentsPane, { editor, view, open, onToggle: () => {} });

    await act(async () => {
      root.render(pane(true));
    });
    expect(anchors).toBe(1);
    expect(mount.querySelector('.w-comments-pane')).not.toBeNull();

    await act(async () => {
      root.render(pane(false));
    });

    // 칸은 갔고
    expect(mount.querySelector('.w-comments-pane')).toBeNull();
    // 띠가 몇 개인지 말하고
    expect(mount.querySelector('.w-comments-closed')?.getAttribute('data-comment-count')).toBe('1');
    // 글자의 표시는 그대로다
    expect(anchors).toBe(1);

    await act(async () => {
      root.unmount();
    });
  });
});
