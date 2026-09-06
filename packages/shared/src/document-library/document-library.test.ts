import { describe, expect, it } from 'vitest';
import { freeLibraryName } from './document-library';

/**
 * **문서를 무엇이라 부를 것인가** — 라이브러리에서 이름은 링크가 붙잡는 것이다.
 *
 * IndexedDB 를 여닫는 쪽은 여기서 안 잰다. 브라우저가 답을 정하는 자리이고
 * (`docs/specs/testing.md`), 그래서 `office-slides` 도 그 절반에는 검사를 두지 않았다. 이름
 * 짓기는 반대다 — 전부 우리 코드가 정한다.
 */
describe('쓰이지 않은 이름을 짓는다', () => {
  it('제목을 슬러그로 만든다', () => {
    expect(freeLibraryName([], 'One engine, two products', 'doc')).toBe('one-engine-two-products');
  });

  it('한글은 그대로 남는다 — 슬러그가 낱말을 지우면 안 된다', () => {
    expect(freeLibraryName([], '가격표', 'doc')).toBe('가격표');
  });

  /**
   * **넓혔고, 그것이 이 이동의 값 하나다.**
   *
   * `office-slides` 의 판은 `[^a-z0-9가-힣]` 이었다. 라틴과 한글만 남기므로 일본어나 중국어나
   * 키릴 문자로 된 제목은 **통째로 지워지고 `deck` 이 된다** — 그런 제목을 가진 독자에게는 모든
   * 문서가 `deck`, `deck-2`, `deck-3` 이다. 제품 하나의 결함으로 보였지만 제품의 것이 아니었다.
   */
  it('라틴과 한글만이 아니다 — 어느 문자든 낱말이면 남는다', () => {
    expect(freeLibraryName([], '発表資料', 'doc')).toBe('発表資料');
    expect(freeLibraryName([], 'Отчёт', 'doc')).toBe('отчёт');
  });

  it('앞뒤의 이음표를 뗀다', () => {
    expect(freeLibraryName([], '  ...초안...  ', 'doc')).toBe('초안');
  });

  it('제목이 없거나 낱말이 하나도 없으면 대신할 이름을 쓴다', () => {
    expect(freeLibraryName([], undefined, 'doc')).toBe('doc');
    expect(freeLibraryName([], '???', 'doc')).toBe('doc');
  });

  it('아주 긴 제목을 자른다', () => {
    expect(freeLibraryName([], 'a'.repeat(200), 'doc').length).toBeLessThanOrEqual(40);
  });

  it('쓰이고 있으면 숫자를 붙이고, 그 숫자도 쓰이면 넘어간다', () => {
    expect(freeLibraryName(['가격표'], '가격표', 'doc')).toBe('가격표-2');
    expect(freeLibraryName(['가격표', '가격표-2'], '가격표', 'doc')).toBe('가격표-3');
  });

  /**
   * 이름은 링크가 붙잡는 것이고, 링크는 *이름인가 주소인가* 를 슬래시·점·콜론으로 가린다
   * (`office-slides` 의 `isLibraryName`). 슬러그가 그 셋을 남기면 그 판정이 무너진다.
   */
  it('이름에는 구분자가 없다 — 주소와 구별되어야 한다', () => {
    const made = freeLibraryName([], 'a/b.c:d?e#f g', 'doc');
    expect(/[/.:?#\s]/.test(made)).toBe(false);
  });
});
