# 누가 무엇을 붙잡는가

이 문서는 **책임의 지도** 다. 저장소의 어떤 주장을 무엇이 붙잡고 있고, 무엇이
아무에게도 붙잡히지 않는지, 그리고 여러 에이전트가 동시에 일할 때 누가 어느 파일을
쓰는지를 적는다.

## 왜 이 문서가 있나

**붙잡히지 않은 주장은 주장일 뿐이다.**

`docs/ROADMAP.md` 는 "키맵이 Word 에만 있다(71개)" 라고 적어 두었다. 재 보니 그렇지
않았다. 그 줄은 오래 거기 있었고 아무도 몰랐다 — 그 문장을 코드와 대조하는 것이
하나도 없었기 때문이다.

반대편의 증거도 있다. `packages/office-note/test/spec-numbers.test.ts` 는
`docs/specs/note.md` 의 숫자를 코드에서 다시 세어 대조한다. 셸을 옮기던 날 그 검사가
**다섯 번** 멈춰 세웠다. 문서가 낡을 수 없었기 때문이다.

차이는 문서의 품질이 아니라 **문서에 검사가 달렸는가** 하나다.

## 세 종류의 붙잡는 것

| 종류 | 사는 곳 | 무엇을 묻나 | 지금 |
|---|---|---|---|
| **conformance** | `packages/conformance/test/` | 저장소 전체를 가로지르는 규칙 — 제품이 제품에 의존하지 않는가, 여는 문이 다 빌드되는가, 백로그의 절이 뒤섞이지 않았는가 | 22 파일 · 119 검사 |
| **spec-numbers** | `packages/<제품>/test/spec-numbers.test.ts` | 그 제품 명세 문서의 숫자가 코드와 같은가 | **넷 중 둘** (note, word) |
| **제품 검사** | `packages/<제품>/test/` | 그 제품만의 규칙 — 메뉴가 묶인 키를 다 가르치는가 등 | 제품마다 |

conformance 22개 중 **문서를 읽는 것은 4개** 다. 나머지는 코드끼리 대조한다. 문서를
붙잡는 힘은 대부분 `spec-numbers` 에 있고, 그것이 넷 중 둘뿐이다.

## 소유 지도

한 문서·한 파일에는 주인이 하나여야 한다. 여럿이 같은 파일을 쓰면 마지막에 쓴 것이
이긴다 — 그건 병합이 아니라 사고다.

| 대상 | 주인 | 붙잡는 검사 |
|---|---|---|
| `docs/ROADMAP.md`, `docs/TECHNICAL-ROADMAP.md` | 전체 로드맵 담당 | `roadmap-claims-name-their-proof` (작업 중) |
| `docs/specs/word.md` | 제품별 담당 | `office-word/spec-numbers` ✅ |
| `docs/specs/note.md` | 제품별 담당 | `office-note/spec-numbers` ✅ |
| `docs/specs/slides.md` | 제품별 담당 | `office-slides/spec-numbers` (작업 중) |
| `docs/specs/site-builder.md` | 제품별 담당 | `office-site/spec-numbers` (작업 중) |
| `docs/specs/architecture.md`, `shared-layer.md` | 공통 모듈 담당 | `no-product-depends-on-a-product`, `dependency-graph`, `every-product-is-built-the-same-way` |
| `docs/BACKLOG.md` | 사람 하나 (지금은 조율자) | `backlog-says-what-is-done` ✅ |
| `docs/specs/text-position.md`, `keybindings.md`, `testing.md`, `selection.md` | 조율자 | 각 층의 단위 검사 |

**`docs/BACKLOG.md` 는 예외적으로 주인이 하나다.** 여럿이 동시에 덧붙이면 절 경계가
깨진다(실제로 깨졌다 — 🔴 14개가 `## Done` 에 앉아 있었다). 에이전트는 자기
`/tmp/<이름>-backlog.md` 에 쓰고, 조율자가 절을 가려 옮긴다.

## 여러 에이전트를 돌릴 때

**worktree 로 격리하지 않는다 — 같은 트리에서 파일 소유로 가른다.**

`isolation: "worktree"` 는 **`main` 에서** 가지를 딴다. 작업 중인 가지가 아니다. 오늘
셋을 그렇게 띄웠더니 셋 다 그날의 작업이 없는 바탕에 앉았고, 그중 하나는 *왜 그대로
두는지 열 줄로 적어 둔 결정* 을 되돌리는 수리를 만들어 왔다. 그 주석을 볼 수 없었기
때문이다. 3-way 병합을 걸었더니 충돌 다섯이 전부 그날 지운 코드 위에서 났다.

그래서 규칙은 이렇다:

1. **쓸 수 있는 파일을 이름으로 준다.** 읽기만 할 파일도 이름으로 준다.
2. **`git stash`/`checkout`/`reset`/`commit` 금지.** 같은 트리다.
3. **playwright 금지.** 포트가 하나뿐이라 브라우저 회차는 언제나 직렬이다.
4. **브라우저 회차가 도는 동안 `packages/*/src`·`apps/*/src`·`package.json` 금지.**
   vite 가 다시 읽으면 그 회차가 무효다. `docs/` 와 `packages/*/test/` 는 안전하다.
5. **`pnpm install` 금지.** 락파일을 공유한다.
6. 현재 가지에서 손대지 않는 파일만 만지는 작업이면 worktree 를 써도 된다.

## 검사가 답하지 못하는 것

검사는 **끝났나** 에 답한다. **다음에 무엇을 하나** 에는 답하지 못한다.

순서는 사람이 정한다. 검사가 하는 일은 그 결정을 내릴 때 **바닥이 진짜인지** 를
보장하는 것이다 — 끝났다고 적힌 것이 정말 끝났고, 열려 있다고 적힌 것이 정말 열려
있도록.
