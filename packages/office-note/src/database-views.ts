import type { Editor } from '@barocss/editor-core';
import { setAttrs, transaction } from '@barocss/model';
import { getNoteDatabase, type NoteDatabase } from './database';
import { readDatasetViews, normalizeDatasetView, validDatasetFilters, type DatasetView as NoteDatabaseView } from '@barocss/schema';

export { readDatasetViews as readNoteDatabaseViews } from '@barocss/schema';
export type { DatasetView as NoteDatabaseView } from '@barocss/schema';
type Payload = Record<string, unknown>;
const nameOf = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const layoutName = (view: string) => (({ board: '보드', gallery: '갤러리', calendar: '캘린더' } as Record<string, string>)[view] ?? '테이블');

/** A reference block owns its view preferences; its dataset owns the records. */
export function getNoteDatabaseViews(editor: Editor, nodeId: string): { views: NoteDatabaseView[]; activeId: string } {
  const db = getNoteDatabase(editor, nodeId);
  return db ? readDatasetViews(editor.dataStore.getNode(nodeId)?.attributes ?? {}, db.fields) : { views: [], activeId: '' };
}

const projection = (view: NoteDatabaseView) => ({ view: view.view, where: view.where, equals: view.equals,
  sortBy: view.sortBy, sortDir: view.sortDir, groupBy: view.groupBy, dateField: view.dateField, cardPreview: view.cardPreview, cardSize: view.cardSize,
  ...(view.filters ? { filters: view.filters } : {}), ...(view.sorts ? { sorts: view.sorts } : {}) });

export function registerNoteDatabaseViewCommands(editor: Editor): void {
  // Builds execute after earlier writes settle, so concurrent commands cannot overwrite profiles.
  let queue: Promise<unknown> = Promise.resolve();
  const register = (name: string, build: (db: NoteDatabase, state: ReturnType<typeof getNoteDatabaseViews>, payload: Payload, createId: () => string) => { views: NoteDatabaseView[]; activeId: string } | undefined) => {
    const change = (payload?: Payload, materialize = false) => {
      if (!editor.isEditable || typeof payload?.nodeId !== 'string') return;
      const db = getNoteDatabase(editor, payload.nodeId);
      if (!db) return;
      if (name === 'setNoteDatabaseView' && payload.label !== undefined && (typeof payload.label !== 'string' || !payload.label.trim())) return;
      const previous = getNoteDatabaseViews(editor, db.nodeId);
      const createId = () => {
        if (materialize) return `view-${crypto.randomUUID()}`;
        let id = 'pending-view'; while (previous.views.some(view => view.id === id)) id += '-';
        return id;
      };
      const next = build(db, previous, payload, createId);
      const active = next?.views.find(view => view.id === next.activeId);
      if (!next || !active) return;
      const operations = [];
      if (name === 'setNoteDatabaseView' && typeof payload.label === 'string' && payload.label.trim() !== db.label) {
        if (editor.dataStore.getNode(db.datasetId)?.attributes?.kind === 'url') return;
        operations.push(setAttrs(db.datasetId, { label: payload.label.trim() }));
      }
      if (JSON.stringify(previous) !== JSON.stringify(next)) operations.push(setAttrs(db.nodeId, { views: next.views, activeViewId: next.activeId, ...projection(active) } as never));
      return operations.length ? operations : undefined;
    };
    editor.registerCommand({ name, canExecute: (_editor, payload?: Payload) => !!change(payload), execute: (_editor, payload?: Payload) => {
      const pending = queue.then(async () => {
        const operations = change(payload, true);
        return operations ? (await transaction(editor, operations, { applySelectionToView: false }).commit()).success : false;
      });
      queue = pending.catch(() => undefined);
      return pending;
    } });
  };
  register('setNoteDatabaseView', (db, state, payload) => {
    const current = state.views.find(view => view.id === state.activeId)!;
    if (payload.view !== undefined && !['table', 'board', 'gallery', 'calendar'].includes(String(payload.view))) return;
    if (payload.sortDir !== undefined && payload.sortDir !== 'asc' && payload.sortDir !== 'desc') return;
    for (const key of ['where', 'sortBy', 'groupBy']) if (payload[key] !== undefined && payload[key] !== '' && !db.fields.some(field => field.name === payload[key])) return;
    if (payload.dateField !== undefined && payload.dateField !== '' && !db.fields.some(field => field.name === payload.dateField && field.kind === 'date')) return;
    if (payload.cardPreview !== undefined && !['none', 'content'].includes(String(payload.cardPreview))) return;
    if (payload.cardSize !== undefined && !['small', 'medium', 'large'].includes(String(payload.cardSize))) return;
    if (payload.filters !== undefined && !validDatasetFilters(payload.filters, db.fields.map(field => field.name))) return;
    if (payload.sorts !== undefined && (!Array.isArray(payload.sorts) || payload.sorts.some(sort => !sort || typeof sort !== 'object' || !db.fields.some(field => field.name === sort.field) || !['asc', 'desc'].includes(sort.direction)))) return;
    if (payload.equals !== undefined && typeof payload.equals !== 'string') return;
    if (payload.hiddenFields !== undefined && (!Array.isArray(payload.hiddenFields) || payload.hiddenFields.some(name => typeof name !== 'string' || !db.fields.some(field => field.name === name)))) return;
    const patch = Object.fromEntries(['view', 'where', 'equals', 'sortBy', 'sortDir', 'groupBy', 'hiddenFields', 'dateField', 'cardPreview', 'cardSize', 'filters', 'sorts'].filter(key => payload[key] !== undefined).map(key => [key, payload[key]]));
    const next = normalizeDatasetView({ ...current, ...patch }, db.fields);
    // A legacy unnamed view follows its layout until the reader gives it an explicit name.
    if (current.id === 'default' && current.name === layoutName(current.view) && payload.view) next.name = layoutName(next.view);
    return { ...state, views: state.views.map(view => view.id === current.id ? next : view) };
  });
  register('createNoteDatabaseView', (db, state, payload, createId) => {
    if (payload.view !== undefined && !['table', 'board', 'gallery', 'calendar'].includes(String(payload.view))) return;
    const original = payload.duplicateId === undefined ? undefined : state.views.find(view => view.id === payload.duplicateId);
    if (payload.duplicateId !== undefined && !original) return;
    if (payload.name !== undefined && !nameOf(payload.name)) return;
    const kind = typeof payload.view === 'string' ? payload.view : 'table';
    const baseName = nameOf(payload.name) || (original ? `${original.name} 복사본` : layoutName(kind));
    let name = baseName, index = 2;
    while (state.views.some(view => view.name === name)) name = `${baseName} ${index++}`;
    const id = createId();
    const next = normalizeDatasetView({ ...(original ?? { view: kind, groupBy: db.fields.find(field => field.kind === 'choice')?.name ?? '' }), id, name }, db.fields);
    return { views: [...state.views, next], activeId: id };
  });
  register('selectNoteDatabaseView', (_db, state, payload) => state.views.some(view => view.id === payload.viewId)
    ? { ...state, activeId: String(payload.viewId) } : undefined);
  register('renameNoteDatabaseView', (_db, state, payload) => {
    const name = nameOf(payload.name);
    if (!name || !state.views.some(view => view.id === payload.viewId)) return;
    return { ...state, views: state.views.map(view => view.id === payload.viewId ? { ...view, name } : view) };
  });
  register('removeNoteDatabaseView', (_db, state, payload) => {
    const index = state.views.findIndex(view => view.id === payload.viewId);
    if (index < 0 || state.views.length === 1) return;
    const views = state.views.filter(view => view.id !== payload.viewId);
    return { views, activeId: state.activeId === payload.viewId ? views[Math.min(index, views.length - 1)].id : state.activeId };
  });
}
