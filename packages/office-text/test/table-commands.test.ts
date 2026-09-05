import { describe, it, expect } from 'vitest';
import { nextTextDirection } from '../src/table-commands';

/**
 * **칸의 글자 방향** — 워드의 단추가 도는 순환.
 *
 * `office-word/test/toolbar.test.ts` 에 있었고 `table-commands.ts` 와 함께 왔다. 기능은 그것이
 * 사는 층에서 묻는다: 툴바 검사에 남는 것은 *툴바가 그것을 부르는가* 이지 *순환이 맞는가* 가
 * 아니다(`docs/specs/testing.md`).
 */
describe('the direction a cell’s text is turned to next', () => {
  it('moves through the three in a cycle, as Word’s button does', () => {
    expect(nextTextDirection('lrTb')).toBe('tbRl');
    expect(nextTextDirection('tbRl')).toBe('btLr');
    expect(nextTextDirection('btLr')).toBe('lrTb');
  });

  it('turns a cell that says nothing, rather than doing nothing', () => {
    /* 안 적힌 것이 보통 방향이므로, 첫 누름이 거기서 벗어나야 한다. */
    expect(nextTextDirection('')).toBe('tbRl');
    expect(nextTextDirection('something else')).toBe('tbRl');
  });
});
