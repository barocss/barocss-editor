// VS Code when clause context reference:
// https://code.visualstudio.com/api/references/when-clause-contexts

type TokenType =
  | 'IDENT'
  | 'STRING'
  | 'NUMBER'
  | 'OP'
  | 'LPAREN'
  | 'RPAREN'
  | 'IN'
  | 'NOT_IN'
  | 'MATCH';

interface Token {
  type: TokenType;
  value: string;
  raw?: string; // 원본 문자열 (정규식 등에서 사용)
}

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < expr.length) {
    const ch = expr[i];

    // 공백 스킵
    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    // 괄호
    if (ch === '(') {
      tokens.push({ type: 'LPAREN', value: ch });
      i++;
      continue;
    }
    if (ch === ')') {
      tokens.push({ type: 'RPAREN', value: ch });
      i++;
      continue;
    }

    // 문자열 리터럴 (단일 따옴표 또는 큰따옴표)
    if (ch === "'" || ch === '"') {
      const quote = ch;
      let j = i + 1;
      let value = '';
      let escaped = false;
      while (j < expr.length) {
        if (escaped) {
          value += expr[j];
          escaped = false;
          j++;
        } else if (expr[j] === '\\') {
          escaped = true;
          j++;
        } else if (expr[j] === quote) {
          break;
        } else {
          value += expr[j];
          j++;
        }
      }
      tokens.push({ type: 'STRING', value });
      i = j + 1;
      continue;
    }

    // 정규식 리터럴 `/pattern/flags`
    if (ch === '/') {
      let j = i + 1;
      let pattern = '';
      let flags = '';
      let inPattern = true;
      let escaped = false;

      while (j < expr.length) {
        if (escaped) {
          if (inPattern) {
            pattern += expr[j];
          } else {
            flags += expr[j];
          }
          escaped = false;
          j++;
        } else if (expr[j] === '\\') {
          escaped = true;
          j++;
        } else if (expr[j] === '/' && inPattern) {
          inPattern = false;
          j++;
        } else if (inPattern) {
          pattern += expr[j];
          j++;
        } else if (/[gimsuvy]/.test(expr[j])) {
          flags += expr[j];
          j++;
        } else {
          break;
        }
      }
      tokens.push({ type: 'MATCH', value: pattern, raw: `/${pattern}/${flags}` });
      i = j;
      continue;
    }

    // "not in"
    if (expr.slice(i, i + 6) === 'not in' && (i + 6 >= expr.length || /\s/.test(expr[i + 6]))) {
      tokens.push({ type: 'NOT_IN', value: 'not in' });
      i += 6;
      continue;
    }

    // "in"
    if (
      expr.slice(i, i + 2) === 'in' &&
      (i === 0 || /\s/.test(expr[i - 1])) &&
      (i + 2 >= expr.length || /\s/.test(expr[i + 2]))
    ) {
      tokens.push({ type: 'IN', value: 'in' });
      i += 2;
      continue;
    }

    // 3-4자 연산자
    const fourChar = expr.slice(i, i + 4);
    if (fourChar === '!===' || fourChar === '===') {
      tokens.push({ type: 'OP', value: fourChar === '===' ? '==' : '!=' });
      i += 4;
      continue;
    }

    const threeChar = expr.slice(i, i + 3);
    if (threeChar === '!==' || threeChar === '===') {
      tokens.push({ type: 'OP', value: threeChar === '===' ? '==' : '!=' });
      i += 3;
      continue;
    }

    // 2자 연산자
    const twoChar = expr.slice(i, i + 2);
    if (
      twoChar === '&&' ||
      twoChar === '||' ||
      twoChar === '==' ||
      twoChar === '!=' ||
      twoChar === '<=' ||
      twoChar === '>=' ||
      twoChar === '=~'
    ) {
      tokens.push({ type: 'OP', value: twoChar });
      i += 2;
      continue;
    }

    // 1자 연산자
    if (ch === '!' || ch === '=' || ch === '<' || ch === '>') {
      tokens.push({ type: 'OP', value: ch });
      i++;
      continue;
    }

    // 숫자 리터럴 (정수 또는 소수점, .5 같은 형식도 지원)
    if (/\d/.test(ch) || (ch === '.' && i + 1 < expr.length && /\d/.test(expr[i + 1]))) {
      let j = i;
      let value = '';
      // .5 같은 형식도 지원
      if (ch === '.') {
        value = '0.'; // .5를 0.5로 변환하기 위해
        j = i + 1;
      }
      while (j < expr.length && /[\d.]/.test(expr[j])) {
        value += expr[j++];
      }
      const num = parseFloat(value);
      if (!isNaN(num)) {
        tokens.push({ type: 'NUMBER', value: String(num) });
        i = j;
        continue;
      }
    }

    // 식별자
    if (/[a-zA-Z_$]/.test(ch)) {
      let j = i;
      let value = '';
      while (j < expr.length && /[a-zA-Z0-9_$.]/.test(expr[j])) {
        value += expr[j++];
      }
      tokens.push({ type: 'IDENT', value });
      i = j;
      continue;
    }

    // 알 수 없는 문자 → 스킵
    i++;
  }

  return tokens;
}

class WhenParser {
  private tokens: Token[];
  private pos = 0;
  private ctx: Record<string, unknown>;

  constructor(tokens: Token[], ctx: Record<string, unknown>) {
    this.tokens = tokens;
    this.ctx = ctx;
  }

  parse(): boolean {
    const value = this.parseOr();
    return Boolean(value);
  }

  private peek(): Token | null {
    return this.tokens[this.pos] ?? null;
  }

  private consume(): Token | null {
    return this.tokens[this.pos++] ?? null;
  }

  // || (가장 낮은 우선순위)
  private parseOr(): boolean {
    let left = Boolean(this.parseAnd());
    while (this.peek()?.type === 'OP' && this.peek()!.value === '||') {
      this.consume();
      const right = Boolean(this.parseAnd());
      left = left || right;
    }
    return left;
  }

  // && (중간 우선순위)
  private parseAnd(): unknown {
    let left = this.parseIn();
    while (this.peek()?.type === 'OP' && this.peek()!.value === '&&') {
      this.consume();
      const right = this.parseIn();
      left = Boolean(left) && Boolean(right);
    }
    return left;
  }

  // in / not in
  private parseIn(): unknown {
    let left = this.parseComparison();
    const next = this.peek();
    if (next && (next.type === 'IN' || next.type === 'NOT_IN')) {
      this.consume();
      const right = this.parsePrimary();
      const leftVal = this.toValue(left);
      const rightVal = right;

      if (Array.isArray(rightVal)) {
        const result = rightVal.includes(leftVal);
        return next.type === 'IN' ? result : !result;
      }
      if (typeof rightVal === 'object' && rightVal !== null) {
        const result = leftVal in rightVal;
        return next.type === 'IN' ? result : !result;
      }
      return false;
    }
    return left;
  }

  // 비교 연산자: >, >=, <, <=
  private parseComparison(): unknown {
    let left = this.parseEquality();
    const next = this.peek();
    if (next && next.type === 'OP' && ['>', '>=', '<', '<='].includes(next.value)) {
      this.consume();
      const right = this.parseEquality();
      const leftNum = this.toNumber(left);
      const rightNum = this.toNumber(right);

      if (isNaN(leftNum) || isNaN(rightNum)) {
        return false;
      }

      switch (next.value) {
        case '>':
          return leftNum > rightNum;
        case '>=':
          return leftNum >= rightNum;
        case '<':
          return leftNum < rightNum;
        case '<=':
          return leftNum <= rightNum;
        default:
          return false;
      }
    }
    return left;
  }

  // 동등 연산자: ==, !=
  private parseEquality(): unknown {
    let left = this.parseMatch();
    const next = this.peek();
    if (next && next.type === 'OP' && (next.value === '==' || next.value === '!=')) {
      this.consume();
      const right = this.parseMatch();
      const leftVal = this.toValue(left);
      const rightVal = this.toValue(right);
      const equal = leftVal === rightVal;
      return next.value === '==' ? equal : !equal;
    }
    return left;
  }

  // =~ (정규식 매칭)
  private parseMatch(): unknown {
    let left = this.parseUnary();
    const next = this.peek();
    if (next && next.type === 'OP' && next.value === '=~') {
      this.consume();
      const regexToken = this.peek();
      if (regexToken && regexToken.type === 'MATCH') {
        this.consume();
        try {
          const pattern = regexToken.value;
          const raw = regexToken.raw || `/${pattern}/`;
          const flagsMatch = raw.match(/\/([gimsuvy]*)$/);
          const flags = (flagsMatch?.[1] || '').replace(/[gy]/g, '');
          const regex = new RegExp(pattern, flags);
          const leftVal = String(this.toValue(left));
          return regex.test(leftVal);
        } catch (e) {
          console.warn('[WhenParser] Invalid regex pattern:', regexToken.raw, e);
          return false;
        }
      }
      return false;
    }
    return left;
  }

  // 단항 연산자: !
  private parseUnary(): unknown {
    const next = this.peek();
    if (next && next.type === 'OP' && next.value === '!') {
      this.consume();
      return !Boolean(this.parseUnary());
    }
    return this.parsePrimary();
  }

  // 기본 값
  private parsePrimary(): unknown {
    const token = this.consume();
    if (!token) return false;

    if (token.type === 'LPAREN') {
      const value = this.parseOr();
      if (this.peek()?.type === 'RPAREN') {
        this.consume();
      }
      return value;
    }

    if (token.type === 'IDENT') {
      if (token.value === 'true') return true;
      if (token.value === 'false') return false;
      return this.ctx[token.value];
    }

    if (token.type === 'STRING') {
      return token.value;
    }

    if (token.type === 'NUMBER') {
      return parseFloat(token.value);
    }

    return false;
  }

  private toValue(v: unknown): string {
    if (typeof v === 'string') return v;
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (typeof v === 'number') return String(v);
    if (v == null) return '';
    return String(v);
  }

  private toNumber(v: unknown): number {
    if (typeof v === 'number') return v;
    if (typeof v === 'string') {
      const num = parseFloat(v);
      return isNaN(num) ? NaN : num;
    }
    if (typeof v === 'boolean') return v ? 1 : 0;
    return NaN;
  }
}

export function evaluateWhenExpression(expr: string, context: Record<string, unknown>): boolean {
  if (!expr || !expr.trim()) {
    return true;
  }
  const tokens = tokenize(expr);
  if (tokens.length === 0) {
    return true;
  }
  const parser = new WhenParser(tokens, context);
  return parser.parse();
}


