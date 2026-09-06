import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * **독자가 만든 것이 새로고침을 넘는가** — 제품마다.
 *
 * ## 이 검사가 세우는 것
 *
 * `no-product-invents-storage` 는 *다시 발명하지 않는가* 를 묻는다. 그것만으로는 부족하다:
 * **아무것도 안 하는 제품이 가장 잘 통과한다.** 2026-09-06 아침의 상태가 정확히 그랬다 —
 * Word 와 사이트는 저장 코드가 0줄이었고, 그래서 "다시 발명" 도 0이었다.
 *
 * | 제품 | 그날 아침 |
 * |---|---:|
 * | `office-slides` | 818줄 (혼자 다 만들었다) |
 * | `office-word` | **0** — 새로고침하면 사라진다 |
 * | `office-site` | **0** — 새로고침하면 사라진다 |
 *
 * `apps/word/src/main.tsx` 와 `apps/site/src/main.tsx` 는 부팅에 샘플을 실었고 그것이 전부였다.
 * 로드맵의 도표가 스스로 적어 두었다 — **`[ 서비스 ] 거의 비어 있다`**.
 *
 * 그러니 묻는 것은 둘이어야 한다: **다시 발명하지 않는가**(형제 검사), 그리고 **할 수는 있는가**
 * (여기).
 *
 * ## 거절은 침묵이 아니라 문장이다
 *
 * 모든 제품이 라이브러리를 가져야 하는 것은 아니다. 노트는 **호스트 문서 안에 산다** — 사이트의
 * 자료 행 하나가 노트 하나이고, 그것을 지키는 것은 사이트의 파일이다. 자기 라이브러리를 갖는
 * 노트는 두 곳에 있는 노트다.
 *
 * 그것은 정당한 거절이고, 그래서 **이유와 함께 이름으로 적는다.** `office-site/site-kit.ts` 가
 * 레이아웃 명령을 거절하며 남긴 모양 그대로다 — *두 번째 독자보다 이유와 복귀 조건을 적은 거절이
 * 값어치가 크다.* 조용히 빠지는 것과 적어 두고 빠지는 것의 차이가 이 파일 전체다.
 */
const ROOT = join(__dirname, '..', '..', '..');

/**
 * 지금 저장을 갖지 않는 제품과, 왜 그런지.
 *
 * 여기 적힌 제품이 저장을 **갖게 되면** 이 검사가 빨개진다. 목록이 낡는 것도 결함이므로.
 */
const DECLINED: ReadonlyArray<readonly [string, string]> = [
  [
    'office-note',
    '노트는 호스트 문서 안에 산다 — 사이트의 자료 행 하나가 노트 하나이고, 그것을 지키는 것은 ' +
      '사이트의 파일이다. 자기 라이브러리를 갖는 노트는 두 곳에 있는 노트다. `session.ts` 가 ' +
      '노트를 *여는* 쪽을 답하고, 그것은 저장이 아니다.'
  ]
];

const PRODUCTS = ['office-word', 'office-slides', 'office-site', 'office-note'];

const sourceText = (pkg: string): string => {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === 'dist') continue;
      const at = join(dir, entry);
      if (statSync(at).isDirectory()) walk(at);
      else if (/\.(ts|tsx)$/.test(entry) && !/\.test\./.test(entry)) out.push(readFileSync(at, 'utf8'));
    }
  };
  walk(join(ROOT, 'packages', pkg, 'src'));
  return out.join('\n');
};

/** 제품이 공용 층의 무엇을 부르는가. 이름으로 묻는다 — 그것이 그 층의 문이므로. */
const uses = (text: string, symbol: string): boolean =>
  new RegExp(`\\b${symbol}\\s*\\(`).test(text);

describe('제품마다 독자의 작업이 새로고침을 넘는다', () => {
  it('제품 넷의 소스를 실제로 읽었다 — 이 검사가 아무것도 안 보고 통과하지 않게', () => {
    for (const pkg of PRODUCTS) {
      expect(sourceText(pkg).length, `${pkg} 에서 소스를 못 읽었습니다`).toBeGreaterThan(1000);
    }
  });

  it('문서를 파일로 쓰고 되읽을 수 있다', () => {
    const declined = new Set(DECLINED.map(([pkg]) => pkg));
    const missing = PRODUCTS.filter(
      (pkg) => !declined.has(pkg) && !uses(sourceText(pkg), 'documentFileFormat')
    );

    expect(
      missing,
      `이 제품은 문서를 파일로 만들 수 없습니다 — 독자가 만든 것이 새로고침을 못 넘습니다.\n` +
        `\`@barocss/shared\` 의 \`documentFileFormat\` 에 자기 넷(이름·낱말·판·확장자)을 넘기세요.\n` +
        `저장을 갖지 않는 것이 맞다면 이 파일의 \`DECLINED\` 에 **이유와 함께** 적으세요:\n` +
        missing.map((one) => `  ${one}`).join('\n')
    ).toEqual([]);
  });

  it('독자가 만든 것을 이름으로 다시 찾을 수 있다', () => {
    const declined = new Set(DECLINED.map(([pkg]) => pkg));
    const missing = PRODUCTS.filter(
      (pkg) => !declined.has(pkg) && !uses(sourceText(pkg), 'documentLibrary')
    );

    expect(
      missing,
      `이 제품은 문서를 보관할 수 없습니다 — 파일로 내려받을 수는 있어도 돌아와서 이어서 할 수는\n` +
        `없습니다. \`@barocss/shared\` 의 \`documentLibrary\` 를 쓰세요:\n` +
        missing.map((one) => `  ${one}`).join('\n')
    ).toEqual([]);
  });

  /**
   * **거절 목록이 낡는 것도 결함이다.**
   *
   * 적어 둔 제품이 저장을 갖게 되면 이 줄이 빨개진다 — 그때 할 일은 목록에서 빼는 것이고, 그
   * 한 줄이 *언제 마음이 바뀌었는지* 를 기록에 남긴다.
   */
  it('거절한 제품이 정말 저장을 안 갖고 있다', () => {
    const changed = DECLINED.filter(([pkg]) => uses(sourceText(pkg), 'documentLibrary')).map(
      ([pkg, why]) => `${pkg} — "${why.slice(0, 40)}…" 라고 적혀 있는데 지금 라이브러리를 씁니다`
    );

    expect(
      changed,
      `\`DECLINED\` 가 낡았습니다. 목록에서 빼세요 — 예외 목록이 실제와 어긋나면 그 다음부터는\n` +
        `아무것도 안 잡습니다:\n${changed.map((one) => `  ${one}`).join('\n')}`
    ).toEqual([]);
  });
});
