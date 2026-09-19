/** Shared dataset field vocabulary; products own views and editing commands. */
export type DataFieldKind =
  | 'text'
  | 'longText'
  | 'richText'
  | 'number'
  | 'boolean'
  | 'date'
  | 'choice'
  | 'choices'
  | 'colour'
  | 'image'
  | 'page'
  | 'url'
  | 'email'
  | 'phone'
  | 'relation'
  | 'formula'
  | 'rollup';

/** Shared field kinds, including references and computed display values. */
export const DATA_FIELD_KINDS: readonly DataFieldKind[] = [
  'text',
  'longText',
  'richText',
  'number',
  'boolean',
  'date',
  'choice',
  'choices',
  'colour',
  'image',
  'page',
  'url',
  'email',
  'phone',
  'relation',
  'formula',
  'rollup'
];

export interface DataField {
  /** What a `field:` reference names. Durable, like every other reference in this schema. */
  name: string;
  kind: DataFieldKind;
  /** What a reader is shown instead of the name, when the name is not what they would say. */
  label?: string;
  /** The values a `choice` may take. Nothing else reads it. */
  options?: string[];
  relation?: { source: string; multiple?: boolean };
  formula?: { expression: string };
  rollup?: { relationField: string; field: string; operation: 'count' | 'sum' | 'average' | 'min' | 'max' };
}

/** One column, from either shape a document may have written. */
export function fieldOf(one: unknown): DataField | undefined {
  if (typeof one === 'string') return one.trim() ? { name: one, kind: 'text' } : undefined;
  if (!one || typeof one !== 'object' || Array.isArray(one)) return undefined;

  const said = one as Record<string, unknown>;
  if (typeof said.name !== 'string' || !said.name.trim()) return undefined;

  const kind = DATA_FIELD_KINDS.includes(said.kind as DataFieldKind) ? (said.kind as DataFieldKind) : 'text';
  const options = Array.isArray(said.options)
    ? said.options.filter((each): each is string => typeof each === 'string')
    : undefined;

  const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const relation = object(said.relation), formula = object(said.formula), rollup = object(said.rollup);
  return {
    name: said.name,
    kind,
    label: typeof said.label === 'string' && said.label ? said.label : undefined,
    /* Only where it means something. A list of choices on a date is a value nothing reads. */
    options: (kind === 'choice' || kind === 'choices') && options?.length ? [...options] : undefined,
    ...(kind === 'relation' && typeof relation.source === 'string' && relation.source.trim() ? { relation: { source: relation.source, ...(typeof relation.multiple === 'boolean' ? { multiple: relation.multiple } : {}) } } : {}),
    ...(kind === 'formula' && typeof formula.expression === 'string' ? { formula: { expression: formula.expression } } : {}),
    ...(kind === 'rollup' && typeof rollup.relationField === 'string' && typeof rollup.field === 'string' && ['count', 'sum', 'average', 'min', 'max'].includes(String(rollup.operation)) ? { rollup: { relationField: rollup.relationField, field: rollup.field, operation: rollup.operation as NonNullable<DataField['rollup']>['operation'] } } : {})
  };
}

/** Every column a dataset declares, in the order it declares them. */
export function fieldsFrom(said: unknown): DataField[] {
  if (!Array.isArray(said)) return [];
  const found: DataField[] = [];
  const seen = new Set<string>();
  for (const one of said) {
    const field = fieldOf(one);
    /* One column per name: two `제목`s is a `field:제목` that means whichever came first. */
    if (!field || seen.has(field.name)) continue;
    seen.add(field.name);
    found.push(field);
  }
  return found;
}

/** Just the names, for the many callers that only ever wanted those. */
export function columnNames(fields: DataField[] | undefined): string[] {
  return (fields ?? []).map((one) => one.name);
}

/** What a column declares, by name. */
export function fieldNamed(fields: DataField[] | undefined, name: unknown): DataField | undefined {
  return typeof name === 'string' ? (fields ?? []).find((one) => one.name === name) : undefined;
}


export { datasetRows } from './dataset-query';
export type { DatasetRowQuery } from './dataset-query';
