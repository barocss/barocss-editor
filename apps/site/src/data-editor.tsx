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
      fields: ((attrs.fields ?? []) as unknown[]).filter((one): one is string => typeof one === 'string'),
      records: ((attrs.records ?? []) as unknown[]).map((row) => (row ?? {}) as Record<string, unknown>)
    };
  }, [store, sid, revision]);

  if (!sid || !data) return null;
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
              {/*
                Nothing fetches this, and that is the design rather than an omission (`data.ts`):
                the document keeps the address and the handful of rows a reader designs against.
                Said in the panel too, because a reader typing an address into a box that does
                nothing deserves to be told which half of the job it is doing.
              */}
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
          <p className="st-data-note">아래 행은 디자인용 미리보기입니다. 게시된 페이지가 주소에서 받아옵니다.</p>
        ) : null}

        {/*
          A table, and a real one: a grid of divs would leave a screen reader with a wall of text
          where every cell needs its column read out beside it. `scope="col"` is what makes 가격
          the *name* of the cell rather than a word above it.
        */}
        <div className="st-data-scroll">
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
