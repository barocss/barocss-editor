import { useEffect, useMemo, useRef, useState } from 'react';
import type { Editor } from '@barocss/editor-core';
import {
  Button,
  ChoiceSelect,
  Field,
  Icon,
  IconButton,
  PropertyToggle,
  TextField,
  Drawer,
  ColorField,
  type ChoiceOption
} from '@barocss/office-ui';
import { openNote, type NoteSession } from '@barocss/office-note';
import { NoteEditor } from '@barocss/office-note/view';
import {
  assetsOf,
  richPlain,
  richTextNamed,
  DATA_FIELD_KINDS,
  DATA_FIELD_KIND_ICONS,
  DATA_FIELD_KIND_NAMES,
  columnNames,
  fieldsFrom,
  pageIdOf,
  pageRef,
  pagesOf,
  type DataField,
  type DataFieldKind
} from '@barocss/office-site';

/**
 * The data itself, in a table — **in the main area**, where a page is.
 *
 * ## It was a dialog, and the argument for that was wrong
 *
 * What was written here was: a dataset is not on the page, it is a resource the page refers to by
 * name, and what it needs is the one shape neither side of the shell can give — **width**; a
 * catalogue is five columns by twenty rows, and a 280px rail draws that as a column of slivers. All
 * of which is true, and the conclusion did not follow. A dialog is what you reach for when width is
 * the only problem, and it is a shape that keeps having to grow: 56rem, then 76rem the day each
 * column's header held two controls instead of one.
 *
 * The premise that was actually wrong is the second one — *editing data is a stint, not an
 * adjustment*. A dataset is a **place**. A reader goes back to it, it holds most of what a site
 * says, and everything about it is the same kind of work as editing a page.
 *
 * ## And the mechanism was already here, twice
 *
 * A board takes a `rootId` and draws whatever node it names, which is how **editing a component
 * definition** works: the main area shows something that is not a page, and the rail, the panel and
 * the selection are untouched. A dataset is the third thing that area can show. Nothing about the
 * shell changes, the width problem stops existing, and the two ways of editing data — a table and a
 * row's form — sit beside each other instead of one being inside the other.
 *
 * ## What it is careful about
 *
 * Every keystroke here rewrites the dataset's whole `records` array — the cost `data.ts` writes down
 * as the price of rows being an attribute instead of nodes. So every field commits on **blur or
 * Enter** rather than on change, which is what `TextField` already does, and the grid holds no draft
 * state of its own: the document is the value, and one commit is one entry in the history.
 */
/**
 * **One cell, drawn as what its column says it holds.**
 *
 * Every cell here was a text box — a date, a price, a yes/no and a page reference alike — which is
 * what made entering data feel like typing into a spreadsheet by hand rather than filling something
 * in. A column knows its kind now (`dataset.fields`), and the browser has had a date picker, a
 * number spinner and a select for a decade; the only thing that was missing was somewhere to say
 * which one this is.
 *
 * ## Why `onKeys` is only on the typed ones
 *
 * Arrow keys move between cells, and that is a **text box's** gesture: in a select the arrows choose
 * an option and in a checkbox there is nothing to move a caret through. Taking them there would break
 * the control to make the grid consistent, which is the wrong way round.
 */
function Cell({
  field,
  value,
  plain,
  richAt,
  pages,
  assets,
  onCommit,
  onKeys,
  ariaLabel,
  data
}: {
  field: DataField;
  value: unknown;
  /** The **words** a rich value resolves to — a reference has none of its own to draw. */
  plain?: string;
  /**
   * Where the rich value's nodes are, when this cell is somewhere they can be **edited**.
   *
   * Absent in the table, on purpose: a row is one line tall and a paragraph editor in it would be a
   * cell that grows as somebody types. The form has the room, so the form gets the editor.
   */
  /**
   * Where a 서식 있는 글 column's words live, and what the bar over them needs.
   *
   * `run` and `revision` come along because the bar's rows say whether they can run **here** — a
   * body holds no 버튼 — and that answer changes as the caret moves.
   */
  /** Where a 서식 있는 글 column's words live in the **host's** document — see `NoteField`. */
  richAt?: { host: Editor; sid: string; onBlocks: (blocks: unknown[]) => void };
  /** The document's pages, for a column that holds a page reference. */
  pages: ChoiceOption[];
  /** And its pictures, for one that holds an `asset:`. */
  assets: ChoiceOption[];
  onCommit: (value: string) => void;
  onKeys?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  ariaLabel: string;
  data: Record<string, string>;
}) {
  const text = value === undefined || value === null ? '' : String(value);

  switch (field.kind) {
    case 'richText':
      /**
       * **서식 있는 글**, and the one cell whose value is not in the cell.
       *
       * It holds `text:요약-스택` and the words are `richText` nodes in `resources`, so a text box
       * here would be a reader typing over a reference and losing a paragraph.
       *
       * Two drawings, and which one depends on **where there is room**. In the table it is the
       * words, quiet and not typable: a row is one line tall and a paragraph editor in it would be
       * a cell that grew as somebody typed. In the **form** it is the real thing — a second view
       * over the same editor, pointed at the node, where every mark command works because it is the
       * same document and the same selection. See `RichEdit`.
       */
      return richAt ? (
        /* One per rich cell, because a row may declare two — 요약 for a card, 본문 for the post. */
        <NoteField host={richAt.host} sid={richAt.sid} onBlocks={richAt.onBlocks} />
      ) : (
        <span className="st-cell-rich" title={text}>
          {plain || <em>비어 있음</em>}
        </span>
      );

    case 'colour':
      /* The document's own colours beside a literal, which is what every other colour here offers. */
      return <ColorField value={text || null} onChange={onCommit} ariaLabel={ariaLabel} />;

    case 'choices':
      /*
       * **여러 선택**, kept as one string with newlines between — see `cellFor` for why a cell does
       * not hold an array. Drawn as the chosen ones, and chosen from the same list a `choice` uses.
       */
      return (
        <span className="st-cell-choices">
          {(field.options ?? []).map((one) => {
            const held = text.split('\n').filter(Boolean);
            const on = held.includes(one);
            return (
              <button
                key={one}
                type="button"
                data-on={on ? 'true' : undefined}
                aria-pressed={on}
                aria-label={`${ariaLabel} ${one}`}
                onClick={() =>
                  onCommit((on ? held.filter((each) => each !== one) : [...held, one]).join('\n'))
                }
              >
                {one}
              </button>
            );
          })}
        </span>
      );

    case 'image':
      /* A picture from the document's own asset box — `asset:로고`, the same reference a block uses. */
      return (
        <ChoiceSelect
          value={text}
          options={assets}
          onChange={onCommit}
          ariaLabel={ariaLabel}
          className="w-full min-w-0"
        />
      );

    case 'longText':
      return (
        <textarea
          className="st-cell-long"
          defaultValue={text}
          onBlur={(event) => onCommit(event.target.value)}
          aria-label={ariaLabel}
          rows={3}
        />
      );

    case 'boolean':
      return (
        <PropertyToggle
          value={value === true}
          onChange={(next) => onCommit(String(next))}
          ariaLabel={ariaLabel}
        />
      );

    case 'choice':
      return (
        <ChoiceSelect
          value={text}
          /*
           * An empty row first, because a choice column is not a required field: a row that has not
           * been categorised yet is an ordinary state, and a select with no way back to *nothing*
           * makes the first option a value nobody chose.
           */
          options={[{ id: '', label: '—' }, ...(field.options ?? []).map((one) => ({ id: one, label: one }))]}
          onChange={onCommit}
          ariaLabel={ariaLabel}
        />
      );

    case 'page':
      /* The page's **durable id**, which is what every other reference in this document holds. */
      return <ChoiceSelect value={pageIdOf(text)} options={pages} onChange={(id) => onCommit(id ? pageRef(id) : '')} ariaLabel={ariaLabel} />;

    default:
      return (
        <TextField
          value={text}
          type={field.kind === 'number' ? 'number' : field.kind === 'date' ? 'date' : field.kind === 'url' ? 'url' : 'text'}
          onCommit={onCommit}
          onKeys={onKeys}
          ariaLabel={ariaLabel}
          data={data}
        />
      );
  }
}

/**
 * **서식 있는 글, 고칠 수 있게** — and there is no new editor here, which is the point.
 *
 * ## What a view already is
 *
 * `page-frame.tsx` wrote the contract this leans on: *a view that draws part of a document says so
 * and asks for nothing — `rootId`. Then it takes the same path the main view takes — no caller tree,
 * nothing sanitised, nothing written back — and it redraws itself on a content change with the caret
 * where the reader left it.*
 *
 * A `richText` node is a node. So editing one is a second `EditorViewDOM` over **the same editor and
 * the same store**, pointed at it. Which is the third time this mechanism answers a question: the
 * boards draw a page, editing a definition points them at its part, and this points a small one at a
 * paragraph living in `resources`.
 *
 * What comes for free, and is the whole argument for the shape:
 *
 * - **One selection**, because there is one document and one place the reader is.
 * - **One history** — undo walks back through a cell and a summary in the order they happened.
 * - **Every mark command**, unchanged. Which is exactly the hole the conformance harness reported
 *   the day the sample put a link in one: `removeLink` found the run, said it could run, and changed
 *   nothing, because nothing could put a caret there.
 * - **The floating toolbar and the `/` menu**, which follow the selection and so follow this.
 *
 * ## The two things not to do, both already paid for once
 *
 * - **The host must not redraw it.** A view subscribes to `editor:content.change` and redraws
 *   itself; a second render from outside replaces the DOM under a reader who is typing in it, which
 *   is how the caret was lost here before.
 * - **Do not hand it a tree.** `render(tree)` *mutates* what it is given — `_sanitizeTreeContent`
 *   assigns to `content` — so a proxy over the store gets resolved nodes written back into the
 *   document. `rootId` only.
 */
/**
 * **A body, in a session of its own** — the host's side of `openNote`.
 *
 * ## Why this component exists at all
 *
 * Because the session has a lifetime and React has to own it. `openNote` makes a store, loads a copy
 * of the body into it and starts listening; `close` lets go. A mount and an unmount is exactly that
 * shape, and doing it any other way is a store per render.
 *
 * ## And what it fixes
 *
 * `[EditorViewDOM] selection retry exceeded`, on every click into a body. The bar and the view were
 * the note's, and the **editor** was still the site's — one editor means one selection, and a
 * selection is applied by *every* view, so the boards were told the caret is at a `site:` node they
 * do not draw and searched their own DOM for it until they gave up. Read exactly right from the
 * outside: *난 분명 office-note 를 드래그 했는데 office-site 의 editor 가 selection 을 넣는 느낌이야.*
 */
function NoteField({
  host,
  sid,
  onBlocks
}: {
  host: Editor;
  sid: string;
  onBlocks: (blocks: unknown[]) => void;
}) {
  const [held, setHeld] = useState<NoteSession | undefined>(undefined);
  /*
   * The callback, kept in a ref: `openNote` takes it once and the session outlives every render, so
   * closing over the first one would write home with a stale `run`.
   */
  const told = useRef(onBlocks);
  told.current = onBlocks;

  useEffect(() => {
    const store = (host as never as { dataStore: { getNode: (one: string) => never } }).dataStore;
    const one = openNote({ getNode: (at: string) => store.getNode(at) } as never, sid, {
      onChange: (blocks) => told.current(blocks)
    });
    setHeld(one);
    return () => {
      one.close();
      setHeld(undefined);
    };
  }, [host, sid]);

  if (!held) return <div className="on-note" data-note-loading={sid} />;
  return <NoteEditor editor={held.editor} rootId={held.rootId} />;
}

/*
 * **미니 에디터는 `@barocss/office-note`의 것입니다.**
 *
 * `MiniText` and `RichEdit` were here: a bar assembled out of `siteControlsIn('text')` and
 * `siteSlashItems()` — the **page's** declarations — over a view this file mounted. So what a writer
 * could do to a post was decided by what a designer could do to a page, which is the coupling
 * reported as *이 툴바가 기존 페이지 빌더 툴바랑 연동되고 있음. 그러면 안돼.*
 *
 * A body is its own thing with its own schema, kit, toolbar and chrome. What this file does now is
 * hand `NoteEditor` the two things only a host knows: which editor, and which node.
 */

/**
 * **속성 추가** — a name and what it holds, in one gesture.
 *
 * It was a name alone, so every column a reader made was 글자 and setting it to a date was a second
 * act on a control they had to find afterwards. Which is not how anybody thinks about adding a
 * column: *발행일, 날짜* is one decision, and every table of this kind asks for both at once.
 *
 * The name **first and focused**, because that is what a reader came to type; the kinds under it,
 * because there are fourteen and a reader picks by recognising a shape rather than by reading a
 * word. `setDatasetField` already took both — the command could do this before any surface offered
 * it, which is the ordinary way round here.
 */
function AddField({
  onAdd,
  onClose,
  where
}: {
  onAdd: (name: string, kind: DataFieldKind) => void;
  onClose: () => void;
  /** What names the controls, so a form and a table do not both say *새 열 이름*. */
  where: string;
}) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<DataFieldKind>('text');

  const add = () => {
    const named = name.trim();
    if (!named) return onClose();
    onAdd(named, kind);
    onClose();
  };

  return (
    <div className="st-add-field" data-add-field={where}>
      <TextField
        value={name}
        onChange={setName}
        placeholder="속성 이름"
        ariaLabel={`${where} 새 속성 이름`}
        onKeys={(event) => {
          if (event.key === 'Enter') add();
          if (event.key === 'Escape') onClose();
        }}
        inputRef={(el) => el?.focus()}
        data={{ 'add-field-name': where }}
      />
      <div className="st-add-kinds" role="listbox" aria-label="자료형">
        {DATA_FIELD_KINDS.map((one) => (
          <button
            key={one}
            type="button"
            role="option"
            aria-selected={one === kind}
            data-on={one === kind ? 'true' : undefined}
            data-add-kind={one}
            onClick={() => setKind(one)}
          >
            <Icon name={DATA_FIELD_KIND_ICONS[one] as never} size={14} />
            {DATA_FIELD_KIND_NAMES[one]}
          </button>
        ))}
      </div>
      <div className="st-add-do">
        <Button onClick={add} data={{ 'add-field-do': where }}>
          추가
        </Button>
        <Button onClick={onClose}>취소</Button>
      </div>
    </div>
  );
}

export function DataTable({
  editor,
  run,
  can,
  revision,
  sid,
  onClose,
  onOpenRow
}: {
  editor: Editor;
  run: (name: string, payload?: Record<string, unknown>) => void;
  can: (name: string, payload?: Record<string, unknown>) => boolean;
  /** The document's revision, so the grid redraws when a command lands. */
  revision: number;
  /** Which dataset. Nothing means the main area is showing something else. */
  sid: string | null;
  onClose: () => void;
  /** Open one row as a form. The grid compares rows; the form fills one in. */
  onOpenRow?: (row: number) => void;
}) {
  const store = editor.dataStore;
  const [adding, setAdding] = useState(false);

  const data = useMemo(() => {
    const node = sid ? store?.getNode(sid) : undefined;
    if (node?.stype !== 'dataset') return undefined;
    const attrs = node.attributes ?? {};
    return {
      name: String(attrs.name ?? ''),
      label: String(attrs.label ?? attrs.name ?? ''),
      kind: attrs.kind === 'url' ? 'url' : 'inline',
      url: String(attrs.url ?? ''),
      live: attrs.live === true,
      /* What each column *holds*, not only what it is called — see `fieldsFrom` for both shapes. */
      fields: fieldsFrom(attrs.fields),
      records: ((attrs.records ?? []) as unknown[]).map((row) => (row ?? {}) as Record<string, unknown>)
    };
  }, [store, sid, revision]);

  /**
   * The document's pages, for a column that holds a **page reference**.
   *
   * A picker rather than a text box, for the reason every other reference in this product is a
   * picker: `page:post-stack` typed by hand is a typo that draws a link to nowhere, and the id is
   * not what a reader knows the page by.
   */
  /** The document, for the readers that resolve a reference — `richPlain`, `pagesOf`, `assetsOf`. */
  const doc = useMemo(
    () => ({ rootId: editor.getRootId() ?? '', getNode: (one: string) => store?.getNode(one) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editor, store, revision]
  );

  const pages = useMemo((): ChoiceOption[] => {
    return [
      { id: '', label: '없음' },
      ...pagesOf(doc as never).map((one) => ({ id: one.id, label: `${one.name} · ${one.path}` }))
    ];
  }, [editor, store, revision]);

  /**
   * The document's **pictures**, for a column that holds one.
   *
   * `asset:로고`, which is the same reference a block's `src` holds — so a picture in a list is the
   * same picture the page uses, and changing the file changes both.
   */
  const assets = useMemo((): ChoiceOption[] => {
    return [
      { id: '', label: '없음' },
      ...assetsOf(doc as never).map((one) => ({ id: `asset:${one.name}`, label: one.label ?? one.name }))
    ];
  }, [editor, store, revision]);

  if (!sid || !data) return null;

  /**
   * **Moving between cells the way a grid moves**, which is the other half of *feels like a
   * spreadsheet*.
   *
   * Tab already worked, because these are ordinary inputs in document order — and that is exactly
   * the problem: Tab walks along a row and into the **delete button at the end of it**, which is
   * where a reader pressing it to reach the next column arrives. A grid moves by direction.
   *
   * ## Which keys, and when
   *
   * Up and down always: a column of values is read and typed downward, and nothing else in a text
   * box wants a vertical arrow. Left and right **only from an end** — a reader editing a cell's
   * words uses those to move the caret, and taking them would make the grid useless for what it is
   * mostly used for. So the caret has to be against the edge it is moving past already, which is
   * the rule a spreadsheet's own formula bar follows. Enter is down; Shift+Enter is up.
   *
   * ## Why it is here and not on the container
   *
   * It was written once as a `keydown` on the scroll box and never fired: `TextField` stops the
   * event on purpose, so that an Enter committing a field cannot also reach the paragraph inside
   * the shape being edited. `onKeys` is the door that control declares for exactly this, and going
   * through it is also more honest — the handler is handed its own row and column rather than
   * parsing them back out of an attribute.
   */
  const moveCell = (event: React.KeyboardEvent<HTMLInputElement>, row: number, field: string) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const box = event.currentTarget;
    const column = columnNames(data.fields).indexOf(field);

    const atStart = box.selectionStart === 0 && box.selectionEnd === 0;
    const atEnd = box.selectionStart === box.value.length && box.selectionEnd === box.value.length;

    const step =
      event.key === 'ArrowDown' || (event.key === 'Enter' && !event.shiftKey)
        ? [1, 0]
        : event.key === 'ArrowUp' || (event.key === 'Enter' && event.shiftKey)
          ? [-1, 0]
          : event.key === 'ArrowRight' && atEnd
            ? [0, 1]
            : event.key === 'ArrowLeft' && atStart
              ? [0, -1]
              : undefined;
    if (!step) return;

    const wanted = `${row + step[0]}:${data.fields[column + step[1]]?.name ?? ''}`;
    const next = document.querySelector<HTMLInputElement>(`input[data-cell="${wanted}"]`);
    if (!next) return;

    /*
     * **Prevented**, so Enter does not also commit-and-blur its way out from under the reader and an
     * arrow does not scroll the dialog. Selected rather than merely focused, which is what every
     * grid does: landing on a cell means *replace this*, and a reader who meant to edit types a key
     * and starts from what was there.
     */
    event.preventDefault();
    next.focus();
    next.select();
  };
  const set = (payload: Record<string, unknown>) => run('setDatasetInfo', { nodeId: sid, ...payload });

  return (
    <div className="st-data-page" data-dataset-page={data.name}>
      {/*
        The strip above the table: what this data is called, and the one act that is about the whole
        of it. It was a dialog's title bar and footer, which is where those two things go when a
        dialog is what you have — here they are a header, which is what they are.
      */}
      <header className="st-data-head">
        <div className="st-data-title">
          <h2>{data.label}</h2>
          <p>
            데이터 · {data.fields.length}개 열 · {data.records.length}행
          </p>
        </div>
        {/*
          Deleting the dataset lives here rather than in the rail's list, because this is the only
          place a reader can see what they would be deleting. It refuses while a list draws it —
          `removeDataset` counts the collections that name it — and says so by being disabled with a
          title rather than by failing when pressed.
        */}
        <Button
          disabled={!can('removeDataset', { nodeId: sid })}
          title={can('removeDataset', { nodeId: sid }) ? undefined : '이 데이터를 쓰는 목록이 있습니다'}
          onClick={() => {
            run('removeDataset', { nodeId: sid });
            onClose();
          }}
          data={{ 'dataset-remove': data.name }}
        >
          데이터 삭제
        </Button>
      </header>

      <div className="st-data-edit">
        <div className="st-data-about">
          <Field label="이름">
            <TextField
              value={data.label}
              onCommit={(value) => set({ label: value })}
              ariaLabel="데이터 이름"
            />
          </Field>
          <Field label="출처">
            <ChoiceSelect
              value={data.kind}
              options={[
                { id: 'inline', label: '문서 안' },
                { id: 'url', label: '주소에서' }
              ]}
              onChange={(value) => set({ kind: value })}
              ariaLabel="데이터 출처"
            />
          </Field>
          {data.kind === 'url' ? (
            <Field label="주소">
              <TextField
                value={data.url}
                onCommit={(value) => set({ url: value })}
                placeholder="https://…"
                ariaLabel="데이터 주소"
              />
            </Field>
          ) : null}
        </div>

        {data.kind === 'url' ? (
          <div className="st-data-fetch">
            {/*
              The half that did not exist. The rows are fetched **here**, into the document, rather
              than by the published page — see `refreshDataset` for the argument, which comes down to
              this: the other way ships a script on every page, and this way the rows are in the HTML
              a crawler reads.

              So the sentence under it is not a caveat, it is the contract: what a visitor sees is
              what was here the last time somebody pressed this.
            */}
            <Button
              onClick={() => run('refreshDataset', { nodeId: sid })}
              disabled={!data.url.trim()}
              ariaLabel="주소에서 새로 가져오기"
            >
              새로 가져오기
            </Button>
            <p className="st-data-note">
              눌렀을 때 받아온 행이 문서에 저장되고, 게시된 페이지에 그대로 실립니다.
            </p>
            {/*
              And the deliberate second mode. The sentence under it says every cost, because all of
              them show up somewhere the reader is not: a script on the page, a crawler that reads
              the old rows, a list that moves after the page paints, and an address that has to let
              a stranger's browser read it. `live.ts` argues why it is off by default.
            */}
            <PropertyToggle
              value={data.live}
              onChange={(value) => set({ live: value })}
              label="방문자 브라우저에서도 새로 가져오기"
              ariaLabel="방문자 브라우저에서도 새로 가져오기"
            />
            <p className="st-data-note">
              켜면 게시된 페이지가 열릴 때마다 이 주소를 다시 읽습니다. 페이지에 스크립트가 실리고,
              검색 엔진은 게시할 때의 행을 봅니다.
            </p>
          </div>
        ) : null}

        {/*
          A table, and a real one: a grid of divs would leave a screen reader with a wall of text
          where every cell needs its column read out beside it. `scope="col"` is what makes 가격
          the *name* of the cell rather than a word above it.
        */}
        {/**
          * **A block of cells, pasted.**
          *
          * The reason a dataset exists is that the data is somewhere else — a spreadsheet, a page, a
          * CSV somebody was sent — and typing forty cells back in one at a time is the work this
          * feature was supposed to remove. A paste is what a reader tries first, and until now it
          * put the whole clipboard into whichever single box had the caret.
          *
          * ## Where it lands, and where it stops
          *
          * At the **focused cell**, which is what every grid does and what a reader is pointing at.
          * Rows grow to fit; columns are trimmed at the last one, because a column has a *name* — one
          * `field:가격` refers to and a card is bound through — and a paste cannot invent one.
          *
          * ## Why it does not fire on every paste in this dialog
          *
          * The name field and the address field are ordinary boxes and a paste in one of them means
          * what it always did. So this asks whether the paste happened **in a cell**, and lets every
          * other one alone rather than swallowing it.
          *
          * ## One line is not a block
          *
          * A paste with no tab and no newline is a single value, and handling it here would take a
          * gesture the browser already does perfectly well and do it again, worse: the box would
          * lose its selection, its caret and its undo. Left to the browser.
          */}
        <div
          className="st-data-scroll"
          onPaste={(event) => {
            const at = (event.target as HTMLElement).closest?.('[data-cell]');
            const said = at?.getAttribute('data-cell');
            if (!said) return;

            const text = event.clipboardData.getData('text/plain');
            if (!text || !/[\t\n]/.test(text)) return;

            /*
             * Tabs and newlines, which is what every spreadsheet puts on a clipboard — and the
             * trailing newline a copy of whole rows always carries is dropped, or a paste of three
             * rows writes four and the last one is empty.
             */
            const values = text
              .replace(/\r\n/g, '\n')
              .replace(/\n+$/, '')
              .split('\n')
              .map((line) => line.split('\t'));
            if (values.length === 0) return;

            const [row, field] = [said.slice(0, said.indexOf(':')), said.slice(said.indexOf(':') + 1)];
            event.preventDefault();
            run('setDatasetCells', { nodeId: sid, row: Number(row), field, values });
          }}
        >
          <table className="st-data-grid">
            <thead>
              <tr>
                <th scope="col" className="st-data-rownum" />
                {data.fields.map((field) => (
                  <th key={field.name} scope="col">
                    <span className="st-data-col">
                      {/*
                        The column's **name**, and it is the control: a rename rewrites the key in
                        every row (`setDatasetField`), which is the one thing about this grid that is
                        not obvious — so it is done in the place a reader would try it.
                      */}
                      <span className="st-data-col-name">
                        <TextField
                          value={field.name}
                          onCommit={(value) => {
                            if (value !== field.name) {
                              run('setDatasetField', { nodeId: sid, field: field.name, rename: value });
                            }
                          }}
                          ariaLabel={`${field.name} 열 이름`}
                          data={{ 'column': field.name }}
                        />
                        <IconButton
                          label={`${field.name} 열 삭제`}
                          size="sm"
                          disabled={data.fields.length <= 1}
                          onClick={() => run('setDatasetField', { nodeId: sid, field: field.name, remove: true })}
                          data={{ 'column-remove': field.name }}
                        >
                          <Icon name="delete" size={12} />
                        </IconButton>
                      </span>
                      {/*
                        **What the column holds**, on its own line under the name.

                        It is a fact about the column and this is the one place a column is looked at
                        — it used to live on the *card* that drew it (`componentVar.kind`), so two
                        cards drawing one column declared it twice and could disagree, and nothing
                        could check a cell.

                        Under rather than beside, and that is not taste: two controls side by side
                        make a header whose width is the sum of two minimums **per column**, which at
                        five columns is wider than any dialog. Side by side, the name field was the
                        flexible half and the browser squeezed it to nothing.
                      */}
                      <ChoiceSelect
                        value={field.kind}
                        /*
                          **A picture per kind**, because a reader setting a table up scans fourteen
                          rows of a menu and fourteen Korean words at 12px are read one at a time. All
                          fourteen were drawn for this — `math` (Σ) on a number would have said *this
                          is computed*, which is a kind this product deliberately does not have.
                        */
                        options={DATA_FIELD_KINDS.map((one) => ({
                          id: one,
                          label: DATA_FIELD_KIND_NAMES[one],
                          icon: DATA_FIELD_KIND_ICONS[one]
                        }))}
                        onChange={(kind) => run('setDatasetField', { nodeId: sid, field: field.name, kind })}
                        ariaLabel={`${field.name} 자료형`}
                        testClass="st-data-kind"
                        className="w-full min-w-0"
                      />
                    </span>
                  </th>
                ))}
                <th scope="col" className="st-data-add">
                  {adding ? (
                    <AddField
                      where="표"
                      onAdd={(named, kind) => run('setDatasetField', { nodeId: sid, field: named, kind })}
                      onClose={() => setAdding(false)}
                    />
                  ) : (
                    <IconButton label="열 추가" size="sm" onClick={() => setAdding(true)} data={{ 'column-add': 'true' }}>
                      <Icon name="add" size={12} />
                    </IconButton>
                  )}
                </th>
              </tr>
            </thead>
            <tbody>
              {data.records.map((row, index) => (
                // Keyed by position, which is honest: a row here has no identity of its own — it is
                // the nth entry of an array — and pretending otherwise with a synthesised key would
                // make React keep the wrong input focused after a delete.
                <tr
                  key={index}
                  data-row={index}
                  /**
                   * **행 전체로도 열린다** — asked for after the number turned out to be the only way
                   * in, and it has to be careful about one thing: a cell **is** a field, so a plain
                   * click has to keep landing in it.
                   *
                   * So two gestures rather than one. A single click opens the row only where it did
                   * not land on something interactive — the gaps, the paddings, a quiet cell — and a
                   * **double click anywhere** opens it, which is the gesture that cannot collide
                   * because a field's own double click selects a word and this one is on the row.
                   */
                  onClick={(event) => {
                    const at = event.target as HTMLElement;
                    if (at.closest('input, select, button, textarea, [contenteditable="true"], label')) return;
                    onOpenRow?.(index);
                  }}
                  onDoubleClick={() => onOpenRow?.(index)}
                >
                  <th scope="row" className="st-data-rownum">
                    {/*
                      The row number **is** the way into the form, which is where every tool of this
                      kind puts it: the one part of a row that is not a value, and the one a reader
                      is already aiming at when they mean *this row* rather than *this cell*.
                    */}
                    <button
                      type="button"
                      className="st-data-open"
                      aria-label={`${index + 1}행 펼치기`}
                      title="이 행을 폼으로 엽니다"
                      onClick={() => onOpenRow?.(index)}
                      data-row-open={String(index)}
                    >
                      {/**
                       * **The number, and then the way in.**
                       *
                       * Reported as *Drawer 가 어디서 열리는지 모르겠어* — and the reading was exact:
                       * the row number **is** the button, drawn in the faintest ink the palette has,
                       * with no icon, no word and nothing but a hover colour to say it does anything.
                       * A reader who does not already know cannot find out by looking, which is the
                       * definition of undiscoverable.
                       *
                       * So the number stays where a reader is already aiming, and an icon takes its
                       * place while the pointer is on the row — the pattern every tool of this kind
                       * uses, because a control on all five hundred rows at once is a column of
                       * clutter and one on the row under the pointer is an answer.
                       */}
                      <span className="st-data-rownum-n">{index + 1}</span>
                      <Icon name="expand" size={12} />
                    </button>
                  </th>
                  {data.fields.map((field) => (
                    <td key={field.name} data-cell-kind={field.kind}>
                      <Cell
                        field={field}
                        value={row[field.name]}
                        plain={richPlain(doc, row[field.name])}
                        pages={pages}
                        assets={assets}
                        onCommit={(value) =>
                          run('setDatasetCell', { nodeId: sid, row: index, field: field.name, value })
                        }
                        onKeys={(event) => moveCell(event, index, field.name)}
                        ariaLabel={`${index + 1}행 ${field.name}`}
                        data={{ 'cell': `${index}:${field.name}` }}
                      />
                    </td>
                  ))}
                  <td className="st-data-rowend">
                    <IconButton
                      label={`${index + 1}행 삭제`}
                      size="sm"
                      onClick={() => run('removeDatasetRow', { nodeId: sid, row: index })}
                      data={{ 'row-remove': String(index) }}
                    >
                      <Icon name="delete" size={12} />
                    </IconButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Button onClick={() => run('addDatasetRow', { nodeId: sid })} data={{ 'row-add': 'true' }}>
          행 추가
        </Button>
      </div>
    </div>
  );
}

/**
 * **한 행을, 폼으로** — the other half of a grid, and the half a blog needs.
 *
 * ## Why a grid is not enough, said as the measurement
 *
 * A grid is for **scanning**: twenty rows of five columns, where the shape of a column tells you
 * something and a wrong cell stands out. It is the wrong shape for **entering** one row, and gets
 * worse the more a row holds: five columns of a product is a comfortable line; a blog entry with a
 * title, a summary, a date, a flag and a page is a row that has scrolled off the right edge before
 * the reader has finished the summary, and every field is 8rem wide whatever it holds.
 *
 * So: both. The grid stays exactly as it was and is where rows are compared; the form is where one
 * is filled in. That is the pair every tool of this kind arrives at, and each half is bad at the
 * other's job rather than merely less good.
 *
 * ## Why it is a drawer and not a second dialog
 *
 * Because of where it is opened from. A row is opened from the grid *and* from the page — a reader
 * who clicks the third card of a blog index is looking at row three — and in the second case the
 * thing they are editing is **behind the drawer, drawn**. A dialog in the middle covers it. A drawer
 * against the right edge leaves it visible, so a summary being typed is a summary the reader can
 * watch land in the card.
 *
 * ## What it does not do
 *
 * It does not hold a draft. Every field commits on blur or Enter, exactly as the grid's do, and the
 * document is the value — so there is no 저장 button, no unsaved state to lose, and one commit is one
 * entry in the history. See `DataEditor` for why that rule is worth the cost.
 */
export function RowForm({
  editor,
  run,
  revision,
  at,
  onClose
}: {
  editor: Editor;
  run: (name: string, payload?: Record<string, unknown>) => void;
  revision: number;
  /** Which dataset and which row, or nothing when the drawer is closed. */
  at: { sid: string; row: number } | null;
  onClose: () => void;
}) {
  const store = editor.dataStore;
  const [adding, setAdding] = useState(false);

  const shown = useMemo(() => {
    const node = at ? store?.getNode(at.sid) : undefined;
    if (node?.stype !== 'dataset') return undefined;
    const attrs = node.attributes ?? {};
    const records = ((attrs.records ?? []) as unknown[]).map((one) => (one ?? {}) as Record<string, unknown>);
    const record = records[at!.row];
    if (!record) return undefined;
    return {
      label: String(attrs.label ?? attrs.name ?? '데이터'),
      fields: fieldsFrom(attrs.fields),
      record,
      rows: records.length
    };
  }, [store, at, revision]);

  /** The document, for the readers that resolve a reference — `richPlain`, `pagesOf`, `assetsOf`. */
  const doc = useMemo(
    () => ({ rootId: editor.getRootId() ?? '', getNode: (one: string) => store?.getNode(one) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editor, store, revision]
  );

  const pages = useMemo((): ChoiceOption[] => {
    return [
      { id: '', label: '없음' },
      ...pagesOf(doc as never).map((one) => ({ id: one.id, label: `${one.name} · ${one.path}` }))
    ];
  }, [editor, store, revision]);

  /**
   * The document's **pictures**, for a column that holds one.
   *
   * `asset:로고`, which is the same reference a block's `src` holds — so a picture in a list is the
   * same picture the page uses, and changing the file changes both.
   */
  const assets = useMemo((): ChoiceOption[] => {
    return [
      { id: '', label: '없음' },
      ...assetsOf(doc as never).map((one) => ({ id: `asset:${one.name}`, label: one.label ?? one.name }))
    ];
  }, [editor, store, revision]);

  if (!at || !shown) return null;

  return (
    <Drawer
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={`${at.row + 1}행`}
      description={`${shown.label} · ${shown.rows}행 중 ${at.row + 1}번째`}
      /*
       * **Wider**, because what is in it stopped being a column of fields: a 서식 있는 글 column
       * draws a whole editor, and a body written at 24rem is a body written down a gutter. Two of
       * them — which a row may have — is two gutters side by side.
       */
      width="40rem"
      className="st-row-form"
    >
      <div className="st-row-fields" data-row-form={String(at.row)}>
        {shown.fields.map((field) => (
          <label key={field.name} className="st-row-field" data-field={field.name} data-kind={field.kind}>
            <span className="st-row-label">
              {field.label ?? field.name}
              {/*
                What the column holds, beside its name and quiet — the same fact the grid's header
                shows, drawn here too because a reader filling a row in should not have to remember
                which of five columns was the date.
              */}
              <em className="st-row-kind">{DATA_FIELD_KIND_NAMES[field.kind]}</em>
            </span>
            <Cell
              field={field}
              value={shown.record[field.name]}
              plain={richPlain(doc, shown.record[field.name])}
              /*
               * And **where those words live**, so the form draws the editor rather than the words.
               * A reference that resolves to nothing hands back nothing, and the cell falls back to
               * saying so — which is what a `richText` that was deleted looks like.
               */
              richAt={(() => {
                if (field.kind !== 'richText') return undefined;
                const one = richTextNamed(doc as never, shown.record[field.name]);
                return one?.sid
                  ? {
                      host: editor,
                      sid: String(one.sid),
                      /*
                       * And **home again**: the session edits a copy in a store of its own, so what
                       * it changes has to be written back into the document the card draws from.
                       * `setRichText` is the host's transaction — see `data-commands.ts`.
                       */
                      onBlocks: (blocks: unknown[]) =>
                        run('setRichText', { nodeId: String(one.sid), blocks })
                    }
                  : undefined;
              })()}
              pages={pages}
              assets={assets}
              onCommit={(value) => run('setDatasetCell', { nodeId: at.sid, row: at.row, field: field.name, value })}
              ariaLabel={`${field.name}`}
              data={{ 'row-cell': field.name }}
            />
          </label>
        ))}

        {/*
          **속성 추가**, in the form — which is where a reader is when they discover a field is
          missing, and where every tool of this kind puts it. It adds a **column**, so the table gets
          it too and every other row gets it empty: one act, and the two views are two views of one
          thing rather than two places to keep in step.
        */}
        {adding ? (
          <AddField
            where="폼"
            onAdd={(named, kind) => run('setDatasetField', { nodeId: at.sid, field: named, kind })}
            onClose={() => setAdding(false)}
          />
        ) : (
          <Button onClick={() => setAdding(true)} data={{ 'add-field': 'form' }}>
            + 속성 추가
          </Button>
        )}
      </div>
    </Drawer>
  );
}
