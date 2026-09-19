import { DatabaseBulkActions, navigateDatabaseCell } from './database-bulk-ui';
import { DatabaseCSVControl } from './database-csv-ui';
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@barocss/editor-core';
import { useEditorRevision } from '@barocss/office-editor-ui';
import { DataTable, DataTableRow, DataTableCell, EmptyState, PropertyToggle, Icon, Button, ChoiceSelect, TextField, TipProvider, SidePeek } from '@barocss/office-ui';
import { type DataField } from '@barocss/schema';
import { getNoteDatabase, getNoteDatabaseSourceOptions, getNoteDatabaseCommandError, noteDatabaseRows } from './database';
import { DatabaseFieldEditor, DATABASE_FIELD_KINDS as FIELD_KINDS } from './database-field-editor';
import { getNoteDatabaseViews } from './database-views';
import { DatabaseViewTabs, DatabaseVisibleProperties } from './database-views-ui';
import { DatabaseGallery, DatabaseCalendar } from './database-layouts';
import { DatabaseFilterEditor, DatabaseSortEditor, countDatabaseFilters } from './database-query-ui';
import './database.css';
import { DatabaseItemPage, DatabaseItemActions, DatabaseProperty } from './database-item-page';

type DatabaseTarget = { id: string; element: HTMLElement; mount: HTMLElement };

/** React owns only the chrome placeholder; the editor owns the database model and history. */
export function NoteDatabases({ editor, scope, active = true, renderItemBody, revealItem }: {
  editor: Editor; scope: RefObject<HTMLElement | null>; active?: boolean; revealItem?: { source: string; rowId: string }; renderItemBody?: (nodeId: string, row: number) => ReactNode;
}) {
  const revision = useEditorRevision(editor);
  const [targets, setTargets] = useState<DatabaseTarget[]>([]);
  const [activeItem, setActiveItem] = useState<{ nodeId: string; row: number }>();
  useEffect(() => { setActiveItem(undefined); }, [editor, active]);
  const mounts = useRef(new Map<string, HTMLElement>());
  useEffect(() => () => { for (const mount of mounts.current.values()) mount.remove(); mounts.current.clear(); }, []);
  useEffect(() => {
    const host = scope.current;
    if (!host || !active) { for (const mount of mounts.current.values()) mount.remove(); mounts.current.clear(); setTargets([]); return; }
    const sync = () => {
      const next = [...host.querySelectorAll<HTMLElement>('[data-note-database]')].flatMap(element => {
        const id = element.closest('[data-bc-sid]')?.getAttribute('data-bc-sid');
        if (!id || !editor.dataStore.getNode(id)) return [];
        let mount = mounts.current.get(id);
        if (!mount) {
          mount = element.ownerDocument.createElement('div');
          mount.dataset.noteDatabaseMount = id;
          mount.contentEditable = 'false';
          let focused: HTMLElement | null = null;
          mount.addEventListener('focusin', event => { focused = event.target as HTMLElement; });
          mount.addEventListener('focusout', () => { focused = null; });
          // Removal does not dispatch blur; intentional blur clears this remembered control.
          mount.addEventListener('note-database-reattached', () => {
            if (!focused || element.ownerDocument.activeElement !== element.ownerDocument.body) return;
            const label = focused.getAttribute('aria-label');
            const replacement = focused.isConnected ? focused : [...mount!.querySelectorAll<HTMLElement>('[aria-label]')].find(control => control.getAttribute('aria-label') === label);
            replacement?.focus({ preventScroll: true });
          });
          mounts.current.set(id, mount);
        }
        // The DOM renderer sweeps foreign direct children. Reattach our intact island,
        // never individual React children: their ownership and input state remain React's.
        if (mount.parentElement !== element) element.append(mount);
        mount.dispatchEvent(new Event('note-database-reattached'));
        return [{ id, element, mount }];
      });
      const present = new Set(next.map(target => target.id));
      for (const [id, mount] of mounts.current) if (!present.has(id)) { mount.remove(); mounts.current.delete(id); }
      setTargets(previous => previous.length === next.length && previous.every((target, i) => target.id === next[i].id && target.element === next[i].element) ? previous : next);
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(host, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [editor, scope, active, revision]);
  const revealedItem = useRef<typeof revealItem>(undefined);
  useEffect(() => {
    if (!revealItem || revealItem === revealedItem.current) return;
    const target = targets.find(target => editor.dataStore.getNode(target.id)?.attributes?.source === revealItem.source);
    const source = getNoteDatabaseSourceOptions(editor).find(source => source.source === revealItem.source);
    const row = source?.rowIds.indexOf(revealItem.rowId) ?? -1;
    if (target && row >= 0) { revealedItem.current = revealItem; setActiveItem({ nodeId: target.id, row }); }
  }, [editor, targets, revealItem]);
  return <>{targets.map(target => createPortal(<DatabaseCard editor={editor} nodeId={target.id} renderItemBody={renderItemBody} onOpenRelated={(source, rowId) => {
    const related = targets.find(target => editor.dataStore.getNode(target.id)?.attributes?.source === source);
    const data = getNoteDatabaseSourceOptions(editor).find(item => item.source === source);
    const row = data?.rowIds.indexOf(rowId) ?? -1;
    if (!related || row < 0) return false;
    setActiveItem({ nodeId: related.id, row }); return true;
  }} editingRow={activeItem?.nodeId === target.id ? activeItem.row : undefined} onRowChange={row => setActiveItem(previous => row === undefined ? (previous?.nodeId === target.id ? undefined : previous) : { nodeId: target.id, row })} />, target.mount, target.id))}</>;
}

const NONE = '__note_no_field__';
const fieldLabel = (field: DataField) => field.label || field.name;

function DatabaseCard({ editor, nodeId, renderItemBody, editingRow, onOpenRelated, onRowChange: setEditingRow }: { editor: Editor; nodeId: string; renderItemBody?: (nodeId: string, row: number) => ReactNode; editingRow?: number; onOpenRelated: (source: string, rowId: string) => boolean; onRowChange: (row: number | undefined) => void }) {
  useEditorRevision(editor);
  const db = getNoteDatabase(editor, nodeId);
  const [settings, setSettings] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const visibleIds = db ? noteDatabaseRows(db).map(row => db.rowIds[row.index]).filter(Boolean) : [];
  const visibleKey = visibleIds.join(',');
  useEffect(() => setSelectedIds(ids => ids.filter(id => visibleIds.includes(id))), [visibleKey]);
  const selectedRows = selectedIds.filter(id => visibleIds.includes(id));
  const toggleRow = (id: string) => setSelectedIds(ids => ids.includes(id) ? ids.filter(value => value !== id) : [...ids, id]);
  const [editingField, setEditingField] = useState<string>();
  const [fieldAnchor, setFieldAnchor] = useState<HTMLElement | null>(null);
  const [expanded, setExpanded] = useState(false);
  const openField = (name: string, anchor?: HTMLElement) => { setFieldAnchor(anchor ?? document.activeElement as HTMLElement); setEditingField(name); };
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  const queue = useRef(Promise.resolve());
  const pending = useRef(0);
  const execute = (command: string, payload: Record<string, unknown>): Promise<boolean> => {
    pending.current += 1; setBusy(true);
    const task = queue.current.then(async () => {
      const target = { nodeId, ...payload };
      if (!editor.canExecuteCommand(command, target)) { setProblem(getNoteDatabaseCommandError(editor, command, target) ?? '이 변경을 적용할 수 없습니다. 필드 이름이나 입력값을 확인하세요.'); return false; }
      setProblem('');
      try {
        const result = await editor.executeCommand(command, target);
        if (!result) setProblem('변경을 적용하지 못했습니다. 값을 확인하고 다시 시도하세요.');
        return !!result;
      } catch { setProblem('변경을 적용하지 못했습니다. 다시 시도하세요.'); return false; }
    });
    queue.current = task.then(() => { pending.current -= 1; if (!pending.current) setBusy(false); });
    return task;
  };
  if (!db) return <div className="ondb-empty" role="status">연결된 데이터를 찾을 수 없습니다.</div>;
  const view = (patch: Record<string, unknown>) => void execute('setNoteDatabaseView', patch);
  const rows = noteDatabaseRows(db);
  const sources = getNoteDatabaseSourceOptions(editor);
  const field = db.fields.find(field => field.name === editingField);
  const titleField = db.fields.find(field => field.kind === 'text');
  const savedViews = getNoteDatabaseViews(editor, nodeId);
  const hiddenFields = savedViews.views.find(view => view.id === savedViews.activeId)?.hiddenFields ?? [];
  const visibleFields = db.fields.filter(field => !hiddenFields.includes(field.name));
  const fieldOptions = [{ id: NONE, label: '없음' }, ...db.fields.map(field => ({ id: field.name, label: fieldLabel(field) }))];
  const editable = editor.canExecuteCommand('insertNoteDatabaseRow', { nodeId });
  const disabled = busy || !editable;
  const addField = async (anchor: HTMLElement) => {
    let index = db.fields.length + 1;
    while (db.fields.some(field => field.name === `필드 ${index}`)) index += 1;
    const name = `필드 ${index}`;
    if (await execute('setNoteDatabaseField', { field: name, kind: 'text' })) openField(name, anchor);
  };
  const cell = (row: number, record: Record<string, unknown>, field: DataField) => <DatabaseProperty
    field={field} value={record[field.name]} rawValue={db.records[row]?.[field.name]} error={db.errors[row]?.[field.name]} sources={sources} onOpenRelated={onOpenRelated} label={`행 ${row + 1} · ${fieldLabel(field)}`} disabled={!editable}
    commit={value => execute('setNoteDatabaseCell', { row, field: field.name, value })} />;
  const groups = new Map<string, typeof rows>();
  const groupedField = db.fields.find(field => field.name === db.groupBy);
  if (groupedField?.kind === 'choice') for (const option of groupedField.options ?? []) groups.set(option, []);
  for (const row of rows) {
    const key = db.groupBy ? String(row.record[db.groupBy] ?? '') : '';
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  if (!groups.size) groups.set('', []);
  return <TipProvider><section className="ondb" data-note-database-ui={nodeId} aria-label={db.label || '데이터베이스'} contentEditable={false}
    onPointerDown={event => event.stopPropagation()} onMouseDown={event => event.stopPropagation()} onKeyDown={event => {
      if (event.defaultPrevented || (event.target instanceof Element && event.target.closest('[data-db-item-body]'))) return;
      event.stopPropagation();
      if (!(event.metaKey || event.ctrlKey) || event.nativeEvent.isComposing) return;
      const key = event.key.toLowerCase();
      if (key !== 'z' && key !== 'y') return;
      const target = event.target;
      // An uncommitted input draft belongs to native input undo. Otherwise undo the dataset transaction.
      if ((target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) && target.value !== target.defaultValue && !['checkbox', 'button'].includes(target.type)) return;
      event.preventDefault();
      const owner = event.currentTarget;
      const label = target instanceof HTMLElement ? target.getAttribute('aria-label') : null;
      void (key === 'y' || event.shiftKey ? editor.redo() : editor.undo()).then(() => {
        // History restores document selection. Keep keyboard ownership in the database
        // so the immediately following redo edits this same committed cell.
        if (label) requestAnimationFrame(() => {
          const control = [...document.querySelectorAll<HTMLElement>('[aria-label]')].find(control => control.getAttribute('aria-label') === label && (owner.contains(control) || control.closest('.ondb-peek')));
          control?.focus({ preventScroll: true });
        });
      });
    }}>
    <div className="ondb-header">
      <TextField ariaLabel="데이터베이스 이름" value={db.label} disabled={disabled} onCommit={label => view({ label })} />
      <DatabaseCSVControl editor={editor} nodeId={nodeId} disabled={disabled} />
      <span className="ondb-count">{rows.length}개 항목{rows.length !== db.records.length ? ` / 전체 ${db.records.length}` : ''}</span>
      <Button tone="quiet" ariaLabel="데이터베이스 보기 설정" onClick={() => setSettings(value => !value)}>보기 설정</Button>
    </div>
    <DatabaseViewTabs editor={editor} nodeId={nodeId} disabled={disabled} />
    {problem && <div role="alert" className="ondb-error">{problem}</div>}
    {settings && <div className="ondb-settings" aria-label="데이터베이스 보기 설정">
      <div className="ondb-settings-row"><span className="ondb-settings-label">레이아웃</span>
        <div className="ondb-views" role="group" aria-label="데이터베이스 보기">
          <Button pressed={db.view === 'table'} disabled={disabled} onClick={() => view({ view: 'table' })}>테이블</Button>
          <Button pressed={db.view === 'board'} disabled={disabled} onClick={() => view({ view: 'board', groupBy: db.groupBy || db.fields.find(field => field.kind === 'choice')?.name || db.fields[0]?.name || '' })}>보드</Button>
          <Button pressed={db.view === 'gallery'} disabled={disabled} onClick={() => view({ view: 'gallery' })}>갤러리</Button>
          <Button pressed={db.view === 'calendar'} disabled={disabled} onClick={() => view({ view: 'calendar', dateField: db.dateField || db.fields.find(field => field.kind === 'date')?.name || '' })}>캘린더</Button>
        </div>
        <DatabaseVisibleProperties fields={db.fields} hidden={hiddenFields} disabled={disabled} onChange={hiddenFields => view({ hiddenFields })} />
      </div>
      <div className="ondb-settings-row"><span className="ondb-settings-label">필터</span>
        {!db.filters && <><ChoiceSelect ariaLabel="필터 필드" value={db.where || NONE} options={fieldOptions} disabled={disabled} onChange={value => view({ where: value === NONE ? '' : value, equals: '' })} />
        {db.where && <TextField ariaLabel="필터 값" value={String(db.equals ?? '')} disabled={disabled} placeholder="값과 일치하는 항목" onCommit={equals => view({ equals })} />}</>}
        <DatabaseFilterEditor fields={db.fields} filters={db.filters} where={db.where} equals={db.equals} disabled={disabled} onApply={filters => execute('setNoteDatabaseView', { filters, where: '', equals: '' })} />
      </div>
      <div className="ondb-settings-row"><span className="ondb-settings-label">정렬</span>
        {!db.sorts && <><ChoiceSelect ariaLabel="정렬 필드" value={db.sortBy || NONE} options={fieldOptions} disabled={disabled} onChange={value => view({ sortBy: value === NONE ? '' : value })} />
        {db.sortBy && <ChoiceSelect ariaLabel="정렬 방향" value={db.sortDir} options={[{ id: 'asc', label: '오름차순' }, { id: 'desc', label: '내림차순' }]} disabled={disabled} onChange={sortDir => view({ sortDir })} />}</>}
        <DatabaseSortEditor fields={db.fields} sorts={db.sorts} sortBy={db.sortBy} sortDir={db.sortDir} disabled={disabled} onApply={sorts => execute('setNoteDatabaseView', { sorts, sortBy: '' })} />
      </div>
      {db.view === 'board' && <div className="ondb-settings-row"><span className="ondb-settings-label">그룹</span>
        <ChoiceSelect ariaLabel="그룹 필드" value={db.groupBy || NONE} options={fieldOptions} disabled={disabled} onChange={value => view({ groupBy: value === NONE ? '' : value })} />
      </div>}
      {db.view === 'gallery' && <div className="ondb-settings-row"><span className="ondb-settings-label">카드</span>
        <ChoiceSelect ariaLabel="카드 미리보기" value={db.cardPreview} options={[{ id: 'content', label: '본문 미리보기' }, { id: 'none', label: '미리보기 없음' }]} disabled={disabled} onChange={cardPreview => view({ cardPreview })} />
        <ChoiceSelect ariaLabel="카드 크기" value={db.cardSize} options={[{ id: 'small', label: '작게' }, { id: 'medium', label: '보통' }, { id: 'large', label: '크게' }]} disabled={disabled} onChange={cardSize => view({ cardSize })} />
      </div>}
      {db.view === 'calendar' && <div className="ondb-settings-row"><span className="ondb-settings-label">날짜</span>
        {db.fields.some(field => field.kind === 'date') ? <ChoiceSelect ariaLabel="캘린더 날짜 속성" value={db.dateField} options={db.fields.filter(field => field.kind === 'date').map(field => ({ id: field.name, label: fieldLabel(field) }))} disabled={disabled} onChange={dateField => view({ dateField })} /> : <span>날짜 유형의 속성을 추가하세요.</span>}
      </div>}
    </div>}
    {field && <DatabaseFieldEditor key={field.name} field={field} fields={db.fields} sources={sources} sourceName={db.source} anchor={fieldAnchor} disabled={disabled} error={problem}
      onUpdate={patch => execute('setNoteDatabaseField', { field: field.name, ...patch })} onRename={setEditingField} onClose={() => setEditingField(undefined)} />}
    {editingRow !== undefined && db.records[editingRow] && <SidePeek open onOpenChange={open => { if (!open) setEditingRow(undefined); }} title="데이터베이스 항목" breadcrumb={db.label} expanded={expanded} onExpandedChange={setExpanded} className="ondb-peek" actions={<DatabaseItemActions
      previous={rows.findIndex(row => row.index === editingRow) > 0 ? () => setEditingRow(rows[rows.findIndex(row => row.index === editingRow) - 1].index) : undefined}
      next={rows.findIndex(row => row.index === editingRow) >= 0 && rows.findIndex(row => row.index === editingRow) < rows.length - 1 ? () => setEditingRow(rows[rows.findIndex(row => row.index === editingRow) + 1].index) : undefined}
      onDuplicate={() => void execute('duplicateNoteDatabaseRow', { row: editingRow })}
      onRemove={() => { void execute('removeNoteDatabaseRow', { row: editingRow }).then(ok => { if (ok) setEditingRow(undefined); }); }} />}>
      <DatabaseItemPage key={editingRow} row={editingRow} record={db.records[editingRow]} computedRecord={db.computedRecords[editingRow]} errors={db.errors[editingRow]} sources={sources} onOpenRelated={onOpenRelated} fields={db.fields} disabled={!editable} commit={(field, value) => execute('setNoteDatabaseCell', { row: editingRow, field, value })} onAddField={anchor => void addField(anchor)} onEditField={openField}>{renderItemBody?.(nodeId, editingRow)}</DatabaseItemPage>
    </SidePeek>}
    {db.view === 'table' && <DatabaseBulkActions sources={sources} onEditField={openField} db={db} ids={selectedRows} disabled={disabled} execute={execute} onClear={() => setSelectedIds([])} />}
    {db.view === 'table' ? <div className="ondb-content"><DataTable onPaste={event => {
      const target = event.target as HTMLElement;
      if (target.closest('input,textarea,[role="menu"],[role="listbox"]') || target.isContentEditable) return;
      const at = target.closest<HTMLTableCellElement>('td[data-db-field]');
      if (!at || !event.clipboardData.types.includes('text/plain')) return;
      event.preventDefault(); event.stopPropagation();
      const row = Number(at.parentElement?.getAttribute('data-db-record'));
      const start = rows.findIndex(item => item.index === row);
      const column = visibleFields.findIndex(field => field.name === at.dataset.dbField);
      if (start < 0 || column < 0) return;
      const table = event.currentTarget;
      void execute('pasteNoteDatabaseRange', { rowIds: rows.slice(start).map(item => db.rowIds[item.index]), fieldNames: visibleFields.slice(column).map(field => field.name), text: event.clipboardData.getData('text/plain') }).then(ok => {
        if (ok) requestAnimationFrame(() => table.querySelectorAll<HTMLTableRowElement>('tbody tr')[start]?.querySelectorAll<HTMLTableCellElement>('td[data-db-field]')[column]?.querySelector<HTMLElement>('button:not(:disabled),[tabindex="0"]')?.focus({ preventScroll: true }));
      });
    }} onKeyDown={navigateDatabaseCell} className="ondb-table" aria-label={`${db.label} 데이터 테이블`}>
      <thead><tr><th scope="col" data-row-control><PropertyToggle ariaLabel="보이는 행 전체 선택" disabled={disabled || !visibleIds.length} value={selectedRows.length === 0 ? false : selectedRows.length === visibleIds.length ? true : null} onChange={value => setSelectedIds(value ? visibleIds : [])} /></th>{!titleField && <th scope="col">항목</th>}{visibleFields.map(field => <th key={field.name} scope="col"><button type="button" className="ondb-field-button" aria-label={`${fieldLabel(field)} 필드 편집`} onClick={event => openField(field.name, event.currentTarget)}>{fieldLabel(field)} <span className="ondb-field-type">{FIELD_KINDS.find(kind => kind.id === field.kind)?.label ?? field.kind}</span></button></th>)}</tr></thead>
      <tbody>{rows.map(({ index, record }) => <DataTableRow key={db.rowIds[index] || index} data-db-record={index} selected={selectedRows.includes(db.rowIds[index])}><td data-row-control><PropertyToggle ariaLabel={`행 ${index + 1} 선택`} value={selectedRows.includes(db.rowIds[index])} disabled={disabled || !db.rowIds[index]} onChange={() => toggleRow(db.rowIds[index])} /></td>{!titleField && <td><button type="button" className="ondb-title-link" aria-label={`행 ${index + 1} 열기`} onClick={() => setEditingRow(index)}>항목 {index + 1} 열기</button></td>}{visibleFields.map(field => <DataTableCell key={field.name} data-db-field={field.name} numeric={field.kind === 'number' || typeof record[field.name] === 'number'} readOnly={field.kind === 'formula' || field.kind === 'rollup'} invalid={!!db.errors[index]?.[field.name]}>{field === titleField ? <button type="button" className="ondb-title-link" aria-label={`행 ${index + 1} 열기`} onClick={() => setEditingRow(index)}>{String(record[field.name] || '제목 없음')}</button> : cell(index, record, field)}</DataTableCell>)}</DataTableRow>)}</tbody>
    </DataTable>{!rows.length && <EmptyState title={db.where || countDatabaseFilters(db.filters) ? '필터에 맞는 항목이 없습니다.' : '첫 번째 항목을 추가하세요.'} />}</div> : db.view === 'gallery' ? <DatabaseGallery editor={editor} nodeId={nodeId} rows={rows} fields={visibleFields} titleField={titleField} cardSize={db.cardSize} cardPreview={db.cardPreview} renderProperty={cell} onOpenRow={setEditingRow} onInsert={values => execute('insertNoteDatabaseRow', { values })} disabled={disabled} /> : db.view === 'calendar' ? <DatabaseCalendar rows={rows} fields={db.fields} titleField={titleField} dateField={db.dateField} onOpenRow={setEditingRow} onInsert={values => execute('insertNoteDatabaseRow', { values })} onCellChange={(row, field, value) => execute('setNoteDatabaseCell', { row, field, value })} disabled={disabled} /> : <div className="ondb-board" aria-label={`${db.label} 데이터 보드`}>
      {[...groups].map(([group, records]) => <section className="ondb-column" key={group} aria-label={`${group || '미지정'} 그룹`}>
        <h4>{group || '미지정'} <span>{records.length}</span></h4>
        {records.map(({ index, record }) => <article key={index} className="ondb-record" data-db-record={index}><button type="button" className="ondb-title-link" aria-label={`행 ${index + 1} 열기`} onClick={() => setEditingRow(index)}>{String(record[titleField?.name ?? ''] || '제목 없음')}</button>{visibleFields.filter(field => field !== titleField).map(field => <div key={field.name} className="ondb-card-property" data-db-field={field.name}><span>{fieldLabel(field)}</span>{cell(index, record, field)}</div>)}</article>)}
        {(!groupedField || !['formula', 'rollup', 'relation', 'choices'].includes(groupedField.kind)) && <Button tone="quiet" disabled={disabled} ariaLabel={`${group || '미지정'} 그룹에 항목 추가`} onClick={() => void execute('insertNoteDatabaseRow', { ...(db.groupBy ? { values: { [db.groupBy]: group } } : {}) })}>항목 추가</Button>}
      </section>)}
    </div>}
    <div className="ondb-footer"><Button tone="quiet" disabled={disabled} onClick={() => void execute('insertNoteDatabaseRow', {})}>새 항목</Button><Button tone="quiet" disabled={disabled} onClick={event => void addField(event.currentTarget)}>필드 추가</Button>{db.view !== 'table' && <ChoiceSelect ariaLabel="편집할 필드" value={editingField ?? NONE} options={[{ id: NONE, label: '필드 편집' }, ...db.fields.map(field => ({ id: field.name, label: fieldLabel(field) }))]} onChange={value => value === NONE ? setEditingField(undefined) : openField(value)} />}</div>
  </section></TipProvider>;
}
