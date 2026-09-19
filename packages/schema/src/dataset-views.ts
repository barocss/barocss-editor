import { normalizeDatasetFilters, type DatasetFilterGroup, type DatasetSort } from './dataset-query';
import type { DataField } from './dataset-fields';

export interface DatasetView {
  id: string;
  name: string;
  view: 'table' | 'board' | 'gallery' | 'calendar';
  dateField: string;
  cardPreview: 'none' | 'content';
  cardSize: 'small' | 'medium' | 'large';
  filters?: DatasetFilterGroup;
  sorts?: DatasetSort[];
  where: string;
  equals: string;
  sortBy: string;
  sortDir: 'asc' | 'desc';
  groupBy: string;
  hiddenFields: string[];
}
type Payload = Record<string, unknown>;
const object = (value: unknown): value is Payload => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown) => typeof value === 'string' ? value : '';
const nameOf = (value: unknown) => text(value).trim();
const layoutName = (view: string) => (({ board: '보드', gallery: '갤러리', calendar: '캘린더' } as Record<string, string>)[view] ?? '테이블');

export function normalizeDatasetView(value: Payload, fields: readonly DataField[]): DatasetView {
  const has = (value: unknown) => fields.some(field => field.name === value);
  const title = fields.find(field => field.kind === 'text')?.name;
  const view = (['board', 'gallery', 'calendar'].includes(String(value.view)) ? value.view : 'table') as DatasetView['view'];
  const filters = normalizeDatasetFilters(value.filters, fields.map(field => field.name));
  return {
    dateField: value.dateField === '' ? '' : fields.some(field => field.name === value.dateField && field.kind === 'date') ? text(value.dateField) : fields.find(field => field.kind === 'date')?.name ?? '',
    cardPreview: value.cardPreview === 'none' ? 'none' : 'content',
    cardSize: value.cardSize === 'small' || value.cardSize === 'large' ? value.cardSize : 'medium',
    ...(filters ? { filters } : {}),
    ...(Array.isArray(value.sorts) ? { sorts: value.sorts.filter(sort => object(sort) && has(sort.field) && ['asc', 'desc'].includes(String(sort.direction))).map(sort => ({ field: text(sort.field), direction: sort.direction as 'asc' | 'desc' })) } : {}),
    id: text(value.id), name: nameOf(value.name) || layoutName(view), view,
    where: has(value.where) ? text(value.where) : '', equals: text(value.equals),
    sortBy: has(value.sortBy) ? text(value.sortBy) : '', sortDir: value.sortDir === 'desc' ? 'desc' : 'asc',
    groupBy: has(value.groupBy) ? text(value.groupBy) : '',
    hiddenFields: Array.isArray(value.hiddenFields) ? [...new Set(value.hiddenFields.filter((name): name is string => typeof name === 'string' && has(name) && name !== title))] : []
  };
}

/** Read saved profiles without writing; legacy scalar settings remain a single default view. */
export function readDatasetViews(attrs: Record<string, unknown>, fields: readonly DataField[]): { views: DatasetView[]; activeId: string } {
  const seen = new Set<string>();
  const views = (Array.isArray(attrs.views) ? attrs.views : []).flatMap(value => {
    if (!object(value) || !nameOf(value.id) || seen.has(text(value.id))) return [];
    seen.add(text(value.id)); return [normalizeDatasetView(value, fields)];
  });
  if (!views.length) views.push(normalizeDatasetView({ ...attrs, id: 'default', name: layoutName(text(attrs.view)) }, fields));
  return { views, activeId: views.some(view => view.id === attrs.activeViewId) ? String(attrs.activeViewId) : views[0].id };
}
