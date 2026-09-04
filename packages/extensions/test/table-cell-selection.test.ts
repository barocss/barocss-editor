import { describe, it, expect, vi } from 'vitest';
import type { Editor } from '@barocss/editor-core';

/**
 * **`cell` 선택으로 셀을 합칠 수 있는가** — 넷 중 둘만 되고 있었다.
 *
 * `mergeCells` 는 `_selectedCellRange` 로 두 셀을 구한다. 그것이 답하는 것이 셋이다:
 *
 * 1. `payload.fromCellId`·`toCellId` 를 직접 받으면 그대로 쓴다
 * 2. `range` 선택의 두 끝이 서로 다른 셀에 있으면 그 둘
 * 3. **그 밖은 `null`** — 여기에 `cell` 선택이 들어간다
 *
 * `cell` 은 *이 셀들이 한 덩어리* 를 말하기 위해 존재하는 유일한 선택 종류이고, 합치기는 그것을
 * 필요로 하는 유일한 명령이다. 그런데 3번이 그걸 거부한다.
 *
 * Word 와 Slides 는 `office-word/table-commands.ts` 가 그 사이를 이어 준다 — `cell` 선택을 읽어
 * 양 끝 셀 id 를 1번으로 넘긴다. 사이트와 노트에는 그 다리가 없다. 그래서 사이트의 표 메뉴에 있는
 * **셀 합치기**는 끌어 고른 상태에서는 눌리지 않는다.
 *
 * 다리를 셋으로 늘리는 것이 아니라 `cell` 을 알아보게 하는 것이 답이다: `cell` 선택의 `nodeIds` 는
 * 문서 순서라서 첫 것과 마지막이 곧 사각형의 마주 보는 두 꼭짓점이고, 그게 `mergeTableCells` 가
 * 원하는 그대로다. `office-word` 의 다리가 이미 그 계산을 하고 있다.
 */

vi.mock('@barocss/model', async () => {
  const real: any = await vi.importActual('@barocss/model');
  return { ...real, transaction: () => ({ commit: async () => ({ success: true }) }) };
});

/** 셀 넷의 표 하나. 문단 하나가 각 셀 안에 있어서 캐럿이 셀이 아니라 문단에 앉는다. */
function tableOfFour() {
  const nodes: Record<string, any> = {
    table: { sid: 'table', stype: 'bTable', parentId: 'doc' },
    row1: { sid: 'row1', stype: 'bTableRow', parentId: 'table' },
    A1: { sid: 'A1', stype: 'bTableCell', parentId: 'row1' },
    B1: { sid: 'B1', stype: 'bTableCell', parentId: 'row1' },
    pA1: { sid: 'pA1', stype: 'paragraph', parentId: 'A1' },
    pB1: { sid: 'pB1', stype: 'paragraph', parentId: 'B1' }
  };
  return { getNode: (id: string) => nodes[id] };
}

function editorWith(selection: unknown): Editor & { __get: (name: string) => any } {
  const commands: Record<string, any> = {};
  return {
    registerCommand: (cmd: any) => void (commands[cmd.name] = cmd),
    __get: (name: string) => commands[name],
    dataStore: tableOfFour(),
    selection
  } as never;
}

const cellSelection = {
  type: 'cell',
  nodeIds: ['A1', 'B1'],
  startNodeId: 'A1',
  startOffset: 0,
  endNodeId: 'B1',
  endOffset: 0,
  collapsed: false,
  direction: 'none'
};

describe('mergeCells 와 선택 종류', () => {
  it('두 셀에 걸친 range 로는 합칠 수 있다 — 브라우저가 주는 그 선택', async () => {
    const { TableExtension } = await import('../src/table');
    const editor = editorWith({ type: 'range', startNodeId: 'pA1', endNodeId: 'pB1' });
    new TableExtension().onCreate(editor);

    expect(editor.__get('mergeCells').canExecute(editor)).toBe(true);
  });

  it('한 셀 안에서 끝나는 range 로는 못 합친다 — 합칠 두 번째가 없다', async () => {
    const { TableExtension } = await import('../src/table');
    const editor = editorWith({ type: 'range', startNodeId: 'pA1', endNodeId: 'pA1' });
    new TableExtension().onCreate(editor);

    expect(editor.__get('mergeCells').canExecute(editor)).toBe(false);
  });

  it('양 끝 셀을 직접 주면 합칠 수 있다 — office-word 의 다리가 쓰는 길', async () => {
    const { TableExtension } = await import('../src/table');
    const editor = editorWith(undefined);
    new TableExtension().onCreate(editor);

    expect(
      editor.__get('mergeCells').canExecute(editor, { fromCellId: 'A1', toCellId: 'B1' })
    ).toBe(true);
  });

  /**
   * 이것이 재려던 하나. `cell` 은 이 명령을 위해 존재하는 선택 종류인데 이 명령이 못 알아본다.
   */
  it('cell 선택으로 합칠 수 있다', async () => {
    const { TableExtension } = await import('../src/table');
    const editor = editorWith(cellSelection);
    new TableExtension().onCreate(editor);

    expect(editor.__get('mergeCells').canExecute(editor)).toBe(true);
  });

  it('셀 하나만 담은 cell 선택으로는 못 합친다', async () => {
    const { TableExtension } = await import('../src/table');
    const editor = editorWith({ ...cellSelection, nodeIds: ['A1'], endNodeId: 'A1' });
    new TableExtension().onCreate(editor);

    expect(editor.__get('mergeCells').canExecute(editor)).toBe(false);
  });
});
