import { databaseRangeRecords } from './database-range';
import { databaseCSVRows } from './database-csv';
import type { INode } from '@barocss/datastore';
import type { Editor } from '@barocss/editor-core';
import { addChild, removeChild, setAttrs, transaction } from '@barocss/model';
import { registerNoteDatabaseViewCommands } from './database-views';
import { evaluateDatasetRecords, readDatasetViews, repairDatasetFilters, normalizeDatasetFilters, type DatasetView, inspectFormula, renameFormulaProperty, type DatasetEvaluationSource, DATA_FIELD_KINDS, fieldsFrom, datasetRows, validateTree, type DataField, type DataFieldKind } from '@barocss/schema';

export interface NoteDatabase {
  nodeId: string;
  datasetId: string;
  source: string;
  label: string;
  fields: DataField[];
  records: Record<string, unknown>[];
  rowIds: string[];
  computedRecords: Record<string, unknown>[];
  errors: Record<number, Record<string, string>>;
  view: DatasetView['view'];
  dateField: string;
  cardPreview: DatasetView['cardPreview'];
  cardSize: DatasetView['cardSize'];
  filters?: DatasetView['filters'];
  sorts?: DatasetView['sorts'];
  where?: string;
  equals?: unknown;
  sortBy?: string;
  sortDir: 'asc' | 'desc';
  groupBy?: string;
}

type Payload = Record<string, unknown>;
const object = (value: unknown): value is Payload => !!value && typeof value === 'object' && !Array.isArray(value);
const safeName = (value: unknown): value is string => typeof value === 'string' && !!value.trim() && !['__proto__', 'constructor', 'prototype'].includes(value);

export { getNoteDatabaseNodeDefinitions } from '@barocss/schema';

function resources(editor: Editor) {
  const store = editor.dataStore;
  const root = store.getNode(editor.getRootId()!);
  if (!root) return;
  const resourceId = root.content?.find(id => typeof id === 'string' && store.getNode(id)?.stype === 'resources');
  return { root, box: typeof resourceId === 'string' ? store.getNode(resourceId) : undefined };
}

function datasetNodes(editor: Editor): INode[] {
  return (resources(editor)?.box?.content ?? []).flatMap(id => {
    const node = typeof id === 'string' ? editor.dataStore.getNode(id) : undefined;
    return node?.stype === 'dataset' ? [node] : [];
  });
}
function sourceOf(node: INode): DatasetEvaluationSource {
  const data = node.attributes ?? {};
  return { name: String(data.name ?? ''), fields: fieldsFrom(data.fields),
    records: Array.isArray(data.records) ? structuredClone(data.records.filter(object)) : [],
    rowIds: Array.isArray(data.records) ? data.records.flatMap((record, index) => object(record) ? [Array.isArray(data.rowIds) && typeof data.rowIds[index] === 'string' ? data.rowIds[index] : ''] : []) : [] };
}
export function getNoteDatabaseSources(editor: Editor): DatasetEvaluationSource[] {
  return datasetNodes(editor).map(sourceOf);
}
export function getNoteDatabaseSourceOptions(editor: Editor): (DatasetEvaluationSource & { source: string; label: string; editable: boolean })[] {
  return datasetNodes(editor).map(node => ({ ...sourceOf(node), source: String(node.attributes?.name ?? ''),
    label: String(node.attributes?.label ?? node.attributes?.name ?? ''), editable: node.attributes?.kind !== 'url' }));
}
export function getNoteDatabase(editor: Editor, nodeId: string): NoteDatabase | undefined {
  const node = editor.dataStore.getNode(nodeId);
  if (node?.stype !== 'noteDatabase') return;
  const source = node.attributes?.source;
  const dataset = datasetNodes(editor).find(item => item.attributes?.name === source);
  if (!dataset?.sid || !safeName(source)) return;
  const attrs = node.attributes ?? {}, data = dataset.attributes ?? {}, raw = sourceOf(dataset);
  const computed = evaluateDatasetRecords(raw, getNoteDatabaseSources(editor));
  const state = readDatasetViews(attrs, raw.fields), active = state.views.find(view => view.id === state.activeId)!;
  return {
    nodeId, datasetId: dataset.sid, source, label: String(data.label ?? source),
    fields: raw.fields, records: raw.records, rowIds: raw.rowIds, computedRecords: computed.records, errors: computed.errors,
    dateField: active.dateField, cardPreview: active.cardPreview, cardSize: active.cardSize,
    ...(active.filters ? { filters: active.filters } : {}), ...(active.sorts ? { sorts: active.sorts } : {}),
    view: active.view, where: active.where, equals: active.equals,
    sortBy: active.sortBy, sortDir: active.sortDir, groupBy: active.groupBy
  };
}

/** Retain source indexes: edits to a filtered/sorted view target the original record. */
export function noteDatabaseRows(database: NoteDatabase): { index: number; record: Record<string, unknown> }[] {
  return datasetRows(database.computedRecords, database);
}

function cell(value: unknown, kind: DataFieldKind): unknown {
  // Match Site's lossless cell entry: a type change never rewrites existing values.
  const input = typeof value === 'string' ? value.trim() : value;
  if (kind === 'number' && typeof input === 'string' && input !== '' && Number.isFinite(Number(input))) return Number(input);
  if (kind === 'boolean') {
    if (input === 'true' || input === '예') return true;
    if (input === 'false' || input === '아니오' || input === '') return false;
  }
  return input ?? '';
}

function editable(editor: Editor, payload?: Payload): NoteDatabase | undefined {
  const db = typeof payload?.nodeId === 'string' ? getNoteDatabase(editor, payload.nodeId) : undefined;
  if (!db || editor.dataStore.getNode(db.datasetId)?.attributes?.kind === 'url') return;
  return db;
}
const validCell = (value: unknown) => value === null || ['string', 'boolean'].includes(typeof value) || (typeof value === 'number' && Number.isFinite(value));
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const validRow = (db: NoteDatabase, row: unknown): row is number => Number.isInteger(row) && Number(row) >= 0 && Number(row) < db.records.length;

let itemSequence = 0;
const newItemId = () => `note-item-${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${(++itemSequence).toString(36)}-${Math.random().toString(36).slice(2)}`}`;
function itemIds(db: Pick<DatasetEvaluationSource, 'records' | 'rowIds'>): string[] {
  const seen = new Set<string>();
  return db.records.map((_, row) => {
    const old = db.rowIds[row];
    const id = old && !seen.has(old) ? old : newItemId();
    seen.add(id); return id;
  });
}
function itemResource(editor: Editor, id: string | undefined) {
  if (!id) return;
  return resources(editor)?.box?.content?.map(sid => typeof sid === 'string' ? editor.dataStore.getNode(sid) : undefined)
    .find(node => node?.stype === 'richText' && node.attributes?.id === id);
}
function treeOf(editor: Editor, node: INode): INode {
  return {
    stype: node.stype,
    ...(node.text !== undefined ? { text: node.text } : {}),
    ...(node.attributes && Object.keys(node.attributes).length ? { attributes: structuredClone(node.attributes) } : {}),
    ...(node.marks?.length ? { marks: structuredClone(node.marks) } : {}),
    ...(Array.isArray(node.content) ? { content: node.content.map(child => {
      const found = typeof child === 'string' ? editor.dataStore.getNode(child) : child;
      if (!found) throw new Error('Missing item body node');
      return treeOf(editor, found);
    }) } : {})
  } as INode;
}
export function getNoteDatabaseItemId(editor: Editor, nodeId: string, row: number): string | undefined {
  const db = getNoteDatabase(editor, nodeId);
  return db && validRow(db, row) ? db.rowIds[row] || undefined : undefined;
}
/** Detached prose trees, including local resources; never return live datastore node IDs. */
export function getNoteDatabaseItemBody(editor: Editor, nodeId: string, row: number): INode[] {
  const body = itemResource(editor, getNoteDatabaseItemId(editor, nodeId, row));
  return body ? (treeOf(editor, body).content ?? []) as INode[] : [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: '' }] }] as INode[];
}

const computedField = (field: DataField) => field.kind === 'formula' || field.kind === 'rollup';
const blankCell = (field: DataField) => field.kind === 'relation' || field.kind === 'choices' ? [] : field.kind === 'boolean' ? false : '';
function fieldWithPayload(found: DataField | undefined, payload: Payload): DataField {
  const next = { ...(found ?? { name: String(payload.field), kind: 'text' }),
    ...Object.fromEntries(['kind', 'label', 'options', 'relation', 'formula', 'rollup'].filter(key => payload[key] !== undefined).map(key => [key, structuredClone(payload[key])])),
    name: String(payload.name ?? payload.field) } as DataField;
  if (next.kind !== 'relation') delete next.relation;
  if (next.kind !== 'formula') delete next.formula;
  if (next.kind !== 'rollup') delete next.rollup;
  return next;
}
function fieldConfigurationError(editor: Editor, source: string, field: DataField, fields: DataField[]): string | undefined {
  if (field.kind === 'relation') {
    const target = datasetNodes(editor).find(node => node.attributes?.name === field.relation?.source);
    if (!field.relation || (!target && field.relation.source !== source)) return '관계를 연결할 데이터베이스를 선택하세요.';
    if (target?.attributes?.kind === 'url') return '관계는 이 문서에 저장된 데이터베이스 항목에 연결할 수 있습니다.';
    if (field.relation.multiple !== undefined && typeof field.relation.multiple !== 'boolean') return '관계의 여러 항목 허용 설정을 확인하세요.';
  }
  if (field.kind === 'formula') {
    if (typeof field.formula?.expression !== 'string') return '수식을 입력하세요.';
    const checked = inspectFormula(field.formula.expression);
    if (!checked.valid) return checked.error ?? '수식 문법을 확인하세요.';
    const missing = checked.references.find(name => !fields.some(item => item.name === name));
    if (missing) return `수식이 참조하는 속성 “${missing}”이 없습니다.`;
  }
  if (field.kind === 'rollup') {
    const rollup = field.rollup;
    if (!rollup || !['count', 'sum', 'average', 'min', 'max'].includes(rollup.operation)) return '롤업 계산 방식을 선택하세요.';
    const relation = fields.find(item => item.name === rollup.relationField && item.kind === 'relation');
    if (!relation?.relation) return '롤업에 사용할 관계 속성을 선택하세요.';
    const target = relation.relation.source === source ? fields : getNoteDatabaseSources(editor).find(item => item.name === relation.relation!.source)?.fields;
    if (!target?.some(item => item.name === rollup.field)) return '롤업으로 계산할 대상 속성을 선택하세요.';
  }
}
function dependentField(editor: Editor, source: string, name: string): string | undefined {
  for (const dataset of getNoteDatabaseSources(editor)) for (const field of dataset.fields) {
    if (dataset.name === source && field.name === name) continue;
    if (dataset.name === source && field.formula && inspectFormula(field.formula.expression).references.includes(name)) return `${dataset.name} · ${field.name}`;
    if (!field.rollup) continue;
    if (dataset.name === source && field.rollup.relationField === name) return `${dataset.name} · ${field.name}`;
    const relation = dataset.fields.find(item => item.name === field.rollup!.relationField);
    if (relation?.relation?.source === source && field.rollup.field === name) return `${dataset.name} · ${field.name}`;
  }
}
function valueError(editor: Editor, field: DataField, value: unknown): string | undefined {
  if (computedField(field)) return '계산 속성은 수식 또는 롤업 설정에서 변경하세요.';
  if (field.kind === 'relation') {
    if (!Array.isArray(value) || value.some(id => typeof id !== 'string')) return '연결할 항목을 선택하세요.';
    if (field.relation?.multiple === false && value.length > 1) return '이 관계에는 한 항목만 연결할 수 있습니다.';
    const target = getNoteDatabaseSources(editor).find(item => item.name === field.relation?.source);
    if (!target || value.some(id => !id || !target.rowIds.includes(id))) return '연결 대상 항목이 없거나 삭제되었습니다.';
    return;
  }
  if (field.kind === 'choices') return Array.isArray(value) && value.every(item => typeof item === 'string') ? undefined : '다중 선택 값은 문자열 배열이어야 합니다.';
  if (!validCell(value)) return '지원하지 않는 셀 값입니다.';
}
/** A UI can explain a refused edit instead of silently leaving a field unchanged. */
export function getNoteDatabaseCommandError(editor: Editor, command: string, payload: Payload = {}): string | undefined {
  if (!editor.isEditable) return '읽기 전용 문서입니다.';
  const db = editable(editor, payload);
  if (!db) return '편집할 데이터베이스를 찾을 수 없습니다.';
  if (command === 'pasteNoteDatabaseRange') {
    try { databaseRangeRecords(db, payload.rowIds, payload.fieldNames, payload.text); } catch (error) { return error instanceof Error ? error.message : '붙여넣을 수 없습니다.'; }
    return;
  }
  if (command === 'setNoteDatabaseCell') {
    if (!validRow(db, payload.row)) return '편집할 항목이 없습니다.';
    const field = db.fields.find(item => item.name === payload.field);
    return field ? valueError(editor, field, payload.value) : '편집할 속성이 없습니다.';
  }
  if (command !== 'setNoteDatabaseField') return;
  if (!safeName(payload.field)) return '유효한 속성 이름을 입력하세요.';
  const found = db.fields.find(item => item.name === payload.field), renamed = payload.name ?? payload.field;
  if (!safeName(renamed) || (renamed !== payload.field && (db.fields.some(field => field.name === renamed) || db.records.some(row => Object.hasOwn(row, renamed))))) return '이미 사용 중이거나 올바르지 않은 속성 이름입니다.';
  if (payload.kind !== undefined && !DATA_FIELD_KINDS.includes(payload.kind as DataFieldKind)) return '지원하지 않는 속성 유형입니다.';
  if (payload.remove === true) {
    if (!found || db.fields.length === 1) return '데이터베이스에는 적어도 하나의 속성이 필요합니다.';
    const dependency = dependentField(editor, db.source, payload.field);
    if (dependency) return `“${dependency}”에서 사용하는 속성입니다. 참조 설정을 먼저 변경하세요.`;
    return;
  }
  const next = fieldWithPayload(found, payload);
  if (found?.kind === 'relation' && next.kind !== 'relation') {
    const dependency = dependentField(editor, db.source, found.name);
    if (dependency) return `“${dependency}”에서 사용하는 관계입니다. 롤업 설정을 먼저 변경하세요.`;
  }
  const fields = found ? db.fields.map(field => field === found ? next : field) : [...db.fields, next];
  // Rename propagates separately, so validate existing references against their current names.
  return fieldConfigurationError(editor, db.source, next, [...fields, ...(renamed !== payload.field && found ? [found] : [])]);
}

/** Register pure commands; the product view renders these same resources in table or board form. */
export function registerNoteDatabaseCommands(editor: Editor): void {
  const register = (name: string, build: (payload?: Payload) => unknown[] | undefined) => editor.registerCommand({
    name, canExecute: (_ed, payload?: Payload) => editor.isEditable && !!build(payload),
    execute: async (_ed, payload?: Payload) => {
      if (!editor.isEditable) return false;
      const ops = build(payload);
      if (!ops?.length) return false;
      return (await transaction(editor, ops as never, name === 'insertNoteDatabase' ? undefined : { applySelectionToView: false }).commit()).success;
    }
  });

  register('insertNoteDatabase', payload => {
    const at = resources(editor);
    if (!at?.root.sid || !editor.dataStore.getActiveSchema()?.getNodeType('noteDatabase')) return;
    const existing = (at.box?.content ?? []).map(id => typeof id === 'string' ? editor.dataStore.getNode(id)?.attributes?.name : undefined);
    let name = payload?.name;
    if (name === undefined) { let index = 1; while (existing.includes(`database-${index}`)) index++; name = `database-${index}`; }
    if (!safeName(name) || existing.includes(name)) return;
    const fields = payload?.fields === undefined ? [
      { name: '이름', kind: 'text' as const }, { name: '상태', kind: 'choice' as const, options: ['시작 전', '진행 중', '완료'] }
    ] : fieldsFrom(payload.fields);
    if (!fields.length || fields.some(field => !safeName(field.name))) return;
    if (payload?.fields !== undefined && (!Array.isArray(payload.fields) || fields.length !== payload.fields.length)) return;
    if (fields.some(field => fieldConfigurationError(editor, String(name), field, fields))) return;
    const blank = Object.fromEntries(fields.filter(field => !computedField(field)).map(field => [field.name, blankCell(field)]));
    const records = payload?.records === undefined ? [blank] : payload.records;
    if (!Array.isArray(records) || records.some(record => !object(record) || Object.entries(record).some(([key, value]) => {
      const field = fields.find(item => item.name === key);
      return field ? field.kind === 'relation' && Array.isArray(value) && !value.length ? false : !!valueError(editor, field, value) : !validCell(value);
    }))) return;
    const dataset = { stype: 'dataset', attributes: { name, label: typeof payload?.label === 'string' ? payload.label : '데이터베이스', kind: 'inline', fields, records: structuredClone(records), rowIds: records.map(() => newItemId()) } };
    const content = at.root.content ?? [];
    let index = at.box?.sid ? content.indexOf(at.box.sid) : content.length;
    if (typeof payload?.afterNodeId === 'string') {
      const after = content.indexOf(payload.afterNodeId);
      if (after < 0 || payload.afterNodeId === at.box?.sid) return;
      index = after + 1;
    }
    const identities: unknown[] = [];
    for (const targetName of new Set(fields.flatMap(field => field.relation ? [field.relation.source] : []))) {
      const target = datasetNodes(editor).find(node => node.attributes?.name === targetName);
      if (target?.sid) { const raw = sourceOf(target), rowIds = itemIds(raw); if (!same(raw.rowIds, rowIds)) identities.push(setAttrs(target.sid, { rowIds } as never)); }
    }
    return [
      ...identities,
      ...(at.box?.sid ? [addChild(at.box.sid, dataset as never)] : [addChild(at.root.sid, { stype: 'resources', content: [dataset] } as never, content.length)]),
      addChild(at.root.sid, { stype: 'noteDatabase', attributes: { source: name, view: 'table', groupBy: fields.find(field => field.kind === 'choice')?.name ?? '' } } as never, index)
    ];
  });

  register('setNoteDatabaseField', payload => {
    const db = editable(editor, payload);
    if (!db || !safeName(payload?.field) || getNoteDatabaseCommandError(editor, 'setNoteDatabaseField', payload)) return;
    const field = payload.field, found = db.fields.find(item => item.name === field);
    let fields = structuredClone(db.fields), records = structuredClone(db.records);
    const renamed = payload.name === undefined ? field : payload.name;
    if (!safeName(renamed) || (renamed !== field && (fields.some(item => item.name === renamed) || records.some(record => Object.hasOwn(record, renamed))))) return;
    if (payload.kind !== undefined && !DATA_FIELD_KINDS.includes(payload.kind as DataFieldKind)) return;
    if (payload.options !== undefined && (!Array.isArray(payload.options) || payload.options.some(value => typeof value !== 'string'))) return;
    if (payload.remove === true) {
      if (!found || fields.length === 1) return;
      fields = fields.filter(item => item.name !== field);
      records = records.map(record => { const { [field]: _gone, ...rest } = record; return rest; });
    } else {
      const next = fieldWithPayload(found, payload);
      fields = found ? fields.map(item => item.name === field ? next : item) : [...fields, next];
      if (!found && !computedField(next)) records = records.map(record => ({ ...record, [renamed]: Object.hasOwn(record, renamed) ? record[renamed] : blankCell(next) }));
      else if (field !== renamed) records = records.map(record => {
        const { [field]: value, ...rest } = record; return Object.hasOwn(record, field) ? { ...rest, [renamed]: value } : rest;
      });
    }
    if (same(fields, db.fields) && same(records, db.records)) return;
    const ops: unknown[] = [];
    // Reference metadata in every local dataset follows a rename in this same history entry.
    if (renamed !== field) {
      const rewrite = (source: DatasetEvaluationSource, items: DataField[]) => items.map(item => {
        const next = structuredClone(item);
        if (source.name === db.source && next.formula) next.formula.expression = renameFormulaProperty(next.formula.expression, field, renamed);
        if (next.rollup) {
          const relation = source.fields.find(one => one.name === next.rollup!.relationField);
          if (relation?.relation?.source === db.source && next.rollup.field === field) next.rollup.field = renamed;
          if (source.name === db.source && next.rollup.relationField === field) next.rollup.relationField = renamed;
        }
        return next;
      });
      fields = rewrite({ name: db.source, fields: db.fields, records: db.records, rowIds: db.rowIds }, fields);
      for (const node of datasetNodes(editor)) {
        if (node.sid === db.datasetId) continue;
        const source = sourceOf(node), next = rewrite(source, source.fields);
        if (!same(source.fields, next)) ops.push(setAttrs(node.sid!, { fields: next } as never));
      }
    }
    ops.unshift(setAttrs(db.datasetId, { fields, records } as never));
    // Legacy target records receive durable identities when the relation is configured.
    const next = fields.find(item => item.name === renamed);
    if (next?.kind === 'relation') {
      const target = datasetNodes(editor).find(node => node.attributes?.name === next.relation?.source);
      if (target?.sid) {
        const raw = sourceOf(target), rowIds = itemIds(raw);
        if (!same(rowIds, raw.rowIds)) ops.push(setAttrs(target.sid, { rowIds } as never));
      }
    }
    // Every view of this resource follows a renamed/removed column in the same undo step.
    if (payload.remove === true || renamed !== field) {
      for (const node of editor.dataStore.getNodes().values()) {
        if (node.stype !== 'noteDatabase' || node.attributes?.source !== db.source) continue;
        const patch: Payload = {};
        const repairQuery = (view: Payload) => {
          const filter = normalizeDatasetFilters(view.filters, db.fields.map(item => item.name));
          if (filter) view.filters = repairDatasetFilters(filter, field, payload.remove === true ? undefined : renamed);
          if (Array.isArray(view.sorts)) view.sorts = view.sorts.flatMap(sort => object(sort) && sort.field === field ? payload.remove === true ? [] : [{ ...sort, field: renamed }] : [sort]);
        };
        const query = { filters: node.attributes?.filters, sorts: node.attributes?.sorts }; repairQuery(query);
        for (const key of ['filters', 'sorts'] as const) if (!same(query[key], node.attributes?.[key])) patch[key] = query[key];
        for (const key of ['where', 'sortBy', 'groupBy', 'dateField']) if (node.attributes?.[key] === field) patch[key] = payload.remove === true ? '' : renamed;
        if (Array.isArray(node.attributes?.views)) {
          const views = node.attributes.views.map(value => {
            if (!object(value)) return value;
            const view = structuredClone(value);
            repairQuery(view);
            for (const key of ['where', 'sortBy', 'groupBy', 'dateField']) if (view[key] === field) view[key] = payload.remove === true ? '' : renamed;
            if (Array.isArray(view.hiddenFields)) view.hiddenFields = view.hiddenFields.flatMap(name => name === field ? payload.remove === true ? [] : [renamed] : [name]);
            return view;
          });
          if (!same(views, node.attributes.views)) patch.views = views;
        }
        if (Object.keys(patch).length) ops.push(setAttrs(node.sid!, patch as never));
      }
    }
    return ops;
  });

  register('setNoteDatabaseCell', payload => {
    const db = editable(editor, payload);
    if (!db || !validRow(db, payload?.row)) return;
    const field = db.fields.find(item => item.name === payload?.field);
    if (!field || valueError(editor, field, payload?.value)) return;
    const value = field.kind === 'relation' ? [...new Set(payload!.value as string[])] : cell(payload?.value, field.kind);
    if (same(db.records[payload!.row][field.name], value)) return;
    const records = structuredClone(db.records);
    records[payload!.row] = { ...records[payload!.row], [field.name]: value };
    return [setAttrs(db.datasetId, { records } as never)];
  });

  register('pasteNoteDatabaseRange', payload => {
    const db = editable(editor, payload);
    if (!db) return;
    try {
      const records = databaseRangeRecords(db, payload?.rowIds, payload?.fieldNames, payload?.text);
      if (same(records, db.records)) return;
      return [setAttrs(db.datasetId, { records } as never)];
    } catch { return; }
  });

  register('importNoteDatabaseCSV', payload => {
    const db = editable(editor, payload);
    if (!db || typeof payload?.csv !== 'string') return;
    let added: Record<string, unknown>[];
    try { added = databaseCSVRows(payload.csv, db); } catch { return; }
    const blank = Object.fromEntries(db.fields.filter(field => !computedField(field)).map(field => [field.name, blankCell(field)]));
    const records = [...structuredClone(db.records), ...added.map(row => ({ ...blank, ...row }))];
    const rowIds = [...itemIds(db), ...added.map(() => newItemId())];
    return [setAttrs(db.datasetId, { records, rowIds } as never)];
  });

  register('insertNoteDatabaseRow', payload => {
    const db = editable(editor, payload);
    if (!db || (payload?.at !== undefined && (!Number.isInteger(payload.at) || Number(payload.at) < 0 || Number(payload.at) > db.records.length))) return;
    if (payload?.values !== undefined && !object(payload.values)) return;
    const values = payload?.values as Payload | undefined;
    if (values && Object.entries(values).some(([key, value]) => { const field = db.fields.find(item => item.name === key); return !field || !!valueError(editor, field, value); })) return;
    const row = Object.fromEntries(db.fields.filter(field => !computedField(field)).map(field => [field.name, values?.[field.name] === undefined ? blankCell(field) : cell(values[field.name], field.kind)]));
    const records = structuredClone(db.records);
    const rowIds = itemIds(db), at = Number(payload?.at ?? records.length);
    records.splice(at, 0, row); rowIds.splice(at, 0, newItemId());
    return [setAttrs(db.datasetId, { records, rowIds } as never)];
  });

  register('duplicateNoteDatabaseRow', payload => {
    const db = editable(editor, payload), at = resources(editor);
    if (!db || !at?.box?.sid || !validRow(db, payload?.row)) return;
    const row = payload!.row, rowIds = itemIds(db), records = structuredClone(db.records);
    const body = itemResource(editor, rowIds[row]), id = newItemId();
    rowIds.splice(row + 1, 0, id); records.splice(row + 1, 0, structuredClone(records[row]));
    return [setAttrs(db.datasetId, { records, rowIds } as never),
      ...(body ? [{ type: 'addChild', payload: { parentId: at.box.sid, children: [{ ...treeOf(editor, body), attributes: { ...structuredClone(body.attributes), id } }] } }] : [])];
  });

  for (const action of ['set', 'remove'] as const) register(`batchNoteDatabaseRows:${action}`, payload => {
    const db = editable(editor, payload);
    if (!db || !Array.isArray(payload?.rowIds) || !payload.rowIds.length || payload.rowIds.some(id => typeof id !== 'string' || !id)) return;
    const ids = new Set(payload.rowIds as string[]), rowIds = itemIds(db);
    if ([...ids].some(id => !rowIds.includes(id))) return;
    const indexes = rowIds.flatMap((id, index) => ids.has(id) ? [index] : []);
    if (action === 'set') {
      const field = db.fields.find(field => field.name === payload?.field);
      if (!field || valueError(editor, field, payload?.value)) return;
      const records = structuredClone(db.records);
      const mode = payload?.mode ?? 'replace';
      if (!['replace', 'add', 'remove'].includes(String(mode))) return;
      if (mode !== 'replace' && !['relation', 'choices'].includes(field.kind)) return;
      for (const index of indexes) {
        const previous = Array.isArray(records[index][field.name]) ? records[index][field.name] as unknown[] : [];
        const incoming = Array.isArray(payload?.value) ? payload.value : [];
        const value = mode === 'add' ? [...new Set([...previous, ...incoming])]
          : mode === 'remove' ? previous.filter(value => !incoming.includes(value)) : cell(payload?.value, field.kind);
        if (valueError(editor, field, value)) return;
        records[index][field.name] = value;
      }
      if (same(records, db.records)) return;
      return [setAttrs(db.datasetId, { records } as never)];
    }
    const records = db.records.filter((_, index) => !ids.has(rowIds[index]));
    const bodies = [...ids].flatMap(id => { const body = itemResource(editor, id); return body?.sid ? [removeChild(resources(editor)!.box!.sid!, body.sid)] : []; });
    return [setAttrs(db.datasetId, { records, rowIds: rowIds.filter(id => !ids.has(id)) } as never), ...bodies];
  });

  register('removeNoteDatabaseRow', payload => {
    const db = editable(editor, payload);
    if (!db || !validRow(db, payload?.row)) return;
    const records = structuredClone(db.records), rowIds = itemIds(db);
    const body = itemResource(editor, rowIds[payload!.row]);
    records.splice(payload!.row, 1); rowIds.splice(payload!.row, 1);
    return [setAttrs(db.datasetId, { records, rowIds } as never),
      ...(body?.sid ? [removeChild(resources(editor)!.box!.sid!, body.sid)] : [])];
  });

  register('ensureNoteDatabaseItem', payload => {
    const db = editable(editor, payload);
    if (!db || !validRow(db, payload?.row)) return;
    const rowIds = itemIds(db);
    if (same(rowIds, db.rowIds)) return;
    return [setAttrs(db.datasetId, { rowIds } as never)];
  });

  register('setNoteDatabaseItemBody', payload => {
    const db = editable(editor, payload), at = resources(editor);
    if (!db || !at?.box?.sid || !Array.isArray(payload?.blocks)) return;
    // A delayed save targets the captured identity, never the next record at a deleted index.
    const row = typeof payload.itemId === 'string' ? db.rowIds.indexOf(payload.itemId) : payload.row;
    if (!validRow(db, row)) return;
    const rowIds = itemIds(db), id = rowIds[row];
    let blocks: INode[];
    try {
      const clean = (value: unknown): INode => {
        if (!object(value) || typeof value.stype !== 'string') throw new Error('Invalid item body');
        const { sid: _sid, parentId: _parentId, content, ...rest } = value;
        return { ...structuredClone(rest), ...(content === undefined ? {} : { content: Array.isArray(content) ? content.map(clean) : (() => { throw new Error('Invalid content'); })() }) } as INode;
      };
      blocks = payload.blocks.map(clean);
    } catch { return; }
    if (!blocks.length) blocks = [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: '' }] }] as INode[];
    const tree = { stype: 'richText', attributes: { id }, content: blocks };
    const schema = editor.dataStore.getActiveSchema();
    if (!schema || validateTree(schema, tree).length) return;
    const current = itemResource(editor, id);
    if (current && same(treeOf(editor, current).content, blocks) && same(rowIds, db.rowIds)) return;
    return [
      ...(same(rowIds, db.rowIds) ? [] : [setAttrs(db.datasetId, { rowIds } as never)]),
      ...(current?.sid ? [removeChild(at.box.sid, current.sid)] : []),
      // The plural resource insertion has no automatic caret target.
      { type: 'addChild', payload: { parentId: at.box.sid, children: [tree] } }
    ];
  });

  registerNoteDatabaseViewCommands(editor);
}

/** Duplicate a block's database resources once per source, keeping the original views independent. */
export function copyNoteDatabaseResources(editor: Editor, sources: string[]): { operations: unknown[]; names: Map<string, string> } | undefined {
  const at = resources(editor);
  if (!at?.box?.sid) return sources.length ? undefined : { operations: [], names: new Map() };
  const datasets = (at.box.content ?? []).map(id => typeof id === 'string' ? editor.dataStore.getNode(id) : undefined)
    .filter(node => node?.stype === 'dataset');
  const taken = new Set(datasets.map(node => String(node!.attributes?.name)));
  const names = new Map<string, string>();
  const operations: unknown[] = [];
  const copies: { data: INode; name: string; rowIds: string[]; oldIds: string[] }[] = [];
  const itemMaps = new Map<string, Map<string, string>>();
  // Allocate all names and item IDs first: two copied databases may refer to one another.
  for (const source of new Set(sources)) {
    const data = datasets.find(node => node?.attributes?.name === source);
    if (!data) return;
    let suffix = 2, name = `${source}-copy`;
    while (taken.has(name)) name = `${source}-copy-${suffix++}`;
    taken.add(name); names.set(source, name);
    const raw = sourceOf(data), rowIds = raw.records.map(() => newItemId());
    copies.push({ data, name, rowIds, oldIds: raw.rowIds });
    itemMaps.set(source, new Map(raw.rowIds.flatMap((id, index) => id ? [[id, rowIds[index]]] : [])));
  }
  for (const { data, name, rowIds, oldIds } of copies) {
    const raw = sourceOf(data);
    const fields = raw.fields.map(field => field.relation && names.has(field.relation.source)
      ? { ...field, relation: { ...field.relation, source: names.get(field.relation.source)! } } : field);
    const records = raw.records.map(record => {
      const next = structuredClone(record);
      for (const field of raw.fields) {
        const ids = field.relation && itemMaps.get(field.relation.source);
        if (ids && Array.isArray(next[field.name])) next[field.name] = (next[field.name] as unknown[]).map(id => typeof id === 'string' ? ids.get(id) ?? id : id);
      }
      return next;
    });
    operations.push(addChild(at.box.sid, { stype: 'dataset', attributes: {
      ...structuredClone(data.attributes), name, fields, records, rowIds
    } } as never));
    rowIds.forEach((id, index) => {
      const body = itemResource(editor, oldIds[index]);
      if (body) operations.push(addChild(at.box!.sid!, { ...treeOf(editor, body), attributes: { ...structuredClone(body.attributes), id } } as never));
    });
  }
  return { operations, names };
}
