/**
 * **어떤 것 옆에 상자를 놓는다** — 창 밖으로 나가지 않게, 안 맞으면 반대쪽으로.
 *
 * ## 세 번 쓰여 있었고 서로 달랐습니다
 *
 * `floating.tsx`, `color-field.tsx`, and `apps/slide/src/timeline.tsx` each worked out where a
 * popover goes, and the three did not agree:
 *
 * | | 어느 쪽을 먼저 | 가로 맞춤 |
 * |---|---|---|
 * | `floating` | 위 | 가운데 |
 * | `color-field` | 아래 | 오른쪽 끝 |
 * | 데크의 timeline | 위 | 오른쪽 끝 |
 *
 * The preferences are real and different — a slash menu belongs above the caret, a colour picker
 * below its swatch — but *the arithmetic under them is one arithmetic*, and it is the arithmetic
 * that is easy to get subtly wrong: the flip when the preferred side does not fit, the clamp when
 * neither does, the margin from the window edge.
 *
 * ## 왜 `office-ui` 인가
 *
 * 순수한 기하입니다 — 에디터도, 제품도, DOM 조차 모릅니다. 두 사각형과 두 낱말이 들어가고 좌표가
 * 나옵니다. 그래서 밀리초에 검사할 수 있고, 실제로 검사합니다.
 */

/** A rectangle, in the shape `getBoundingClientRect` gives one. */
export interface PlaceBox {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface PlaceOptions {
  /**
   * Which side to try first — and it is a preference, not a rule: a box that does not fit there goes
   * to the other side, and one that fits nowhere is clamped into the window.
   */
  prefer?: 'above' | 'below';
  /** How the box lines up across — under the anchor's centre, or flush with one of its edges. */
  align?: 'center' | 'start' | 'end';
  /** Between the anchor and the box. */
  gap?: number;
  /** Between the box and the edge of the window. */
  margin?: number;
  /** The window, so a test can hand it one that is not the reader's. */
  within?: { width: number; height: number };
}

/**
 * Where the box goes, in page coordinates.
 *
 * Clamped last and always: a box taller than the window has no side that fits, and the honest answer
 * is *as high as the margin allows* rather than a negative `top` that puts half of it off screen.
 */
export function placeNear(
  anchor: PlaceBox,
  box: { width: number; height: number },
  options: PlaceOptions = {}
): { top: number; left: number } {
  const { prefer = 'below', align = 'center', gap = 4, margin = 8 } = options;
  const within = options.within ?? {
    width: typeof window === 'undefined' ? 0 : window.innerWidth,
    height: typeof window === 'undefined' ? 0 : window.innerHeight
  };

  /**
   * **놓인 자리가 여백을 지키는가**를 묻습니다 — 높이가 들어가는가가 아니라.
   *
   * The difference is four pixels wide and it is a real bug. Asking *does the height fit in the room*
   * lets through a box whose resulting `top` is between `margin - gap` and `margin`: it "fits", so
   * this side is chosen, and then the clamp pulls it to the margin — so a menu that should have
   * flipped below the caret sits at the top of the window instead.
   *
   * Found by the site's slash-menu check, which asserts the menu is at or below the caret when there
   * is no room above: it came back **8** — the margin — where it wanted 379. The three copies this
   * function replaced asked it the right way; the extraction asked it the wrong way, which is exactly
   * the risk that made three slightly different copies worth consolidating in the first place.
   */
  const above = anchor.top - gap - box.height;
  const below = anchor.bottom + gap;
  const fitsAbove = above >= margin;
  const fitsBelow = below + box.height <= within.height - margin;

  /**
   * **선호하는 쪽이 맞으면 거기, 아니면 반대쪽, 둘 다 안 맞으면 아래.**
   *
   * The last clause is the one that had to be measured. Both originals chose *below* when neither
   * side fit, and it took a failing check to see why: a box clamped **upward** covers the anchor —
   * a 411px menu at a caret 380px down a 720px window lands at the margin and swallows the very
   * caret it is about. Clamped downward it starts just under the anchor with its first rows visible,
   * which is the half a reader actually uses.
   *
   * Written the other way first, and the site's slash check caught it: *at or below the caret*, and
   * it got **8**.
   */
  const top = prefer === 'above' ? (fitsAbove ? above : below) : fitsBelow ? below : fitsAbove ? above : below;

  const left =
    align === 'center'
      ? anchor.left + anchor.width / 2 - box.width / 2
      : align === 'end'
        ? anchor.right - box.width
        : anchor.left;

  /**
   * **창 안으로 가두되, 앵커를 넘지는 않게.**
   *
   * The three originals disagreed here and one of them had no vertical clamp at all — which looked
   * like an omission and was the point: a menu about a caret must stay **attached** to the caret,
   * and a clamp that pulls it back into the window can pull it straight across the thing it is
   * about. Measured: a 411px menu at a caret 380px down a 720px window clamps to 301 and then spans
   * 301–712, swallowing the caret.
   *
   * So the clamp is bounded by the anchor. A box placed below never rises above `anchor.bottom +
   * gap` however little room is left — it runs off the bottom instead, which is what a long menu
   * does everywhere and what a reader can scroll or arrow through. A box placed above is only ever
   * chosen when it already clears the margin, so moving it further up cannot cross anything.
   */
  const lowest = Math.max(margin, within.height - margin - box.height);
  const inside = Math.min(Math.max(margin, top), lowest);

  return {
    top: top === below ? Math.max(inside, below) : Math.min(inside, above),
    left: Math.min(Math.max(margin, left), Math.max(margin, within.width - margin - box.width))
  };
}
