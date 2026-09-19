import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { TipProvider } from '@barocss/office-ui';
import type { DataField } from '@barocss/schema';
import { DatabaseGallery, DatabaseCalendar, databaseGalleryPreview } from '../src/database-layouts';
import { calendarMonthDays, calendarMonthShift, calendarToday } from '../src/database-calendar';
import { openNoteTree, type NoteSession } from '../src/session';
import { getNoteDatabase } from '../src/database';
let root: Root, session: NoteSession, nodeId: string;
const fields: DataField[] = [{ name: '이름', kind: 'text' }, { name: '기한', kind: 'date' }];
const button = (label: string) => document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  session = openNoteTree({ stype: 'note', content: [{ stype: 'noteDatabase', attributes: { source: 'tasks' } }, { stype: 'resources', content: [{ stype: 'dataset', attributes: { name: 'tasks', label: '업무', fields, rowIds: ['item1'], records: [{ 이름: '실제 업무', 기한: calendarToday() }] } }] }] });
  nodeId = session.editor.dataStore.getNode(session.rootId)!.content![0] as string;
});
afterEach(async () => { await act(async () => root.unmount()); session.close(); document.body.replaceChildren(); });
it('builds stable civil-month grids across leap days, year boundaries and DST months', () => {
  expect(calendarMonthDays('2024-02')).toContain('2024-02-29'); expect(calendarMonthDays('2025-02')).not.toContain('2025-02-29');
  expect(calendarMonthDays('2026-03')).toHaveLength(42); expect(new Set(calendarMonthDays('2026-03')).size).toBe(42);
  expect(calendarMonthShift('2026-12', 1)).toBe('2027-01'); expect(calendarMonthShift('2026-01', -1)).toBe('2025-12');
});
it('previews actual item prose, suppresses resources and refuses unsafe image sources', () => {
  expect(databaseGalleryPreview([{ stype: 'paragraph', content: [{ stype: 'inline-text', text: '본문 미리보기' }] }, { stype: 'resources', content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: '내부 데이터' }] }] }, { stype: 'picture', attributes: { src: 'javascript:alert(1)' } }]).text).toBe('본문 미리보기');
  expect(databaseGalleryPreview([{ stype: 'picture', attributes: { src: 'javascript:alert(1)' } }]).image).toBeUndefined();
});
it('renders the saved item body in gallery cards and omits disabled previews', async () => {
  await session.editor.executeCommand('setNoteDatabaseItemBody', { nodeId, itemId: 'item1', blocks: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: '카드에서 읽는 실제 본문' }] }] });
  const open = vi.fn(); const rows = [{ index: 0, record: getNoteDatabase(session.editor, nodeId)!.records[0] }];
  const render = async (cardPreview: 'none' | 'content') => { await act(async () => root.render(createElement(DatabaseGallery, { editor: session.editor, nodeId, rows, fields, cardPreview, cardSize: 'small', renderProperty: (_row, record, field) => String(record[field.name] ?? ''), onOpenRow: open, onInsert: vi.fn(), disabled: false }))); };
  await render('content'); expect(document.querySelector('.ondb-gallery-preview')?.textContent).toContain('실제 본문');
  await act(async () => button('행 1 열기').click()); expect(open).toHaveBeenCalledWith(0);
  await render('none'); expect(document.querySelector('.ondb-gallery-preview')).toBeNull(); expect(document.querySelector('[data-card-size="small"]')).not.toBeNull();
});
it('keeps missing and invalid dates in a visible unscheduled list and inserts on the chosen day', async () => {
  const insert = vi.fn(); const today = calendarToday();
  const rows = [{ index: 7, record: { 이름: '오늘 업무', 기한: today } }, { index: 12, record: { 이름: '날짜 없음', 기한: '' } }, { index: 20, record: { 이름: '잘못된 날짜', 기한: '2026-02-30' } }];
  await act(async () => root.render(createElement(TipProvider, null, createElement(DatabaseCalendar, { rows, fields, dateField: '기한', onOpenRow: vi.fn(), onInsert: insert, onCellChange: vi.fn(), disabled: false }))));
  expect(document.querySelector(`[data-db-calendar-day="${today}"] [data-db-calendar-event="7"]`)).not.toBeNull();
  expect(document.querySelector('[aria-label="날짜 미지정 항목"]')?.textContent).toContain('날짜 없음'); expect(document.querySelector('[aria-label="날짜 미지정 항목"]')?.textContent).toContain('잘못된 날짜');
  await act(async () => button(`${today}에 항목 추가`).click()); expect(insert).toHaveBeenCalledWith({ 기한: today });
});
function drag(element: Element, type: string) { const event = new Event(type, { bubbles: true, cancelable: true }); const values = new Map<string, string>(); Object.defineProperty(event, 'dataTransfer', { value: { setData(type: string, value: string) { values.set(type, value); }, effectAllowed: '', dropEffect: '' } }); element.dispatchEvent(event); return values; }
it('reschedules a dragged event through one model change and restores it with one undo', async () => {
  const previous = calendarToday(); const target = calendarMonthDays(previous.slice(0, 7)).find(day => day !== previous)!;
  const change = vi.fn((row: number, field: string, value: unknown) => session.editor.executeCommand('setNoteDatabaseCell', { nodeId, row, field, value }));
  await act(async () => root.render(createElement(TipProvider, null, createElement(DatabaseCalendar, { rows: [{ index: 0, record: getNoteDatabase(session.editor, nodeId)!.records[0] }], fields, onOpenRow: vi.fn(), onInsert: vi.fn(), onCellChange: change, disabled: false }))));
  await act(async () => { drag(document.querySelector('[data-db-calendar-event="0"]')!, 'dragstart'); drag(document.querySelector(`[data-db-calendar-day="${target}"]`)!, 'drop'); });
  expect(change).toHaveBeenCalledTimes(1); expect(getNoteDatabase(session.editor, nodeId)!.records[0].기한).toBe(target);
  await session.editor.undo(); expect(getNoteDatabase(session.editor, nodeId)!.records[0].기한).toBe(previous);
});
it('reports a rejected date change and does not hide the event', async () => {
  const today = calendarToday(); const target = calendarMonthDays(today.slice(0, 7)).find(day => day !== today)!;
  await act(async () => root.render(createElement(TipProvider, null, createElement(DatabaseCalendar, { rows: [{ index: 3, record: { 이름: '업무', 기한: today } }], fields, onOpenRow: vi.fn(), onInsert: vi.fn(), onCellChange: async () => false, disabled: false }))));
  await act(async () => { drag(document.querySelector('[data-db-calendar-event="3"]')!, 'dragstart'); drag(document.querySelector(`[data-db-calendar-day="${target}"]`)!, 'drop'); });
  expect(document.querySelector('[role="alert"]')?.textContent).toContain('변경하지 못했습니다'); expect(document.querySelector('[data-db-calendar-event="3"]')).not.toBeNull();
});

it('honors an explicitly unset date field and keeps every item openable without date mutation', async () => {
  const open = vi.fn(), insert = vi.fn(), change = vi.fn();
  await act(async () => root.render(createElement(TipProvider, null, createElement(DatabaseCalendar, { rows: [{ index: 4, record: { 이름: '날짜 선택 전', 기한: calendarToday() } }], fields, dateField: '', onOpenRow: open, onInsert: insert, onCellChange: change, disabled: false }))));
  expect(document.querySelector('.ondb-calendar-notice')?.textContent).toContain('날짜 속성을 선택');
  expect(document.querySelector('[aria-label="날짜 미지정 항목"] [data-db-calendar-event="4"]')).not.toBeNull();
  expect(button(`${calendarToday()}에 항목 추가`).disabled).toBe(true);
  expect(button('캘린더 항목 · 날짜 선택 전').draggable).toBe(false);
  await act(async () => button('캘린더 항목 · 날짜 선택 전').click());
  expect(open).toHaveBeenCalledWith(4); expect(insert).not.toHaveBeenCalled(); expect(change).not.toHaveBeenCalled();
});

it('places timestamp values on their written civil day without timezone conversion', async () => {
  const today = calendarToday();
  await act(async () => root.render(createElement(TipProvider, null, createElement(DatabaseCalendar, { rows: [{ index: 9, record: { 이름: '시차 업무', 기한: `${today}T23:30:00-12:00` } }], fields, onOpenRow: vi.fn(), onInsert: vi.fn(), onCellChange: vi.fn(), disabled: false }))));
  expect(document.querySelector(`[data-db-calendar-day="${today}"] [data-db-calendar-event="9"]`)).not.toBeNull();
});
it('locks consecutive drag writes until the pending date mutation finishes', async () => {
  let finish!: (value: boolean) => void;
  const change = vi.fn(() => new Promise<boolean>(resolve => { finish = resolve; }));
  const today = calendarToday(), target = calendarMonthDays(today.slice(0, 7)).find(day => day !== today)!;
  await act(async () => root.render(createElement(TipProvider, null, createElement(DatabaseCalendar, { rows: [{ index: 0, record: { 이름: '저장 중', 기한: today } }], fields, onOpenRow: vi.fn(), onInsert: vi.fn(), onCellChange: change, disabled: false }))));
  await act(async () => { drag(document.querySelector('[data-db-calendar-event="0"]')!, 'dragstart'); drag(document.querySelector(`[data-db-calendar-day="${target}"]`)!, 'drop'); });
  expect(button('캘린더 항목 · 저장 중').draggable).toBe(false);
  await act(async () => { drag(document.querySelector('[data-db-calendar-event="0"]')!, 'dragstart'); drag(document.querySelector(`[data-db-calendar-day="${target}"]`)!, 'drop'); });
  expect(change).toHaveBeenCalledTimes(1);
  await act(async () => finish(true));
  expect(button('캘린더 항목 · 저장 중').draggable).toBe(true);
});

it('stops consumed calendar drops before the embedding editor can paste the row index', async () => {
  const parentDrop = vi.fn(); const change = vi.fn(async () => true);
  const today = calendarToday(), target = calendarMonthDays(today.slice(0, 7)).find(day => day !== today)!;
  await act(async () => root.render(createElement(TipProvider, null, createElement('div', { onDrop: parentDrop }, createElement(DatabaseCalendar, { rows: [{ index: 0, record: { 이름: '보호된 본문', 기한: today } }], fields, onOpenRow: vi.fn(), onInsert: vi.fn(), onCellChange: change, disabled: false })))));
  await act(async () => {
    const clipboard = drag(document.querySelector('[data-db-calendar-event="0"]')!, 'dragstart');
    // A drop outside the calendar can reach the editor's paste path. It must carry no prose.
    expect(clipboard.get('text/plain')).toBeUndefined(); expect(clipboard.get('text/html')).toBeUndefined();
    drag(document.querySelector(`[data-db-calendar-day="${target}"]`)!, 'drop');
  });
  expect(change).toHaveBeenCalledTimes(1); expect(parentDrop).not.toHaveBeenCalled();
});
