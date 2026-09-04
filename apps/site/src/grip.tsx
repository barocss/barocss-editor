/**
 * **The edge a reader drags** — one for the rail, one for the panel.
 *
 * ## Why a builder needs this and a document tool does not
 *
 * The two sides hold lists whose longest row is the reader's own words: a page called 블로그 and one
 * called *스택이 페이지의 문법이다* are both rows in the same 240px column, and the second is read as
 * `스택이 페이지의…`. A panel is the same story with a definition's name and a dataset's. Every tool
 * of this kind lets the sides move for exactly that reason, and none of them makes it a setting.
 *
 * ## What it is not
 *
 * A splitter component. There is no second pane to give the space to — the canvas takes whatever is
 * left, and it already reflows — so this is one number and a pointer, which is the whole mechanism.
 *
 * And it is a **sibling of both regions**, not a child of either: inside the rail it covered the
 * last nine pixels of every row, and a row's 삭제 ends one pixel from that edge, so it ate the click
 * on all of them. A boundary belongs to neither side.
 *
 * Pointer capture rather than window listeners: a drag that leaves the window and comes back is one
 * gesture, and the element that started it keeps the events. Clamped, because a 40px rail and one
 * that eats the canvas are both a reader having to drag it back.
 */
export function Grip({
  at,
  onWidth
}: {
  /** Where the boundary is, which is also the width the region to its left has. */
  at: number;
  onWidth: (width: number) => void;
}) {
  return (
    <div
      className="st-boundary"
      style={{ left: at }}
      role="separator"
      aria-orientation="vertical"
      /*
       * **Not 너비.** It was *왼쪽 너비*, and `getByLabel('너비')` — which matches a substring — then
       * found this as well as the panel's W. A check about a placed block's width failed on a handle
       * that has nothing to do with one, which is the kind of collision an accessible name causes
       * and a class name cannot.
       */
      aria-label="도구 영역 경계"
      onPointerDown={(event) => {
        event.preventDefault();
        const from = event.clientX;
        const was = at;
        const held = event.currentTarget;
        held.setPointerCapture(event.pointerId);

        const move = (one: PointerEvent) => {
          onWidth(Math.max(200, Math.min(560, Math.round(was + (one.clientX - from)))));
        };
        const done = () => {
          held.removeEventListener('pointermove', move);
          held.removeEventListener('pointerup', done);
          held.removeEventListener('pointercancel', done);
        };
        held.addEventListener('pointermove', move);
        held.addEventListener('pointerup', done);
        held.addEventListener('pointercancel', done);
      }}
      /* Double-click puts it back, which is what every tool of this kind does with a dragged edge. */
      onDoubleClick={() => onWidth(240)}
    />
  );
}

