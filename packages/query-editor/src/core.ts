export type QueryValueKind = 'text' | 'option' | 'person' | 'location' | 'date' | 'boolean';

export interface QueryOption {
  value: string;
  label: string;
  description?: string;
  keywords?: readonly string[];
  disabled?: boolean;
}

export interface QueryOperator {
  key: string;
  label: string;
  description?: string;
  placeholder?: string;
  kind?: QueryValueKind;
  multiple?: boolean;
  aliases?: readonly string[];
  options?: readonly QueryOption[];
}

export interface QueryFilter {
  key: string;
  value: string;
  negated?: boolean;
}

export interface QueryDocument {
  text: string;
  filters: readonly QueryFilter[];
}

export interface QueryFragment {
  prefix: string;
  value: string;
}

export interface ParsedFilterFragment {
  key: string;
  value: string;
  negated: boolean;
}

const keyPattern = /^[a-z][a-z0-9_-]*$/i;

export const commonQueryOperators: readonly QueryOperator[] = [
  { key: 'from', label: '작성자', description: '작성자 또는 보낸 사람', kind: 'person', multiple: true },
  { key: 'in', label: '위치', description: '채널, 폴더 또는 프로젝트', kind: 'location', multiple: true },
  { key: 'type', label: '유형', description: '문서 또는 결과 유형', kind: 'option', multiple: true },
  { key: 'after', label: '시작일', description: '이 날짜 이후', kind: 'date', multiple: false },
  { key: 'before', label: '종료일', description: '이 날짜 이전', kind: 'date', multiple: false },
  { key: 'has', label: '포함', description: '링크, 첨부 파일 또는 멘션', kind: 'option', multiple: true },
  { key: 'status', label: '상태', description: '작업 또는 문서 상태', kind: 'option', multiple: true },
] as const;

interface QueryPart {
  raw: string;
  value: string;
}

function readParts(source: string): QueryPart[] {
  const parts: QueryPart[] = [];
  let raw = '';
  let value = '';
  let quote = false;
  let escaped = false;
  for (const character of source.trim()) {
    if (escaped) {
      raw += character;
      value += character;
      escaped = false;
    } else if (character === '\\') {
      raw += character;
      escaped = true;
    } else if (character === '"') {
      raw += character;
      quote = !quote;
    } else if (/\s/.test(character) && !quote) {
      if (raw) parts.push({ raw, value });
      raw = '';
      value = '';
    } else {
      raw += character;
      value += character;
    }
  }
  if (escaped) value += '\\';
  if (raw) parts.push({ raw, value });
  return parts;
}

function operatorKey(key: string, operators: readonly QueryOperator[]): string | undefined {
  const normalized = key.toLocaleLowerCase();
  return operators.find(operator =>
    operator.key.toLocaleLowerCase() === normalized ||
    operator.aliases?.some(alias => alias.toLocaleLowerCase() === normalized),
  )?.key;
}

export function parseFilterFragment(
  fragment: string,
  operators: readonly QueryOperator[] = commonQueryOperators,
): ParsedFilterFragment | undefined {
  const parts = readParts(fragment);
  const decoded = parts.length === 1 ? parts[0].value : fragment;
  const negated = decoded.startsWith('-');
  const body = negated ? decoded.slice(1) : decoded;
  const separator = body.indexOf(':');
  if (separator <= 0) return undefined;
  const rawKey = body.slice(0, separator);
  const value = body.slice(separator + 1);
  if (!keyPattern.test(rawKey) || !value) return undefined;
  const key = operatorKey(rawKey, operators);
  return key ? { key, value, negated } : undefined;
}

export function parseQuery(
  source: string,
  operators: readonly QueryOperator[] = commonQueryOperators,
): QueryDocument {
  const text: string[] = [];
  const filters: QueryFilter[] = [];
  for (const part of readParts(source)) {
    const filter = parseFilterFragment(part.raw, operators);
    if (filter) filters.push(filter);
    else text.push(part.raw);
  }
  return { text: text.join(' '), filters };
}

function quote(value: string): string {
  if (value && !/[\s"\\]/.test(value)) return value;
  return `"${value.replace(/(["\\])/g, '\\$1')}"`;
}

export function stringifyQuery(document: QueryDocument): string {
  return [
    document.text.trim(),
    ...document.filters.map(filter => `${filter.negated ? '-' : ''}${filter.key}:${quote(filter.value)}`),
  ].filter(Boolean).join(' ');
}

export function splitQueryFragment(text: string): QueryFragment {
  const match = text.match(/^(.*\s)?([^\s]*)$/s);
  return { prefix: match?.[1] ?? '', value: match?.[2] ?? text };
}

export function findQueryOperator(
  key: string,
  operators: readonly QueryOperator[] = commonQueryOperators,
): QueryOperator | undefined {
  const canonical = operatorKey(key.replace(/^-/, ''), operators);
  return canonical ? operators.find(operator => operator.key === canonical) : undefined;
}

export function filterQueryOperators(
  input: string,
  operators: readonly QueryOperator[] = commonQueryOperators,
): readonly QueryOperator[] {
  const query = input.replace(/^-/, '').toLocaleLowerCase();
  return operators.filter(operator => `${operator.key} ${operator.label} ${operator.description ?? ''} ${operator.aliases?.join(' ') ?? ''}`
    .toLocaleLowerCase().includes(query));
}

export function filterQueryOptions(options: readonly QueryOption[], input: string): readonly QueryOption[] {
  const query = input.trim().toLocaleLowerCase();
  if (!query) return options;
  return options.filter(option => `${option.value} ${option.label} ${option.description ?? ''} ${option.keywords?.join(' ') ?? ''}`
    .toLocaleLowerCase().includes(query));
}

export function addQueryFilter(
  document: QueryDocument,
  filter: QueryFilter,
  operators: readonly QueryOperator[] = commonQueryOperators,
): QueryDocument {
  const operator = findQueryOperator(filter.key, operators);
  const filters = operator?.multiple === false
    ? document.filters.filter(current => current.key !== filter.key)
    : document.filters;
  return { ...document, filters: [...filters, filter] };
}

export function removeQueryFilter(document: QueryDocument, index: number): QueryDocument {
  return { ...document, filters: document.filters.filter((_, current) => current !== index) };
}

export function mergeQueryText(
  document: QueryDocument,
  operators: readonly QueryOperator[] = commonQueryOperators,
): QueryDocument {
  const parsed = parseQuery(document.text, operators);
  return parsed.filters.reduce(
    (next, filter) => addQueryFilter(next, filter, operators),
    { text: parsed.text, filters: document.filters },
  );
}

export function optionLabel(operator: QueryOperator | undefined, value: string): string {
  return operator?.options?.find(option => option.value === value)?.label ?? value;
}
