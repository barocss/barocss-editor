import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { openNoteTree, type NoteSession } from '../src/session';
import { getNoteDatabase } from '../src/database';
import { NoteDatabases } from '../src/database-view';
let session: NoteSession, root: Root, scope: HTMLDivElement, nodeId: string;
const database = () => getNoteDatabase(session.editor, nodeId)!;
const button = (label: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find(button => button.getAttribute('aria-label') === label || button.textContent?.trim() === label)!;
const input = (label: string) => document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
async function click(label: string) { await act(async () => { button(label).click(); }); }
async function change(label: string, value: string) { await act(async () => { const field = input(label); field.focus(); field.value = value; field.blur(); }); }
function placeholder() { const target = document.createElement('div'); target.dataset.noteDatabase = 'true'; target.dataset.bcSid = nodeId; target.contentEditable = 'false'; return target; }
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  session = openNoteTree({ stype: 'note', content: [
    { stype: 'noteDatabase', attributes: { source: 'tasks', view: 'table' } },
    { stype: 'resources', content: [{ stype: 'dataset', attributes: { name: 'tasks', label: '업무 목록', fields: [
      { name: '이름', kind: 'text' }, { name: '상태', kind: 'choice', options: ['시작 전', '완료'] }, { name: '수량', kind: 'number' }, { name: '기한', kind: 'date' }, { name: '확인', kind: 'boolean' }
    ], records: [{ 이름: '첫 업무', 상태: '시작 전', 수량: 2, 기한: '2026-09-01', 확인: false }] } }] }
  ] });
  const first = session.editor.dataStore.getNode(session.rootId)!.content![0];
  if (typeof first !== 'string') throw new Error('Expected database sid'); nodeId = first;
  scope = document.createElement('div'); scope.append(placeholder()); document.body.append(scope);
  const host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(createElement(NoteDatabases, { editor: session.editor, scope: { current: scope } })));
});
afterEach(async () => { await act(async () => root.unmount()); session.close(); document.body.replaceChildren(); vi.unstubAllGlobals(); });
it('shows readable values and enters a typed editor only when selected', async () => {
  expect(input('행 1 · 수량')).toBeNull();
  await click('행 1 · 수량'); expect(input('행 1 · 수량').type).toBe('number');
  await change('행 1 · 수량', '7'); expect(database().records[0].수량).toBe(7);
  await act(async () => { await session.editor.undo(); }); expect(database().records[0].수량).toBe(2);
  await click('행 1 · 확인'); expect(database().records[0].확인).toBe(true);
});
it('adds records and edits a field in a contextual popup', async () => {
  await click('새 항목'); expect(database().records).toHaveLength(2);
  await click('필드 추가'); expect(database().fields).toHaveLength(6);
  await change('필드 이름', '담당자'); expect(database().fields.at(-1)?.name).toBe('담당자');
  await click('담당자 필드 삭제'); expect(database().fields).toHaveLength(5);
});
it('switches to grouped cards and keeps data when returning to table', async () => {
  await click('데이터베이스 보기 설정');
  await click('보드'); expect(database().view).toBe('board'); expect(database().groupBy).toBe('상태');
  await click('완료 그룹에 항목 추가'); expect(database().records[1].상태).toBe('완료');
  await click('테이블'); expect(document.querySelectorAll('[data-db-record]')).toHaveLength(2);
});
it('opens a nonmodal item page while the database remains interactive', async () => {
  await click('행 1 열기');
  expect(document.querySelector('[data-db-item-page]')).not.toBeNull();
  expect(document.querySelector('[aria-modal="true"]')).toBeNull();
  await click('새 항목'); expect(database().records).toHaveLength(2);
  await click('항목 · 수량'); await change('항목 · 수량', '12');
  expect(database().records[0].수량).toBe(12);
});
it('cancels a draft property with Escape without a model mutation', async () => {
  await click('행 1 · 수량');
  await act(async () => { const field = input('행 1 · 수량'); field.value = '19'; field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
  expect(database().records[0].수량).toBe(2);
});
it('adds a property from the item page without replacing or hiding that page', async () => {
  await click('행 1 열기'); await click('항목에 속성 추가');
  expect(document.querySelector('[data-db-item-page]')).not.toBeNull();
  await change('필드 이름', '담당자'); await click('필드 편집 닫기');
  await click('항목 · 담당자'); await change('항목 · 담당자', 'Kim');
  expect(database().records[0].담당자).toBe('Kim');
});
it('moves between visible records and keeps deletion inside the item menu', async () => {
  await click('새 항목'); await click('행 1 열기'); await click('다음 항목');
  expect(document.querySelector('[data-db-item-page]')?.getAttribute('data-db-item-page')).toBe('1');
  expect(button('행 2 삭제')).toBeUndefined();
  await click('항목 메뉴'); await click('열린 항목 삭제'); expect(database().records).toHaveLength(1);
});
it('reattaches the intact React island after the renderer sweeps foreign children', async () => {
  const original = button('행 1 열기');
  await act(async () => { scope.querySelector('[data-note-database]')!.replaceChildren(); await Promise.resolve(); });
  expect(button('행 1 열기')).toBe(original);
  await click('행 1 열기'); expect(document.querySelector('[data-db-item-page]')).not.toBeNull();
});
it('renders an injected writing surface below item properties', async () => {
  await act(async () => root.render(createElement(NoteDatabases, { editor: session.editor, scope: { current: scope }, renderItemBody: (id, row) => createElement('div', { 'data-test-body': id }, `Body ${row}`) })));
  await click('행 1 열기'); expect(document.querySelector('[data-test-body]')?.textContent).toBe('Body 0');
});
it('commits the page title on Enter and cancels title drafts with Escape', async () => {
  await click('행 1 열기');
  const title = () => document.querySelector<HTMLTextAreaElement>('[aria-label="항목 · 이름"]')!;
  const draft = async (value: string) => { await act(async () => {
    title().focus(); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(title(), value);
    title().dispatchEvent(new Event('input', { bubbles: true }));
  }); };
  await draft('새 페이지 제목');
  await act(async () => { title().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); });
  expect(database().records[0].이름).toBe('새 페이지 제목');
  await draft('취소될 제목');
  await act(async () => { title().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); });
  expect(database().records[0].이름).toBe('새 페이지 제목'); expect(title().value).toBe('새 페이지 제목');
});
it('keeps a composing title uncommitted when Enter confirms an IME syllable', async () => {
  await click('행 1 열기');
  const title = document.querySelector<HTMLTextAreaElement>('[aria-label="항목 · 이름"]')!;
  await act(async () => { title.focus(); title.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true })); });
  expect(document.activeElement).toBe(title); expect(database().records[0].이름).toBe('첫 업무');
});
it('duplicates an item from its action menu and preserves its field values', async () => {
  await click('행 1 열기'); await click('항목 메뉴'); await click('열린 항목 복제');
  expect(database().records).toHaveLength(2);
  expect(database().records[1]).toMatchObject({ 이름: '첫 업무', 수량: 2, 상태: '시작 전' });
});
it('keeps field configuration open for pointer events in its owned select portal', async () => {
  await click('필드 추가');
  const trigger = document.querySelector('[aria-label="필드 유형"]')!;
  const list = document.createElement('div'); list.id = 'field-type-options'; list.setAttribute('role', 'listbox');
  document.body.append(list); trigger.setAttribute('aria-expanded', 'true'); trigger.setAttribute('aria-controls', list.id);
  await act(async () => { list.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true })); });
  expect(button('필드 편집 닫기')).toBeDefined();
  list.remove();
});
it('keeps a clear item opener when no text field remains', async () => {
  await act(async () => { await session.editor.executeCommand('setNoteDatabaseField', { nodeId, field: '이름', kind: 'number' }); });
  expect(button('행 1 열기')?.textContent).toBe('항목 1 열기');
  await click('행 1 열기'); expect(document.querySelector('[data-db-item-page]')).not.toBeNull();
});
it('keeps only one active item across database blocks in the same note', async () => {
  let otherId = '';
  await act(async () => {
    await session.editor.executeCommand('insertNoteDatabase', { name: 'other', label: 'Other database' });
    const children = session.editor.dataStore.getNode(session.rootId)!.content ?? [];
    otherId = children.find(id => typeof id === 'string' && id !== nodeId && session.editor.dataStore.getNode(id)?.stype === 'noteDatabase') as string;
    const target = placeholder(); target.dataset.bcSid = otherId; scope.append(target); await Promise.resolve();
  });
  expect(otherId).toBeTruthy();
  await click('행 1 열기');
  await act(async () => { document.querySelector<HTMLButtonElement>(`[data-note-database-ui="${otherId}"] [aria-label="행 1 열기"]`)!.click(); });
  expect(document.querySelectorAll('[data-side-peek]')).toHaveLength(1);
  expect(document.querySelector('[aria-label="항목 위치"]')?.textContent).toBe('Other database');
});
