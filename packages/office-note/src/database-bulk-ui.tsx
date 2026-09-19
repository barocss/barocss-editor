import { useState } from 'react';
import { Button, Choice } from '@barocss/office-ui';
import type { NoteDatabase } from './database';
import type { DatabaseSourceOption } from './database-advanced-value';
import { DatabaseProperty } from './database-item-page';

export function DatabaseBulkActions({ db, ids, disabled, execute, onClear, sources, onEditField }: {
  sources: DatabaseSourceOption[]; onEditField: (field: string, anchor: HTMLElement) => void;
  db: NoteDatabase; ids: string[]; disabled: boolean;
  execute: (command: string, payload: Record<string, unknown>) => Promise<boolean>; onClear: () => void;
}) {
  const [name, setName] = useState(''), [draft, setDraft] = useState<unknown>(''), [hasDraft, setHasDraft] = useState(false);
  const [mode, setMode] = useState('replace');
  const fields = db.fields.filter(field => field.kind !== 'richText');
  const field = fields.find(field => field.name === name);
  const computed = field?.kind === 'formula' || field?.kind === 'rollup';
  const collection = field?.kind === 'choices' || field?.kind === 'relation';
  if (!ids.length) return null;
  return <div className="ondb-bulk" role="group" aria-label="선택한 행 일괄 작업">
    <span>{ids.length}개 선택</span>
    <Choice ariaLabel="일괄 변경 필드" value={name} onChange={value => { setName(value); setDraft(['relation', 'choices'].includes(fields.find(field => field.name === value)?.kind ?? '') ? [] : ''); setHasDraft(false); setMode('replace'); }}>
      <option value="">속성 선택</option>{fields.map(field => <option key={field.name} value={field.name}>{field.label || field.name}</option>)}
    </Choice>
    {field && !computed && <DatabaseProperty key={field.name} field={field} sources={sources} value={draft} label="일괄 변경 값" disabled={disabled} commit={value => { setDraft(value); setHasDraft(true); }} />}
    {collection && <Choice ariaLabel="일괄 선택 적용 방식" value={mode} onChange={setMode}><option value="replace">선택한 값으로 교체</option>{field?.relation?.multiple !== false && <option value="add">기존 값에 추가</option>}<option value="remove">기존 값에서 제거</option></Choice>}
    {computed && <><span>계산 설정은 이 속성의 모든 행에 적용됩니다.</span><Button disabled={disabled} onClick={event => onEditField(name, event.currentTarget)}>계산 설정 열기</Button></>}
    <Button disabled={disabled || !field || computed || !hasDraft} onClick={() => void execute('batchNoteDatabaseRows:set', { rowIds: ids, field: name, value: draft, mode })}>선택 행에 적용</Button>
    <Button tone="quiet" disabled={disabled} onClick={() => void execute('batchNoteDatabaseRows:remove', { rowIds: ids }).then(ok => { if (ok) onClear(); })}>선택 행 삭제</Button>
    <Button tone="quiet" onClick={onClear}>선택 해제</Button>
  </div>;
}

/** Arrow navigation only owns display cells. Inputs and popup editors retain their native keys. */
export function navigateDatabaseCell(event: React.KeyboardEvent<HTMLTableElement>) {
  if (event.defaultPrevented || event.nativeEvent.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  const target = event.target as HTMLElement;
  if (target.isContentEditable || target.closest('input,textarea,select,[role="listbox"],[role="menu"]')) return;
  const cell = target.closest<HTMLTableCellElement>('td[data-db-field]');
  if (!cell || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
  const rows = [...event.currentTarget.tBodies[0].rows], row = cell.parentElement as HTMLTableRowElement;
  const rowIndex = rows.indexOf(row), cells = [...row.querySelectorAll<HTMLTableCellElement>('td[data-db-field]')], column = cells.indexOf(cell);
  const nextRow = rowIndex + (event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0);
  const nextColumn = column + (event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0);
  const next = rows[nextRow]?.querySelectorAll<HTMLTableCellElement>('td[data-db-field]')[nextColumn];
  const control = next?.querySelector<HTMLElement>('button:not(:disabled),[tabindex="0"]');
  if (control) { event.preventDefault(); event.stopPropagation(); control.focus(); }
}
