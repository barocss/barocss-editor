import { describe, it, expect, vi } from 'vitest';
import { InputHandlerImpl } from '../../src/event-handlers/input-handler';
import type { ModelSelection } from '@barocss/editor-core';

/**
 * **#9 — 타이핑이 쓰는 캐럿이 자기가 캐럿이라고 말하는가.**
 *
 * `boundary-inside-a-block.test.ts` 의 표에서 아홉 번째이고, **이 저장소가 재 본 몸짓이 실제로
 * 만드는 것은 이것 하나** 다: `site.spec.ts:8298` 이 하는 ⌘클릭 · 더블클릭 · `End` · `type(' /')`
 * 에서 `End` 뒤의 캐럿은 글자 노드 안이라 2·3·5 는 안 걸린다. 15% 는 여기서 나왔다.
 *
 * ## 무엇이 있었나
 *
 * `tryHandleInsertViaGetTargetRanges` 가 `convertStaticRangeToModel` 의 답에서 **네 필드만**
 * 골라 새 리터럴로 옮겨 담았다 — 두 끝과 두 오프셋. `collapsed` 는 그 목록에 없었다. 그리고
 * 그것을 강제한 것이 타입이었다: `editor-view-dom/types.ts` 가 그 함수의 답을 여섯 필드짜리
 * **좁은 사본**으로 적어 두었고 거기에 `collapsed` 가 없었으므로, 옮겨 적는 쪽은 그런 필드가
 * 있는 줄 몰랐다. `docs/specs/selection.md` 가 이 모양을 이미 적어 두었다 — *"사본은 어긋남을
 * 못 잡은 것이 아니라 어긋남을 강제했다."*
 *
 * 떨어진 깃발은 몇 줄 아래 `updateSelection(range)` 으로 모델에 들어간다. 그 뒤 `insertText`
 * 연산은 오프셋만 옮기며 *"Collapsed state does not change"* 라고 적어 두었으므로 아무도 다시
 * 세지 않고, 이 함수가 `preventDefault` 했으므로 `selectionchange` 가 그 자리를 다시 읽어 주지도
 * 않는다. **한 번 `undefined` 가 들어가면 스스로 낫지 않는다.**
 *
 * ## 왜 하필 15% 인가 — 그리고 왜 이 검사가 그 답을 준다
 *
 * `updateSelection` 은 `!modelAgrees` 일 때만 불린다. 즉 `selectionchange` 가 아직 안 와서
 * 편집기의 선택이 **낡아 있을 때** 만. 브라우저 검사는 `End` 와 `type(' /')` 사이에 아무것도
 * 기다리지 않으므로, 세 워커가 같이 도는 부하에서 그 경합이 이따금 진다.
 *
 * 단위에서는 그 경합을 기다릴 필요가 없다 — **선택을 일부러 낡게 세워 두면** 된다. 그게 이
 * 픽스처가 하는 전부이고, 4분짜리 브라우저 회차가 밀리초가 되는 지점이다.
 */

const CARET: ModelSelection = {
  type: 'range',
  startNodeId: 't1',
  startOffset: 2,
  endNodeId: 't1',
  endOffset: 2,
  collapsed: true,
  direction: 'none'
};

/**
 * **선택이 낡아 있는 편집기.** `stale` 이 `modelAgrees` 를 거짓으로 만드는 값이다.
 *
 * 낡은 값이 `t1:0 → t1:2` 인 것에 뜻이 있다: 그건 *직전에 두 글자를 고르고 있었다* 는 뜻이고,
 * 실제 브라우저 회차에서 더블클릭이 만드는 모양이다.
 */
function build(stale: ModelSelection | null) {
  const nodes: Record<string, unknown> = {
    t1: { sid: 't1', stype: 'inline-text', text: '가나다라', parentId: 'p1' },
    p1: { sid: 'p1', stype: 'paragraph' }
  };

  const updateSelection = vi.fn();
  /*
   * `as never` 는 **리터럴 쪽**에 붙인다. 변수 이름 뒤에 붙이면 `editor-is-typed` 의 톱니가 그것을
   * 새 캐스트로 센다 — 그 톱니가 세는 것은 *편집기를 캐스트로 걷어낸 자리* 이고, 여기서 필요한
   * 것은 그게 아니라 흉내 낸 객체를 인자로 넘기는 것뿐이다.
   *
   * (그 검사는 자기 자신만 빼고 세므로, 그 모양을 **글자로 적은 주석**도 캐스트로 세어진다.
   * 이 주석이 그 모양을 안 적는 이유다 — 처음 판은 적었고, 검사가 바로 그것을 잡았다.)
   */
  const editor = {
    selection: stale,
    dataStore: { getNode: (id: string) => nodes[id] ?? null },
    updateSelection,
    executeCommand: vi.fn().mockResolvedValue(true),
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    getDecorators: () => []
  } as never;

  const view = {
    _isRendering: false,
    _isModelDrivenChange: false,
    getDecorators: () => [],
    convertStaticRangeToModel: vi.fn(() => ({ ...CARET })),
    convertDOMSelectionToModel: vi.fn(),
    convertModelSelectionToDOM: vi.fn()
  } as never;

  return { updateSelection, handler: new InputHandlerImpl(editor, view) };
}

/** `beforeinput` 하나 — `getTargetRanges` 가 **접힌** 범위를 준다. 캐럿에 타이핑하면 그 모양이다. */
function typeOneCharacter(): InputEvent {
  const event = new InputEvent('beforeinput', { inputType: 'insertText', data: '/', cancelable: true });
  const caret = { startContainer: document.body, startOffset: 0, endContainer: document.body, endOffset: 0, collapsed: true };
  Object.defineProperty(event, 'getTargetRanges', { value: () => [caret] });
  return event;
}

describe('타이핑이 모델에 알리는 캐럿', () => {
  it('접힌 채로 알린다 — 편집기의 선택이 낡아 있을 때', () => {
    const { handler, updateSelection } = build({
      type: 'range',
      startNodeId: 't1',
      startOffset: 0,
      endNodeId: 't1',
      endOffset: 2,
      collapsed: false,
      direction: 'forward'
    });

    handler.handleBeforeInput(typeOneCharacter());

    expect(updateSelection, '낡은 선택인데 모델에 알리지 않았습니다').toHaveBeenCalledTimes(1);
    const payload = updateSelection.mock.calls[0][0] as { selection: ModelSelection; applySelectionToView: boolean };

    expect(payload.selection.startNodeId).toBe('t1');
    expect(payload.selection.startOffset).toBe(2);
    expect(payload.selection.endOffset).toBe(2);
    /*
     * **이 한 줄이 15% 다.** 없으면 버블 툴바가 `collapsed !== true` 를 물어 뜨고, 슬래시 메뉴는
     * 두 끝을 비교해 같이 뜬다 — `[data-floating-surface]` 가 둘.
     */
    expect(payload.selection.collapsed, '타이핑이 쓴 캐럿이 깃발을 안 달았습니다').toBe(true);
    /* 화면의 캐럿은 이미 거기 있다 — 되쓰면 캐럿 둘이 싸운다. */
    expect(payload.applySelectionToView).toBe(false);
  });

  it('모델이 이미 같은 자리를 알고 있으면 다시 알리지 않는다', () => {
    /*
     * 반대쪽을 함께 잡아 둔다. `modelAgrees` 는 네 자리로만 비교하므로, 깃발을 계산해 붙이는
     * 것이 *같은 자리를 다르다고 읽게* 만들면 안 된다 — 그러면 키를 칠 때마다 선택 이벤트가
     * 하나씩 더 나가고, 그 이벤트를 듣는 것이 여섯이다.
     */
    const { handler, updateSelection } = build({ ...CARET });

    handler.handleBeforeInput(typeOneCharacter());

    expect(updateSelection, '같은 자리인데 다시 알렸습니다').not.toHaveBeenCalled();
  });
});
