import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * **`## Open` 이 이름 대는 파일은 아직 있어야 한다.**
 *
 * ## 이 검사가 찾는 결함
 *
 * 형제 검사 `backlog-says-what-is-done` 은 **표식이 자리와 맞는가** 를 묻는다. 그것으로는 부족한
 * 것이 하나 있다: 표식이 맞는 자리에 있어도 **내용이 없는 세계를 이야기할 수 있다.**
 *
 * 2026-09-06 에 세어 보니 `## Open` 이 이름 댄 경로 63개 중 **14개가 디스크에 없었다.** 대부분
 * 셸 이주로 옮겨간 것이다 — `apps/slide/src/stage.tsx` 는 `packages/office-slides/` 로 갔고,
 * `apps/word/src/ruler.tsx` 도 그랬다. 그 항목들은 여전히 🔴 이고 여전히 `## Open` 에 있지만,
 * 가리키는 것이 없다.
 *
 * **그리고 그 경로들은 다음 사람이 일을 고르는 근거다.** 열린 항목의 65개가 8월에 쓰였고 그
 * 사이 제품 넷의 셸이 통째로 옮겨갔다. 파일이 어디로 갔는지 다시 찾는 일은 항목을 쓴 사람이
 * 한 번 하면 되는 일인데, 안 하면 읽는 사람이 매번 한다.
 *
 * ## 크기로 자르지 않는 이유
 *
 * 이 파일은 15,000줄이 넘고 "너무 크다" 는 말이 계속 나온다. 그런데 재보면 무게는 Done 이 아니라
 * **Open** 에 있고(항목당 37줄 대 25줄), 저장소의 다른 산문에 비해 outsized 도 아니다(`docs/`
 * 전체 66,000줄, 소스 주석 55,000줄). 그리고 크기는 **기계가 판정할 수 없다** — 몇 줄이 너무
 * 많은지는 아무도 모른다. 반면 *이름 댄 파일이 있는가* 는 판정할 수 있다. 그래서 이 검사는
 * 크기가 아니라 **진실** 을 붙잡는다.
 *
 * ## `## Done` 은 안 본다
 *
 * Done 이 없어진 파일을 이야기하는 것은 정상이다 — 그게 역사다. *"그때 `apps/slide/app.tsx`
 * 에서 이랬다"* 는 지금 그 파일이 없어야 오히려 맞는 말일 때가 있다.
 *
 * ## 일부러 없는 것 — 경고가 아니라 이름 적힌 예외로
 *
 * 항목이 *없는 것* 을 이름으로 부를 때가 있다: 검사가 잡는지 보려고 만들었다 지운 프로브 파일,
 * 아직 열지 않은 문. 그것을 "경로 비슷한 낱말은 넘어간다" 로 처리하면 진짜 낡은 것도 같이
 * 넘어간다. 그래서 **이름을 적는다.** 그리고 그 목록도 검사한다 — 적어 둔 것이 나중에 실제로
 * 생기면 목록이 낡은 것이므로 실패한다.
 */
const ROOT = join(__dirname, '..', '..', '..');

/**
 * 열린 항목이 **일부러** 이름 부르는, 없어야 맞는 경로.
 *
 * 여기 적는 기준은 하나다: *그 파일이 생기면 그 항목의 말이 틀려지는가.* 그렇다면 여기 적는다.
 * 옮겨가서 없어진 것은 여기가 아니라 항목의 경로를 고쳐야 한다.
 */
const DELIBERATELY_ABSENT: ReadonlyArray<readonly [string, string]> = [
  ['packages/dsl/test/probe.test.ts', '검사가 잡는지 보려고 만들었다 지운 프로브'],
  ['packages/office-slides/test/zz-perf.test.ts', '재려고 만든 임시 파일, 지웠다(항목이 그렇게 적고 있다)']
];

/** 백로그 산문에 흔한, 파일이 아닌 경로 모양. */
const NOT_A_FILE = /(^|\/)(node_modules|dist)\//;

const openSection = (): string => {
  const text = readFileSync(join(ROOT, 'docs', 'BACKLOG.md'), 'utf8');
  const at = text.indexOf('\n## Open\n');
  const to = text.indexOf('\n## Done\n');
  if (at < 0 || to < 0 || to < at) {
    throw new Error('BACKLOG.md 에 `## Open` 과 `## Done` 이 그 순서로 있어야 합니다');
  }
  return text.slice(at, to);
};

/**
 * 열린 구간이 이름 대는 저장소 안 경로.
 *
 * **역따옴표 안의 것만 센다.** 산문에 그냥 적힌 `apps/word 의 스타일` 같은 것은 파일 이름이
 * 아니라 자리를 가리키는 말이고, 그것까지 세면 검사가 자기 문장에 걸린다 — 이 저장소가 오늘
 * 하루에 세 번 겪은 모양이다.
 */
const namedPaths = (): string[] => {
  const body = openSection();
  const found = new Set<string>();
  for (const span of body.matchAll(/`([^`\n]+)`/g)) {
    for (const hit of span[1].matchAll(/(?:packages|apps|docs|scripts)\/[A-Za-z0-9_./-]+\.[a-z]+/g)) {
      const path = hit[0].replace(/[.,)]+$/, '');
      if (!NOT_A_FILE.test(path)) found.add(path);
    }
  }
  return [...found].sort();
};

describe('BACKLOG 의 열린 항목', () => {
  it('경로를 하나라도 이름 댄다 — 이 검사가 아무것도 안 보고 통과하지 않게', () => {
    expect(namedPaths().length, '`## Open` 에서 파일 경로를 하나도 못 찾았습니다').toBeGreaterThan(20);
  });

  it('이름 댄 파일이 아직 있다', () => {
    const exempt = new Set(DELIBERATELY_ABSENT.map(([path]) => path));
    const gone = namedPaths().filter((path) => !exempt.has(path) && !existsSync(join(ROOT, path)));

    expect(
      gone,
      `열린 항목이 없는 파일을 가리킵니다. 옮겨갔으면 항목의 경로를 고치고, 파일과 함께 죽은 ` +
        `문제면 \`## Done\` 으로 옮기거나 지우세요. 일부러 없는 것이면 이 파일의 ` +
        `\`DELIBERATELY_ABSENT\` 에 이유와 함께 적으세요:\n${gone.map((one) => `  ${one}`).join('\n')}`
    ).toEqual([]);
  });

  it('일부러 없다고 적어 둔 것이 실제로 없다 — 목록이 낡으면 여기서 걸린다', () => {
    const appeared = DELIBERATELY_ABSENT.filter(([path]) => existsSync(join(ROOT, path))).map(
      ([path, why]) => `${path} — "${why}" 라고 적혀 있는데 지금 있습니다`
    );

    expect(
      appeared,
      `\`DELIBERATELY_ABSENT\` 가 낡았습니다. 생긴 파일은 목록에서 빼세요 — 예외 목록이 ` +
        `실제와 어긋나면 그 다음부터는 아무것도 안 잡습니다:\n${appeared.map((one) => `  ${one}`).join('\n')}`
    ).toEqual([]);
  });
});
