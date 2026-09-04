import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { Editor } from '@barocss/editor-core';
import { Schema } from '@barocss/schema';
import { DeleteExtension } from '../src/delete';

/**
 * **두 블록에 걸친 선택을 지우면 문서가 어떻게 되는가.**
 *
 * ## 무엇이 틀려 있었나, 그리고 무엇이 아니었나
 *
 * Reported as *지금 selection 도구가 제대로 없는데*, and measured in `apps/note`: a drag from the
 * first paragraph into the third left the blocks at three with fragments in them. That reads like
 * broken arithmetic, and the arithmetic was the one part that was **right**.
 *
 * `deleteRange` edits runs, which is what its name says. With three paragraphs and a range from
 * `첫째 문단입니다`:2 to `셋째 문단입니다`:2, what it leaves is `['첫째', '', ' 문단입니다']` — every
 * character correct, and still three blocks. Nothing joined the two ends or dropped what was between.
 *
 * So the fix is structural and it is in the **extension**, built out of operations that each already
 * have an inverse: one transaction, one undo, and no new inverse to get right.
 */
const schema = () =>
  new Schema('delete-across', {
    nodes: {
      document: { name: 'document', group: 'document', content: 'block+' },
      paragraph: { name: 'paragraph', group: 'block', content: 'inline*' },
      heading: { name: 'heading', group: 'block', content: 'inline*', attrs: { level: { type: 'number', default: 1 } } },
      blockQuote: { name: 'blockQuote', group: 'block', content: 'block+' },
      'inline-text': { name: 'inline-text', group: 'inline', content: 'text*', marks: ['bold'] }
    },
    marks: { bold: { name: 'bold' } }
  });

describe('두 블록에 걸쳐 지우기', () => {
  let store: DataStore;
  let editor: Editor;

  const load = (blocks: unknown[]) => {
    const made = schema();
    store = new DataStore(undefined as never, made);
    editor = new Editor({
      dataStore: store,
      schema: made,
      editable: true,
      extensions: [new DeleteExtension()]
    } as never);
    editor.loadDocument({ stype: 'document', content: blocks }, 'del');
  };

  const p = (text: string) => ({ stype: 'paragraph', content: [{ stype: 'inline-text', text }] });
  const h = (text: string) => ({
    stype: 'heading',
    attributes: { level: 1 },
    content: [{ stype: 'inline-text', text }]
  });

  /** What the document says, block by block. */
  const said = () => {
    const root = store.getNode(editor.getRootId()!) as { content?: string[] };
    const words = (sid: string): string => {
      const node = store.getNode(sid) as { text?: string; content?: string[] } | undefined;
      if (!node) return '';
      if (typeof node.text === 'string') return node.text;
      return (node.content ?? []).map(words).join('');
    };
    return (root.content ?? []).map(words);
  };

  const kinds = () => {
    const root = store.getNode(editor.getRootId()!) as { content?: string[] };
    return (root.content ?? []).map((sid) => String((store.getNode(sid) as { stype?: string })?.stype));
  };

  /** The run inside block `n`, so a range can name it. */
  const runIn = (n: number) => {
    const root = store.getNode(editor.getRootId()!) as { content?: string[] };
    const block = store.getNode(root.content![n]) as { content?: string[] };
    return block.content![0];
  };

  const drag = async (fromBlock: number, fromAt: number, toBlock: number, toAt: number) => {
    editor.setRange({
      type: 'range',
      startNodeId: runIn(fromBlock),
      startOffset: fromAt,
      endNodeId: runIn(toBlock),
      endOffset: toAt,
      collapsed: false
    } as never);
    /*
     * **`backspace`, not `deleteText`.** The latter's `canExecute` refuses a range whose ends are in
     * different runs — which is honest, because it takes its range from a payload and is the
     * single-run path. What a reader's Backspace runs is this one.
     */
    return await editor.executeCommand('backspace', {});
  };

  beforeEach(() => load([p('첫째 문단입니다'), p('둘째 문단입니다'), p('셋째 문단입니다')]));

  it('joins the two blocks the range touches, and drops the ones between', async () => {
    expect(await drag(0, 2, 2, 2)).toBe(true);
    /* `첫째` from the first, ` 문단입니다` from the last, the middle gone — and **one** block. */
    expect(said()).toEqual(['첫째 문단입니다']);
  });

  it('drops a whole block caught in the middle, with nothing taken from either end', async () => {
    expect(await drag(0, 8, 2, 0)).toBe(true);
    expect(said()).toEqual(['첫째 문단입니다셋째 문단입니다']);
  });

  it('keeps the kind of the block the drag started in', async () => {
    /*
     * A drag from a heading into a paragraph leaves a **heading**, and the other way leaves a
     * paragraph. Which is what a reader means by dragging in that direction — and why
     * `mergeBlockNodes` is not what runs here: it refuses two different stypes, and refusing is the
     * wrong answer to a question that has one.
     */
    load([h('제목입니다'), p('본문입니다')]);
    expect(await drag(0, 2, 1, 2)).toBe(true);
    expect(said()).toEqual(['제목입니다']);
    expect(kinds()).toEqual(['heading']);

    load([p('본문입니다'), h('제목입니다')]);
    expect(await drag(0, 2, 1, 2)).toBe(true);
    expect(kinds()).toEqual(['paragraph']);
  });

  it('undoes as one step, because it is one transaction', async () => {
    /* Four operations — a range, two removals and a move — and a reader pressed one key. */
    await drag(0, 2, 2, 2);
    expect(said()).toEqual(['첫째 문단입니다']);
    await editor.executeCommand('undo', {});
    expect(said()).toEqual(['첫째 문단입니다', '둘째 문단입니다', '셋째 문단입니다']);
  });

  it('still deletes inside one block, which is the case that already worked', async () => {
    expect(await drag(1, 2, 1, 5)).toBe(true);
    expect(said()).toEqual(['첫째 문단입니다', '둘째입니다', '셋째 문단입니다']);
  });

  it('leaves the text right when the two ends are not siblings, which it does not join', async () => {
    /**
     * A range out of a quotation into the body has two parents, and **which container should
     * survive** is a question this does not answer. It leaves the text correct and the blocks apart,
     * which is what happens today — a smaller wrong than a guess, and written down rather than
     * silently attempted.
     */
    load([
      { stype: 'blockQuote', content: [p('인용 안입니다')] },
      p('바깥입니다')
    ]);
    const root = store.getNode(editor.getRootId()!) as { content?: string[] };
    const quote = store.getNode(root.content![0]) as { content?: string[] };
    const inner = store.getNode(quote.content![0]) as { content?: string[] };

    editor.setRange({
      type: 'range',
      startNodeId: inner.content![0],
      startOffset: 2,
      endNodeId: runIn(1),
      endOffset: 2,
      collapsed: false
    } as never);
    expect(await editor.executeCommand('backspace', {})).toBe(true);
    expect(said()).toEqual(['인용', '입니다']);
  });
});

/**
 * **지우기 말고 나머지 둘** — 굵게와 글자 치기.
 *
 * The same report named three symptoms and only one of them was a delete:
 *
 * | | 무엇이 일어났나 |
 * |---|---|
 * | 굵게 | the button is enabled and **nothing happens** — 0 `<strong>` |
 * | 글자 치기 | the selection is not replaced — the last block keeps every character |
 *
 * Both are *a command that consumes a range*, and a range that crosses blocks is a range whose runs
 * are several. Checked here rather than in a browser for the same reason as the delete: it is
 * arithmetic over runs, and 4ms beats 30s.
 */
describe('두 블록에 걸친 선택으로 하는 다른 일들', () => {
  let store: DataStore;
  let editor: Editor;

  const load = (blocks: unknown[], extensions: unknown[]) => {
    const made = schema();
    store = new DataStore(undefined as never, made);
    editor = new Editor({ dataStore: store, schema: made, editable: true, extensions } as never);
    editor.loadDocument({ stype: 'document', content: blocks }, 'del');
  };

  const p = (text: string) => ({ stype: 'paragraph', content: [{ stype: 'inline-text', text }] });

  const runIn = (n: number) => {
    const root = store.getNode(editor.getRootId()!) as { content?: string[] };
    const block = store.getNode(root.content![n]) as { content?: string[] };
    return block.content![0];
  };

  const across = () =>
    editor.setRange({
      type: 'range',
      startNodeId: runIn(0),
      startOffset: 2,
      endNodeId: runIn(2),
      endOffset: 2,
      collapsed: false
    } as never);

  /** What the document says, block by block. */
  const said = () => {
    const root = store.getNode(editor.getRootId()!) as { content?: string[] };
    const words = (sid: string): string => {
      const node = store.getNode(sid) as { text?: string; content?: string[] } | undefined;
      if (!node) return '';
      if (typeof node.text === 'string') return node.text;
      return (node.content ?? []).map(words).join('');
    };
    return (root.content ?? []).map(words);
  };

  /** Every run of the document, with the marks it carries. */
  const marked = () => {
    const out: { text: string; marks: number }[] = [];
    const dig = (sid: string) => {
      const node = store.getNode(sid) as
        | { text?: string; marks?: unknown[]; content?: string[] }
        | undefined;
      if (!node) return;
      if (typeof node.text === 'string') {
        out.push({ text: node.text, marks: (node.marks ?? []).length });
        return;
      }
      for (const one of node.content ?? []) dig(one);
    };
    dig(editor.getRootId()!);
    return out;
  };

  it('marks every run the range touches, not none of them', async () => {
    const { BoldExtension } = await import('../src/bold');
    load([p('첫째 문단입니다'), p('둘째 문단입니다'), p('셋째 문단입니다')], [new BoldExtension()]);
    across();

    expect(await editor.executeCommand('toggleBold', {})).toBe(true);
    /*
     * Three runs touched: the tail of the first, all of the second, the head of the third. A command
     * that reported success and marked nothing is the third recorded instance of *guard says yes,
     * then does nothing* — and the one that is hardest to see, because the toolbar looks right.
     */
    expect(marked().filter((one) => one.marks > 0).length).toBe(3);
  });

  it('marks the last run too when the range ends at its very end — as Ctrl+A does', async () => {
    /**
     * **The shape a select-all makes**, and the one that stayed broken after the middle walk went in:
     * `첫째…`:0 → `셋째…`:8, where 8 is the whole of the last run.
     *
     * Measured in `apps/note` with Ctrl+A over three blocks: the first two took the mark and the
     * third did not, which reads as *the last paragraph did not take*.
     */
    const { BoldExtension } = await import('../src/bold');
    load([p('첫째 문단입니다'), p('둘째 문단입니다'), p('셋째 문단입니다')], [new BoldExtension()]);
    editor.setRange({
      type: 'range',
      startNodeId: runIn(0),
      startOffset: 0,
      endNodeId: runIn(2),
      endOffset: 8,
      collapsed: false
    } as never);

    expect(await editor.executeCommand('toggleBold', {})).toBe(true);
    expect(marked().map((one) => one.marks)).toEqual([1, 1, 1]);
  });

  it('replaces what is selected when a reader types over it', async () => {
    /**
     * The third symptom, and the one with the most at stake: a selection that is not replaced means
     * a reader's next keystroke **appends to a document they thought they were overwriting**.
     *
     * Routed through the same join as Backspace, because typing over a selection *is* a delete
     * followed by an insert — and the delete half is the one that crossed blocks.
     */
    const { TextExtension } = await import('../src/text');
    load([p('첫째 문단입니다'), p('둘째 문단입니다'), p('셋째 문단입니다')], [new TextExtension()]);
    const range = {
      type: 'range' as const,
      startNodeId: runIn(0),
      startOffset: 2,
      endNodeId: runIn(2),
      endOffset: 2,
      collapsed: false
    };
    editor.setRange(range as never);

    expect(await editor.executeCommand('replaceText', { range, text: 'X' })).toBe(true);

    /*
     * **블록으로 셉니다, 런이 아니라.** The one block holds two runs — `첫째X` and ` 문단입니다` — which
     * is not wrong: adjacent runs with the same marks are one span to a renderer, and coalescing them
     * is a tidiness pass rather than a correctness one. What matters is that the three blocks became
     * one and the typed character is in it.
     */
    expect(said()).toEqual(['첫째X 문단입니다']);
  });
});