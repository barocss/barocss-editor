export type JqlOperator =
  | '=' | '!=' | '~' | '!~' | '>' | '>=' | '<' | '<='
  | 'IN' | 'NOT IN' | 'IS' | 'IS NOT'
  | 'WAS' | 'WAS IN' | 'WAS NOT' | 'WAS NOT IN' | 'CHANGED';

export interface JqlCatalogValue {
  value: string;
  label?: string;
  description?: string;
  quoted?: boolean;
}

export interface JqlField {
  key: string;
  label: string;
  description?: string;
  type: 'text' | 'option' | 'user' | 'date' | 'number' | 'work-item';
  operators: readonly JqlOperator[];
  values?: readonly JqlCatalogValue[];
  functions?: readonly string[];
}

export interface JqlFunction {
  name: string;
  label?: string;
  description?: string;
  arguments?: string;
}

export interface JqlCatalog {
  fields: readonly JqlField[];
  functions?: readonly JqlFunction[];
}

export interface JqlRange { from: number; to: number }

export type JqlValue =
  | ({ kind: 'literal'; value: string; quoted: boolean } & JqlRange)
  | ({ kind: 'function'; name: string; arguments: readonly JqlValue[] } & JqlRange);

export type JqlOperand =
  | ({ kind: 'value'; value: JqlValue } & JqlRange)
  | ({ kind: 'list'; values: readonly JqlValue[] } & JqlRange);

export interface JqlClause extends JqlRange {
  type: 'clause';
  field: string;
  operator: JqlOperator;
  operand?: JqlOperand;
}

export interface JqlLogicalExpression extends JqlRange {
  type: 'logical';
  operator: 'AND' | 'OR';
  left: JqlExpression;
  right: JqlExpression;
}

export interface JqlNotExpression extends JqlRange {
  type: 'not';
  expression: JqlExpression;
}

export interface JqlGroupExpression extends JqlRange {
  type: 'group';
  expression: JqlExpression;
}

export type JqlExpression = JqlClause | JqlLogicalExpression | JqlNotExpression | JqlGroupExpression;

export interface JqlOrder extends JqlRange {
  field: string;
  direction: 'ASC' | 'DESC';
}

export interface JqlDocument {
  expression?: JqlExpression;
  orderBy: readonly JqlOrder[];
}

export interface JqlDiagnostic extends JqlRange {
  severity: 'error' | 'warning';
  message: string;
  code: 'syntax' | 'unknown-field' | 'invalid-operator' | 'unknown-function';
}

export interface JqlParseResult {
  source: string;
  document: JqlDocument;
  diagnostics: readonly JqlDiagnostic[];
  valid: boolean;
}

type TokenKind = 'word' | 'string' | 'number' | 'operator' | 'lparen' | 'rparen' | 'comma';
interface Token extends JqlRange { kind: TokenKind; value: string; raw: string; closed?: boolean }

const word = /[A-Za-z0-9_.\-[\]]/;
const symbolicOperators = ['!=', '>=', '<=', '!~', '=', '~', '>', '<'] as const;
const operatorWords = new Set(['IN', 'IS', 'NOT', 'WAS', 'CHANGED']);

function tokenizeJql(source: string): Token[] {
  const tokens: Token[] = [];
  let at = 0;
  while (at < source.length) {
    if (/\s/.test(source[at])) { at += 1; continue; }
    const from = at;
    const character = source[at];
    if (character === '"' || character === "'") {
      const delimiter = character;
      let value = '';
      let escaped = false;
      at += 1;
      while (at < source.length) {
        const current = source[at++];
        if (escaped) { value += current; escaped = false; }
        else if (current === '\\') escaped = true;
        else if (current === delimiter) break;
        else value += current;
      }
      tokens.push({ kind: 'string', value, raw: source.slice(from, at), from, to: at, closed: source[at - 1] === delimiter });
      continue;
    }
    if (character === '(' || character === ')' || character === ',') {
      tokens.push({ kind: character === '(' ? 'lparen' : character === ')' ? 'rparen' : 'comma', value: character, raw: character, from, to: ++at });
      continue;
    }
    const symbolic = symbolicOperators.find(operator => source.startsWith(operator, at));
    if (symbolic) {
      at += symbolic.length;
      tokens.push({ kind: 'operator', value: symbolic, raw: symbolic, from, to: at });
      continue;
    }
    while (at < source.length && word.test(source[at])) at += 1;
    if (at === from) {
      at += 1;
      tokens.push({ kind: 'word', value: character, raw: character, from, to: at });
      continue;
    }
    const raw = source.slice(from, at);
    tokens.push({ kind: /^-?\d+(?:\.\d+)?$/.test(raw) ? 'number' : 'word', value: raw, raw, from, to: at });
  }
  return tokens;
}

class JqlParser {
  private at = 0;
  readonly diagnostics: JqlDiagnostic[] = [];

  constructor(private readonly source: string, private readonly tokens: readonly Token[], private readonly catalog?: JqlCatalog) {
    for (const token of tokens) {
      if (token.kind === 'string' && !token.closed) this.error('따옴표를 닫으세요.', token.from, token.to);
    }
  }

  parse(): JqlDocument {
    const expression = this.atEnd() || this.isWord('ORDER') ? undefined : this.parseOr();
    const orderBy: JqlOrder[] = [];
    if (this.takeWord('ORDER')) {
      if (!this.takeWord('BY')) this.error('ORDER 뒤에 BY가 필요합니다.', this.currentFrom(), this.currentTo());
      while (!this.atEnd()) {
        const field = this.takeField();
        if (!field) { this.error('정렬할 필드를 입력하세요.', this.currentFrom(), this.currentTo()); break; }
        const direction = this.takeWord('DESC') ? 'DESC' : (this.takeWord('ASC'), 'ASC');
        orderBy.push({ field: field.value, direction, from: field.from, to: this.previousTo() });
        if (!this.takeKind('comma')) break;
      }
    }
    if (!this.atEnd()) this.error(`예상하지 못한 '${this.peek()?.raw ?? ''}' 항목입니다.`, this.currentFrom(), this.currentTo());
    return { expression, orderBy };
  }

  private parseOr(): JqlExpression | undefined {
    let left = this.parseAnd();
    while (left && this.takeWord('OR')) {
      const right = this.parseAnd();
      if (!right) { this.error('OR 뒤에 조건이 필요합니다.', this.currentFrom(), this.currentTo()); break; }
      left = { type: 'logical', operator: 'OR', left, right, from: left.from, to: right.to };
    }
    return left;
  }

  private parseAnd(): JqlExpression | undefined {
    let left = this.parseUnary();
    while (left && this.takeWord('AND')) {
      const right = this.parseUnary();
      if (!right) { this.error('AND 뒤에 조건이 필요합니다.', this.currentFrom(), this.currentTo()); break; }
      left = { type: 'logical', operator: 'AND', left, right, from: left.from, to: right.to };
    }
    return left;
  }

  private parseUnary(): JqlExpression | undefined {
    const not = this.takeWord('NOT');
    if (not) {
      const expression = this.parseUnary();
      if (!expression) { this.error('NOT 뒤에 조건이 필요합니다.', not.from, not.to); return undefined; }
      return { type: 'not', expression, from: not.from, to: expression.to };
    }
    if (this.takeKind('lparen')) {
      const start = this.previous()!;
      const expression = this.parseOr();
      if (!expression) { this.error('괄호 안에 조건을 입력하세요.', start.from, start.to); return undefined; }
      const close = this.takeKind('rparen');
      if (!close) this.error('닫는 괄호가 필요합니다.', expression.to, expression.to);
      return { type: 'group', expression, from: start.from, to: close?.to ?? expression.to };
    }
    return this.parseClause();
  }

  private parseClause(): JqlClause | undefined {
    const fieldToken = this.takeField();
    if (!fieldToken) return undefined;
    const field = this.catalog?.fields.find(item => item.key.toLocaleLowerCase() === fieldToken.value.toLocaleLowerCase());
    if (this.catalog && !field) this.warning(`알 수 없는 필드 '${fieldToken.value}'입니다.`, fieldToken.from, fieldToken.to, 'unknown-field');
    const operator = this.takeOperator();
    if (!operator) {
      this.error(`'${fieldToken.value}' 뒤에 연산자가 필요합니다.`, fieldToken.to, fieldToken.to);
      return undefined;
    }
    if (field && !field.operators.includes(operator.value)) {
      this.diagnostics.push({ severity: 'error', code: 'invalid-operator', message: `${field.label} 필드에는 ${operator.value} 연산자를 사용할 수 없습니다.`, from: operator.from, to: operator.to });
    }
    const needsList = ['IN', 'NOT IN', 'WAS IN', 'WAS NOT IN'].includes(operator.value);
    const optionalOperand = operator.value === 'CHANGED';
    let operand: JqlOperand | undefined;
    if (needsList) operand = this.parseList();
    else if (!optionalOperand || !this.atClauseBoundary()) {
      const value = this.parseValue();
      if (value) operand = { kind: 'value', value, from: value.from, to: value.to };
      else this.error(`${operator.value} 뒤에 값이 필요합니다.`, operator.to, operator.to);
    }
    return { type: 'clause', field: fieldToken.value, operator: operator.value, operand, from: fieldToken.from, to: operand?.to ?? operator.to };
  }

  private parseList(): JqlOperand | undefined {
    const open = this.takeKind('lparen');
    if (!open) { this.error('목록은 괄호로 감싸야 합니다.', this.currentFrom(), this.currentTo()); return undefined; }
    const values: JqlValue[] = [];
    while (!this.atEnd() && !this.isKind('rparen')) {
      const value = this.parseValue();
      if (!value) { this.error('목록 값을 입력하세요.', this.currentFrom(), this.currentTo()); break; }
      values.push(value);
      if (!this.takeKind('comma')) break;
    }
    const close = this.takeKind('rparen');
    if (!close) this.error('목록을 닫는 괄호가 필요합니다.', this.previousTo(), this.previousTo());
    return { kind: 'list', values, from: open.from, to: close?.to ?? this.previousTo() };
  }

  private parseValue(): JqlValue | undefined {
    const token = this.peek();
    if (!token || !['word', 'string', 'number'].includes(token.kind)) return undefined;
    this.at += 1;
    if (token.kind === 'word' && this.takeKind('lparen')) {
      const values: JqlValue[] = [];
      while (!this.atEnd() && !this.isKind('rparen')) {
        const value = this.parseValue();
        if (!value) break;
        values.push(value);
        if (!this.takeKind('comma')) break;
      }
      const close = this.takeKind('rparen');
      if (!close) this.error('함수를 닫는 괄호가 필요합니다.', this.previousTo(), this.previousTo());
      if (this.catalog?.functions && !this.catalog.functions.some(item => item.name.toLocaleLowerCase() === token.value.toLocaleLowerCase())) {
        this.warning(`알 수 없는 함수 '${token.value}()'입니다.`, token.from, close?.to ?? token.to, 'unknown-function');
      }
      return { kind: 'function', name: token.value, arguments: values, from: token.from, to: close?.to ?? this.previousTo() };
    }
    return { kind: 'literal', value: token.value, quoted: token.kind === 'string', from: token.from, to: token.to };
  }

  private takeOperator(): { value: JqlOperator } & JqlRange | undefined {
    const token = this.peek();
    if (!token) return undefined;
    if (token.kind === 'operator') { this.at += 1; return { value: token.value as JqlOperator, from: token.from, to: token.to }; }
    const first = token.value.toLocaleUpperCase();
    if (!operatorWords.has(first)) return undefined;
    this.at += 1;
    let value = first;
    if (first === 'NOT' && this.takeWord('IN')) value = 'NOT IN';
    else if (first === 'IS' && this.takeWord('NOT')) value = 'IS NOT';
    else if (first === 'WAS') {
      if (this.takeWord('NOT')) value = this.takeWord('IN') ? 'WAS NOT IN' : 'WAS NOT';
      else if (this.takeWord('IN')) value = 'WAS IN';
    }
    return { value: value as JqlOperator, from: token.from, to: this.previousTo() };
  }

  private takeField(): Token | undefined {
    const token = this.peek();
    if (token && (token.kind === 'word' || token.kind === 'string')) { this.at += 1; return token; }
    return undefined;
  }

  private atClauseBoundary(): boolean {
    return this.atEnd() || this.isWord('AND') || this.isWord('OR') || this.isWord('ORDER') || this.isKind('rparen');
  }

  private peek(offset = 0): Token | undefined { return this.tokens[this.at + offset]; }
  private previous(): Token | undefined { return this.tokens[this.at - 1]; }
  private previousTo(): number { return this.previous()?.to ?? this.source.length; }
  private currentFrom(): number { return this.peek()?.from ?? this.source.length; }
  private currentTo(): number { return this.peek()?.to ?? this.source.length; }
  private atEnd(): boolean { return this.at >= this.tokens.length; }
  private isKind(kind: TokenKind): boolean { return this.peek()?.kind === kind; }
  private isWord(value: string): boolean { return this.peek()?.kind === 'word' && this.peek()!.value.toLocaleUpperCase() === value; }
  private takeKind(kind: TokenKind): Token | undefined { if (!this.isKind(kind)) return undefined; return this.tokens[this.at++]; }
  private takeWord(value: string): Token | undefined { if (!this.isWord(value)) return undefined; return this.tokens[this.at++]; }
  private error(message: string, from: number, to: number): void { this.diagnostics.push({ severity: 'error', code: 'syntax', message, from, to }); }
  private warning(message: string, from: number, to: number, code: JqlDiagnostic['code']): void { this.diagnostics.push({ severity: 'warning', code, message, from, to }); }
}

export function parseJql(source: string, catalog?: JqlCatalog): JqlParseResult {
  const parser = new JqlParser(source, tokenizeJql(source), catalog);
  const document = parser.parse();
  return { source, document, diagnostics: parser.diagnostics, valid: !parser.diagnostics.some(item => item.severity === 'error') };
}

function quoteJql(value: string): string {
  return /^[A-Za-z0-9_.-]+$/.test(value) ? value : `"${value.replace(/(["\\])/g, '\\$1')}"`;
}

function valueToJql(value: JqlValue): string {
  if (value.kind === 'function') return `${value.name}(${value.arguments.map(valueToJql).join(', ')})`;
  return value.quoted ? `"${value.value.replace(/(["\\])/g, '\\$1')}"` : quoteJql(value.value);
}

function expressionToJql(expression: JqlExpression): string {
  if (expression.type === 'logical') return `${expressionToJql(expression.left)} ${expression.operator} ${expressionToJql(expression.right)}`;
  if (expression.type === 'not') return `NOT ${expressionToJql(expression.expression)}`;
  if (expression.type === 'group') return `(${expressionToJql(expression.expression)})`;
  const operand = expression.operand?.kind === 'list'
    ? `(${expression.operand.values.map(valueToJql).join(', ')})`
    : expression.operand?.kind === 'value' ? valueToJql(expression.operand.value) : '';
  return `${quoteJql(expression.field)} ${expression.operator}${operand ? ` ${operand}` : ''}`;
}

export function stringifyJql(document: JqlDocument): string {
  const where = document.expression ? expressionToJql(document.expression) : '';
  const order = document.orderBy.length
    ? `ORDER BY ${document.orderBy.map(item => `${quoteJql(item.field)} ${item.direction}`).join(', ')}`
    : '';
  return [where, order].filter(Boolean).join(' ');
}

export type JqlSuggestionKind = 'field' | 'operator' | 'value' | 'function' | 'keyword' | 'sort' | 'template';
export interface JqlSuggestion {
  id: string;
  kind: JqlSuggestionKind;
  label: string;
  detail?: string;
  insertText: string;
  from: number;
  to: number;
  cursorOffset?: number;
}

export interface JqlEdit { source: string; cursor: number }

const defaultFunctions: readonly JqlFunction[] = [
  { name: 'currentUser', label: '현재 사용자', description: '로그인한 사용자', arguments: '' },
  { name: 'startOfDay', label: '오늘 시작', description: '오늘 00:00', arguments: '' },
  { name: 'startOfWeek', label: '이번 주 시작', description: '이번 주의 시작', arguments: '' },
  { name: 'now', label: '현재 시각', description: '현재 날짜와 시각', arguments: '' },
];

const commonOperators: readonly JqlOperator[] = ['=', '!=', 'IN', 'NOT IN', 'IS', 'IS NOT', '~', '!~', '>', '>=', '<', '<='];

export const jiraJqlCatalog: JqlCatalog = {
  fields: [
    { key: 'project', label: '프로젝트', description: '프로젝트 키 또는 이름', type: 'option', operators: ['=', '!=', 'IN', 'NOT IN'], values: [{ value: 'PRODUCT' }, { value: 'DESIGN' }, { value: 'FINANCE' }] },
    { key: 'status', label: '상태', description: '업무 상태', type: 'option', operators: ['=', '!=', 'IN', 'NOT IN', 'IS', 'IS NOT', 'WAS', 'WAS IN', 'WAS NOT', 'WAS NOT IN', 'CHANGED'], values: [{ value: 'To Do', quoted: true }, { value: 'In Progress', quoted: true }, { value: 'Done', quoted: true }] },
    { key: 'assignee', label: '담당자', description: '업무 담당자', type: 'user', operators: ['=', '!=', 'IN', 'NOT IN', 'IS', 'IS NOT', 'WAS', 'CHANGED'], values: [{ value: 'minsu' }, { value: 'jiho' }, { value: 'sora' }], functions: ['currentUser'] },
    { key: 'reporter', label: '보고자', description: '업무를 만든 사용자', type: 'user', operators: ['=', '!=', 'IN', 'NOT IN', 'IS', 'IS NOT', 'WAS', 'CHANGED'], functions: ['currentUser'] },
    { key: 'priority', label: '우선순위', description: '업무 우선순위', type: 'option', operators: ['=', '!=', 'IN', 'NOT IN', 'IS', 'IS NOT', '>', '>=', '<', '<='], values: [{ value: 'Highest' }, { value: 'High' }, { value: 'Medium' }, { value: 'Low' }] },
    { key: 'issuetype', label: '업무 유형', description: 'Bug, Story 또는 Task', type: 'option', operators: ['=', '!=', 'IN', 'NOT IN', 'IS', 'IS NOT'], values: [{ value: 'Bug' }, { value: 'Story' }, { value: 'Task' }] },
    { key: 'summary', label: '제목', description: '제목 텍스트', type: 'text', operators: ['~', '!~', 'IS', 'IS NOT'] },
    { key: 'created', label: '생성일', description: '업무 생성 시각', type: 'date', operators: ['=', '!=', '>', '>=', '<', '<=', 'IS', 'IS NOT'], functions: ['startOfDay', 'startOfWeek', 'now'] },
    { key: 'updated', label: '수정일', description: '최근 수정 시각', type: 'date', operators: ['=', '!=', '>', '>=', '<', '<=', 'IS', 'IS NOT'], functions: ['startOfDay', 'startOfWeek', 'now'] },
    { key: 'resolution', label: '해결 상태', description: '해결 여부 또는 결과', type: 'option', operators: ['=', '!=', 'IN', 'NOT IN', 'IS', 'IS NOT'], values: [{ value: 'EMPTY' }, { value: 'Unresolved' }, { value: 'Done' }] },
  ],
  functions: defaultFunctions,
};

function suggestionFilter(label: string, detail: string | undefined, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase();
  return !needle || `${label} ${detail ?? ''}`.toLocaleLowerCase().includes(needle);
}

function replacementRange(source: string, cursor: number): JqlRange {
  let from = cursor;
  while (from > 0 && /[A-Za-z0-9_.-]/.test(source[from - 1])) from -= 1;
  return { from, to: cursor };
}

function fieldBySource(source: string, catalog: JqlCatalog): JqlField | undefined {
  const match = source.match(/^\s*(?:"([^"]+)"|([A-Za-z][\w.\-[\]]*))/);
  const key = match?.[1] ?? match?.[2];
  return key ? catalog.fields.find(field => field.key.toLocaleLowerCase() === key.toLocaleLowerCase()) : undefined;
}

export function getJqlSuggestions(source: string, cursor: number, catalog: JqlCatalog = jiraJqlCatalog): readonly JqlSuggestion[] {
  const before = source.slice(0, cursor);
  const range = replacementRange(source, cursor);
  const partial = source.slice(range.from, range.to);
  const orderField = before.match(/\bORDER\s+BY\s+([A-Za-z0-9_.-]*)$/i);
  if (orderField) {
    return catalog.fields.filter(field => suggestionFilter(field.key, field.label, orderField[1])).map(field => ({
      id: `sort:${field.key}`, kind: 'sort', label: field.key, detail: field.label, insertText: `${field.key} `, from: cursor - orderField[1].length, to: cursor,
    }));
  }
  if (/\bORDER\s+BY\s+[A-Za-z0-9_.-]+\s+[A-Za-z]*$/i.test(before)) {
    return ['ASC', 'DESC'].filter(value => value.startsWith(partial.toLocaleUpperCase())).map(value => ({
      id: `direction:${value}`, kind: 'sort', label: value, detail: value === 'ASC' ? '오름차순' : '내림차순', insertText: `${value} `, ...range,
    }));
  }

  const logicalBoundary = Math.max(
    before.toLocaleUpperCase().lastIndexOf(' AND '),
    before.toLocaleUpperCase().lastIndexOf(' OR '),
  );
  const lastParenthesis = before.lastIndexOf('(');
  const parenthesisStartsGroup = lastParenthesis >= 0
    && !/\b(?:IN|NOT\s+IN|WAS\s+IN|WAS\s+NOT\s+IN)\s*$/i.test(before.slice(0, lastParenthesis));
  const boundary = Math.max(logicalBoundary, parenthesisStartsGroup ? lastParenthesis : -1);
  const clause = before.slice(boundary < 0 ? 0 : boundary + 1).trimStart();
  const clauseFrom = cursor - clause.length;
  const fieldMatch = clause.match(/^(?:"([^"]+)"|([A-Za-z][\w.\-[\]]*))(\s*)(.*)$/s);
  if (!fieldMatch || (!fieldMatch[3] && !fieldMatch[4])) {
    const query = fieldMatch ? fieldMatch[1] ?? fieldMatch[2] : clause;
    return catalog.fields.filter(field => suggestionFilter(field.key, `${field.label} ${field.description ?? ''}`, query)).map(field => ({
      id: `field:${field.key}`, kind: 'field', label: field.key, detail: `${field.label}${field.description ? ` · ${field.description}` : ''}`, insertText: `${quoteJql(field.key)} `, from: clauseFrom, to: cursor,
    }));
  }

  const field = fieldBySource(clause, catalog);
  const rest = fieldMatch[4];
  const operatorMatch = rest.match(/^(NOT\s+IN|IS\s+NOT|WAS\s+NOT\s+IN|WAS\s+IN|WAS\s+NOT|IN|IS|WAS|CHANGED|!=|>=|<=|!~|=|~|>|<)(?:\s+|$)(.*)$/i);
  if (!operatorMatch) {
    const operatorQuery = rest.trim().toLocaleUpperCase();
    return (field?.operators ?? commonOperators).filter(operator => operator.startsWith(operatorQuery)).map(operator => {
      const list = ['IN', 'NOT IN', 'WAS IN', 'WAS NOT IN'].includes(operator);
      const insertText = list ? `${operator} (` : `${operator} `;
      return { id: `operator:${operator}`, kind: 'operator', label: operator, detail: field ? `${field.label}에 사용 가능` : undefined, insertText, from: cursor - rest.trim().length, to: cursor };
    });
  }

  const operator = operatorMatch[1].replace(/\s+/g, ' ').toLocaleUpperCase() as JqlOperator;
  const operand = operatorMatch[2];
  if (operand && !/[,(]\s*[^,)]*$/.test(operand) && /(?:\)|["'A-Za-z0-9_.-])\s+$/.test(before)) {
    return [
      { id: 'keyword:AND', kind: 'keyword', label: 'AND', detail: '모든 조건 충족', insertText: 'AND ', from: cursor, to: cursor },
      { id: 'keyword:OR', kind: 'keyword', label: 'OR', detail: '하나 이상의 조건 충족', insertText: 'OR ', from: cursor, to: cursor },
      { id: 'keyword:ORDER BY', kind: 'keyword', label: 'ORDER BY', detail: '결과 정렬', insertText: 'ORDER BY ', from: cursor, to: cursor },
    ];
  }
  const valuePartial = operand.split(/[,(]/).at(-1)?.trim() ?? operand.trim();
  const valueFrom = cursor - valuePartial.length;
  const values = field?.values ?? [];
  const functions = (catalog.functions ?? []).filter(item => !field?.functions || field.functions.includes(item.name));
  const valueSuggestions: JqlSuggestion[] = values.filter(item => suggestionFilter(item.value, `${item.label ?? ''} ${item.description ?? ''}`, valuePartial)).map(item => {
    const value = item.quoted || /\s/.test(item.value) ? `"${item.value}"` : item.value;
    const closesList = ['IN', 'NOT IN', 'WAS IN', 'WAS NOT IN'].includes(operator) && !before.slice(0, valueFrom).includes(')');
    return { id: `value:${item.value}`, kind: 'value', label: item.label ?? item.value, detail: item.description ?? item.value, insertText: closesList ? `${value}) ` : `${value} `, from: valueFrom, to: cursor };
  });
  const functionSuggestions: JqlSuggestion[] = functions.filter(item => suggestionFilter(item.name, `${item.label ?? ''} ${item.description ?? ''}`, valuePartial)).map(item => ({
    id: `function:${item.name}`, kind: 'function', label: `${item.name}()`, detail: item.label ?? item.description, insertText: `${item.name}(${item.arguments ?? ''}) `, from: valueFrom, to: cursor,
  }));
  if (['IS', 'IS NOT'].includes(operator)) {
    valueSuggestions.unshift({ id: 'value:EMPTY', kind: 'value', label: 'EMPTY', detail: '값이 없음', insertText: 'EMPTY ', from: valueFrom, to: cursor });
  }
  return [...valueSuggestions, ...functionSuggestions];
}

export function applyJqlSuggestion(source: string, suggestion: JqlSuggestion): JqlEdit {
  const next = `${source.slice(0, suggestion.from)}${suggestion.insertText}${source.slice(suggestion.to)}`;
  return { source: next, cursor: suggestion.from + (suggestion.cursorOffset ?? suggestion.insertText.length) };
}
