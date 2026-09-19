import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { openNoteTree, type NoteSession } from '../src/session';
import { PageReferenceUI, matchingReferencePages, pageReferenceQuery, pageReferenceChildDestination, type NotePageReferences } from '../src/page-reference-ui';
let session: NoteSession, root: Root, scope: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  session = openNoteTree({ stype: 'note', content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: '앞 [[프로' }, { stype: 'inline-text', text: '젝트' }] }] });
  scope = document.createElement('div'); document.body.append(scope); const host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); session.close(); document.body.replaceChildren(); vi.unstubAllGlobals(); });
const paragraph = () => session.editor.dataStore.getNode(session.editor.dataStore.getNode(session.rootId)!.content![0] as string)!;
function caret(id: string, offset: number) { session.editor.selectionManager.setSelection({ type: 'range', startNodeId: id, endNodeId: id, startOffset: offset, endOffset: offset, collapsed: true }); }
it('finds a bracket query across adjacent inline runs and keeps the exact replacement range', () => {
  const children = paragraph().content! as string[];
  caret(children[1], 2);
  expect(pageReferenceQuery(session.editor)).toEqual({ query: '프로젝트', replaceRange: { type: 'range', startNodeId: children[0], startOffset: 2, endNodeId: children[1], endOffset: 2, collapsed: false } });
});
it('does not offer page references in code or across a selected range', async () => {
  const children = paragraph().content! as string[]; caret(children[0], 1);
  expect(pageReferenceQuery(session.editor)).toBeUndefined();
  session.editor.selectionManager.setSelection({ type: 'range', startNodeId: children[0], endNodeId: children[1], startOffset: 0, endOffset: 2, collapsed: false });
  expect(pageReferenceQuery(session.editor)).toBeUndefined();
  session.close(); session = openNoteTree({ stype: 'note', content: [{ stype: 'codeBlock', content: [{ stype: 'inline-text', text: '[[literal' }] }] });
  caret(paragraph().content![0] as string, 9); expect(pageReferenceQuery(session.editor)).toBeUndefined();
});
it('updates live titles, marks missing/trash references and only navigates existing pages', async () => {
  scope.innerHTML = '<span data-note-page-reference data-page-id="page-2" data-page-title="이전 이름"><svg></svg><span data-note-page-reference-title>이전 이름</span></span>';
  const navigate = vi.fn();
  const render = async (pages: NotePageReferences['pages']) => { await act(async () => root.render(createElement(PageReferenceUI, { editor: session.editor, scope: { current: scope }, references: { pages, currentPageId: 'page-1', onNavigate: navigate } }))); };
  await render([{ id: 'page-2', title: '새 이름' }]);
  expect(scope.querySelector('[data-note-page-reference-title]')!.textContent).toBe('새 이름'); expect(scope.querySelector('svg')).not.toBeNull();
  await act(async () => scope.querySelector<HTMLElement>('[data-note-page-reference]')!.click()); expect(navigate).toHaveBeenCalledWith('page-2');
  await render([{ id: 'page-2', title: '휴지통 이름', trashed: true }]); expect(scope.firstElementChild?.getAttribute('data-page-state')).toBe('trashed');
  await act(async () => scope.querySelector<HTMLElement>('[data-note-page-reference]')!.click()); expect(navigate).toHaveBeenCalledTimes(2);
  await render([]); expect(scope.firstElementChild?.getAttribute('aria-disabled')).toBe('true');
  await act(async () => scope.querySelector<HTMLElement>('[data-note-page-reference]')!.click()); expect(navigate).toHaveBeenCalledTimes(2); expect(document.querySelector('[role="alert"]')).not.toBeNull();
});
it('reapplies host titles after the document renderer replaces an atom label', async () => {
  scope.innerHTML = '<span data-note-page-reference data-page-id="p" data-page-title="Snapshot"><span data-note-page-reference-title>Snapshot</span></span>';
  await act(async () => root.render(createElement(PageReferenceUI, { editor: session.editor, scope: { current: scope }, references: { pages: [{ id: 'p', title: 'Live' }], currentPageId: 'here', onNavigate: vi.fn() } })));
  await act(async () => { scope.querySelector('[data-note-page-reference-title]')!.textContent = 'Snapshot'; await Promise.resolve(); });
  expect(scope.querySelector('[data-note-page-reference-title]')!.textContent).toBe('Live');
});

it('passes only the matching remainder of a nested item backlink route into a child body', () => {
  const route = { source: 'outer', rowId: 'outer-row', next: { source: 'inner', rowId: 'inner-row', next: { source: 'deep', rowId: 'deep-row' } } };
  const inner = pageReferenceChildDestination(route, 'outer', 'outer-row');
  expect(inner).toBe(route.next);
  expect(pageReferenceChildDestination(inner, 'inner', 'inner-row')).toBe(route.next.next);
  expect(pageReferenceChildDestination(route, 'outer', 'other-row')).toBeUndefined();
  expect(pageReferenceChildDestination(route, 'other-database', 'outer-row')).toBeUndefined();
  expect(pageReferenceChildDestination(undefined, 'outer', 'outer-row')).toBeUndefined();
});

it('orders matching pages independently of library save order before limiting the keyboard list', () => {
  const pages = Array.from({ length: 35 }, (_, index) => ({ id: `p-${index + 1}`, title: `연결 후보 ${index + 1}` }));
  const mixed = [...pages.slice(15), ...pages.slice(0, 15)].reverse();
  expect(matchingReferencePages(mixed, '연결 후보')).toEqual(pages.slice(0, 30));
  expect(matchingReferencePages([...mixed, { id: 'trash', title: '연결 후보 0', trashed: true }], '연결 후보')).toEqual(pages.slice(0, 30));
  expect(matchingReferencePages([{ id: 'b', title: '같은 제목' }, { id: 'a', title: '같은 제목' }], '') .map(page => page.id)).toEqual(['a', 'b']);
});

for (const [text, expected] of [['@프로젝트', '프로젝트'], ['앞 @프로젝트 계획', '프로젝트 계획'], ['(@프로젝트', '프로젝트'], ['name@example.com', undefined], ['https://host/@name', undefined], ['\\@문서', undefined], ['\\[[문서', undefined]] as const) {
  it(`treats ${text} as ${expected === undefined ? 'literal text' : 'a page mention'}`, () => {
    session.close(); session = openNoteTree({ stype: 'note', content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text }] }] });
    caret(String(paragraph().content![0]), text.length);
    expect(pageReferenceQuery(session.editor)?.query).toBe(expected);
  });
}
it('inserts a mention spanning marked runs, replacing only its trigger, with undo and redo', async () => {
  session.close(); session = openNoteTree({ stype: 'note', content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: '앞 @프로', marks: [{ stype: 'bold', range: [0, 5] }] }, { stype: 'inline-text', text: '젝트' }] }] });
  const ids = paragraph().content as string[];
  caret(ids[1], 2);
  const found = pageReferenceQuery(session.editor)!;
  expect(found.query).toBe('프로젝트');
  expect(found.replaceRange).toMatchObject({ startNodeId: ids[0], startOffset: 2, endNodeId: ids[1], endOffset: 2 });
  expect(await session.editor.executeCommand('insertNotePageReference', { pageId: 'project', title: '프로젝트', replaceRange: found.replaceRange })).toBe(true);
  expect(JSON.stringify(session.editor.exportDocument())).toContain('pageReference');
  expect(JSON.stringify(session.editor.exportDocument())).not.toContain('@프로');
  expect(await session.editor.undo()).toBe(true);
  expect(pageReferenceQuery(session.editor)?.query).toBe('프로젝트');
  expect(await session.editor.redo()).toBe(true);
  expect(JSON.stringify(session.editor.exportDocument())).toContain('pageReference');
});
it('does not interpret mention or bracket syntax inside inline code', () => {
  for (const text of ['@문서', '[[문서']) {
    session.close(); session = openNoteTree({ stype: 'note', content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text, marks: [{ stype: 'code', range: [0, text.length] }] }] }] });
    caret(String(paragraph().content![0]), text.length);
    expect(pageReferenceQuery(session.editor)).toBeUndefined();
  }
});
