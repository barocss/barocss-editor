import { describe, it, expect, vi } from 'vitest';
import { dragGesture, type GestureMoved } from './gesture';

/**
 * 제스처가 **어떻게 끝나든** 리스너가 남지 않는가 — 이 파일이 지키는 하나.
 *
 * 스무 자리 중 열아홉이 `pointercancel` 을 듣지 않아서 그 순간 `window` 에 `pointermove` 를 영구히
 * 남기고 있었습니다. 그 결함은 화면에 안 보이고 리로드하면 사라지므로, 여기서 **리스너의 수를 직접
 * 세는 것** 말고는 잡을 방법이 없습니다.
 */

/** 붙은 것과 걷힌 것을 세는 가짜 대상. */
function counting() {
  const live = new Map<string, number>();
  const listeners = new Map<string, Set<EventListener>>();
  const target = {
    addEventListener(type: string, fn: EventListener) {
      live.set(type, (live.get(type) ?? 0) + 1);
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    },
    removeEventListener(type: string, fn: EventListener) {
      if (listeners.get(type)?.delete(fn)) live.set(type, (live.get(type) ?? 0) - 1);
    }
  };
  return {
    target,
    living: () => [...live.values()].reduce((a, b) => a + b, 0),
    fire(type: string, event: Partial<PointerEvent | KeyboardEvent>) {
      for (const fn of [...(listeners.get(type) ?? [])]) fn(event as Event);
    }
  };
}

function down(over: Partial<PointerEvent> = {}) {
  return { clientX: 100, clientY: 100, button: 0, preventDefault: vi.fn(), ...over } as never;
}

describe('dragGesture', () => {
  it('오른쪽 버튼으로는 시작하지 않는다', () => {
    const start = vi.fn();
    expect(dragGesture(down({ button: 2 }), { start })).toBe(false);
    expect(start).not.toHaveBeenCalled();
  });

  it('start 가 아무것도 주지 않으면 리스너를 달지 않는다', () => {
    const seen = counting();
    vi.stubGlobal('window', seen.target);
    expect(dragGesture(down(), { start: () => null })).toBe(false);
    expect(seen.living()).toBe(0);
    vi.unstubAllGlobals();
  });

  it('문턱을 넘기 전에는 move 가 없고, 넘으면 그 뒤로 매번 온다', () => {
    const seen = counting();
    vi.stubGlobal('window', seen.target);
    const move = vi.fn();
    dragGesture(down(), { start: () => ({}), move });

    seen.fire('pointermove', { clientX: 102, clientY: 100 });
    expect(move).not.toHaveBeenCalled();

    seen.fire('pointermove', { clientX: 104, clientY: 100 });
    expect(move).toHaveBeenCalledTimes(1);

    // 문턱을 한 번 넘으면 다시 안으로 들어와도 계속 끄는 중입니다.
    seen.fire('pointermove', { clientX: 100, clientY: 100 });
    expect(move).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });

  it('문턱을 못 넘고 뗐으면 done 이 dragged: false 로 온다 — 그것이 클릭이다', () => {
    const seen = counting();
    vi.stubGlobal('window', seen.target);
    let told: GestureMoved | undefined;
    dragGesture(down(), { start: () => ({}), done: (_s, moved) => void (told = moved) });

    seen.fire('pointermove', { clientX: 101, clientY: 101 });
    seen.fire('pointerup', { clientX: 101, clientY: 101 });
    expect(told?.dragged).toBe(false);
    expect(seen.living()).toBe(0);
    vi.unstubAllGlobals();
  });

  it('수정키는 움직일 때의 것이지 누를 때의 것이 아니다', () => {
    const seen = counting();
    vi.stubGlobal('window', seen.target);
    const move = vi.fn();
    dragGesture(down({ shiftKey: false }), { start: () => ({}), move });

    seen.fire('pointermove', { clientX: 140, clientY: 100, shiftKey: true, altKey: true });
    expect(move.mock.calls[0][1]).toMatchObject({ shift: true, alt: true, dx: 40, dy: 0 });
    vi.unstubAllGlobals();
  });

  /* ── 여기부터가 스무 자리 중 열아홉이 틀린 것 ── */

  it('pointercancel 로 끝나도 리스너가 남지 않는다', () => {
    const seen = counting();
    vi.stubGlobal('window', seen.target);
    const abort = vi.fn();
    const done = vi.fn();
    dragGesture(down(), { start: () => ({}), move: vi.fn(), done, abort });
    expect(seen.living()).toBeGreaterThan(0);

    seen.fire('pointercancel', {});
    expect(abort).toHaveBeenCalledTimes(1);
    expect(done).not.toHaveBeenCalled();
    expect(seen.living()).toBe(0);
    vi.unstubAllGlobals();
  });

  it('Escape 는 물러선다 — 그리고 abort 가 없으면 아예 듣지 않는다', () => {
    const seen = counting();
    vi.stubGlobal('window', seen.target);

    const abort = vi.fn();
    dragGesture(down(), { start: () => ({}), abort });
    seen.fire('keydown', { key: 'Escape', preventDefault: vi.fn(), stopPropagation: vi.fn() });
    expect(abort).toHaveBeenCalledTimes(1);
    expect(seen.living()).toBe(0);

    // 되돌릴 방법이 없으면 Escape 로 미리 보기만 끊는 것은 화면이 거짓말을 하는 것입니다.
    const done = vi.fn();
    dragGesture(down(), { start: () => ({}), done });
    seen.fire('keydown', { key: 'Escape', preventDefault: vi.fn(), stopPropagation: vi.fn() });
    expect(done).not.toHaveBeenCalled();
    expect(seen.living()).toBeGreaterThan(0);
    seen.fire('pointerup', { clientX: 100, clientY: 100 });
    expect(seen.living()).toBe(0);
    vi.unstubAllGlobals();
  });

  it('abort 도 moved 를 받는다 — 그린 적 없는 것을 되돌리지 않게', () => {
    const seen = counting();
    vi.stubGlobal('window', seen.target);

    // 문턱을 못 넘고 취소: 미리 보기가 그려진 적이 없다.
    const quiet = vi.fn();
    dragGesture(down(), { start: () => ({}), move: vi.fn(), abort: quiet });
    seen.fire('pointermove', { clientX: 101, clientY: 100 });
    seen.fire('pointercancel', {});
    expect(quiet.mock.calls[0][1]).toMatchObject({ dragged: false });

    // 넘고 나서 취소: 그려졌으니 걷을 것이 있다.
    const drawn = vi.fn();
    dragGesture(down(), { start: () => ({}), move: vi.fn(), abort: drawn });
    seen.fire('pointermove', { clientX: 140, clientY: 100 });
    seen.fire('pointercancel', { clientX: 140, clientY: 100 });
    expect(drawn.mock.calls[0][1]).toMatchObject({ dragged: true, dx: 40 });

    /*
     * Escape 에는 포인터가 없다 — 그때는 마지막으로 본 자리로 답한다. 시작 자리로 답하면
     * `dragged: true` 인데 `dx: 0` 인, 스스로 모순된 기록이 된다.
     */
    const escaped = vi.fn();
    dragGesture(down(), { start: () => ({}), move: vi.fn(), abort: escaped });
    seen.fire('pointermove', { clientX: 160, clientY: 130 });
    seen.fire('keydown', { key: 'Escape', preventDefault: vi.fn(), stopPropagation: vi.fn() });
    expect(escaped.mock.calls[0][1]).toMatchObject({ dragged: true, dx: 60, dy: 30 });
    vi.unstubAllGlobals();
  });

  it('done 과 abort 를 합쳐 정확히 한 번', () => {
    const seen = counting();
    vi.stubGlobal('window', seen.target);
    const done = vi.fn();
    const abort = vi.fn();
    dragGesture(down(), { start: () => ({}), done, abort });

    seen.fire('pointerup', { clientX: 100, clientY: 100 });
    seen.fire('pointerup', { clientX: 100, clientY: 100 });
    seen.fire('pointercancel', {});
    expect(done).toHaveBeenCalledTimes(1);
    expect(abort).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('start 가 준 것이 그대로 세 곳에 다시 온다', () => {
    const seen = counting();
    vi.stubGlobal('window', seen.target);
    const held = { was: 240 };
    const move = vi.fn();
    const done = vi.fn();
    dragGesture(down(), { start: () => held, move, done });

    seen.fire('pointermove', { clientX: 150, clientY: 100 });
    seen.fire('pointerup', { clientX: 150, clientY: 100 });
    expect(move.mock.calls[0][0]).toBe(held);
    expect(done.mock.calls[0][0]).toBe(held);
    vi.unstubAllGlobals();
  });

  it('threshold 0 이면 첫 움직임이 곧 드래그다', () => {
    const seen = counting();
    vi.stubGlobal('window', seen.target);
    const move = vi.fn();
    dragGesture(down(), { start: () => ({}), move }, { threshold: 0 });
    seen.fire('pointermove', { clientX: 101, clientY: 100 });
    expect(move).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('잡은 요소가 캡처를 받으면 창이 아니라 그 요소가 듣는다', () => {
    const inWindow = counting();
    const inElement = counting();
    vi.stubGlobal('window', inWindow.target);
    const captured: number[] = [];
    const held = {
      ...inElement.target,
      setPointerCapture: (id: number) => void captured.push(id),
      releasePointerCapture: vi.fn(),
      ownerDocument: { defaultView: inWindow.target }
    };

    dragGesture(down({ currentTarget: held as never, pointerId: 7 }), { start: () => ({}), done: vi.fn() });
    expect(captured).toEqual([7]);
    expect(inElement.living()).toBe(3);
    expect(inWindow.living()).toBe(0);

    inElement.fire('pointerup', { clientX: 100, clientY: 100 });
    expect(inElement.living()).toBe(0);
    vi.unstubAllGlobals();
  });
});
