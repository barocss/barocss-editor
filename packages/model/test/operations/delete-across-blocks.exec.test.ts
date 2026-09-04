import { describe, it, expect, beforeEach } from 'vitest';
import '../../src/operations/register-operations';
import { DataStore } from '@barocss/datastore';
import { SelectionManager } from '@barocss/editor-core';
import { createTransactionContext } from '../../src/create-transaction-context';
import { Schema } from '@barocss/schema';
import { globalOperationRegistry } from '../../src/operations/define-operation';
import type { INode } from '@barocss/datastore';

/**
 * **`deleteRange` 는 글자만 지웁니다 — 그리고 그게 맞습니다.**
 *
 * ## 왜 이 파일이 있나
 *
 * Reported as *지금 selection 도구가 제대로 없는데*, and the measurement was worse than the wording:
 * the selection **is made correctly** and everything that consumes one gets it wrong. Measured in
 * `apps/note`, dragging paragraph 1 → paragraph 3:
 *
 * | | |
 * |---|---|
 * | 굵게 | the button is enabled and nothing happens — 0 `<strong>` |
 * | Backspace | blocks stay 21 and their contents go `28,28,28` → **`1,1,16`** |
 * | 글자 치기 | the selection is not replaced |
 *
 * What this file establishes is which half was wrong. `deleteRange` edits **runs**, which is what
 * its name says, and every character it leaves is correct: `['첫째', '', ' 문단입니다']`. What was
 * missing is that they are still **three blocks** — nothing joined the two ends or dropped what was
 * between. So the fix is structural and it lives one layer up, in `DeleteExtension`, built out of
 * operations that each already have an inverse. See `extensions/test/delete-across-blocks.test.ts`.
 *
 * These stay as the record of the boundary: **this** operation is not where the join belongs, and a
 * later reader who adds it here would be putting a document-level decision inside a text edit.
 *
 * ## 왜 여기이고 브라우저가 아닌가
 *
 * The existing sweep (`range-sweep.exec.test.ts`) runs `deleteRange` over every shape of selection
 * and asserts only that it does not throw. What was never asked is **what is left**, which is the
 * whole of the bug. That is arithmetic, and arithmetic costs 4ms here and 30s in a browser.
 */
const makeSchema = () =>
  new Schema('delete-across-schema', {
    nodes: {
      document: { name: 'document', group: 'document', content: 'block+' },
      paragraph: { name: 'paragraph', group: 'block', content: 'inline*' },
      heading: { name: 'heading', group: 'block', content: 'inline*', attrs: { level: { default: 1 } } },
      'inline-text': { name: 'inline-text', group: 'inline', content: 'text*', marks: ['bold'] }
    },
    marks: { bold: { name: 'bold' } }
  });

describe('두 블록에 걸쳐 지우기', () => {
  let dataStore: DataStore;
  let context: any;

  /**
   * Three paragraphs of one run each, which is the shape a body actually has — a note's paragraphs
   * hold one `inline-text` until a mark splits them.
   */
  const fresh = (blocks: { sid: string; stype: string; run: string; text: string }[]) => {
    const schema = makeSchema();
    dataStore = new DataStore(undefined as never, schema);
    const selection = new SelectionManager({ dataStore } as never);
    context = createTransactionContext(dataStore, selection, schema);

    const set = (node: Partial<INode>) => dataStore.setNode(node as INode);
    set({ sid: 'doc', stype: 'document', content: blocks.map((one) => one.sid) });
    for (const one of blocks) {
      set({ sid: one.sid, stype: one.stype, content: [one.run], parentId: 'doc' });
      set({ sid: one.run, stype: 'inline-text', text: one.text, parentId: one.sid });
    }
  };

  const three = () =>
    fresh([
      { sid: 'p1', stype: 'paragraph', run: 'r1', text: '첫째 문단입니다' },
      { sid: 'p2', stype: 'paragraph', run: 'r2', text: '둘째 문단입니다' },
      { sid: 'p3', stype: 'paragraph', run: 'r3', text: '셋째 문단입니다' }
    ]);

  /** What the document says, as blocks of text — the only thing worth asserting about a delete. */
  const said = () => {
    const doc = dataStore.getNode('doc') as { content?: string[] };
    const words = (sid: string): string => {
      const node = dataStore.getNode(sid) as { text?: string; content?: string[] } | undefined;
      if (!node) return '';
      if (typeof node.text === 'string') return node.text;
      return (node.content ?? []).map(words).join('');
    };
    return (doc.content ?? []).map(words);
  };

  const run = async (name: string, payload: unknown) => {
    const op = globalOperationRegistry.get(name);
    return await op!.execute({ type: name, payload } as never, context);
  };

  beforeEach(() => three());

  it('takes exactly the right characters out of the first and last runs', async () => {
    /**
     * **문단 1의 3번째 글자부터 문단 3의 3번째 글자까지.**
     *
     * What every editor does, and what the report says this does not: the first block keeps what was
     * before the range, the last keeps what was after, the two become **one block**, and anything
     * wholly inside is gone.
     *
     * **Measured before the fix, and the text was right**: `['첫째', '', ' 문단입니다']`. The
     * remainders are exactly correct — what is missing is that they are still **three blocks**. So
     * the bug is not the arithmetic, which is what *fragments left behind* made it sound like; it is
     * that nothing joins the two ends or drops what is between.
     */
    await run('deleteRange', {
      range: { startNodeId: 'r1', startOffset: 2, endNodeId: 'r3', endOffset: 2 }
    });

    expect(said()).toEqual(['첫째', '', ' 문단입니다']);
  });

  it('empties a run wholly inside the range, and leaves its block to the layer above', async () => {
    await run('deleteRange', {
      range: { startNodeId: 'r1', startOffset: 7, endNodeId: 'r3', endOffset: 0 }
    });
    /* Nothing of the first is taken, all of the second, none of the third. */
    expect(said()).toEqual(['첫째 문단입니', '', '셋째 문단입니다']);
  });

  it('does not join a heading into a paragraph, because joining is not its job', async () => {
    /*
     * A range from a paragraph into a heading leaves **the paragraph**, and one from a heading into a
     * paragraph leaves the heading. The block that survives is the one the range started in, which
     * is what a reader means by dragging in that direction.
     */
    fresh([
      { sid: 'h1', stype: 'heading', run: 'hr', text: '제목입니다' },
      { sid: 'p1', stype: 'paragraph', run: 'pr', text: '본문입니다' }
    ]);
    await run('deleteRange', {
      range: { startNodeId: 'hr', startOffset: 2, endNodeId: 'pr', endOffset: 2 }
    });

    expect(said()).toEqual(['제목', '입니다']);
  });

  it('empties every run when the range covers everything', async () => {
    /* The blocks stay — putting the document back to one empty block is the extension's decision. */
    await run('deleteRange', {
      range: { startNodeId: 'r1', startOffset: 0, endNodeId: 'r3', endOffset: 8 }
    });
    expect(said()).toEqual(['', '', '']);
  });

  it('still deletes inside one block, which is the case that already worked', async () => {
    await run('deleteRange', {
      range: { startNodeId: 'r2', startOffset: 2, endNodeId: 'r2', endOffset: 5 }
    });
    expect(said()).toEqual(['첫째 문단입니다', '둘째입니다', '셋째 문단입니다']);
  });
});
