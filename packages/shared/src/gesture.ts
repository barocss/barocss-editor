/**
 * **포인터 제스처** — 누른 것이 무엇이 되는가.
 *
 * `key-binding.ts` 가 키보드에 대해 답하는 것을 포인터에 대해 답합니다. 둘 다 *읽은 것*을 말할 뿐
 * 그것이 무엇을 하는지는 모릅니다.
 *
 * ## 왜 여기에 생겼나 — 스무 개를 여덟 질문에 대조한 것
 *
 * 저장소에 `pointerdown` 뒤에 move/up 을 붙이는 자리가 **스물** 있고, 그 스물이 같은 질문 여덟 개에
 * 각자 답합니다. 셋은 답이 하나뿐인데 그 하나를 한 파일만 썼습니다:
 *
 * | 질문 | 답한 곳 |
 * |---|---|
 * | 제스처는 `pointercancel` 로 끝날 수 있다 | **스물 중 하나** |
 * | 리스너는 요소에 붙는다(`window` 아님) | **스물 중 하나** |
 * | Escape 로 되돌린다 | 스물 중 넷 |
 * | 오른쪽 버튼은 드래그가 아니다 | 스물 중 둘 |
 *
 * 그리고 이건 정돈의 문제가 아니라 **살아 있는 결함**입니다. `window` 에 `pointermove` 를 붙이고
 * `pointerup` 에서만 걷으면, 브라우저가 `pointercancel` 을 주는 순간 — 터치가 끊기거나, 시스템
 * 제스처가 가로채거나, 잡고 있던 요소가 드래그 도중 DOM 에서 사라지면 — 그 리스너가 window 에
 * **영원히** 남습니다. 그 다음부터 아무 상관 없는 포인터 움직임이 드래그 계산을 계속 돌립니다.
 * 화면은 멀쩡해 보이고, 리로드하면 사라지고, 재현 절차를 적을 수 없습니다.
 *
 * ## 흐름
 *
 * ```
 *              ┌── 문턱을 못 넘고 pointerup ──→ done(dragged: false)   "눌렀다"
 * pointerdown ─┤
 *              └── 문턱을 넘음 ─→ move… ─┬─ pointerup ──────→ done(dragged: true)   "끌었다"
 *                                        ├─ pointercancel ──→ abort
 *                                        └─ Escape ─────────→ abort
 * ```
 *
 * **`done` 과 `abort` 는 합쳐서 정확히 한 번**이고, 어느 쪽으로 끝나든 리스너가 다 걷힙니다. 그것이
 * 이 파일이 존재하는 이유의 전부입니다.
 *
 * 누른 것과 끈 것을 한 제스처로 묶은 것도 재고 나온 것입니다. 부르는 쪽이 둘을 갈라 쓰면
 * `onClick` 과 `onPointerDown` 이 같은 대상에 대해 두 번 판단하고, 그 둘이 어긋나는 것이 슬라이드의
 * 상자 선택에서 이미 한 번 나왔습니다. `moved.dragged` 로 묻습니다.
 */

/** 이 제스처가 어디서 시작해 지금 어디인가. */
export interface GestureMoved {
  /** `pointerdown` 의 자리. */
  readonly fromX: number;
  readonly fromY: number;
  /** 지금 자리. */
  readonly x: number;
  readonly y: number;
  /** 지금 자리 빼기 시작 자리. */
  readonly dx: number;
  readonly dy: number;
  /**
   * 문턱을 넘었는가 — **끈 것**과 **누른 것**을 가르는 하나.
   *
   * `done` 에서 이것이 거짓이면 클릭이고, 그래서 부르는 쪽이 클릭 처리를 따로 달지 않아도 됩니다.
   */
  readonly dragged: boolean;
  /**
   * 수정키 — **지금**의 것이지 눌렀을 때의 것이 아닙니다.
   *
   * Alt 로 복제하고 Shift 로 각도를 묶는 것은 **끄는 중에** 누릅니다. `pointerdown` 에서 한 번 읽어
   * 두면 끄는 중에 누른 Shift 를 영영 못 봅니다.
   */
  readonly shift: boolean;
  readonly alt: boolean;
  readonly ctrl: boolean;
  readonly meta: boolean;
}

export interface GestureHandlers<S> {
  /**
   * 잡을 것인가, 그리고 무엇을 잡았나.
   *
   * `null`/`undefined` 를 주면 제스처가 아니고 — 리스너를 하나도 달지 않고 `preventDefault` 도 하지
   * 않습니다. 여기서 돌려준 것이 `move`/`done`/`abort` 에 그대로 다시 옵니다: 시작할 때의 값(잡은
   * 상자의 원래 자리 같은)을 클로저에 가두지 말고 이리로 주라는 뜻입니다.
   *
   * `stopPropagation` 이 필요하면 여기서 부릅니다. `preventDefault` 는 이쪽이 합니다 — 드래그는
   * 예외 없이 글자 선택과 네이티브 drag 를 막아야 하기 때문입니다.
   */
  start(event: PointerEvent): S | null | undefined;
  /** 문턱을 넘은 뒤의 매 움직임. **미리 보기**를 그리는 자리이지 쓰는 자리가 아닙니다. */
  move?(state: S, moved: GestureMoved, event: PointerEvent): void;
  /**
   * 끝. **한 번** 불리고, 여기서 한 번 씁니다.
   *
   * 움직임마다 쓰면 한 제스처가 히스토리에 마흔 줄이 되고 되돌리기가 드래그를 되짚어 걸어갑니다.
   */
  done?(state: S, moved: GestureMoved, event: PointerEvent | undefined): void;
  /**
   * 물렀다 — Escape 이거나 `pointercancel`. **미리 보기를 걷는 자리**입니다.
   *
   * 이것이 없으면 Escape 를 듣지 않습니다: 되돌릴 방법 없이 미리 보기만 끊으면 화면이 거짓말을 하고,
   * 그건 Escape 가 아무것도 안 하는 것보다 나쁩니다.
   *
   * **`moved` 를 받는 이유는 `dragged` 하나입니다.** 문턱을 못 넘고 물러선 것은 미리 보기가 그려진
   * 적이 없다는 뜻이고, 그때 되돌리기를 쓰면 같은 값을 다시 써서 히스토리에 아무 일도 아닌 항목이
   * 하나 생깁니다. 그라디언트 멈춤을 고르기만 하고 Escape 를 누른 것이 그 자리였습니다.
   */
  abort?(state: S, moved: GestureMoved): void;
}

export interface GestureOptions {
  /**
   * 이만큼 움직여야 끄는 것 — CSS 픽셀, 축마다 따로 봅니다. 기본 `3`.
   *
   * `0` 이면 첫 움직임이 곧 드래그입니다(자 눈금처럼 누르는 순간 값이 정해지는 것).
   */
  threshold?: number;
  /** 주 버튼만 받는가. 기본 참 — 오른쪽 버튼은 맥락 메뉴이지 드래그가 아닙니다. */
  primaryOnly?: boolean;
  /** `setPointerCapture` 를 걸까. 기본 참. */
  capture?: boolean;
}

const PRIMARY_BUTTON = 0;

/** React 의 합성 이벤트도 네이티브도 받되 React 에 기대지 않기 위한 최소한의 모양. */
type PointerLike = Pick<PointerEvent, 'clientX' | 'clientY'> & {
  pointerId?: number;
  button?: number;
  currentTarget?: unknown;
  preventDefault?(): void;
};

function isElement(value: unknown): value is Element {
  return !!value && typeof (value as Element).addEventListener === 'function';
}

/**
 * 드래그 하나를 연다.
 *
 * `pointerdown` 핸들러 안에서 한 번 부르고 그걸로 끝입니다 — 리스너를 달고, 걷고, 문턱을 재고,
 * Escape 와 `pointercancel` 을 듣는 것이 전부 이 안입니다.
 *
 * @returns 제스처가 시작됐는가. `start` 가 아무것도 안 줬거나 버튼이 주 버튼이 아니면 거짓.
 */
export function dragGesture<S>(
  event: PointerLike,
  handlers: GestureHandlers<S>,
  options: GestureOptions = {}
): boolean {
  const { threshold = 3, primaryOnly = true, capture = true } = options;

  if (primaryOnly && typeof event.button === 'number' && event.button !== PRIMARY_BUTTON) return false;

  const state = handlers.start(event as PointerEvent);
  if (state === null || state === undefined) return false;

  event.preventDefault?.();

  const fromX = event.clientX;
  const fromY = event.clientY;
  let dragged = threshold <= 0;
  let over = false;

  const held = isElement(event.currentTarget) ? event.currentTarget : undefined;
  const view: (Window & typeof globalThis) | undefined =
    (held?.ownerDocument?.defaultView as (Window & typeof globalThis) | null | undefined) ??
    (typeof window !== 'undefined' ? window : undefined);

  /*
   * **마지막으로 본 자리** — Escape 로 물러설 때 쓸 것이 이것뿐이다.
   *
   * `pointercancel` 은 좌표를 갖고 오므로 그건 그대로 쓰고, 키보드에서 온 물러섬에는 포인터가 없다.
   * 시작 자리로 답하면 *40px 을 끌다가 물러섰다* 가 *움직인 적 없다* 로 보인다 — `dragged` 는
   * 참인데 `dx` 는 0인, 스스로 모순된 기록이 된다.
   */
  let lastX = fromX;
  let lastY = fromY;

  const readingOf = (pointer: PointerLike | undefined): GestureMoved => {
    const x = pointer ? pointer.clientX : lastX;
    const y = pointer ? pointer.clientY : lastY;
    const keys = pointer as Partial<PointerEvent> | undefined;
    return {
      fromX,
      fromY,
      x,
      y,
      dx: x - fromX,
      dy: y - fromY,
      dragged,
      shift: keys?.shiftKey === true,
      alt: keys?.altKey === true,
      ctrl: keys?.ctrlKey === true,
      meta: keys?.metaKey === true
    };
  };

  /*
   * 들을 곳이 없으면 도착할 이벤트도 없습니다 — 매달아 두는 것이 지우려는 그 누수라서, 누른 것으로
   * 닫습니다. 브라우저에서는 일어나지 않고, DOM 없는 자리에서 부른 것이 조용히 사라지지 않게 하는
   * 몫입니다.
   */
  if (!view) {
    over = true;
    handlers.done?.(state, readingOf(event), undefined);
    return true;
  }

  /*
   * 붙일 곳은 **잡은 요소**입니다. 포인터 캡처가 걸리면 창을 벗어났다 돌아오는 것도 한 제스처이고,
   * 요소가 사라지면 브라우저가 `pointercancel` 을 줍니다 — window 에 붙였으면 그 순간을 못 봅니다.
   * 캡처가 안 되는 자리(jsdom, 이미 놓친 포인터)에서만 창으로 물러섭니다.
   */
  let on: Element | Window = view;
  if (capture && held && typeof held.setPointerCapture === 'function' && typeof event.pointerId === 'number') {
    try {
      held.setPointerCapture(event.pointerId);
      on = held;
    } catch {
      /* 이미 없는 포인터. 창으로 듣습니다. */
    }
  }

  const finish = (pointer: PointerEvent | undefined, why: 'done' | 'abort') => {
    if (over) return;
    over = true;

    on.removeEventListener('pointermove', onMove as EventListener);
    on.removeEventListener('pointerup', onUp as EventListener);
    on.removeEventListener('pointercancel', onCancel as EventListener);
    if (listensEscape) view.removeEventListener('keydown', onKey, true);

    if (held && typeof held.releasePointerCapture === 'function' && typeof event.pointerId === 'number') {
      try {
        held.releasePointerCapture(event.pointerId);
      } catch {
        /* pointerup 이 이미 놓았습니다. */
      }
    }

    if (why === 'abort') handlers.abort?.(state, readingOf(pointer));
    else handlers.done?.(state, readingOf(pointer), pointer);
  };

  const onMove = (pointer: PointerEvent) => {
    lastX = pointer.clientX;
    lastY = pointer.clientY;
    if (!dragged) {
      if (Math.abs(pointer.clientX - fromX) < threshold && Math.abs(pointer.clientY - fromY) < threshold) return;
      dragged = true;
    }
    handlers.move?.(state, readingOf(pointer), pointer);
  };
  const onUp = (pointer: PointerEvent) => finish(pointer, 'done');
  /* 취소는 좌표를 갖고 온다 — 버리지 않는다. */
  const onCancel = (pointer: PointerEvent) => finish(pointer, 'abort');

  /*
   * Escape 는 **잡는 단계**에서 듣습니다. 제품이 자기 Escape 로 패널을 닫는데, 끄는 중이면 그 전에
   * 이 제스처가 물러서야 합니다 — 순서가 반대면 패널이 닫히고 미리 보기만 화면에 남습니다.
   */
  const listensEscape = typeof handlers.abort === 'function';
  const onKey = (key: KeyboardEvent) => {
    if (key.key !== 'Escape') return;
    key.preventDefault();
    key.stopPropagation();
    finish(undefined, 'abort');
  };

  on.addEventListener('pointermove', onMove as EventListener);
  on.addEventListener('pointerup', onUp as EventListener);
  on.addEventListener('pointercancel', onCancel as EventListener);
  if (listensEscape) view.addEventListener('keydown', onKey, true);

  return true;
}
