import { describe, it, expect } from 'vitest';
import {
  WORD_FONT_CATALOGUE,
  fontFaceSpecs,
  googleFontUrl,
  isWebFont
} from '../src/fonts';

/**
 * **글꼴 목록** — `office-word/test/fonts.test.ts` 에서 모듈과 함께 왔다.
 *
 * 기능은 그것이 사는 층에서 묻는다(`docs/specs/testing.md`). 카탈로그는 *읽는 사람에게 내놓는
 * 선택지* 이고 덱도 같은 것을 쓰므로 부품의 것이다. 문서를 훑는 `documentFontFamilies` 는
 * `office-word` 에 남았고, 그 검사도 거기 남았다 — 그건 문서에 대한 질문이다.
 */
describe('the catalogue', () => {
  it('offers the fonts a desktop already has alongside the ones to fetch', () => {
    const system = WORD_FONT_CATALOGUE.filter((entry) => !entry.web);
    expect(system.map((entry) => entry.family)).toContain('Georgia');
    expect(WORD_FONT_CATALOGUE.some((entry) => entry.web)).toBe(true);
  });

  it('names each family once', () => {
    // A duplicate would show twice in the control and, worse, could disagree
    // with itself about whether it needs fetching.
    const names = WORD_FONT_CATALOGUE.map((entry) => entry.family);
    expect(new Set(names).size).toBe(names.length);
  });

  it('knows which families have to be fetched', () => {
    expect(isWebFont('Merriweather')).toBe(true);
    expect(isWebFont('Georgia')).toBe(false);
    // Not in the catalogue at all: a document may name anything, and a font
    // nobody offered is not one this host can go and get.
    expect(isWebFont('Some Private Font')).toBe(false);
    expect(isWebFont(undefined)).toBe(false);
  });
});

describe('where to fetch from', () => {
  it('asks for the weights the document can actually use', () => {
    const url = googleFontUrl(['Merriweather'])!;
    // Bold as well as regular: a browser asked to embolden a face it only has in
    // regular invents one, at a different width — and width is the thing being
    // measured.
    expect(url).toContain('wght@400;700');
    expect(url).toContain('family=Merriweather');
  });

  it('blocks rather than swapping', () => {
    // Swapping paints in a fallback first, which is exactly the sequence that
    // produces pages broken for the wrong font.
    expect(googleFontUrl(['Lora'])).toContain('display=block');
  });

  it('escapes a family whose name has spaces', () => {
    expect(googleFontUrl(['Playfair Display'])).toContain('family=Playfair+Display');
  });

  it('asks for several families at once', () => {
    const url = googleFontUrl(['Lora', 'Inter'])!;
    expect(url).toContain('family=Lora');
    expect(url).toContain('family=Inter');
  });

  it('has nothing to fetch for fonts already present', () => {
    // No request at all, rather than a request for nothing.
    expect(googleFontUrl(['Georgia', 'Arial'])).toBeNull();
    expect(googleFontUrl([])).toBeNull();
  });
});

describe('waiting for a family', () => {
  it('waits on each weight separately', () => {
    // Asking for the family alone resolves when any one face arrives, and the
    // bold turning up later rewrites the width of every line it is on — after
    // the breaks were decided.
    expect(fontFaceSpecs('Lora')).toEqual(['400 1em "Lora"', '700 1em "Lora"']);
  });
});
