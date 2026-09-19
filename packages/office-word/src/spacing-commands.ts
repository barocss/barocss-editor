import { Editor, Extension } from '@barocss/editor-core';
import type { ModelSelection } from '@barocss/editor-core';
import { transaction } from '@barocss/model';
import { spacingOf, spacingPatch, spacingProperties, type SpacingState } from './spacing-model';
import { selectedBlocks } from './selected-blocks';

/**
 * **문단 간격을 쓰는 길.**
 *
 * `border-commands.ts` 와 같은 모양이고, 같은 파일이 아닌 것이 맞다: 하나는 상자를 정하고
 * 하나는 자리를 정한다. Word 에서도 서로 다른 대화상자이고, 독자가 *간격을 바꾸려다 테두리를
 * 지우는* 일이 없어야 한다 — 한 명령이 둘을 함께 쓰면 그렇게 된다.
 */

export interface SetSpacingPayload {
  spacing: SpacingState;
  selection?: ModelSelection;
}

export class WordSpacingExtension implements Extension {
  name = 'wordSpacing';

  onCreate(editor: Editor): void {
    editor.registerCommand({
      name: 'setParagraphSpacing',
      execute: async (ed: Editor, payload?: SetSpacingPayload) => {
        const spacing = payload?.spacing;
        if (!spacing) return false;

        const blocks = selectedBlocks(ed, payload?.selection ?? ed.selection);
        if (blocks.length === 0) return false;

        const attrs = spacingPatch(spacing);
        /**
         * **쓸 것이 없으면 안 쓴다.**
         *
         * 독자가 아무것도 건드리지 않고 확인을 누르면 `spacingPatch` 가 빈 객체를 답한다. 그것을
         * 그대로 커밋하면 문서는 그대로인데 되돌리기 기록에 걸음이 하나 생긴다 — 되감는 독자가
         * 자기가 하지 않은 걸음을 지나게 된다.
         */
        if (Object.keys(attrs).length === 0) return false;

        const result = await transaction(
          ed,
          blocks.map((block) => ({
            type: 'setAttrs',
            payload: { nodeId: block.sid, attrs }
          })) as never
        ).commit();
        return result.success;
      },
      /** 바꿀 문단이 있어야 하고, 무엇으로 바꿀지 들었어야 한다 — 테두리와 같은 문지기. */
      canExecute: (ed: Editor, payload?: SetSpacingPayload) =>
        !!payload?.spacing &&
        Object.keys(spacingPatch(payload.spacing)).length > 0 &&
        selectedBlocks(ed, payload?.selection ?? ed.selection).length > 0
    });
  }
}

export function createWordSpacing(): WordSpacingExtension {
  return new WordSpacingExtension();
}

/** 지금 선택이 말하는 간격 — 대화상자가 열릴 때 읽는 것. 묻기만 하므로 명령이 아니다. */
export function currentSpacing(
  editor: Editor | null,
  selection?: ModelSelection | null
): SpacingState {
  if (!editor) return spacingOf([]);
  const blocks = selectedBlocks(editor, selection ?? editor.selection);
  return spacingOf(blocks.map((block) => block.attributes ?? {}));
}

/**
 * 검사가 받는 모양 — `노드.속성`.
 *
 * 노드 셋은 `BORDER_BLOCKS` 와 같다: 커서가 들어가는 블록이 Word 에서는 그 셋이다. 목록을 두 곳에
 * 두지 않으려고 저기서 가져온다.
 */
export { BORDER_BLOCKS as SPACING_BLOCKS } from './border-commands';
import { BORDER_BLOCKS } from './border-commands';

export function spacingEditable(): string[] {
  return BORDER_BLOCKS.flatMap((node) => spacingProperties().map((attr) => `${node}.${attr}`));
}
