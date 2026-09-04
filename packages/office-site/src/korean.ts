/**
 * **조사** — the particle a Korean sentence picks by the word in front of it, which a template
 * literal cannot do.
 *
 * ## Why this is a module and not a habit
 *
 * It is not a style preference. *5개이 끊어집니다* and *컴포넌트이 없습니다* are wrong the way *a
 * apple* is wrong, and this product writes sentences with a name dropped into the middle of them:
 * `'${name}' ${what}이 없습니다` reads correctly for 템플릿 and 파일 and incorrectly for 컴포넌트
 * and 데이터, from the same line of code.
 *
 * It got away with it for a long time because every counted noun in one sentence happened to end
 * the same way — `faults.ts` has a comment saying exactly that about 머리말·본문·꼬리말, which is
 * the reasoning done by hand and correct until somebody adds a fourth landmark. Two sentences now
 * choose their noun at runtime, so the rule has to be arithmetic rather than a comment.
 *
 * ## The rule
 *
 * Hangul encodes the syllable: `(code - 가) % 28` is the 종성, the final consonant, and zero means
 * there is none. Everything else about Korean particles is either this question or the same question
 * — 은/는, 을/를 and 와/과 all split on it — so this file is where they go when they are needed.
 * They are not needed yet.
 *
 * A word that does not end in a Hangul syllable — a name typed in Latin letters, a number, an id —
 * has no answer, and the honest fallback is the one a reader writes by hand in that situation:
 * `이(가)`. Guessing would be wrong for half of them.
 */

/** 이 or 가, by whether the word ends in a final consonant. */
export function iGa(said: string): string {
  return particle(said, '이', '가');
}

function particle(said: string, withFinal: string, without: string): string {
  const last = said.charCodeAt(said.length - 1) - 0xac00;
  if (!Number.isFinite(last) || last < 0 || last > 11171) return `${withFinal}(${without})`;
  return last % 28 === 0 ? without : withFinal;
}
