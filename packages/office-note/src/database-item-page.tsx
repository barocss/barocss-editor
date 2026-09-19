import { DatabaseMultiChoice } from './database-multi-choice';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { FloatingSurface, Icon, IconButton, MenuAction, TextField } from '@barocss/office-ui';
import type { DataField } from '@barocss/schema';
import { DatabaseComputedValue, DatabaseRelationValue, type AdvancedValueProps, type DatabaseSourceOption } from './database-advanced-value';

const labelOf = (field: DataField) => field.label || field.name;
const plain = (value: unknown) => value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
export const databaseFieldIcon = (field: DataField) => `type-${field.kind === 'relation' ? 'url' : field.kind === 'rollup' || field.kind === 'formula' ? 'number' : field.kind === 'boolean' ? 'check' : field.kind === 'longText' ? 'long-text' : field.kind === 'richText' ? 'rich-text' : field.kind}`;

export function DatabaseValue({ field, value }: { field: DataField; value: unknown }) {
  if (field.kind === 'boolean') return <span className="ondb-check" data-checked={value === true}><Icon name={value === true ? 'chosen' : 'type-check'} /></span>;
  if (value === '' || value === null || value === undefined) return <span className="ondb-value-empty">비어 있음</span>;
  if (field.kind === 'choice') return <span className="ondb-status" data-tone={Math.max(0, (field.options ?? []).indexOf(String(value))) % 5}>{String(value)}</span>;
  return <span className="ondb-value-text">{plain(value)}</span>;
}

/** Property values remain readable until the reader chooses to change one. */
export function DatabaseProperty({ field, value, label, disabled, commit, rawValue, error, sources, onOpenRelated }: {
  field: DataField; value: unknown; label: string; disabled: boolean; commit: (value: unknown) => void | Promise<boolean>;
} & AdvancedValueProps) {
  const [editing, setEditing] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const returnFocus = useRef(false);
  useEffect(() => { if (editing && field.kind !== 'choice') box.current?.querySelector<HTMLInputElement>('input')?.focus(); }, [editing, field.kind]);
  useEffect(() => { if (!editing && returnFocus.current) { returnFocus.current = false; trigger.current?.focus({ preventScroll: true }); } }, [editing]);
  const done = (value: unknown) => { commit(value); setEditing(false); };
  if (field.kind === 'choices') return <DatabaseMultiChoice field={field} value={value} label={label} disabled={disabled} commit={commit} />;
  if (field.kind === 'formula' || field.kind === 'rollup') return <DatabaseComputedValue value={value} label={label} error={error} />;
  if (field.kind === 'relation') return <DatabaseRelationValue field={field} rawValue={rawValue ?? value} label={label} disabled={disabled} commit={commit} sources={sources} onOpenRelated={onOpenRelated} error={error} />;
  if (editing && field.kind !== 'choice') return <div ref={box} data-cell-editor className="ondb-property-input" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setEditing(false); }}><TextField ariaLabel={label} value={plain(value)} type={field.kind === 'number' && (plain(value) === '' || Number.isFinite(Number(value))) ? 'number' : field.kind === 'date' && (plain(value) === '' || /^\d{4}-\d{2}-\d{2}$/.test(plain(value))) ? 'date' : 'text'} onCommit={done} onKeys={event => { if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return; if (event.key === 'Enter' || event.key === 'Escape') { returnFocus.current = true; setEditing(false); } }} /></div>;
  return <><button ref={trigger} type="button" className="ondb-property-value" aria-label={label} disabled={disabled} onClick={() => field.kind === 'boolean' ? commit(value !== true) : setEditing(true)}><DatabaseValue field={field} value={value} /></button>
    {editing && field.kind === 'choice' && <FloatingSurface open at={trigger.current?.getBoundingClientRect() ?? null} variant="menu" role="listbox" aria-label={`${label} 선택`} prefer="below" align="start" className="ondb-choice-menu" focusOnOpen onDismiss={() => setEditing(false)} ownedElements={[trigger]} onKeyDown={event => {
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      const options = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="option"]')];
      const at = options.indexOf(document.activeElement as HTMLElement);
      options[event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (at + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length]?.focus();
    }}>
      {['', ...new Set([...(field.options ?? []), ...(plain(value) ? [plain(value)] : [])])].map(option => <MenuAction key={option} role="option" aria-selected={plain(value) === option} selected={plain(value) === option} onClick={() => { returnFocus.current = true; done(option); }}>{option ? <DatabaseValue field={field} value={option} /> : '비어 있음'}</MenuAction>)}
    </FloatingSurface>}
  </>;
}

export function DatabaseItemPage({ row, record, computedRecord, errors, sources, onOpenRelated, fields, disabled, commit, onAddField, onEditField, children }: {
  row: number; record: Record<string, unknown>; computedRecord?: Record<string, unknown>; errors?: Record<string, string>; sources?: DatabaseSourceOption[]; onOpenRelated?: (source: string, rowId: string) => boolean | void; fields: DataField[]; disabled: boolean;
  commit: (field: string, value: unknown) => void | Promise<boolean>; onAddField: (anchor: HTMLElement) => void; onEditField: (field: string, anchor: HTMLElement) => void; children?: ReactNode;
}) {
  const titleField = fields.find(field => field.kind === 'text');
  const title = plain(titleField ? record[titleField.name] : '');
  const [draft, setDraft] = useState(title);
  const titleInput = useRef<HTMLTextAreaElement>(null);
  const cancel = useRef(false);
  useEffect(() => setDraft(title), [title]);
  useEffect(() => { const input = titleInput.current; if (input) { input.style.height = '0px'; input.style.height = `${input.scrollHeight}px`; } }, [draft]);
  return <article className="ondb-item-page" data-db-row-drawer={row} data-db-item-page={row}>
    {titleField ? <textarea ref={titleInput} rows={1} className="ondb-page-title" aria-label={`항목 · ${labelOf(titleField)}`} placeholder="제목 없음" value={draft} disabled={disabled}
      onChange={event => setDraft(event.target.value)} onBlur={() => { if (cancel.current) { cancel.current = false; return; } if (draft !== title) commit(titleField.name, draft); }}
      onKeyDown={event => { if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return; if (event.key === 'Escape') { cancel.current = true; setDraft(title); event.currentTarget.blur(); event.stopPropagation(); } else if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.blur(); } }} /> : <h1 className="ondb-page-title">제목 없음</h1>}
    <div className="ondb-page-properties">{fields.filter(field => field !== titleField).map(field => <div className="ondb-page-property" key={field.name}>
      <button className="ondb-property-name" type="button" onClick={event => onEditField(field.name, event.currentTarget)} aria-label={`${labelOf(field)} 속성 설정`}><Icon name={databaseFieldIcon(field)} /><span>{labelOf(field)}</span></button>
      <DatabaseProperty field={field} value={(computedRecord ?? record)[field.name]} rawValue={record[field.name]} error={errors?.[field.name]} sources={sources} onOpenRelated={onOpenRelated} label={`항목 · ${labelOf(field)}`} disabled={disabled} commit={value => commit(field.name, value)} />
    </div>)}<button type="button" className="ondb-add-property" aria-label="항목에 속성 추가" disabled={disabled} onClick={event => onAddField(event.currentTarget)}><Icon name="add" />속성 추가</button></div>
    <div className="ondb-page-content">{children}</div>
  </article>;
}

export function DatabaseItemActions({ previous, next, onRemove, onDuplicate }: { previous?: () => void; next?: () => void; onRemove: () => void; onDuplicate: () => void }) {
  const [menu, setMenu] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  return <div className="ondb-item-actions"><IconButton label="이전 항목" disabled={!previous} onClick={previous}><Icon name="previous" /></IconButton><IconButton label="다음 항목" disabled={!next} onClick={next}><Icon name="next" /></IconButton>
    <button ref={button} type="button" className="ondb-more" aria-label="항목 메뉴" onClick={() => setMenu(!menu)}><Icon name="more" /></button>
    {menu && <FloatingSurface open at={button.current?.getBoundingClientRect() ?? null} variant="menu" role="menu" aria-label="항목 작업" prefer="below" align="end" onDismiss={() => setMenu(false)} ownedElements={[button]} focusOnOpen><MenuAction role="menuitem" aria-label="열린 항목 복제" onClick={() => { setMenu(false); onDuplicate(); }}><Icon name="duplicate" />항목 복제</MenuAction><MenuAction role="menuitem" aria-label="열린 항목 삭제" onClick={onRemove}><Icon name="delete" />항목 삭제</MenuAction></FloatingSurface>}
  </div>;
}
