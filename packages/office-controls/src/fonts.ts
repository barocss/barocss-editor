import type { ChoiceControl } from './index';

/**
 * **글꼴 목록** — `office-word` 에서 왔다.
 *
 * ## 왜 여기인가
 *
 * `apps/slide/src/ribbon.tsx` 가 이것을 `@barocss/office-word` 에서 가져오고 있었다. 그 파일이
 * 스스로 진단을 적어 뒀다 — *"a font catalogue and a set of text colours are shared **content**,
 * and their home is wherever the shared text model ends up"*. 맞는 말이었고 집이 틀렸다.
 *
 * 여기인 이유는 **자매가 이미 여기 있기 때문**이다: `WORD_TEXT_COLOR`·`WORD_TEXT_HIGHLIGHT` 가
 * 이 패키지의 것이고 `office-word` 는 되팔 뿐이었다. 글꼴 목록과 글자색 팔레트는 같은 종류다 —
 * *제품이 읽는 사람에게 내놓는 선택지* 이고, 두 제품이 그것에 대해 다른 답을 내면 하나가 틀린 것이다.
 *
 * ## 갈라서 옮긴 이유
 *
 * 원래 파일은 155줄이었고 `documentFontFamilies(doc: DocumentAccess)` 하나가 `office-text` 를
 * 필요로 했다. 통째로 옮겼으면 이 패키지가 `office-text`(깊이 4)를 의존해 **깊이 5** 가 되고,
 * 그러면 이것을 쓰는 제품 넷이 전부 6으로 밀린다. 카탈로그 쪽은 **의존이 0** 이므로 그것만 왔다.
 * 문서를 훑는 함수는 `office-word` 에 남았다 — 그건 문서에 대한 질문이다.
 */
export interface FontFamily {
  /** The name stored in the document, and shown in the control. */
  family: string;
  /**
   * Whether a host has to fetch this family before it will render.
   *
   * The ones that do not are the fonts a desktop can be assumed to have. Naming
   * them costs nothing and they render immediately, which is why they are still
   * offered alongside the web ones.
   */
  web: boolean;
}

const system = (family: string): FontFamily => ({ family, web: false });
const web = (family: string): FontFamily => ({ family, web: true });

export const WORD_FONT_CATALOGUE: FontFamily[] = [
  // Assumed present. A document set in one of these is readable the instant it
  // opens, with no fetch and nothing to wait for.
  system('Georgia'),
  system('Times New Roman'),
  system('Arial'),
  system('Helvetica'),
  system('Courier New'),
  system('Verdana'),

  // Serif faces meant for running text.
  web('EB Garamond'),
  web('Libre Baskerville'),
  web('Lora'),
  web('Merriweather'),
  web('Noto Serif'),
  web('Playfair Display'),
  web('Source Serif 4'),

  web('Inter'),
  web('Lato'),
  web('Montserrat'),
  web('Noto Sans'),
  web('Open Sans'),
  web('Roboto'),
  web('Source Sans 3'),
  web('Work Sans'),

  web('JetBrains Mono'),
  web('Roboto Mono'),
  web('Source Code Pro'),

  // Korean. A run takes one family, so a run holding Hangul takes one of these —
  // the Latin faces above carry none of it. Which is why they are offered in the
  // same control rather than in a slot of their own: picking the font for the
  // text is the whole of the choice.
  web('Noto Sans KR'),
  web('Noto Serif KR'),
  web('Nanum Gothic'),
  web('Nanum Myeongjo')
];

/** Whether a family has to be fetched before it will render. */
export function isWebFont(family: string | undefined): boolean {
  if (!family) return false;
  return WORD_FONT_CATALOGUE.some((entry) => entry.family === family && entry.web);
}

/**
 * Where to fetch a family from.
 *
 * Regular and bold, because a document that turns bold on would otherwise get a
 * browser's synthetic emboldening — which is a different width, and width is
 * what pagination is measuring.
 *
 * `display=block` rather than the usual `swap`: swapping means text is painted
 * in a fallback and then re-painted in the real face, and everything measured in
 * between is measured against the wrong font. Blocking keeps the text invisible
 * until it can be measured once, correctly.
 */
export function googleFontUrl(families: string[]): string | null {
  const wanted = families.filter(isWebFont);
  if (wanted.length === 0) return null;

  const query = wanted
    .map((family) => `family=${encodeURIComponent(family).replace(/%20/g, '+')}:wght@400;700`)
    .join('&');
  return `https://fonts.googleapis.com/css2?${query}&display=block`;
}

/** The fonts offered, drawn from the catalogue; see fonts.ts for what is in it. */
export const WORD_FONTS: ChoiceControl = {
  id: 'font-family',
  label: 'Font',
  command: 'setFontFamily',
  key: 'family',
  markType: 'fontFamily',
  attr: 'family',
  options: WORD_FONT_CATALOGUE.map((entry) => ({ value: entry.family, label: entry.family }))
};

/**
 * The sizes offered, in Word's unit.
 *
 * Half-points, because that is what a .docx stores and what the renderer reads a
 * number as — 22 is eleven point. The labels are points, because that is what a
 * writer means by "eleven".
 */
export const WORD_FONT_SIZES: ChoiceControl = {
  id: 'font-size',
  label: 'Size',
  command: 'setFontSize',
  key: 'size',
  markType: 'fontSize',
  attr: 'size',
  options: [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48, 72].map((points) => ({
    value: points * 2,
    label: String(points)
  })),
  /**
   * The document stores half-points and a reader reads points, so a size that is
   * not one of the presets has to be turned back before it is shown. Named on
   * the model because the model is what knows the unit — an app that divided by
   * two would be an app that knew a `.docx` detail.
   */
  labelOf: (value) => String(Number(value) / 2)
};


/**
 * The CSS font specifications to wait on for a family.
 *
 * `document.fonts.load` takes a font shorthand and resolves when that exact face
 * is ready; asking for the family alone would resolve as soon as any weight
 * arrived, and the bold one arriving later would change every line it is on.
 */
export function fontFaceSpecs(family: string): string[] {
  const quoted = `"${family.replace(/"/g, '\\"')}"`;
  return [`400 1em ${quoted}`, `700 1em ${quoted}`];
}
