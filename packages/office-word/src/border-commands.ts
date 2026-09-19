import { Editor, Extension } from '@barocss/editor-core';
import type { ModelSelection } from '@barocss/editor-core';
import { transaction } from '@barocss/model';
import { borderProperties, bordersOf, borderPatch, type BorderState } from './border-model';
import { selectedBlocks } from './selected-blocks';

/**
 * **문단 테두리를 쓰는 길.**
 *
 * `word.md` 가 갚아야 할 것 다섯 묶음 중 첫째로 적어 둔 열여섯 개가 여기서 닫힌다. 스키마
 * (`boxBorderAttrs()`)와 그리는 쪽(`paragraphCss`)은 처음부터 있었고 **쓰는 쪽만 없었다** — 이
 * 저장소가 `pageCss` 에서 이미 한 번 겪은 모양이다: 콘솔에서 부를 수 있고 아무도 안 부르는 것.
 *
 * 계산은 `border-model.ts` 에 있다. 여기 있는 것은 *어느 문단에 쓰는가* 하나뿐이다.
 */

/** 명령이 받는 것. */
export interface SetBordersPayload {
  borders: BorderState;
  selection?: ModelSelection;
}

export class WordBorderExtension implements Extension {
  name = 'wordBorders';

  onCreate(editor: Editor): void {
    editor.registerCommand({
      name: 'setParagraphBorders',
      execute: async (ed: Editor, payload?: SetBordersPayload) => {
        const borders = payload?.borders;
        if (!borders) return false;

        const blocks = selectedBlocks(ed, payload?.selection ?? ed.selection);
        if (blocks.length === 0) return false;

        const attrs = borderPatch(borders);
        const result = await transaction(
          ed,
          blocks.map((block) => ({
            type: 'setAttrs',
            payload: { nodeId: block.sid, attrs }
          })) as never
        ).commit();
        return result.success;
      },
      /**
       * 바꿀 문단이 있어야 하고, **무엇으로 바꿀지 들었어야 한다.**
       *
       * 앞의 판은 앞의 절반만 물었다. 그러자 Word 의 명령 프로브가 곧바로 말했다 —
       * *"할 수 있다고 하고 아무것도 바꾸지 않는다."* 테두리를 듣지 못한 이 명령은 문단 위에서
       * 켜져 있으면서 `false` 를 돌려준다. `list-commands.ts` 가 같은 값을 치르고 적어 둔 것이
       * 그것이다: 문서 전체의 문단 위에서 켜져 있고 들여쓴 것 말고는 아무 데서도 안 되던 내어쓰기 —
       * *독자가 한 번 눌러 보고 믿기를 그만두는 컨트롤.*
       *
       * 이 명령은 대화상자가 확인을 누를 때만 불린다. 메뉴 항목은 `view` 이므로 메뉴바가 이것을
       * 묻지 않는다 — 대화상자를 여는 것은 문서가 할 줄 아는 일이 아니기 때문이다.
       */
      canExecute: (ed: Editor, payload?: SetBordersPayload) =>
        !!payload?.borders && selectedBlocks(ed, payload?.selection ?? ed.selection).length > 0
    });
  }
}

/**
 * 지금 선택이 말하는 테두리 — 대화상자가 열릴 때 읽는 것.
 *
 * 명령이 아니라 함수인 것은 이것이 **묻기만** 하기 때문이다. 되돌리기 기록에 남을 일이 없는 것을
 * 명령으로 만들면, 기록을 되감는 독자가 자기가 하지 않은 걸음을 지나게 된다.
 */
export function currentBorders(
  editor: Editor | null,
  selection?: ModelSelection | null
): BorderState {
  if (!editor) return bordersOf([]);
  const blocks = selectedBlocks(editor, selection ?? editor.selection);
  return bordersOf(blocks.map((block) => block.attributes ?? {}));
}

/** 다른 확장들과 같은 모양으로 만들어 준다. */
export function createWordBorders(): WordBorderExtension {
  return new WordBorderExtension();
}

/**
 * **이 대화상자가 테두리를 쓰는 노드들.**
 *
 * `selectedBlocks` 가 돌려주는 것은 *커서가 들어간 블록*이고, Word 에서 그것은 문단·제목·목록
 * 항목 셋이다. 표 셀 안에 커서를 두어도 돌아오는 것은 셀이 아니라 셀 **안의 문단**이다 — 그래서
 * 셀의 테두리는 이 대화상자로 정할 수 없고, `every-property-can-be-edited` 는 그것을 계속 빚으로
 * 세어야 한다.
 *
 * 그 구분이 가능해진 것은 검사가 `node.attr` 을 받게 된 날이다. 이름만 보던 동안에는 문단 하나를
 * 답한 것이 표와 셀과 페이지까지 조용히 덮었다 — 96개가 한 번에 사라지는 것으로 드러났다.
 */
export const BORDER_BLOCKS = ['paragraph', 'heading', 'listItem'] as const;

/**
 * 검사가 받는 모양 — `노드.속성`, 이 명령이 정말 쓰는 짝만.
 *
 * 손으로 적은 목록이 아니다: 노드는 위에서, 속성은 `borderPatch` 에게 물어서 온다.
 */
export function borderEditable(): string[] {
  return BORDER_BLOCKS.flatMap((node) => borderProperties().map((attr) => `${node}.${attr}`));
}
