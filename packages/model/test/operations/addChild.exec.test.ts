import { describe, it, expect, beforeEach } from 'vitest';
import '../../src/operations/register-operations';
import { DataStore } from '@barocss/datastore';
import { SelectionManager } from '@barocss/editor-core';
import { createTransactionContext } from '../../src/create-transaction-context';
import { Schema } from '@barocss/schema';
import { addChild as addChildDsl } from '../../src/operations/addChild';
import { globalOperationRegistry } from '../../src/operations/define-operation';

describe('addChild operation (exec)', () => {
  let dataStore: DataStore;
  let selectionManager: SelectionManager;
  let context: any;
  let schema: Schema;

  beforeEach(() => {
    schema = new Schema('test-schema', {
      nodes: {
        paragraph: { name: 'paragraph', content: 'inline-text*' },
        'inline-text': { name: 'inline-text', content: 'text*', marks: [] }
      },
      marks: {}
    });
    dataStore = new DataStore(undefined, schema);
    selectionManager = new SelectionManager({ dataStore });
    context = createTransactionContext(dataStore, selectionManager, schema);
  });

  it('adds child at position', async () => {
    dataStore.setNode({ sid: 'p', stype: 'paragraph', content: [] } as any);
    const op = globalOperationRegistry.get('addChild');
    const childNode = { stype: 'inline-text', text: 'X' } as any;
    const result = await op!.execute({ type: 'addChild', payload: { parentId: 'p', child: childNode, position: 0 } } as any, context);
    expect(result.data?.text).toBe('X');
    const p = dataStore.getNode('p');
    expect(p?.content?.length).toBe(1);
  });

  /**
   * **넣은 것의 *첫 글자* 에 캐럿을 남긴다** — 첫 *자식* 이 아니라.
   *
   * `selectionAfter` 가 `content[0]` 을 한 칸만 보고 그것을 `firstTextNodeId` 라 불렀다. 문단은
   * `content[0]` 이 곧 글자 런이라 맞았고, **표는 `bTableHeader`** 다 — 구조 노드다.
   *
   * 노트에서 잰 결과: 2×2 표를 넣으면 모델 선택이 `bTableHeader` 에 앉고 DOM 선택은 첫 칸의 런에
   * 앉는다. 둘이 태어날 때부터 어긋나고, **칸을 클릭해도 안 고쳐진다** — DOM 선택이 이미 거기라
   * `selectionchange` 가 뜨지 않기 때문이다(브라우저에서 0회를 셌다). 그래서 캐럿으로 셀을 찾는
   * 모든 것이 `null` 을 받는다: `nextCell`·`insertRowBelow`·`mergeCells` 전부.
   *
   * 노트의 툴바가 그것을 가려 왔다 — 눌린 칸을 `cellId` 로 **명시적으로** 넘기기 때문이다
   * (`note-view.tsx` 의 `const on = { nodeId: sid, cellId: cell }`). 키보드에는 그 지팡이가 없다.
   *
   * 이름이 거짓말이었던 것이 핵심이다: `firstTextNodeId` 라고 적힌 값이 첫 자식이었다.
   */
  it('leaves the caret in the first text of what was added, not its first child', async () => {
    const nested = new Schema('nested-schema', {
      nodes: {
        doc: { name: 'doc', content: '(paragraph | table)*' },
        paragraph: { name: 'paragraph', content: 'inline-text*' },
        table: { name: 'table', content: 'header*' },
        header: { name: 'header', content: 'cell*' },
        cell: { name: 'cell', content: 'paragraph*' },
        'inline-text': { name: 'inline-text', content: 'text*', marks: [] }
      },
      marks: {}
    });
    const store = new DataStore(undefined, nested);
    const picked = new SelectionManager({ dataStore: store });
    const nestedContext: any = createTransactionContext(store, picked, nested);

    store.setNode({ sid: 'doc', stype: 'doc', content: [] } as any);

    const op = globalOperationRegistry.get('addChild');
    const result = await op!.execute(
      {
        type: 'addChild',
        payload: {
          parentId: 'doc',
          child: {
            stype: 'table',
            content: [
              { stype: 'header', content: [{ stype: 'cell', content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: '' }] }] }] }
            ]
          }
        }
      } as any,
      nestedContext
    );

    const said = (result as { selectionAfter?: { nodeId?: string } }).selectionAfter?.nodeId;
    expect(said, 'selectionAfter 가 없습니다').toBeTruthy();

    const landed = store.getNode(String(said));
    expect(
      typeof (landed as { text?: unknown })?.text,
      `캐럿이 구조 노드(${(landed as { stype?: string })?.stype})에 앉았습니다 — 글자를 담은 노드여야 합니다`
    ).toBe('string');

    /* 그리고 그 글자가 **첫 칸의** 것이어야 한다 — 아무 글자가 아니라. */
    const cell = store.getNode(String((landed as { parentId?: string })?.parentId));
    expect((cell as { stype?: string })?.stype, '첫 칸의 문단이 아닙니다').toBe('paragraph');
  });

  it('throws when parent does not exist', async () => {
    const op = globalOperationRegistry.get('addChild');
    await expect(op!.execute({ type: 'addChild', payload: { parentId: 'nope', child: { type: 'inline-text', text: 'X' } } } as any, context))
      .rejects.toThrow('Parent not found');
  });

  describe('addChild DSL', () => {
    it('builds descriptor (direct)', () => {
      const dsl = addChildDsl('p', { type: 'inline-text', text: 'A' } as any, 0);
      expect(dsl).toEqual({ type: 'addChild', payload: { parentId: 'p', child: { type: 'inline-text', text: 'A' }, position: 0 } });
    });
    it('builds descriptor (control)', () => {
      const dsl = addChildDsl({ type: 'inline-text', text: 'A' } as any, 1);
      expect(dsl).toEqual({ type: 'addChild', payload: { child: { type: 'inline-text', text: 'A' }, position: 1 } });
    });
  });
});


