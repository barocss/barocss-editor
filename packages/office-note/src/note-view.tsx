import { useEffect, useRef, useState } from 'react';
import type { Editor } from '@barocss/editor-core';
import { EditorViewDOM } from '@barocss/editor-view-dom';
import { Controls, SlashMenu, useEditorRevision } from '@barocss/office-editor-ui';
import { noteRegistry } from './renderers';
import { Icon } from '@barocss/office-icons';
import { FilePick, Tip, TipProvider } from '@barocss/office-ui';
import {
  WORD_ENV_KEY,
  createTextEnv,
  installCellSelection,
  type CellSelectionHandle
} from '@barocss/office-text';
import { cellAt, holdsWriting, pickedAt } from './selection';
import { NOTE_MOVES, actsFor, fieldsFor, fileSrc } from './block-model';
import { noteControlsIn } from './toolbar-model';

/**
 * **한 편의 글을 쓰는 화면** — the bar and the body, owned by the package the body belongs to.
 *
 * ## Why the UI is in here
 *
 * Because it was in the app, and that was the coupling. The bar over a body was assembled in the
 * site builder's data editor out of `siteControlsIn('text')` and `siteSlashItems()` — the **page's**
 * declarations — so what a writer could do to a post was decided by what a designer could do to a
 * page. Reported as *이 툴바가 기존 페이지 빌더 툴바랑 연동되고 있음. 그러면 안돼.*
 *
 * A note is its own thing: its own schema (`note-schema.ts`), its own kit (`note-kit.ts`), its own
 * toolbar (`toolbar-model.ts`) and its own chrome — this. A host **embeds** it and hands it the two
 * things only a host can know: which editor, and which node.
 *
 * ## Props in, callbacks out
 *
 * `office-ui`'s rule, kept here for the same reason: this draws a body and knows nothing about a
 * drawer, a row, a dataset or a page. Which is what makes it mountable in a CMS with none of those.
 */
export function NoteEditor({
  editor,
  rootId,
  className,
  onFile
}: {
  /**
   * The editing session. **Handed in**, because whose session it is is the host's decision — a site
   * builder embedding a cell's value and a standalone note opening a file want different answers,
   * and `createNoteEditor` is how either makes one.
   */
  editor: Editor;
  /** The node whose blocks are the body — a `note`, or a site's `richText`. */
  rootId: string;
  className?: string;
  /**
   * What a picked file becomes, when the host has somewhere better to put one than the document.
   *
   * A note on its own has nowhere: what a reader picks becomes a data URI in the `src`, and the
   * file's own size becomes the document's. A site has an asset store and would rather hand back
   * `asset:이름`. So the host decides, and the fallback is the one that always works.
   */
  onFile?: (file: File) => Promise<string>;
}) {
  /**
   * Which block is held, and it lives **here** rather than in the body: two things need it — the
   * body draws the mark, and the strip above asks it what it is. A state each would be two answers
   * to *what is selected*, and the day they differ is the day a reader sets a file on a picture they
   * are not looking at.
   */
  const [picked, setPicked] = useState<string | undefined>(undefined);
  /*
   * And, for a table, **which cell** — the second answer a press in a body can have. Held here
   * rather than read back from the caret: see `cellAt`.
   */
  const [cell, setCell] = useState<string | undefined>(undefined);

  return (
    <div className={['on-note', className].filter(Boolean).join(' ')} data-note-editor={rootId}>
      {/*
        **Its own `TipProvider`.** A tooltip needs one above it, and a host that has never mounted a
        toolbar has none — a CMS embedding this would get buttons with no words, which is the thing
        that was reported: *toolbar 에 툴팁이 안나오니깐 어떤 기능인지 모르겠어.* Nesting providers
        is allowed and the inner one wins, so a host that has its own loses nothing.
      */}
      <TipProvider>
        <NoteBar editor={editor} />
        {/*
          And **what the held block is asked**, which appears only when one is held. A second row that
          was always there would be a row of nothing for the ninety per cent of a body that is words.
        */}
        {picked ? <NoteBlockBar editor={editor} sid={picked} cell={cell} onFile={onFile} /> : null}
      </TipProvider>
      <NoteBody
        editor={editor}
        rootId={rootId}
        picked={picked}
        onPicked={(sid, at) => {
          setPicked(sid);
          setCell(at);
        }}
      />
      {/*
        And the `/` menu, which is this package's for the reason the bar is: the host's surface
        listens to the host's editor, and a body's caret is no longer that one. Typing `/` in a post
        raised nothing the day the session split — in the one place the rail is behind a scrim.
      */}
      {/*
        * **`/` 메뉴는 `office-editor-ui` 의 것입니다.**
        *
        * `note-slash.tsx` was 182 lines and the site's `slash-surface.tsx` was 195, and with comments
        * and blank lines removed **129 of them were identical** — the same regex reading `/질의` out
        * of the run before the caret, the same Escape/arrows/Enter, the same `selectionRectIn`, the
        * same re-measure on scroll. What differed was eight lines, all of them the site's `mode`
        * guard.
        */}
      <SlashMenu editor={editor} />
    </div>
  );
}

/**
 * The bar, from `NOTE_TOOLBAR`.
 *
 * ## Why the blocks come and go and the marks do not
 *
 * A mark applies to a selection and a block is *put somewhere*, so the second one has a question the
 * first does not: **can it go here.** A body holds no frame and no second body, and the model
 * already answers — so the row is left out rather than greyed, which is the difference a bar over a
 * writing surface makes: a reader scanning ten small buttons should be scanning ten they can press.
 *
 * The marks stay whatever the caret is doing. A toggle that disappeared when nothing was selected
 * would be a bar that changes shape as a reader clicks around in their own writing.
 */
function NoteBar({ editor }: { editor: Editor }) {
  const revision = useEditorRevision(editor);
  void revision;

  const can = (name: string) => editor.canExecuteCommand(name) === true;
  const blocks = noteControlsIn('block').filter((one) => can(one.command));

  return (
    <div className="on-bar" data-note-bar>
      {/**
        * **The marks, drawn by the shared chrome.**
        *
        * They were 24 lines here — a `useRevision`, a `getSelectionSummary`, a `markState` per
        * control, a `preventDefault` on `mousedown`, a `Tip`, an `Icon` — and every one of those
        * lines exists three more times, in the site's ribbon, Word's and the deck's. Four of the
        * five things a toolbar does are the same in every product; the one that is not is *which
        * list*, and that is the prop.
        *
        * `data-note-control` rather than the default, because this package's own checks name the
        * buttons that way and a shared surface should not rename a product's tests.
        */}
      <Controls editor={editor} controls={noteControlsIn('mark')} mark="note-control" />

      {blocks.length > 0 ? <span className="on-bar-split" /> : null}

      {/*
       * The blocks stay here, and the reason is the one that is not shared: 표 asks its size before
       * it makes anything, so one of these rows is a grid rather than a button. A shared strip that
       * grew a case for it would be the shared layer learning a product's vocabulary.
       */}
      {blocks.map((one) =>
        one.command === 'insertTableBlock' ? (
          <TablePick
            key={one.command}
            control={one}
            onPick={(rows, cols) => void editor.executeCommand(one.command, { rows, cols })}
          />
        ) : (
          <Tip key={one.command} label={one.title}>
            <button
              type="button"
              aria-label={one.title}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => void editor.executeCommand(one.command)}
              data-note-control={one.command}
            >
              <Icon name={one.icon} size={13} />
            </button>
          </Tip>
        )
      )}
    </div>
  );
}


/** How far a reader may drag — the size past which a table is a spreadsheet and not a body's. */
const PICK_ROWS = 8;
const PICK_COLS = 8;

/**
 * **몇 칸인지 끌어서 고르는 격자** — the size chosen before the table exists, not after.
 *
 * *테이블은 셀 선택으로 몇칸인지 드래그 해서 선택해야한느거 아니니?* — yes, and the reason is not that
 * it looks familiar. A fixed 2×2 makes the reader's first act after inserting a table be **adding
 * rows to it**, and adding a row is the operation a body's table does not have yet. So the size is
 * asked when it is cheap to answer and free to change: the grid is the whole feature.
 *
 * `onMouseOver` and not a drag: a reader who presses and drags gets the same result, because the
 * button under the pointer at `mouseup` is the one that fires. A press-and-release inside one cell
 * is 1×1 and a press-drag-release across the grid is what it crossed — one handler, both gestures.
 */
function TablePick({
  control,
  onPick
}: {
  control: { command: string; title: string; icon: string };
  onPick: (rows: number, cols: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [over, setOver] = useState<{ rows: number; cols: number } | null>(null);

  /* Closing on a click anywhere else, which is what every reader tries before finding a 닫기. */
  useEffect(() => {
    if (!open) return;
    const away = () => setOpen(false);
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  const rows = over?.rows ?? 0;
  const cols = over?.cols ?? 0;

  return (
    <span className="on-pick" onMouseDown={(event) => event.stopPropagation()}>
      <Tip label={control.title}>
        <button
          type="button"
          aria-label={control.title}
          aria-expanded={open}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setOpen((was) => !was)}
          data-note-control={control.command}
        >
          <Icon name={control.icon} size={13} />
        </button>
      </Tip>

      {open ? (
        <div className="on-pick-grid" data-note-pick role="grid" aria-label="표 크기">
          {Array.from({ length: PICK_ROWS }, (_, r) =>
            Array.from({ length: PICK_COLS }, (_, c) => (
              <button
                key={`${r}:${c}`}
                type="button"
                role="gridcell"
                aria-label={`${r + 1}행 ${c + 1}열`}
                data-note-pick-cell={`${r + 1}:${c + 1}`}
                data-on={r < rows && c < cols ? '' : undefined}
                onMouseDown={(event) => event.preventDefault()}
                onMouseOver={() => setOver({ rows: r + 1, cols: c + 1 })}
                onClick={() => {
                  onPick(r + 1, c + 1);
                  setOpen(false);
                  setOver(null);
                }}
              />
            ))
          )}
          {/* What the drag currently means, in the two numbers a reader is choosing. */}
          <span className="on-pick-said" data-note-pick-said>
            {over ? `${rows} × ${cols}` : '표 크기'}
          </span>
        </div>
      ) : null}
    </span>
  );
}

/**
 * **고른 블록에 무엇을 물어보는 줄** — the second row, and only when something is held.
 *
 * A picture arrives as a placeholder and a video as a blank `src`, because both are required by the
 * schema and a reader has not chosen a file yet. Without this, 이미지 is a button that puts a grey
 * rectangle in a post forever — *이미지나 동영상은 파일을 넣을 수 있어야하고*.
 *
 * The rows come from `NOTE_FIELDS`, keyed by the kind of block. A kind with no row is a block a
 * reader can hold and do nothing with, which a check can now count.
 */
function NoteBlockBar({
  editor,
  sid,
  cell,
  onFile
}: {
  editor: Editor;
  sid: string;
  /** For a table, the cell the reader pressed — what the row and column acts are relative to. */
  cell?: string;
  onFile?: (file: File) => Promise<string>;
}) {
  const revision = useEditorRevision(editor);
  void revision;

  const store = editor.dataStore;
  const node = store.getNode(sid);
  if (!node) return null;

  const attrs = (node.attributes ?? {}) as Record<string, unknown>;
  const fields = fieldsFor(node.stype);
  const acts = actsFor(node.stype);
  /*
   * One payload for both kinds of act: the moves name the block, the table's four name the cell, and
   * a command reads the field it knows about. Two spellings of *what is being acted on* is how a
   * button comes to be enabled for one reason and to run for another.
   */
  const on = { nodeId: sid, cellId: cell };
  const canOn = (name: string) =>
    editor.canExecuteCommand(
      name,
      on
    ) === true;
  const runOn = (name: string) =>
    void editor.executeCommand(name, on);
  const said = (attr: string) => String(attrs[attr] ?? '');

  const write = (attr: string, value: string) =>
    void editor.executeCommand('setNoteAttrs', {
      nodeId: sid,
      attrs: { [attr]: value }
    });

  return (
    <div className="on-block" data-note-block={String(node.stype ?? '')}>
      <span className="on-block-what">{labelOf(node.stype)}</span>

      {fields.map((one) =>
        one.kind === 'file' ? (
          <FilePick
            key={one.attr}
            accept={one.accept}
            ariaLabel={one.label}
            onPick={async (file) => write(one.attr, onFile ? await onFile(file) : await fileSrc(file))}
            testClass={`on-field-${one.attr}`}
            /* The input, not the button, is what a test hands a file to — see `FilePick`. */
            inputData={{ 'note-file': one.attr }}
          >
            {one.label}
          </FilePick>
        ) : one.kind === 'choice' ? (
          <select
            key={one.attr}
            aria-label={one.label}
            data-note-field={one.attr}
            value={said(one.attr)}
            onChange={(event) => write(one.attr, event.target.value)}
          >
            {(one.options ?? []).map((each) => (
              <option key={each.id} value={each.id}>
                {each.label}
              </option>
            ))}
          </select>
        ) : (
          /*
           * **Committed, not typed through.** A field that writes per keystroke puts `h`, `ht`,
           * `htt` into the history, and the first two are values the reader never meant — the same
           * rule the site's address field follows.
           */
          <input
            key={one.attr}
            type="text"
            aria-label={one.label}
            data-note-field={one.attr}
            placeholder={one.label}
            defaultValue={said(one.attr)}
            onBlur={(event) => write(one.attr, event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
            }}
          />
        )
      )}

      {/*
        * **무엇을 시킬 수 있나** — this kind's own acts, then the two every held block has.
        *
        * One list and one `Controls`, where it was two identical `.map`s over two lists: 표's rows
        * and columns and 위로/아래로 draw the same button, ask the same question and run the same
        * way, and the only thing that differed was which array they came out of.
        *
        * Quiet when the caret is not in a cell, because 행 추가 with nothing to be after has no
        * answer, and a button that guesses the last row is one a reader stops trusting.
        */}
      <Controls
        editor={editor}
        controls={[...acts, ...NOTE_MOVES]}
        mark="note-act"
        can={(one) => canOn(one.command)}
        onRun={(one) => runOn(one.command)}
      />

      {/* And the one act every held block has, which is the first thing a reader tries on one. */}
      <button
        type="button"
        className="on-block-go"
        aria-label="지우기"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() =>
          void editor.executeCommand('deleteNode', {
            nodeId: sid
          })
        }
        data-note-block-remove
      >
        지우기
      </button>
    </div>
  );
}

/** What a reader calls the held block, so the strip says what it is about. */
function labelOf(stype: unknown): string {
  switch (String(stype)) {
    case 'picture':
      return '이미지';
    case 'mediaVideo':
      return '영상';
    case 'mediaEmbed':
      return '넣은 것';
    case 'bTable':
      return '표';
    case 'horizontalRule':
      return '구분선';
    case 'codeBlock':
      return '코드';
    default:
      return '블록';
  }
}

/**
 * The body — a view pointed at the node, and the two things not to do with one.
 *
 * - **The host must not redraw it.** A view subscribes to `editor:content.change` and redraws
 *   itself; a second render from outside replaces the DOM under a reader who is typing in it, which
 *   is how the caret was lost here before.
 * - **Do not hand it a tree.** `render(tree)` *mutates* what it is given — `_sanitizeTreeContent`
 *   assigns to `content` — so a proxy over the store gets resolved nodes written back into the
 *   document. `rootId` only.
 */
function NoteBody({
  editor,
  rootId,
  picked,
  onPicked
}: {
  editor: Editor;
  rootId: string;
  picked: string | undefined;
  onPicked: (sid: string | undefined, cell?: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorViewDOM | null>(null);
  const cells = useRef<CellSelectionHandle | null>(null);
  const box = useRef<HTMLDivElement>(null);
  /**
   * And a reason to write the mark again.
   *
   * The view redraws itself on a change, and a redraw replaces the elements — so a mark written once
   * survives until the next one and then is gone. Measured: a picture and a code block stayed held
   * and a **table and a rule did not**, because selecting those two redraws where the other two do
   * not. An attribute on a drawn element is a fact about *this drawing*, so it is re-applied every
   * time there is a new one.
   */
  const revision = useEditorRevision(editor);

  useEffect(() => {
    if (!host.current) return;

    if (!view.current) {
      const store = editor.dataStore;
      const doc = {
        rootId: editor.getRootId(),
        getNode: (one: string) => store.getNode(one) as never
      };
      view.current = new EditorViewDOM(editor, {
        container: host.current,
        /*
         * **자기 레지스트리** — see `noteRegistry`. A note draws with note's renderers wherever it is
         * mounted, and registers nothing globally, so a host's own `paragraph` survives it and a
         * host's own `picture` is no longer what a body's picture is drawn with.
         */
        registry: noteRegistry(),
        rootId,
        /*
         * The **text** environment and nothing else. A body is not drawn at a width, so a breakpoint
         * here is a question with no meaning — and a site env would be this package knowing about a
         * product, which is the line it exists to hold.
         */
        env: { [WORD_ENV_KEY]: createTextEnv(doc as never) }
      } as never);

      /**
       * **셀을 가로질러 끄는 것.**
       *
       * `office-text` 에 있고 이 컨테이너에 붙는다 — *이 독자가 어느 셀들을 말하는가* 는 포인터의
       * 일이라서 킷이 아니라 뷰의 몫이고, Word 와 Slides 가 자기 앱에서 같은 자리에 설치하는 것과
       * 같은 이유다. 노트는 뷰를 패키지에 갖고 있으니 그 자리가 여기다.
       *
       * **인스턴스마다 하나.** `installCellSelection` 은 `container.contains` 로 자기 것만 듣기
       * 때문에 노트를 여럿 띄워도 서로의 셀을 고르지 않는다.
       *
       * 이것이 없으면 표에서 할 수 있는 것이 여섯이다 — 행·열 넣기와 지우기. 나머지 둘, 합치기와
       * 나누기는 *두 셀* 을 말할 수 있어야 하고 그 말을 만드는 것이 이 제스처뿐이다.
       */
      cells.current = installCellSelection(editor, host.current, doc as never);
    }

    view.current.setRootId(rootId);
    view.current.render(undefined, { sync: true });
  }, [editor, rootId]);

  useEffect(
    () => () => {
      cells.current?.destroy();
      cells.current = null;
      view.current?.destroy?.();
      view.current = null;
    },
    []
  );

  /**
   * **Two divs, and the outer one scrolls.**
   *
   * `EditorViewDOM` puts `overflow: clip` on the container it is given — inline, with a reason
   * written down: *nothing in the three products scrolls this element, they scroll a pane above it*.
   * A body in a drawer is the first place that does, and an inline style is not something a
   * stylesheet can argue with. Measured: 701 pixels of writing in a 183 pixel box, clipped, with no
   * way to reach the rest.
   *
   * So the scroll goes where that comment says it goes — **above** the container — rather than the
   * view being taught a second answer about its own overflow.
   */
  /**
   * **A press on a picture holds the picture.**
   *
   * The second answer a click needs in a body, and it had none: a caret goes in the words, and
   * everything else — a picture, a video, an embed, a rule, a table, a code block — is a thing a
   * reader points at. Without it a note could put four kinds of block in and never touch one again:
   * no file, no move, no delete. Measured — clicking a picture did nothing at all.
   *
   * The **DOM** decides which one, not the model: what a reader pressed is a pixel, so the element
   * under it is the honest answer. `pickedAt` walks up from the target and stops at the body, so the
   * space under the last block selects nothing rather than selecting it.
   */
  useEffect(() => {
    const held = box.current;
    if (!held) return;

    const store = editor.dataStore;
    const stypeOf = (sid: string) => {
      const node = store.getNode(sid);
      return node ? String(node.stype ?? '') : undefined;
    };

    const press = (event: MouseEvent) => {
      const sid = pickedAt(event.target as Element | null, stypeOf);
      if (!sid) {
        onPicked(undefined);
        return;
      }
      /*
       * **A table keeps its caret; everything else does not.**
       *
       * For a picture or a rule the caret must not also land in it — a held block *and* a caret in
       * it is two answers to one press. But a table's cells are written in, so preventing the press
       * there is preventing a reader from typing in a table at all, and the two states are the
       * honest description of what a click on a cell means: *this table, in that cell*.
       */
      if (holdsWriting(stypeOf(sid))) {
        /*
         * **Held after the caret has landed, not before it.**
         *
         * Holding a block re-renders the body — the strip appears above it and an outline around it
         * — and doing that from inside `mousedown` puts the redraw between the browser placing the
         * caret and the view reading it back. Measured: the **first** click into a fresh table came
         * back as `bTableHeader` and every click after it as the right cell, which is exactly the
         * shape of a race that only the first press can lose.
         *
         * A frame later the caret is settled and the redraw costs nothing anybody sees.
         */
        requestAnimationFrame(() => onPicked(sid, cellAt(event.target as Element | null, stypeOf)));
        return;
      }
      onPicked(sid);
      event.preventDefault();
      void editor.executeCommand('setNode', {
        nodeIds: [sid]
      });
    };

    /**
     * And **Delete takes the held block**, which is the first thing a reader tries on one.
     *
     * Only while something is held and the caret is nowhere: a note with a picture selected and a
     * caret in a paragraph is a state this cannot produce — the press above clears one when it sets
     * the other — but a keymap that did not check would eat a character somewhere else.
     */
    const typed = (event: KeyboardEvent) => {
      if (event.key !== 'Backspace' && event.key !== 'Delete') return;
      const sid = pickedRef.current;
      if (!sid) return;
      /*
       * **Not when the caret is in it.** Measured, in six lines: insert a table, click a cell, type
       * 이름, press Backspace — and the whole table went, because the table was held from the moment
       * the cell was clicked and this handler answered for it. A key press inside a table's words
       * belongs to the words; the table is removed by 지우기, which is unambiguous.
       */
      if (holdsWriting(stypeOf(sid))) return;
      event.preventDefault();
      void editor.executeCommand('deleteNode', {
        nodeId: sid
      });
      onPicked(undefined);
    };

    held.addEventListener('mousedown', press);
    document.addEventListener('keydown', typed, true);
    return () => {
      held.removeEventListener('mousedown', press);
      document.removeEventListener('keydown', typed, true);
    };
  }, [editor, onPicked]);

  /*
   * The mark, written onto the drawn element rather than into the tree: it is a fact about *this
   * view*, and a redraw is the view's own — so it is re-applied whenever either changes, the way
   * `rowIndex` and `boundFrom` are facts about a drawing in the site builder.
   */
  const pickedRef = useRef<string | undefined>(undefined);
  pickedRef.current = picked;
  useEffect(() => {
    const held = box.current;
    if (!held) return;
    for (const one of held.querySelectorAll('[data-note-picked]')) one.removeAttribute('data-note-picked');
    if (picked) held.querySelector(`[data-bc-sid="${picked}"]`)?.setAttribute('data-note-picked', 'true');
  }, [picked, revision]);

  return (
    <div className="on-body" ref={box}>
      <div ref={host} data-note-body={rootId} />
    </div>
  );
}
