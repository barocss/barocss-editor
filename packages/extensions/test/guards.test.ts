// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { Editor } from '@barocss/editor-core';
import { createSchema, getStandardSchemaDefinition } from '@barocss/schema';
import { createCoreExtensions, createBasicExtensions } from '../src';
import { hasRange } from '../src/guards';

/**
 * **`hasRange(…, 'something')` 은 무엇에 답하나 — 그리고 마지막 한 칸.**
 *
 * `'something'` 이 있는 이유는 하나다: **고른 글자가 0개인 자리에 마크를 걸면 커밋되고 아무것도 안
 * 바뀐다.** 이 저장소가 *guard says yes, then does nothing* 이라 부르는 것이고 아홉 번 세었다.
 *
 * 그 술어가 오래 *두 끝이 다른가* 로 적혀 있었고, 두 끝이 **다른 노드**일 때 그것이 틀린다:
 *
 * ```
 * t1:2 → t2:0     // sid 가 둘. 두 런이 인접하면 화면의 같은 점이고 고른 글자는 0개다.
 * ```
 *
 * 이 모양이 나오는 자리는 지어낸 것이 아니다 — `Shift+→` 로 런 경계를 넘거나, 런 경계에서 드래그를
 * 시작해 그 자리에서 놓으면 나온다. `editor-view-dom/test/boundary-inside-a-block.test.ts` 의 #8 이
 * DOM 쪽에서 그 모양이 실제로 만들어진다는 것을 잡고 있고, **여기서 묻는 것은 그 모양에 가드가
 * 뭐라고 답하는가** 다. 같은 것을 두 층에서 묻지 않는다(`docs/specs/testing.md`).
 *
 * 왜 답할 자리가 여기뿐인가:
 *
 * | 누가 | 무엇을 아나 | 답 |
 * |---|---|---|
 * | `shared/fromDOMSelection` | DOM 의 두 끝 | sid 가 다르면 `collapsed: false` — 두 끝만 보면 옳다 |
 * | `editor-core/isCollapsedSelection` | 선택 하나 | 같은 노드까지만 |
 * | `hasRange` | 선택 **과 편집기** | 문서를 읽는다 |
 */
const document_ = () => ({
  stype: 'document',
  attributes: {},
  content: [
    {
      stype: 'paragraph',
      attributes: {},
      content: [
        { stype: 'inline-text', text: '가나' },
        { stype: 'inline-text', text: '다라' }
      ]
    },
    {
      stype: 'paragraph',
      attributes: {},
      content: [{ stype: 'inline-text', text: '마바' }]
    }
  ]
});

describe('hasRange', () => {
  let editor: Editor;
  let runs: string[];

  beforeEach(() => {
    editor = new Editor({
      schema: createSchema('standard', getStandardSchemaDefinition()) as never,
      extensions: [...createCoreExtensions(), ...createBasicExtensions()]
    } as never);
    editor.loadDocument(document_() as never, 'standard');

    runs = [];
    const walk = (sid: string) => {
      const node = editor.dataStore?.getNode(sid) as
        | { text?: unknown; content?: unknown[] }
        | undefined;
      if (!node) return;
      if (typeof node.text === 'string') runs.push(sid);
      for (const child of node.content ?? []) if (typeof child === 'string') walk(child);
    };
    walk(editor.getRootId() as string);
  });

  const at = (
    startNodeId: string,
    startOffset: number,
    endNodeId: string,
    endOffset: number
  ) => ({
    selection: {
      type: 'range' as const,
      startNodeId,
      startOffset,
      endNodeId,
      endOffset,
      collapsed: startNodeId === endNodeId && startOffset === endOffset
    }
  });

  it('세 런이 문서에 있다 — 앞의 둘은 한 문단 안에서 인접하다', () => {
    expect(runs).toHaveLength(3);
  });

  describe("wants: 'caret'", () => {
    it('캐럿이어도 range 이기만 하면 참이다 — 마크를 걸어 두면 다음 글자가 그렇게 나온다', () => {
      expect(hasRange(editor, at(runs[0], 1, runs[0], 1))).toBe(true);
    });

    it('노드 선택은 거짓이다 — 도형을 잡은 채 서식 단추가 켜지던 자리', () => {
      const picked = {
        selection: {
          type: 'node' as const,
          nodeIds: [runs[0]],
          startNodeId: runs[0],
          startOffset: 0,
          endNodeId: runs[0],
          endOffset: 0
        }
      };
      expect(hasRange(editor, picked)).toBe(false);
      expect(hasRange(editor, picked, 'something')).toBe(false);
    });
  });

  describe("wants: 'something' — 두 끝이 같은 노드", () => {
    it('접힌 캐럿은 거짓이다', () => {
      expect(hasRange(editor, at(runs[0], 1, runs[0], 1), 'something')).toBe(false);
    });

    it('한 글자라도 고르면 참이다', () => {
      expect(hasRange(editor, at(runs[0], 0, runs[0], 1), 'something')).toBe(true);
    });
  });

  describe("wants: 'something' — 두 끝이 다른 노드 (마지막 한 칸)", () => {
    it('인접한 두 런 사이의 0글자 범위는 거짓이다', () => {
      expect(
        hasRange(editor, at(runs[0], 2, runs[1], 0), 'something'),
        '글자를 하나도 안 고른 범위에 가드가 예라고 답했습니다'
      ).toBe(false);
    });

    it('같은 두 런이라도 글자가 하나 들어오면 참이다', () => {
      expect(hasRange(editor, at(runs[0], 1, runs[1], 0), 'something')).toBe(true);
      expect(hasRange(editor, at(runs[0], 2, runs[1], 1), 'something')).toBe(true);
    });

    it('문단을 가로질러도 같은 물음이다 — 사이에 글자가 있으면 참', () => {
      expect(hasRange(editor, at(runs[0], 0, runs[2], 2), 'something')).toBe(true);
    });

    it('문단을 가로지르고 글자가 0개이면 거짓이다', () => {
      /*
       * 첫 문단의 마지막 런 끝에서 다음 문단의 첫 런 처음까지. 두 문단 사이에는 글자가 없으므로
       * 화면에서 이것은 두 자리이지 고른 것이 아니다 — `Shift+→` 가 문단 경계를 넘는 순간 한 번
       * 지나가는 모양이다.
       */
      expect(hasRange(editor, at(runs[1], 2, runs[2], 0), 'something')).toBe(false);
    });
  });

  it('선택이 없으면 거짓이다 — payload 도 편집기도', () => {
    expect(hasRange(editor, undefined, 'something')).toBe(false);
  });

  it("`collapsed: true` 라고 적어 준 호출자는 믿는다 — 그건 이 가드가 볼 수 없는 것에 대한 주장이다", () => {
    const claimed = {
      selection: {
        type: 'range' as const,
        startNodeId: runs[0],
        startOffset: 0,
        endNodeId: runs[2],
        endOffset: 2,
        collapsed: true
      }
    };
    expect(hasRange(editor, claimed, 'something')).toBe(false);
  });
});
