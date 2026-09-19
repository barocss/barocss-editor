import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * **로드맵의 산문이 *없다* 고 말한 것은 정말 없어야 한다.**
 *
 * ## 형제 검사가 구조적으로 못 잡는 것
 *
 * `roadmap-claims-name-their-proof` 는 `- [x]` 줄이 자기 근거의 이름을 대는지 본다. 그것으로
 * 체크박스 쉰 개가 붙잡혔고, 실제로 틀린 완료 주장 다섯을 잡아냈다.
 *
 * 그런데 **거짓말은 체크박스 밖으로 숨을 수 있다.** 2026-09-06 에 `ROADMAP.md:647` 이 이렇게
 * 적고 있었다:
 *
 * > *A shape's whole style is `fill`, `stroke` and `strokeWidth` today. **No gradient, no shadow,
 * > no blur, no dashes, no per-corner radius, no image crop.***
 *
 * 재보니 **여섯 다 있었다.** `slidesPanelAttrs()` 가 `gradientKind`·`shadowColor`·`strokeDash`·
 * `cornerRadius`·`cropTop` 을 전부 내주고 있었고, 그 문단은 *독자가 이 페이지에서 제일 먼저 읽는
 * 자리* 에 있었다. 체크박스가 아니라 문장이었으므로 형제 검사는 통과시켰다.
 *
 * 이 저장소가 같은 모양을 하루에 다섯 번 겪었다 — **가드가 자기가 막을 것을 못 본다.** 이것은
 * 그 다섯 번째의 짝이고, 고치는 방법은 가드를 넓히는 것이 아니라 **두 번째 가드를 두는 것**이다.
 *
 * ## 무엇을 세는가 — 그리고 왜 이 모양뿐인가
 *
 * 산문 전체를 코드와 대보는 것은 불가능하다. 그러나 한 종류의 문장은 기계가 판정할 수 있다:
 * **`no X` 로 **제품 속성**을 이름으로 부르며 부재를 주장하는 것.** 그 이름이 스키마나 패널의
 * 어휘에서 발견되면 그 문장은 다시 읽혀야 한다. 왜 *모든 식별자* 가 아니라 *속성 어휘* 인지는
 * `vocabulary` 위에 적었다 — 첫 판이 그렇게 했고 거짓 양성이 넷이었다.
 *
 * 이름을 대지 않는 부재("아직 얕다", "충분하지 않다")는 여기서 못 잡는다. 그건 이 검사의 구멍이
 * 아니라 **판정할 수 없는 문장** 이고, 판정할 수 없는 것을 판정하는 척하는 검사가 더 나쁘다.
 *
 * ## 면제
 *
 * 부재가 **설계**인 문장이 있다 — *"캔버스에는 물어볼 레이아웃 엔진이 없다"* 는 결함이 아니라
 * 사실이다. 그런 줄은 `<!-- 없는 것이 설계다 -->` 를 같은 줄이나 바로 윗줄에 달아 면제한다.
 * 목록이 아니라 문서 안의 표시인 이유는, 면제가 그 문장 옆에 있어야 다음 사람이 함께 읽기
 * 때문이다.
 */
const ROOT = join(__dirname, '..', '..', '..');

/** 부재 주장 안에서 이름처럼 생긴 낱말. `no gradient` 의 `gradient`. */
const DENIAL = /\bno ([a-z][a-zA-Z]{4,})\b/g;

/**
 * 제품이 실제로 갖는 속성 이름들 — 스키마가 선언한 것과 패널이 내주는 것.
 *
 * **첫 판은 저장소의 모든 식별자와 대봤고 다섯을 물어 넷이 거짓 양성이었다** — `no schema
 * declaring them`, `no honest default`, `needs no components at all`, `no notion of one node`.
 * 영어 산문에서 `no` 뒤에 오는 낱말은 대부분 그냥 낱말이다. 이 파일의 머리가 스스로 적어 둔
 * 문장이 그 판정이다: *"잘못 잡는 것은 이 검사를 무시하게 만들고, 무시되는 가드는 없는 것과
 * 같다."* 그래서 넓히는 대신 **묻는 것을 바꿨다** — 실제 결함이 *제품 속성을 이름으로 부르며
 * 없다고 한 것* 이었으므로 대볼 어휘도 제품 속성이다. 목록은 코드에서 읽으므로 손으로 관리하지
 * 않는다.
 *
 * `no gradient` 를 `gradientKind`·`gradientFrom` 과 맞추기 위해 **접두사로** 센다: 로드맵은
 * 사람의 낱말로 적고 코드는 식별자로 적으므로, 둘이 만나는 자리가 그 경계다.
 */
const vocabulary = (): Set<string> => {
  const out = new Set<string>();
  for (const file of sources()) {
    if (!/(schema|panel-model)\.ts$/.test(file)) continue;
    const text = readFileSync(file, 'utf8');
    for (const hit of text.matchAll(/'([a-z][a-zA-Z]{3,24})'/g)) out.add(hit[1]);
    for (const hit of text.matchAll(/^\s{2,}([a-z][a-zA-Z]{3,24}):/gm)) out.add(hit[1]);
  }
  return out;
};

/** 로드맵이 부른 이름이 그 어휘의 무엇과 만나는가. */
const known = (word: string, vocab: Set<string>): string | null => {
  const low = word.toLowerCase();
  for (const one of vocab) {
    if (one.toLowerCase().startsWith(low) && one.length >= word.length) return one;
  }
  return null;
};

/** `no` 뒤의 흔한 보통명사 — 어휘 대조 전에 미리 걸러 실패 메시지를 조용하게 둔다. */
const WORDS = new Set([
  'longer',
  'layout',
  'product',
  'reason',
  'answer',
  'change',
  'engine',
  '單',
  'second',
  'single',
  'string',
  'timeline',
  'branch',
  'sense',
  'point',
  'place',
  'thing',
  'value',
  'other',
  'right',
  'state',
  'model',
  'error',
  'guess',
  'cache',
  'level',
  'style'
]);

const sources = (): string[] => {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue;
      const at = join(dir, entry);
      if (statSync(at).isDirectory()) walk(at);
      else if (/\.(ts|tsx)$/.test(entry) && !/\.test\./.test(entry)) out.push(at);
    }
  };
  for (const one of ['packages', 'apps']) walk(join(ROOT, one));
  return out;
};

interface Denial {
  file: string;
  line: number;
  word: string;
  text: string;
}

const denials = (): Denial[] => {
  const out: Denial[] = [];
  for (const file of ['docs/ROADMAP.md', 'docs/TECHNICAL-ROADMAP.md']) {
    const lines = readFileSync(join(ROOT, file), 'utf8').split('\n');
    lines.forEach((text, index) => {
      const exempt =
        text.includes('없는 것이 설계다') || (lines[index - 1] ?? '').includes('없는 것이 설계다');
      if (exempt) return;
      for (const hit of text.matchAll(DENIAL)) {
        const word = hit[1];
        if (WORDS.has(word.toLowerCase())) continue;
        out.push({ file, line: index + 1, word, text: text.trim() });
      }
    });
  }
  return out;
};

describe('로드맵의 산문', () => {
  it('부재를 이름으로 주장하는 문장을 찾을 수 있다 — 이 검사가 아무것도 안 보고 통과하지 않게', () => {
    /*
     * 이 줄이 0이 되면 두 가지 중 하나다: 그런 문장이 정말 없어졌거나, `DENIAL` 이 낡았거나.
     * 후자를 초록으로 넘기지 않기 위해 검사 자신이 무엇을 하나라도 읽었는지 확인한다.
     */
    const text = readFileSync(join(ROOT, 'docs/ROADMAP.md'), 'utf8');
    expect(text.length, 'ROADMAP.md 를 못 읽었습니다').toBeGreaterThan(1000);
    expect(sources().length, '저장소 소스를 하나도 못 찾았습니다').toBeGreaterThan(100);
  });

  it('`no X` 라고 적은 X 를 제품이 갖고 있지 않다', () => {
    const vocab = vocabulary();
    expect(vocab.size, '속성 어휘를 하나도 못 읽었습니다 — 파일 고르는 규칙이 낡았습니다').toBeGreaterThan(50);

    const wrong = denials()
      .map((one) => ({ ...one, found: known(one.word, vocab) }))
      .filter((one) => one.found !== null);

    expect(
      wrong,
      `로드맵이 *없다* 고 적은 속성을 제품이 갖고 있습니다. 그 문장을 다시 읽고 사실로 고치세요 —\n` +
        `부재가 설계라면 그 줄이나 바로 윗줄에 \`<!-- 없는 것이 설계다 -->\` 를 다세요:\n` +
        wrong
          .map((one) => `  ${one.file}:${one.line} — "no ${one.word}" 인데 \`${one.found}\` 가 있습니다`)
          .join('\n')
    ).toEqual([]);
  });
});
