/**
 * **쓰인 몸이 무엇으로 이루어지나** — 한 벌.
 *
 * ## 왜 여기인가
 *
 * `office-note/note-schema.ts` 에 `NOTE_BLOCKS`/`NOTE_CONTENT` 로 있었고, 그 프로세가 스스로
 * *"one declaration, read by everything"* 이라고 적었다. 그 결정은 맞았다 — 틀린 것은 **집** 이다:
 * `office-site` 가 `richText.content` 를 위해 그것을 읽으면서 **제품이 제품을 의존하게** 됐다
 * (`docs/specs/architecture.md`).
 *
 * **읽는 쪽이 둘이 되면 그 선언은 둘 중 하나의 것이 아니라 아래층의 것이다.** 그리고 여기가
 * 그 아래층이다: 몸을 이루는 블록은 *글의 낱말* 이지 노트의 발명이 아니다.
 *
 * ## 무엇이 들어 있고 무엇이 빠졌나 — 원래 프로세가 그대로 옳다
 *
 * `block+` 로 두면 페이지 빌더의 어휘가 들어온다: **블로그 글 안에 폼·차트·목록·canvasBlock 이
 * 허용되고 `picture` 는 안 됐다**(`group: 'scene'` 이라서). 정확히 거꾸로였고, 누군가 글에 그림을
 * 넣어 보기 전까지 안 보였다.
 *
 * 빠진 것은 **말하는 대신 배치하는 것** 전부다 — frame · collection · chart · form · placement.
 * **몸은 쓰이고, 페이지는 배치된다.** 두 단 을 원하는 writer 는 *페이지* 를 원하는 것이고, 이
 * 모델은 반쯤 답하는 대신 그렇게 말한다. `pageBreak` 도 빠진다(워드의 생각이고 몸에는 쪽이 없다).
 * `listItem` 은 목록의 자식이지 몸의 자식이 아니다.
 */
export const BODY_BLOCKS = [
  'heading',
  'paragraph',
  'list',
  'blockQuote',
  'codeBlock',
  'bTable',
  'horizontalRule',
  'picture',
  'mediaVideo',
  'mediaEmbed'
] as const;

export type BodyBlock = (typeof BODY_BLOCKS)[number];

/**
 * 몸의 자식이 만족하는 content 식 — **한 선언, 모두가 읽는다.**
 *
 * *무엇을 담을 수 있나* 를 두 번 적으면 모델과 편집기가 어긋나고, 이 저장소는 그 실패를 여러 번
 * 기록했다: 선언 위 프로세에 한 번, 그것을 내놓는 툴바마다 또 한 번.
 */
export const BODY_CONTENT = `(${BODY_BLOCKS.join(' | ')})+`;
