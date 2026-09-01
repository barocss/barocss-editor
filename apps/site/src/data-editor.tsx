import { useMemo, useState } from 'react';
import type { Editor } from '@barocss/editor-core';
import {
  Button,
  ChoiceSelect,
  Dialog,
  DialogButton,
  Field,
  Icon,
  IconButton,
  PropertyToggle,
  TextField
} from '@barocss/office-ui';

/**
 * The data itself, in a grid.
 *
 * ## Why this is a dialog and not a panel
 *
 * Every other thing a reader edits here is a *block*, and a block is edited beside the page it is
 * on — the rail on one side, the properties on the other, the drawing between them. A dataset is
 * not on the page. It is a resource the page refers to by name, and what it needs is the one shape
 * neither side of the shell can give: **width**. A catalogue is five columns by twenty rows, and a
 * 280px rail draws that as a column of unreadable slivers.
 *
 * So it opens over the page, and closes back to it. That also matches what the act *is*: editing
 * data is a stint, not an adjustment — a reader comes here to fill a table in and leaves.
 *
 * ## What it is careful about
 *
 * Every keystroke here rewrites the dataset's whole `records` array — the cost `data.ts` writes down
 * as the price of rows being an attribute instead of nodes. So every field commits on **blur or
 * Enter** rather than on change, which is what `TextField` already does, and the grid holds no draft
 * state of its own: the document is the value, and one commit is one entry in the history.
 */
export function DataEditor({
  editor,
  run,
  can,
  revision,
  sid,
  onClose
}: {
  editor: Editor;
  run: (name: string, payload?: Record<string, unknown>) => void;
  can: (name: string, payload?: Record<string, unknown>) => boolean;
  /** The document's revision, so the grid redraws when a command lands. */
  revision: number;
  /** Which dataset, or nothing when the editor is closed. */
  sid: string | null;
  onClose: () => void;
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
      fields: ((attrs.fields ?? []) as unknown[]).filter((one): one is string => typeof one === 'string'),
      records: ((attrs.records ?? []) as unknown[]).map((row) => (row ?? {}) as Record<string, unknown>)
    };
  }, [store, sid, revision]);

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
    const column = data.fields.indexOf(field);

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

    const wanted = `${row + step[0]}:${data.fields[column + step[1]] ?? ''}`;
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
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      /*
        The label alone. It was `${label} 데이터`, which reads correctly for `상품 목록` and comes
        out as **새 데이터 데이터** for a dataset a reader has just made — and "새 데이터" is the
        name this product gives one, so the doubling is the common case rather than the odd one.
        What kind of thing this is belongs in the line under the title, where it never doubles.
      */
      title={data.label}
      description={`데이터 · ${data.fields.length}개 열 · ${data.records.length}행`}
      className="st-data-dialog"
      footer={
        <>
          {/*
            Deleting the dataset lives here rather than in the rail's list, because this is the only
            place a reader can see what they would be deleting. It refuses while a list draws it —
            `removeDataset` counts the collections that name it — and the button says so by being
            disabled with a title rather than by failing when pressed.
          */}
          <DialogButton
            variant="secondary"
            disabled={!can('removeDataset', { nodeId: sid })}
            title={can('removeDataset', { nodeId: sid }) ? undefined : '이 데이터를 쓰는 목록이 있습니다'}
            onClick={() => {
              run('removeDataset', { nodeId: sid });
              onClose();
            }}
          >
            데이터 삭제
          </DialogButton>
          <DialogButton variant="primary" onClick={onClose}>
            닫기
          </DialogButton>
        </>
      }
    >
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
                  <th key={field} scope="col">
                    <span className="st-data-col">
                      {/*
                        The column's name **is** the control. A rename rewrites the key in every row
                        (`setDatasetField`), which is the one thing about this grid that is not
                        obvious — so it is done in the place a reader would try it.
                      */}
                      <TextField
                        value={field}
                        onCommit={(value) => {
                          if (value !== field) run('setDatasetField', { nodeId: sid, field, rename: value });
                        }}
                        ariaLabel={`${field} 열 이름`}
                        data={{ 'column': field }}
                      />
                      <IconButton
                        label={`${field} 열 삭제`}
                        size="sm"
                        disabled={data.fields.length <= 1}
                        onClick={() => run('setDatasetField', { nodeId: sid, field, remove: true })}
                        data={{ 'column-remove': field }}
                      >
                        <Icon name="delete" size={12} />
                      </IconButton>
                    </span>
                  </th>
                ))}
                <th scope="col" className="st-data-add">
                  {adding ? (
                    <TextField
                      value=""
                      placeholder="열 이름"
                      ariaLabel="새 열 이름"
                      onCommit={(value) => {
                        setAdding(false);
                        const named = value.trim();
                        if (named) run('setDatasetField', { nodeId: sid, field: named });
                      }}
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
                <tr key={index} data-row={index}>
                  <th scope="row" className="st-data-rownum">
                    {index + 1}
                  </th>
                  {data.fields.map((field) => (
                    <td key={field}>
                      <TextField
                        value={String(row[field] ?? '')}
                        onCommit={(value) => run('setDatasetCell', { nodeId: sid, row: index, field, value })}
                        onKeys={(event) => moveCell(event, index, field)}
                        ariaLabel={`${index + 1}행 ${field}`}
                        data={{ 'cell': `${index}:${field}` }}
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
    </Dialog>
  );
}
