import { Editor, Extension } from '@barocss/editor-core';
import type { ModelSelection } from '@barocss/editor-core';
import { transaction } from '@barocss/model';
import { surfaceOf } from '@barocss/office-canvas';
import {
  isUsable,
  pageSetupOf,
  pageSetupPatch,
  pageSetupProperties,
  type PageSetup
} from './page-setup-model';

/**
 * **페이지 설정을 쓰는 길** — 문단이 아니라 **구역**에.
 *
 * 앞의 두 대화상자는 커서가 든 블록에 썼다. 이것은 그 블록이 든 `surface` 에 쓴다: Word 에서
 * 페이지 설정은 구역의 것이고, 한 문서가 여러 구역을 가지면 각각 다른 용지에 인쇄된다.
 *
 * 구역을 찾는 것은 **`office-canvas` 의 `surfaceOf`** 다. 위로 걸어 처음 만나는 `surface` 를
 * 답하는 함수이고, 이 저장소가 이미 갖고 있다 — 같은 걸음을 다시 쓰면 표 안의 문단이 오는 날
 * 하나가 낡는다.
 */

export interface SetPageSetupPayload {
  setup: PageSetup;
  selection?: ModelSelection;
}

/** 지금 커서가 든 구역 — 없으면 문서의 첫 구역. */
export function surfaceFor(editor: Editor, selection: ModelSelection | null | undefined): string | undefined {
  const store: any = editor.dataStore;
  const doc = { getNode: (sid: string) => store?.getNode?.(sid) } as never;

  const here = selection?.startNodeId ? surfaceOf(doc, selection.startNodeId) : undefined;
  if (here) return here;

  /*
   * **첫 구역으로 물러난다.** 커서가 없을 수도 있고(문서를 막 열었을 때), 머리글 안에 있을 수도
   * 있다. 페이지 설정을 열었는데 *바꿀 구역이 없습니다* 라고 답하는 것보다, 문서가 하나뿐인
   * 구역을 갖는 흔한 경우에 그것을 보여 주는 편이 낫다.
   */
  const rootId = editor.getRootId?.();
  const children = (rootId ? store?.getNode?.(rootId)?.content : undefined) as string[] | undefined;
  return children?.find((sid) => store?.getNode?.(sid)?.stype === 'surface');
}

export class WordPageSetupExtension implements Extension {
  name = 'wordPageSetup';

  onCreate(editor: Editor): void {
    editor.registerCommand({
      name: 'setPageSetup',
      execute: async (ed: Editor, payload?: SetPageSetupPayload) => {
        const setup = payload?.setup;
        if (!setup || !isUsable(setup)) return false;

        const surface = surfaceFor(ed, payload?.selection ?? ed.selection);
        if (!surface) return false;

        const result = await transaction(ed, [
          { type: 'setAttrs', payload: { nodeId: surface, attrs: pageSetupPatch(setup) } }
        ] as never).commit();
        return result.success;
      },
      /**
       * 바꿀 구역이 있어야 하고, **글을 놓을 자리가 남는 설정**이어야 한다.
       *
       * `layout.ts` 가 `Math.max(1, …)` 로 이미 방어하고 있다 — 그리는 쪽이 방어하고 있다는 것은
       * 정할 때 막아야 한다는 뜻이다. 여백이 종이보다 넓은 문서는 사라지지 않고 한 줄에 한 글자씩
       * 수천 페이지가 되며, 그것은 사라진 문서보다 나쁘다.
       */
      canExecute: (ed: Editor, payload?: SetPageSetupPayload) =>
        !!payload?.setup &&
        isUsable(payload.setup) &&
        surfaceFor(ed, payload?.selection ?? ed.selection) !== undefined
    });
  }
}

export function createWordPageSetup(): WordPageSetupExtension {
  return new WordPageSetupExtension();
}

/** 지금 구역이 말하는 페이지 — 대화상자가 열릴 때 읽는 것. */
export function currentPageSetup(
  editor: Editor | null,
  selection?: ModelSelection | null
): PageSetup {
  if (!editor) return pageSetupOf([]);
  const surface = surfaceFor(editor, selection ?? editor.selection);
  const store: any = editor.dataStore;
  const attrs = surface ? (store?.getNode?.(surface)?.attributes ?? {}) : undefined;
  return pageSetupOf(attrs ? [attrs] : []);
}

/** 검사가 받는 모양 — 이 대화상자는 `surface` 에만 쓴다. */
export function pageSetupEditable(): string[] {
  return pageSetupProperties().map((attr) => `surface.${attr}`);
}
