import { useRef, useState, type ReactNode } from 'react';
import type { Editor } from '@barocss/editor-core';
import type { INode } from '@barocss/datastore';
import { datasetLocalDay, type DataField } from '@barocss/schema';
import { Button, Icon, IconButton } from '@barocss/office-ui';
import { getNoteDatabaseItemBody } from './database';
import { calendarMonthDays, calendarMonthShift, calendarToday } from './database-calendar';
import './database-layouts.css';

export interface DatabaseLayoutRow { index: number; record: Record<string, unknown> }
interface LayoutProps {
  rows: DatabaseLayoutRow[];
  fields: DataField[];
  titleField?: DataField;
  onOpenRow: (row: number) => void;
  onInsert: (values: Record<string, unknown>) => void | Promise<boolean>;
  disabled: boolean;
}
const titleOf = (row: DatabaseLayoutRow, field?: DataField) => String((field ? row.record[field.name] : '') || `항목 ${row.index + 1}`);
const fieldName = (field: DataField) => field.label || field.name;

/** A short preview of the saved prose, not a second source of editable card content. */
export function databaseGalleryPreview(blocks: readonly INode[]): { text: string; image?: string; alt?: string } {
  const text: string[] = [];
  let image: string | undefined, alt: string | undefined;
  const visit = (node: INode) => {
    if (node.stype === 'resources') return;
    if (typeof node.text === 'string' && node.text) text.push(node.text);
    if (node.stype === 'pageReference' && typeof node.attributes?.title === 'string') text.push(node.attributes.title);
    if (!image && (node.stype === 'picture' || node.stype === 'inline-image')) {
      const src = node.attributes?.src;
      if (typeof src === 'string' && /^(https?:\/\/|blob:|data:image\/(?:png|jpeg|gif|webp|svg\+xml);)/i.test(src)) {
        image = src; alt = typeof node.attributes?.alt === 'string' ? node.attributes.alt : '';
      }
    }
    for (const child of node.content ?? []) if (typeof child !== 'string') visit(child);
  };
  for (const block of blocks) visit(block);
  return { text: text.join(' ').replace(/\uFEFF/g, '').trim().slice(0, 360), image, alt };
}

export function DatabaseGallery({ editor, nodeId, rows, fields, titleField, cardSize = 'medium', cardPreview = 'content', renderProperty, onOpenRow, onInsert, disabled }: LayoutProps & {
  editor: Editor; nodeId: string; cardSize?: 'small' | 'medium' | 'large'; cardPreview?: 'none' | 'content';
  renderProperty: (row: number, record: Record<string, unknown>, field: DataField) => ReactNode;
}) {
  const title = titleField ?? fields.find(field => field.kind === 'text');
  return <div className="ondb-gallery" data-db-gallery data-card-size={cardSize}>
    {rows.map(row => {
      const preview = cardPreview === 'content' ? databaseGalleryPreview(getNoteDatabaseItemBody(editor, nodeId, row.index)) : null;
      return <article className="ondb-gallery-card" key={row.index} data-db-record={row.index} data-db-gallery-row={row.index} onClick={event => {
        if (event.target instanceof Element && !event.target.closest('button,input,textarea,select,a,[role="combobox"]')) onOpenRow(row.index);
      }}>
        {preview && (preview.image || preview.text) && <button type="button" className="ondb-gallery-preview" aria-label={`${titleOf(row, title)} 본문 열기`} onClick={() => onOpenRow(row.index)}>
          {preview.image ? <img src={preview.image} alt={preview.alt || ''} loading="lazy" /> : <p>{preview.text}</p>}
        </button>}
        <div className="ondb-gallery-card-content">
          <button type="button" className="ondb-title-link" aria-label={`행 ${row.index + 1} 열기`} onClick={() => onOpenRow(row.index)}>{titleOf(row, title)}</button>
          {fields.filter(field => field !== title).map(field => <div className="ondb-gallery-property" key={field.name}><span>{fieldName(field)}</span>{renderProperty(row.index, row.record, field)}</div>)}
        </div>
      </article>;
    })}
    <button type="button" className="ondb-gallery-new" aria-label="갤러리에 새 항목" disabled={disabled} onClick={() => void onInsert({})}><Icon name="add" />새 항목</button>
  </div>;
}

export function DatabaseCalendar({ rows, fields, titleField, dateField, onOpenRow, onInsert, onCellChange, disabled }: LayoutProps & {
  dateField?: string;
  onCellChange: (row: number, field: string, value: unknown) => void | Promise<boolean>;
}) {
  const today = calendarToday();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [over, setOver] = useState('');
  const [problem, setProblem] = useState('');
  const [saving, setSaving] = useState(false);
  const dragging = useRef<number | null>(null);
  const working = useRef(false);
  const title = titleField ?? fields.find(field => field.kind === 'text');
  const date = dateField === undefined ? fields.find(field => field.kind === 'date') : fields.find(field => field.name === dateField && field.kind === 'date');
  const days = calendarMonthDays(month);
  const scheduled = new Map<string, DatabaseLayoutRow[]>();
  const unscheduled: DatabaseLayoutRow[] = [];
  for (const row of rows) {
    const day = date ? datasetLocalDay(row.record[date.name]) : '';
    if (!day) unscheduled.push(row); else scheduled.set(day, [...scheduled.get(day) ?? [], row]);
  }
  const move = async (day: string) => {
    const row = dragging.current; dragging.current = null; setOver('');
    if (row === null || !date || disabled || working.current || !datasetLocalDay(day)) return;
    if (datasetLocalDay(rows.find(item => item.index === row)?.record[date.name]) === day) return;
    working.current = true; setSaving(true); setProblem('');
    try { if (await onCellChange(row, date.name, day) === false) setProblem('날짜를 변경하지 못했습니다. 다시 시도하세요.'); }
    catch { setProblem('날짜를 변경하지 못했습니다. 다시 시도하세요.'); }
    finally { working.current = false; setSaving(false); }
  };
  const item = (row: DatabaseLayoutRow) => <button type="button" key={row.index} className="ondb-calendar-event" data-db-calendar-event={row.index} aria-label={`캘린더 항목 · ${titleOf(row, title)}`} draggable={!disabled && !!date && !saving}
    onDragStart={event => { if (disabled || !date || working.current) { event.preventDefault(); return; } dragging.current = row.index; event.dataTransfer.effectAllowed = 'move';
      // Leaving the calendar cancels the move; the embedding prose must never paste a row index.
      event.dataTransfer.setData('application/x-barocss-calendar-item', String(row.index)); }}
    onDragEnd={() => { dragging.current = null; setOver(''); }} onClick={() => onOpenRow(row.index)}><Icon name="type-page" /><span>{titleOf(row, title)}</span></button>;
  const [year, number] = month.split('-');
  return <section className="ondb-calendar" data-db-calendar aria-label="데이터베이스 캘린더">
    <header className="ondb-calendar-header"><h3 aria-live="polite">{year}년 {Number(number)}월</h3><Button ariaLabel="이번 달로 이동" onClick={() => setMonth(today.slice(0, 7))}>오늘</Button><IconButton label="이전 달" onClick={() => setMonth(calendarMonthShift(month, -1))}><Icon name="previous" /></IconButton><IconButton label="다음 달" onClick={() => setMonth(calendarMonthShift(month, 1))}><Icon name="next" /></IconButton></header>
    {!date && <p className="ondb-calendar-notice">보기 설정에서 날짜 속성을 선택하세요. 날짜가 없는 항목은 아래에서 열 수 있습니다.</p>}
    {problem && <p role="alert" className="ondb-calendar-notice ondb-inline-error">{problem}</p>}
    <div className="ondb-calendar-week" aria-hidden="true">{['일', '월', '화', '수', '목', '금', '토'].map(day => <span key={day}>{day}</span>)}</div>
    <div className="ondb-calendar-grid">
      {days.map(day => <div key={day} className="ondb-calendar-day" data-db-calendar-day={day} data-outside-month={day.slice(0, 7) !== month || undefined} data-today={day === today || undefined} data-drop-target={over === day || undefined}
        onDragOver={event => { if (dragging.current !== null && date && !disabled) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setOver(day); } }}
        onDrop={event => { if (dragging.current === null) return; event.preventDefault(); event.stopPropagation(); void move(day); }}>
        <div className="ondb-calendar-day-heading"><time dateTime={day}>{Number(day.slice(-2))}</time><button type="button" aria-label={`${day}에 항목 추가`} disabled={disabled || !date || saving} onClick={() => date && void onInsert({ [date.name]: day })}><Icon name="add" /></button></div>
        {(scheduled.get(day) ?? []).map(item)}
      </div>)}
    </div>
    <div className="ondb-calendar-unscheduled" aria-label="날짜 미지정 항목"><h4>날짜 미지정 <span>{unscheduled.length}</span></h4>
      {unscheduled.length ? unscheduled.map(item) : <p>모든 항목에 유효한 날짜가 있습니다.</p>}
    </div>
  </section>;
}
