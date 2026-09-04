import type { Keybinding } from '@barocss/editor-core';
import { TABLE_CELL_KEYBINDINGS } from '@barocss/extensions';

/**
 * **노트의 키맵** — 그리고 왜 이렇게 짧은가.
 *
 * `word-keymap.ts` 는 71개다. 이 파일은 둘이고, 그 차이가 이 제품이 무엇인지 말한다.
 *
 * ## 왜 짧은가
 *
 * 엔진 기본(`DEFAULT_KEYBINDINGS`)이 이미 준다: Enter · Backspace · Delete · 화살표 · 단어 단위
 * 이동 · 굵게 · 기울임 · 밑줄 · 취소선 · 인용 · 목록 둘 · 들여쓰기 · 되돌리기 · 복사·잘라내기·붙이기 ·
 * 전체 선택. **본문을 쓰는 데 필요한 것이 거의 다 거기 있다.** 노트가 더할 것은 *본문에 없는 것* 뿐이고,
 * 노트는 본문이다.
 *
 * Word 의 71개 중 대부분은 워드프로세서의 관례다 — `Mod+Alt+1`(제목 1), `Mod+Alt+i`(아래에 행),
 * 필드·수식·주석의 키. 노트는 그 어휘를 갖지 않으므로 그 키도 갖지 않는다.
 *
 * ## 왜 비어 있지 않은가
 *
 * **표에서의 `Tab` 이 안 됐다.** `nextCell` 은 공용 `TableExtension` 이 등록하므로 표를 가진 넷이 다
 * 갖는데, 키를 묶는 곳이 `word-keymap.ts` 뿐이었다. 브라우저에서 쟀다: 노트의 표에서 Tab 을 누르면
 * 선택이 그대로이고 표도 그대로이고 다음 글자가 **같은 칸**에 들어간다.
 *
 * 그 둘은 이제 `TABLE_CELL_KEYBINDINGS` 로 확장 옆에 한 번 선언되어 있고, 여기서 펼친다 — 표를 가진
 * 제품이 *표에서 Tab 은 다음 칸* 을 각자 정할 여지가 없기 때문이다.
 *
 * ## 이 파일이 자라는 조건
 *
 * *노트에만 있는 어휘에 키가 필요할 때.* 지금 그런 것은 없다 — 잡은 블록의 위/아래 옮기기는 단추이고,
 * 슬래시 메뉴는 `/` 라는 글자다. 새 줄을 더할 때는 **엔진 기본이 이미 주는지** 먼저 확인한다.
 */
export const NOTE_KEYBINDINGS: Keybinding[] = [...TABLE_CELL_KEYBINDINGS];
