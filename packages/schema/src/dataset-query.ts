export const DATASET_FILTER_OPERATORS = ['equals', 'notEquals', 'contains', 'notContains', 'isEmpty', 'notEmpty', 'gt', 'gte', 'lt', 'lte', 'before', 'after', 'on'] as const;
export type DatasetFilterOperator = typeof DATASET_FILTER_OPERATORS[number];
export interface DatasetFilterRule { id: string; field: string; operator: DatasetFilterOperator; value?: string | number | boolean }
export interface DatasetFilterGroup { mode: 'and' | 'or'; rules: (DatasetFilterRule | DatasetFilterGroup)[] }
export interface DatasetSort { field: string; direction: 'asc' | 'desc' }
export interface DatasetRowQuery { where?: string; equals?: unknown; sortBy?: string; sortDir?: 'asc' | 'desc'; filters?: DatasetFilterGroup; sorts?: DatasetSort[] }
/** Preserve the authored calendar day; never reinterpret a date through a timezone. */
export function datasetLocalDay(value: unknown): string {
  if (typeof value !== 'string') return '';
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(value);
  if (!match) return '';
  const [, y, m, d] = match, year = Number(y), month = Number(m), day = Number(d);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return month >= 1 && month <= 12 && day >= 1 && day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ? `${y}-${m}-${d}` : '';
}
export function normalizeDatasetFilters(value: unknown, names: readonly string[], depth = 0): DatasetFilterGroup | undefined {
  if (!value || typeof value !== 'object' || depth > 2) return;
  const group = value as DatasetFilterGroup;
  if (!['and', 'or'].includes(group.mode) || !Array.isArray(group.rules)) return;
  const rules: DatasetFilterGroup['rules'] = [];
  for (const entry of group.rules.slice(0, 100)) {
    if (!entry || typeof entry !== 'object') continue;
    if ('rules' in entry) { const nested = normalizeDatasetFilters(entry, names, depth + 1); if (nested) rules.push(nested); }
    else if (names.includes(entry.field) && DATASET_FILTER_OPERATORS.includes(entry.operator)) rules.push({ id: typeof entry.id === 'string' ? entry.id : `rule-${rules.length}`, field: entry.field, operator: entry.operator, ...(['string', 'number', 'boolean'].includes(typeof entry.value) ? { value: entry.value } : {}) });
  }
  return { mode: group.mode, rules };
}
/** Strict command boundary, unlike tolerant import normalization. */
export function validDatasetFilters(value: unknown, names: readonly string[], depth = 0): value is DatasetFilterGroup {
  if (!value || typeof value !== 'object' || depth > 2) return false;
  const group = value as DatasetFilterGroup;
  if (!['and', 'or'].includes(group.mode) || !Array.isArray(group.rules) || group.rules.length > 100) return false;
  return group.rules.every(rule => {
    if (!rule || typeof rule !== 'object') return false;
    if ('rules' in rule) return validDatasetFilters(rule, names, depth + 1);
    if (typeof rule.id !== 'string' || !names.includes(rule.field) || !DATASET_FILTER_OPERATORS.includes(rule.operator)) return false;
    if (['isEmpty', 'notEmpty'].includes(rule.operator)) return true;
    if (['gt', 'gte', 'lt', 'lte'].includes(rule.operator)) return typeof rule.value === 'number' && Number.isFinite(rule.value);
    if (['before', 'after', 'on'].includes(rule.operator)) return !!datasetLocalDay(rule.value);
    return ['string', 'number', 'boolean'].includes(typeof rule.value);
  });
}
export function repairDatasetFilters(group: DatasetFilterGroup, from: string, to?: string): DatasetFilterGroup {
  return { ...group, rules: group.rules.flatMap<DatasetFilterRule | DatasetFilterGroup>(rule => {
    if ('rules' in rule) { const nested = repairDatasetFilters(rule, from, to); return nested.rules.length ? [nested] : []; }
    return rule.field !== from ? [rule] : to ? [{ ...rule, field: to }] : [];
  }) };
}
const label = (value: unknown): string => Array.isArray(value) ? value.map(label).join(', ') : String(value ?? '');
function matches(record: Record<string, unknown>, group: DatasetFilterGroup): boolean {
  if (!group.rules.length) return true;
  const test = (rule: DatasetFilterRule | DatasetFilterGroup): boolean => {
    if ('rules' in rule) return matches(record, rule);
    const raw = record[rule.field], left = label(raw), right = label(rule.value), empty = raw == null || left === '' || Array.isArray(raw) && !raw.length;
    switch (rule.operator) {
      case 'isEmpty': return empty;
      case 'notEmpty': return !empty;
      case 'equals': return Array.isArray(raw) ? raw.some(value => label(value) === right) : left === right;
      case 'notEquals': return Array.isArray(raw) ? raw.every(value => label(value) !== right) : left !== right;
      case 'contains': return left.toLocaleLowerCase().includes(right.toLocaleLowerCase());
      case 'notContains': return !left.toLocaleLowerCase().includes(right.toLocaleLowerCase());
      case 'on': case 'before': case 'after': { const a = datasetLocalDay(raw), b = datasetLocalDay(rule.value); return !!a && !!b && (rule.operator === 'on' ? a === b : rule.operator === 'before' ? a < b : a > b); }
      default: { if (empty || right === '' || !Number.isFinite(Number(raw)) || !Number.isFinite(Number(rule.value))) return false; const a = Number(raw), b = Number(rule.value); return rule.operator === 'gt' ? a > b : rule.operator === 'gte' ? a >= b : rule.operator === 'lt' ? a < b : a <= b; }
    }
  };
  return group.mode === 'or' ? group.rules.some(test) : group.rules.every(test);
}
/** Filtering/sorting never mutates raw records or loses their original edit indexes. */
export function datasetRows(records: Record<string, unknown>[], query: DatasetRowQuery = {}): { index: number; record: Record<string, unknown> }[] {
  let rows = records.map((record, index) => ({ record, index }));
  if (query.filters) rows = rows.filter(({ record }) => matches(record, query.filters!));
  else if (query.where) rows = rows.filter(({ record }) => String(record[query.where!] ?? '') === String(query.equals ?? ''));
  const sorts = query.sorts ?? (query.sortBy ? [{ field: query.sortBy, direction: query.sortDir ?? 'asc' }] : []);
  if (sorts.length) rows.sort((a, b) => {
    for (const sort of sorts) {
      const left = a.record[sort.field], right = b.record[sort.field];
      const delta = typeof left === 'number' && typeof right === 'number' ? left - right : label(left).localeCompare(label(right));
      if (delta) return sort.direction === 'desc' ? -delta : delta;
    }
    return a.index - b.index;
  });
  return rows;
}
