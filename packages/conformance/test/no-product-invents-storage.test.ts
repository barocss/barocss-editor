import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * **문서를 파일로 쓰고 어딘가에 두는 일은 한 벌뿐이다.**
 *
 * ## 이 검사가 있는 이유
 *
 * `docs/ROADMAP.md` 의 도표가 스스로 적어 두었다 — **`[ 서비스 ] 거의 비어 있다`**. 2026-09-06
 * 에 세어 보니 그 칸의 내용은 이랬다:
 *
 * | 제품 | 문서를 여닫고 저장하는 코드 |
 * |---|---:|
 * | `office-slides` | **818줄** |
 * | `office-note` | 170줄 (세션이지 저장이 아니다) |
 * | `office-word` | **0** |
 * | `office-site` | **0** |
 *
 * `apps/word/src/main.tsx` 와 `apps/site/src/main.tsx` 는 새로고침마다 샘플을 다시 실었다.
 * 독자가 무엇을 쓰든 돌아오면 없었다.
 *
 * 덱의 219줄짜리 `deck-file.ts` 를 읽으니 **덱의 것은 넷뿐**이었다 — 자기 이름, 독자가 부르는
 * 낱말, 판 번호, 제목이 어디 있는가. 봉투도, 세션이 빌려준 sid 를 걷어내는 것도, 넷 중 어느
 * 것인지 말하는 거절도, 플랫폼마다 안전한 파일 이름도 전부 이 엔진이 담는 **모든** 문서에 대해
 * 참이었다. `deck-storage.ts` 의 IndexedDB 도 마찬가지다.
 *
 * 그래서 그 둘이 `@barocss/shared` 로 내려갔고, Word 가 넉 줄로 그것을 얻었다. 이 검사가 지키는
 * 것은 그다음이다 — **셋째 제품이 다시 발명하지 않는 것.** `note.md` 가 적어 둔 규칙이다:
 * *"아래로 안 내려간 것은 셋째 제품에서 다시 발명된다."* 이번에는 둘째 전에 내려갔고, 이 파일이
 * 그 상태를 붙잡는다.
 *
 * ## 무엇을 세는가
 *
 * 제품 안에서 **직렬화를 스스로 하거나 브라우저 저장소를 직접 여는 것.** 둘 다 공용 층의 것이고,
 * 제품이 그것을 다시 적기 시작했다는 것은 공용 층이 그 제품에 안 맞았다는 뜻이다 — 그때 할 일은
 * 사본을 남기는 게 아니라 공용 층을 고치는 것이다.
 *
 * 읽기는 세지 않는다. `JSON.parse` 로 붙여넣기를 읽거나 `localStorage` 에서 마지막으로 열어 둔
 * 패널을 기억하는 것은 문서를 두는 일이 아니다. 그래서 **쓰는 쪽** 만 센다.
 */
const ROOT = join(__dirname, '..', '..', '..');
const PRODUCTS = ['office-word', 'office-slides', 'office-site', 'office-note'];

/** 문서를 파일로 만드는 것과 브라우저 저장소를 여는 것. 둘 다 공용 층이 답한다. */
const INVENTED: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bindexedDB\.open\s*\(/, 'IndexedDB 를 직접 엽니다'],
  [/\blocalStorage\.setItem\s*\(/, 'localStorage 에 직접 씁니다'],
  [/\bsessionStorage\.setItem\s*\(/, 'sessionStorage 에 직접 씁니다']
];

/**
 * 일부러 남긴 것 — 이유와 함께.
 *
 * 목록이 아니라 파일 안의 표시였으면 더 좋았겠지만, 이것들은 *없어야 할 코드* 가 아니라 *다른
 * 질문에 답하는 코드* 라 파일마다 표시를 다는 것이 소음이 된다. 하나라도 늘면 이 목록이 빨개진다.
 */
const ALLOWED: ReadonlyArray<readonly [string, string]> = [];

const sources = (pkg: string): string[] => {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === 'dist') continue;
      const at = join(dir, entry);
      if (statSync(at).isDirectory()) walk(at);
      else if (/\.(ts|tsx)$/.test(entry) && !/\.test\./.test(entry)) out.push(at);
    }
  };
  walk(join(ROOT, 'packages', pkg, 'src'));
  return out;
};

describe('제품은 저장을 다시 발명하지 않는다', () => {
  it('제품 넷의 소스를 실제로 읽었다 — 이 검사가 아무것도 안 보고 통과하지 않게', () => {
    for (const pkg of PRODUCTS) {
      expect(sources(pkg).length, `${pkg} 에서 소스를 못 찾았습니다`).toBeGreaterThan(10);
    }
  });

  it('브라우저 저장소를 직접 열지 않는다', () => {
    const exempt = new Set(ALLOWED.map(([path]) => path));
    const found: string[] = [];
    for (const pkg of PRODUCTS) {
      for (const file of sources(pkg)) {
        const short = file.slice(ROOT.length + 1);
        if (exempt.has(short)) continue;
        const text = readFileSync(file, 'utf8');
        for (const [pattern, says] of INVENTED) {
          if (pattern.test(text)) found.push(`${short} — ${says}`);
        }
      }
    }

    expect(
      found,
      `제품이 문서를 두는 일을 다시 적고 있습니다. \`@barocss/shared\` 의 \`documentLibrary\` 를\n` +
        `쓰세요 — 그것이 그 제품에 안 맞으면 사본을 만들 것이 아니라 공용 층을 고치세요:\n` +
        found.map((one) => `  ${one}`).join('\n')
    ).toEqual([]);
  });

  it('파일 형식을 다시 적지 않는다 — 제품은 자기 넷만 댄다', () => {
    /*
     * 봉투를 만드는 표시는 하나로 충분하다: `format` 과 `version` 을 **함께** 담은 객체 리터럴.
     * `JSON.stringify` 만 세면 클립보드도 내보내기도 걸리고, 그러면 이 검사는 무시된다.
     *
     * **쉼표로 끝나는 줄만 센다.** 첫 판은 `deck-file.ts` 의 `interface DeckFile` 을 물었다 —
     * 봉투의 *모양을 이름 붙이는* 것과 봉투를 *만드는* 것은 다르고, 앞의 것은 제품이 자기 API 를
     * 위해 가질 수 있다. TypeScript 에서 그 둘을 가르는 것은 줄 끝의 `,` 와 `;` 다.
     */
    const envelope = /format\s*:[^\n]*,\s*\n\s*version\s*:/;
    const found: string[] = [];
    for (const pkg of PRODUCTS) {
      for (const file of sources(pkg)) {
        const text = readFileSync(file, 'utf8');
        if (envelope.test(text)) found.push(file.slice(ROOT.length + 1));
      }
    }

    expect(
      found,
      `제품이 파일 봉투를 스스로 만들고 있습니다. \`@barocss/shared\` 의 \`documentFileFormat\` 에\n` +
        `자기 넷(이름·낱말·판·확장자)만 넘기세요:\n${found.map((one) => `  ${one}`).join('\n')}`
    ).toEqual([]);
  });
});
