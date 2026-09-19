import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { TipProvider } from '@barocss/office-ui';
import { DatabaseFieldEditor } from '../src/database-field-editor';
import { DatabaseProperty } from '../src/database-item-page';
import type { DatabaseSourceOption } from '../src/database-advanced-value';
import type { DataField } from '@barocss/schema';
let root: Root, host: HTMLDivElement, anchor: HTMLButtonElement;
const button = (name: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find(one => one.getAttribute('aria-label') === name || one.textContent === name)!;
const click = async (name: string) => { await act(async () => button(name).click()); };
const fields: DataField[] = [{ name: '이름', kind: 'text' }, { name: '수량', kind: 'number' }, { name: '계산', kind: 'formula', formula: { expression: 'prop("수량") * 2' } }];
const sources: DatabaseSourceOption[] = [{ source: 'tasks', label: '업무', fields, rowIds: ['t1'], records: [{ 이름: '업무 A', 수량: 3 }] }, { source: 'projects', label: '프로젝트', fields: [{ name: '이름', kind: 'text' }, { name: '예산', kind: 'number' }], rowIds: ['p1', 'p2'], records: [{ 이름: '출시', 예산: 10 }, { 이름: '조사', 예산: 20 }] }];
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  host = document.createElement('div'); anchor = document.createElement('button'); document.body.append(host, anchor); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); document.body.replaceChildren(); vi.unstubAllGlobals(); });
async function editFormula(value: string) {
  await act(async () => { const input = document.querySelector<HTMLTextAreaElement>('[aria-label="수식"]')!;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
it('previews a formula and applies only an explicitly accepted valid draft', async () => {
  const update = vi.fn(async () => true);
  await act(async () => root.render(createElement(DatabaseFieldEditor, { field: fields[2], fields, sources, sourceName: 'tasks', anchor, disabled: false, onUpdate: update, onRename: vi.fn(), onClose: vi.fn() })));
  expect(document.querySelector('[aria-label="수식 결과 미리보기"]')?.textContent).toContain('6');
  await editFormula('prop("수량") * 4'); expect(update).not.toHaveBeenCalled();
  await click('수식 적용'); expect(update).toHaveBeenCalledWith({ kind: 'formula', formula: { expression: 'prop("수량") * 4' } });
  await editFormula('prop("없는 속성") + 1'); expect(button('수식 적용').disabled).toBe(true); expect(document.querySelector('[role="alert"]')?.textContent).toContain('없는 속성');
  await editFormula('prop('); expect(button('수식 적용').disabled).toBe(true);
});
it('shows calculated values and dependency failures without exposing a cell input', async () => {
  const commit = vi.fn();
  await act(async () => root.render(createElement(DatabaseProperty, { field: fields[2], value: '#REF!', error: '속성을 찾을 수 없습니다: 비용', label: '계산 결과', disabled: false, commit })));
  expect(document.querySelector('input')).toBeNull(); expect(document.querySelector('[data-db-computed]')?.textContent).toContain('비용'); expect(commit).not.toHaveBeenCalled();
});
it('searches, adds, opens and removes stable relation item ids', async () => {
  const openRelated = vi.fn(); const commit = vi.fn();
  function Relation() {
    const [ids, setIds] = useState<string[]>([]);
    return createElement(TipProvider, null, createElement(DatabaseProperty, { field: { name: '프로젝트', kind: 'relation', relation: { source: 'projects', multiple: true } }, value: [], rawValue: ids, label: '연결 프로젝트', disabled: false, sources, onOpenRelated: openRelated, commit: value => { commit(value); setIds(value as string[]); } }));
  }
  await act(async () => root.render(createElement(Relation)));
  await click('연결 프로젝트');
  await act(async () => { const search = document.querySelector<HTMLInputElement>('[aria-label="연결할 항목 검색"]')!; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(search, '출'); search.dispatchEvent(new Event('input', { bubbles: true })); });
  expect(document.querySelector('[role="listbox"]')?.textContent).not.toContain('조사');
  await click('출시'); expect(commit).toHaveBeenLastCalledWith(['p1']);
  await click('출시 항목 열기'); expect(openRelated).toHaveBeenCalledWith('projects', 'p1');
  await click('출시 연결 해제'); expect(commit).toHaveBeenLastCalledWith([]);
});
it('keeps missing relation targets visible and refuses to invent a record label', async () => {
  await act(async () => root.render(createElement(DatabaseProperty, { field: { name: '관계', kind: 'relation', relation: { source: 'gone' } }, value: [], rawValue: ['missing-id'], label: '관계 항목', disabled: false, sources, commit: vi.fn() })));
  expect(document.querySelector('.office-selection-tag[data-missing]')?.textContent).toContain('찾을 수 없는 항목');
  expect(button('찾을 수 없는 항목 항목 열기')).toBeUndefined();
  await click('관계 항목'); expect(document.querySelector('.office-search-popup')?.textContent).toContain('대상 데이터베이스가 없거나');
});
it('requires an existing relation and target property before applying a rollup', async () => {
  const field: DataField = { name: '합계', kind: 'rollup', rollup: { relationField: '없음', field: '예산', operation: 'sum' } };
  await act(async () => root.render(createElement(DatabaseFieldEditor, { field, fields: [...fields, field], sources, sourceName: 'tasks', anchor, disabled: false, onUpdate: vi.fn(), onRename: vi.fn(), onClose: vi.fn() })));
  expect(button('롤업 설정 적용').disabled).toBe(true); expect(document.body.textContent).toContain('먼저 관계 속성을 추가하세요.');
});
it('serializes rapid relation choices from the latest selection before host props catch up', async () => {
  const waiting: { ids: string[]; resolve: (ok: boolean) => void }[] = [];
  const commit = vi.fn((ids: unknown) => new Promise<boolean>(resolve => waiting.push({ ids: ids as string[], resolve })));
  const field: DataField = { name: '관계', kind: 'relation', relation: { source: 'projects', multiple: true } };
  const render = async (ids: string[]) => { await act(async () => root.render(createElement(DatabaseProperty, { field, value: ids, rawValue: ids, sources, label: '빠른 연결', disabled: false, commit }))); };
  await render([]); await click('빠른 연결');
  await act(async () => { button('출시').click(); button('조사').click(); });
  expect(waiting[0].ids).toEqual(['p1']); expect(commit).toHaveBeenCalledTimes(1);
  await act(async () => waiting[0].resolve(true));
  expect(waiting[1].ids).toEqual(['p1', 'p2']);
  await render(['p1']);
  expect(document.querySelectorAll('.office-selection-tag')).toHaveLength(2);
  await act(async () => waiting[1].resolve(true)); await render(['p1', 'p2']);
  expect(document.querySelectorAll('.office-selection-tag')).toHaveLength(2);
});
it('rolls a rejected relation write back to persisted values and reports failure', async () => {
  await act(async () => root.render(createElement(DatabaseProperty, { field: { name: '관계', kind: 'relation', relation: { source: 'projects' } }, value: [], rawValue: [], sources, label: '거절될 연결', disabled: false, commit: async () => false })));
  await click('거절될 연결'); await click('출시');
  expect(document.querySelectorAll('.office-selection-tag')).toHaveLength(0);
  expect(document.querySelector('.ondb-inline-error')?.textContent).toContain('저장하지 못했습니다');
});
it('returns focus to the relation trigger when Escape dismisses its picker', async () => {
  await act(async () => root.render(createElement(DatabaseProperty, { field: { name: '관계', kind: 'relation', relation: { source: 'projects' } }, value: [], sources, label: '키보드 연결', disabled: false, commit: vi.fn() })));
  await click('키보드 연결');
  await act(async () => {
    document.querySelector<HTMLInputElement>('[aria-label="연결할 항목 검색"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  });
  await act(async () => { await new Promise<void>(resolve => requestAnimationFrame(() => resolve())); });
  expect(document.activeElement).toBe(button('키보드 연결'));
});
it('refreshes formula drafts after metadata undo but preserves drafts across ordinary record changes', async () => {
  const render = async (expression: string, records = sources[0].records) => {
    const field: DataField = { ...fields[2], formula: { expression } };
    await act(async () => root.render(createElement(DatabaseFieldEditor, { field, fields: [...fields.slice(0, 2), field], sources: [{ ...sources[0], records }, sources[1]], sourceName: 'tasks', anchor, disabled: false, onUpdate: vi.fn(), onRename: vi.fn(), onClose: vi.fn() })));
  };
  await render('prop("수량") * 4'); await render('prop("수량") * 2');
  expect(document.querySelector<HTMLTextAreaElement>('[aria-label="수식"]')!.value).toBe('prop("수량") * 2');
  await editFormula('prop("수량") * 9'); await render('prop("수량") * 2', [{ 이름: '업무 B', 수량: 5 }]);
  expect(document.querySelector<HTMLTextAreaElement>('[aria-label="수식"]')!.value).toBe('prop("수량") * 9');
});
it('restores relation focus after outside dismissal without stealing focus from another input', async () => {
  await act(async () => root.render(createElement(DatabaseProperty, { field: { name: '관계', kind: 'relation', relation: { source: 'projects' } }, value: [], sources, label: '외부 연결', disabled: false, commit: vi.fn() })));
  await click('외부 연결');
  await act(async () => { document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })); });
  await act(async () => { await new Promise<void>(resolve => requestAnimationFrame(() => resolve())); });
  expect(document.activeElement).toBe(button('외부 연결'));
  await click('외부 연결');
  const outside = document.createElement('input'); document.body.append(outside);
  await act(async () => { outside.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })); outside.focus(); });
  await act(async () => { await new Promise<void>(resolve => requestAnimationFrame(() => resolve())); });
  expect(document.activeElement).toBe(outside);
});
