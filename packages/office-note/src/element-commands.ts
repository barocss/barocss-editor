import type { Editor, Extension } from '@barocss/editor-core';
import { NOTE_BLOCKS } from './note-schema';
import { addChild, moveBlockDown, moveBlockUp, moveNode, setAttrs, transaction } from '@barocss/model';

type Node = Record<string, any>;

/** A node as a tree, the way every fixture in this repository writes one. */
const node = (stype: string, attributes: Record<string, unknown> = {}, content: Node[] = []): Node => ({
  stype,
  ...(Object.keys(attributes).length > 0 ? { attributes } : {}),
  ...(content.length > 0 ? { content } : {})
});

const run = (text: string): Node => ({ stype: 'inline-text', text });

/** A place for a picture, drawn — see `insertPicture` for why it is not an empty `src`. */
const PLACEHOLDER =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160"><rect width="240" height="160" fill="%23f0f0f0"/><path d="M40 120l45-55 32 38 22-24 61 41z" fill="%23c8c8c8"/><circle cx="78" cy="52" r="13" fill="%23c8c8c8"/></svg>'
  );

/**
 * **What a writer puts in a note** — the eleven ways in, and where each lands.
 *
 * ## Why this file exists, which is a finding rather than a plan
 *
 * `toolbar-model.ts` declared ten commands and `note-kit.ts` registered **none of them**. It worked
 * anyway, for as long as the drawer handed the *site's* editor in: `insertHeading`, `insertQuote`
 * and the rest are `office-site`'s own, so a body's bar was pressing a page builder's buttons — the
 * coupling this package was made to end, still there in the one place nobody had looked.
 *
 * It surfaced the moment the session became the note's own: 93 commands, and every one of the bar's
 * ten missing. Which is the useful thing about giving a thing its own store — the borrowed parts
 * stop working, visibly, instead of continuing to work for the wrong reason.
 *
 * The shared kit has `insertParagraph`, `insertImage`, `insertTable` and `insertEmoji` under names of
 * its own, and nothing at all for a heading, a list, a quote, a rule, a video or an embed. Renaming
 * the bar to match what happens to exist would be a body that cannot have a heading, so: these,
 * named the way this product's other insert lists are named.
 *
 * ## Where a block lands
 *
 * After the block the caret is in, or at the end. A note has no pages, no components, no widths and
 * no coordinates — so the walk that takes a hundred lines in the site builder is the four below.
 */
class NoteElementExtension implements Extension {
  name = 'noteElements';

  onCreate(editor: Editor): void {
    /* `unknown` at the call sites, because each spec below is written inline with its own shape. */
    const command = (spec: unknown) => editor.registerCommand(spec as never);

    const register = (name: string, make: () => Node) =>
      command({
        name,
        execute: async (_ed: Editor, payload?: Record<string, unknown>) => await this._put(editor, make(), payload),
        canExecute: () => !!this._where(editor)
      });

    /**
     * **고른 블록에 값을 준다** — the command the block strip runs.
     *
     * `setAttrs` is an *operation*, not a command: `extensions` builds transactions out of it and
     * nothing registers it by name. So a panel that ran `executeCommand('setAttrs')` ran nothing —
     * which is how a picture stayed a grey rectangle after a reader chose a file for it.
     *
     * Its own command rather than the site's `setBlockFormat`: that one writes 24 fields of a page's
     * design, and a body has four attributes across three kinds of block.
     */
    command({
      name: 'setNoteAttrs',
      execute: async (_ed: Editor, payload?: Record<string, unknown>) => {
        const sid = String(payload?.nodeId ?? '');
        const attrs = payload?.attrs as Record<string, unknown> | undefined;
        if (!sid || !attrs) return false;
        const done = await transaction(editor, [setAttrs(sid, attrs as never)] as never).commit();
        return done.success === true;
      },
      canExecute: (_ed: Editor, payload?: Record<string, unknown>) => !!payload?.nodeId && !!payload?.attrs
    });

    /* Level 2, because a note's level 1 is its title and a title is not one of its blocks. */
    register('insertHeading', () => node('heading', { level: 2 }, [run('제목')]));
    register('insertBodyText', () => node('paragraph', {}, [run('')]));
    /* Two doors into one node — a list is ordered or it is not, and a writer reaches for the word. */
    register('insertBulletList', () =>
      node('list', { type: 'bullet' }, [node('listItem', {}, [node('paragraph', {}, [run('항목')])])])
    );
    register('insertNumberList', () =>
      node('list', { type: 'ordered' }, [node('listItem', {}, [node('paragraph', {}, [run('항목')])])])
    );
    register('insertQuote', () =>
      node('blockQuote', {}, [node('paragraph', {}, [run('인용할 문장을 여기에 씁니다.')])])
    );
    register('insertCode', () => node('codeBlock', { language: 'text' }, [run('')]));
    register('insertRule', () => node('horizontalRule', {}));
    /**
     * **A picture with nothing in it yet**, and `src` is required and may not be empty — measured:
     * an empty one is refused by the model, so a reader pressing 이미지 got nothing at all.
     *
     * An SVG data URI rather than a blank: a `picture` with no source draws a broken image, and a
     * reader who has just added one should see *a place for a picture*. The same answer the site
     * builder's insert gives, for the same reason.
     */
    register('insertPicture', () => node('picture', { src: PLACEHOLDER, alt: '' }));
    /**
     * **A space, not an empty string** — and the site builder has the same line with the same
     * comment, which is the useful part: `src` is *required*, so an empty one is a node the store
     * refuses, and the command lights up, runs and puts nothing in the document. `every-command-
     * does-something` is named after exactly that.
     *
     * A space satisfies the shape, draws nothing, and leaves the reader a block to point at and give
     * a file to. Found here by pressing the button in `apps/note` — the second time this package has
     * been caught declaring something the model does not accept.
     */
    register('insertVideo', () => node('mediaVideo', { src: ' ', aspect: '16/9', controls: true }));
    register('insertEmbed', () => node('mediaEmbed', { provider: 'youtube', id: ' ', aspect: '16/9' }));
    /*
     * A table with a header row, because a table without one is a grid of cells and a reader adding
     * one to a piece of writing means a comparison. Two columns, two body rows — the smallest thing
     * that is recognisably a table.
     */
    /**
     * A table with a header row, because a table without one is a grid of cells and a reader adding
     * one to a piece of writing means a comparison.
     *
     * **A header is not a row.** `bTableHeader` holds `bTableHeaderCell+` **directly** — there is no
     * `bTableRow` in it — while `bTableBody` holds rows and a row holds `bTableCell*`. Written with
     * a row inside the header first, then with ordinary cells inside that row, and the button did
     * nothing both times: two guesses at a shape the schema had already written down. Found by
     * pressing it in `apps/note`, which is what that app is for.
     */
    /**
     * **A table of the size a reader chose** — `rows` × `cols`, both counted including the header row.
     *
     * The only insert that takes a payload, and it is the only one that has a question to answer:
     * *테이블은 셀 선택으로 몇칸인지 드래그 해서 선택해야한느거 아니니?* — yes, and every editor that
     * inserts a fixed 2×2 makes the reader's first act after inserting a table be adding rows to it.
     *
     * Clamped rather than trusted: a grid a reader drags cannot ask for 0 columns, but a command is
     * callable by anything, and a `bTable` with no cells is a node the renderer draws as nothing.
     */
    command({
      name: 'insertTableBlock',
      execute: async (_ed: Editor, payload?: Record<string, unknown>) => {
        const rows = Math.max(1, Math.min(20, Number(payload?.rows ?? 3)));
        const cols = Math.max(1, Math.min(10, Number(payload?.cols ?? 2)));
        const cells = (of: string) => Array.from({ length: cols }, () => node(of, {}, [run('')]));
        const made = node('bTable', {}, [
          node('bTableHeader', {}, cells('bTableHeaderCell')),
          node(
            'bTableBody',
            {},
            /* The header is one of the rows a reader counted, so a 3-row drag makes 1 + 2. */
            Array.from({ length: Math.max(0, rows - 1) }, () => node('bTableRow', {}, cells('bTableCell')))
          )
        ]);
        return await this._put(editor, made, payload);
      },
      canExecute: () => !!this._where(editor)
    });

    /*
     * **표의 행과 열은 여기 없습니다 — 공유 확장의 것입니다.**
     *
     * Four commands were registered here — `addNoteRow` and its three siblings — over
     * `insertTableRow` · `deleteTableRow` · `insertTableColumn` · `deleteTableColumn`, on the finding
     * that the model had them and nothing called them. Half of that was true and the half that
     * mattered was not: `@barocss/extensions`' `TableExtension`, **already in this kit**, registers
     * `insertRowAbove` · `insertRowBelow` · `deleteRow` · `insertColumnLeft` · `insertColumnRight` ·
     * `deleteColumn` · `splitCell` over exactly those, taking the same `cellId` payload — and the
     * other three products had been declaring them all along.
     *
     * Found by `office-controls/test/three-agree.test.ts`, which asks the cheapest version of the
     * question this suite keeps failing: *three products declare a command and the fourth does not.*
     */

    /**
     * **잡은 블록을 위아래로** — the act every held block has and none of them had.
     *
     * This one **is** the note's own, and the same check says so: no other product declares it,
     * because no other product has a held-block strip to put it on. A picture inserted in the wrong
     * place could only be deleted and made again, which loses the file a reader chose for it.
     *
     * Guarded by the position rather than by trying: at the top there is no up, and a button that
     * runs and changes nothing is a button a reader presses twice to be sure.
     */
    const shift = (name: string, make: (sid: string) => unknown, step: -1 | 1) =>
      command({
        name,
        execute: async (_ed: Editor, payload?: Record<string, unknown>) => {
          const sid = String(payload?.nodeId ?? '');
          if (!sid || !this._canShift(editor, sid, step)) return false;
          const done = await transaction(editor, [make(sid)] as never).commit();
          return done.success === true;
        },
        canExecute: (_ed: Editor, payload?: Record<string, unknown>) =>
          this._canShift(editor, String(payload?.nodeId ?? ''), step)
      });

    shift('moveNoteBlockUp', (sid) => moveBlockUp(sid), -1);
    shift('moveNoteBlockDown', (sid) => moveBlockDown(sid), 1);

    /**
     * **자리로 옮긴다** — 한 칸씩이 아니라.
     *
     * 위/위 두 단추는 `moveBlockUp`/`Down` 이고 한 번에 한 칸이다. 끌어 옮기기는 *여기* 를 말하므로
     * 자리를 받는 명령이 따로 있어야 한다. 그리기가 아니라 명령인 이유는 이 저장소의 규칙 그대로다:
     * 하네스가 보는 것은 명령이고, 뷰가 트랜잭션을 직접 열면 *모든 명령이 실제로 무언가를 만드나*
     * 검사가 이 동작을 못 본다.
     *
     * ## `at` 은 **블록 사이의 자리** 이고 content 의 색인이 아니다
     *
     * `NOTE_CONTENT` 는 `(…블록…)+ resources?` 다 — 본문의 자식이 블록만이 아닐 수 있다. 그래서
     * *셋째 블록 앞* 과 *셋째 자식* 은 우연히만 같은 수이고, `moveNode` 가 받는 것은 두 번째다.
     * 여기서 한 칸 틀리면 독자가 그은 선에서 한 칸 옆에 떨어지고, 그건 *놓은 자리로 안 간다* 로
     * 보고된다.
     *
     * 그리고 **옮기는 것을 뺀 채로** 센다 — `moveNode` 가 먼저 빼고 짧아진 배열에 넣기 때문이다.
     * `office-site` 의 `contentIndexFor` 가 같은 규칙을 같은 이유로 적어 뒀다(그쪽은 페이지가 변수를
     * 함께 담아서 부딪혔다). **이 규칙이 필요한 두 번째 자리이고, 세 번째가 나오면 뽑아낼 값이 있다.**
     *
     * 홀로 선 노트는 `resources` 를 만들지 않는다 — *하나의 쓰인 것* 이다. 그래서 오늘은 두 수가
     * 같고, 스키마가 허용하는 동안 맞게 세는 것이 공짜다.
     */
    editor.registerCommand({
      name: 'moveNoteBlockTo',
      execute: async (_ed: Editor, payload?: Record<string, unknown>) => {
        const sid = String(payload?.nodeId ?? '');
        const at = Number(payload?.at);
        const spot = this._contentSpot(editor, sid, at);
        if (spot === undefined) return false;
        const done = await transaction(editor, [moveNode(sid, spot.parentId, spot.at)] as never).commit();
        return done.success === true;
      },
      canExecute: (_ed: Editor, payload?: Record<string, unknown>) =>
        this._contentSpot(editor, String(payload?.nodeId ?? ''), Number(payload?.at)) !== undefined
    });
  }

  /**
   * *N번째 블록 앞* 을 본문 content 의 색인으로 — 옮기는 것을 뺀 채로.
   *
   * `undefined` 는 *옮길 수 없다* 다: 본문의 직계 자식이 아니거나, 자리가 지금과 같거나, 숫자가 아니다.
   * 같은 자리로의 이동을 거부하는 것은 히스토리에 아무 일도 아닌 항목을 만들지 않기 위해서다.
   */
  private _contentSpot(
    editor: Editor,
    sid: string,
    at: number
  ): { parentId: string; at: number } | undefined {
    if (!sid || !Number.isFinite(at) || at < 0) return undefined;
    const store = editor.dataStore;
    const rootId = editor.getRootId();
    const node = store.getNode(sid) as { parentId?: string } | undefined;
    if (!rootId || node?.parentId !== rootId) return undefined;

    const content = (((store.getNode(rootId) as { content?: unknown })?.content ?? []) as unknown[])
      .filter((one): one is string => typeof one === 'string');
    const was = content.indexOf(sid);
    if (was < 0) return undefined;

    const without = content.filter((one) => one !== sid);
    const blocks = without.filter((one) =>
      NOTE_BLOCKS.includes(String((store.getNode(one) as { stype?: string })?.stype) as never)
    );

    /* 마지막 블록보다 뒤: content 의 끝. 블록이 아닌 마지막 자식 뒤로 가야 하기 때문이다. */
    const spot = at >= blocks.length ? without.length : Math.max(0, without.indexOf(blocks[at]));
    if (spot === was) return undefined;
    return { parentId: rootId, at: spot };
  }


  /**
   * Where the next block goes: after the one the caret is in, or at the end.
   *
   * Walks up from the selection to the first child **of the note**, which is the only container a
   * block of a body can be a child of — `NOTE_BLOCKS` has no frame in it, so there is nowhere else
   * for the walk to stop. With no caret it is the end, which is what a bar pressed on a fresh note
   * means.
   */
  private _where(editor: Editor): { parentId: string; at: number } | undefined {
    const store = editor.dataStore;
    const rootId = editor.getRootId();
    if (!store || !rootId) return undefined;

    const root = store.getNode(rootId);
    if (!root) return undefined;
    const kids = (root.content ?? []) as string[];

    const selection = editor.selection;
    let at: Node | undefined = selection?.startNodeId ? store.getNode(selection.startNodeId) : undefined;

    for (let depth = 0; at && depth < 64; depth += 1) {
      const above: string | undefined = typeof at.parentId === 'string' ? at.parentId : undefined;
      if (above === rootId) {
        const index = kids.indexOf(String(at.sid));
        if (index >= 0) return { parentId: rootId, at: index + 1 };
        break;
      }
      at = above ? store.getNode(above) : undefined;
    }

    return { parentId: rootId, at: kids.length };
  }

  private async _put(editor: Editor, child: Node, payload?: Record<string, unknown>): Promise<boolean> {
    void payload;
    const where = this._where(editor);
    if (!where) return false;

    /*
     * Committed once, then the caret — the sid of what was added does not exist until it is written,
     * so the selection cannot ride in the same transaction as the `addChild` that makes it.
     */
    const done = await transaction(editor, [addChild(where.parentId, child as never, where.at)] as never).commit();
    return done.success === true;
  }

  /*
   * **The caret is not written here, and that was tried.** `addChild` leaves it in the first text of
   * what it inserted, and writing over that afterwards — even with the same answer — makes the view
   * apply its own selection and then stop following the DOM caret: a reader clicked the end of a
   * quotation, pressed Enter, and the new line appeared **above** what they had written, because the
   * model still said offset 0. Left in as a comment because the change looked harmless and was not.
   */

  /** Whether this block has a neighbour in that direction — the whole of what makes a move possible. */
  private _canShift(editor: Editor, sid: string, step: -1 | 1): boolean {
    if (!sid) return false;
    const node = editor.dataStore.getNode(sid) as Node | undefined;
    const rootId = editor.getRootId();
    /* A block of a body is a child of the note and nothing else, so anything deeper is not one. */
    if (!node || !rootId || node.parentId !== rootId) return false;
    const kids = ((editor.dataStore.getNode(rootId) as Node | undefined)?.content ?? []) as string[];
    const at = kids.indexOf(sid);
    return at >= 0 && at + step >= 0 && at + step < kids.length;
  }

}

/** The extension, and a check that it answers for every block the schema admits. */
export function createNoteElementCommands(): Extension {
  return new NoteElementExtension();
}

/**
 * Every block command this file registers, so a test can hold it to the bar.
 *
 * **Not one per block**: 목록 and 번호 목록 are one node type and two doors, which is what a writer
 * means by the two words. The check is that every command here makes a block the schema admits and
 * every block has a way in — not that the two lists are the same length.
 */
export const NOTE_INSERTS = [
  'insertHeading',
  'insertBodyText',
  'insertBulletList',
  'insertNumberList',
  'insertQuote',
  'insertCode',
  'insertTableBlock',
  'insertRule',
  'insertPicture',
  'insertVideo',
  'insertEmbed'
] as const;

