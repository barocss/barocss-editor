/**
 * **문서의 길이 단위** — 한 벌.
 *
 * ## 두 벌이었고, 두 벌은 갈라졌다
 *
 * `twipToPx` 가 `office-slides/geometry.ts` 와 `office-text/css.ts` 에 각각 있었고, **두 곳 다
 * 자기가 exact 라고 적어 뒀다.** 그런데 계산 순서가 달랐다:
 *
 * ```
 * office-slides:  twip * (96 / 1440)
 * office-text:    (twip / 1440) * 96
 * ```
 *
 * 수학으로는 같고 **부동소수로는 다르다.** 재본 것: `-100000..100000` 중 **58,310개**가 다른 값을
 * 주고, CSS 문자열로는 20만 중 **58,306개**가 갈린다 —
 *
 * ```
 *  9 twip → 0.6px                vs  0.6000000000000001px
 * 18 twip → 1.2px                vs  1.2000000000000002px
 * ```
 *
 * 화면에서는 안 보인다. 그런데 **문자열이 갈리므로** 내보낸 HTML/CSS 이 제품마다 달라지고, 문자열을
 * 비교하는 검사가 어느 판을 부르느냐로 답이 바뀐다. *두 벌은 반드시 갈라진다* 의 실물이고, 이번에는
 * **둘 다 자기가 정확하다고 적어 둔 채로** 갈라져 있었다.
 *
 * ## 어느 쪽을 골랐나
 *
 * `twip * PX_PER_TWIP` — 상수를 한 번만 나누므로 나눗셈이 하나다. 둘 중 어느 쪽도 IEEE754 에서
 * *더 정확하지* 않지만, **하나여야 한다는 것이 요점이고** 상수를 이름으로 둘 수 있는 쪽이 읽기 낫다.
 */

/** 96dpi 에서 1 twip 이 몇 픽셀인가. 1 twip = 1/1440 inch, 1 inch = 96 CSS px — 정의된 값이다. */
export const PX_PER_TWIP = 96 / 1440;

/** Twips → CSS 픽셀. */
export const twipToPx = (twip: number): number => twip * PX_PER_TWIP;

/** CSS 픽셀 → twips. */
export const pxToTwip = (px: number): number => px / PX_PER_TWIP;

/** Twips → 포인트. 1 twip = 1/20 pt. */
export const twipToPt = (twip: number): number => twip / 20;

/**
 * **CSS 선언 한 뭉치.**
 *
 * `Record<string, string>` 이고, 그래서 두 패키지가 각자 선언하고 있었다 — 짧을수록 다시 적기
 * 쉽다. 이름이 둘이면 *같은 것인가* 를 매번 물어야 하고, 그 질문에 값이 없다.
 */
export type CssStyle = Record<string, string>;

/**
 * **어느 쪽이 위로 오는가** — 종이를 눕히는 그 한 줄.
 *
 * 문서는 종이를 **세운 상태의 두 변**으로 저장하고, 가로로 눕히라는 지시를 따로 적는다. 그리는
 * 쪽은 그릴 때마다 두 변을 맞바꿔야 하고, 그 두 줄이 이 저장소 네 곳에 손으로 복사돼 있었다 —
 * `office-word/layout.ts`, `office-text/css.ts` 의 `flowCss` 와 `pageCss`,
 * `office-canvas/canvas-insert.ts`.
 *
 * 넷은 서로 어긋나 있지 않았다. 어긋난 것은 **다섯 번째로 온 사람**이다: 페이지 설정 대화상자가
 * 저장값 자체를 맞바꾸도록 만들어졌고, 그리는 쪽이 한 번 더 뒤집어 가로를 골라도 종이가 세로였다.
 * 규약이 네 번 적혀 있고 한 번도 이름을 갖지 않으면 그렇게 된다.
 *
 * 속성 이름을 모른다 — `pageWidth` 도 `orientation` 도 여기 없다. 그것들은 오피스의 낱말이고
 * `shared` 는 낱말을 모르는 자리다. 여기 있는 것은 **두 수와 한 판단**뿐이다.
 */
export const sideways = (
  landscape: boolean,
  upright: { width: number; height: number }
): { width: number; height: number } =>
  landscape ? { width: upright.height, height: upright.width } : upright;
