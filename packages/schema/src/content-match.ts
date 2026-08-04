/**
 * Content expression parser and matcher.
 *
 * Node content models are written as small grammars, e.g.
 *
 *   'block+'
 *   'inline*'
 *   'bSummary block+'                                  sequence
 *   '(descTerm descDef)+'                              repeated group
 *   '(bTableHeader)? bTableBody+ (bTableFooter)?'      optional + sequence
 *   '(inline-image|bTable|codeBlock)+ bFigcaption?'    choice + sequence
 *   'paragraph{1,3}'                                   counted repetition
 *
 * A name matches either a node type or a node group. The previous
 * implementation only inspected the last character of the whole string, so any
 * expression with a sequence or a group was rejected outright — every bTable,
 * bDetails, descList and bFigure in the standard schema failed validation
 * against its own definition.
 *
 * Matching is NFA simulation over the parsed expression. It is linear in
 * (content length x expression size), which is far below the cost of the tree
 * walks around it, and it avoids the state explosion a DFA would need for the
 * counted-repetition forms.
 */

export interface ContentMatchContext {
  /** Node type name -> its group, if any. */
  groupOf(nodeType: string): string | undefined;
  /** Whether a node type exists in the schema. */
  hasNodeType(nodeType: string): boolean;
}

type Expr =
  | { type: 'empty' }
  | { type: 'name'; value: string }
  | { type: 'seq'; exprs: Expr[] }
  | { type: 'choice'; exprs: Expr[] }
  | { type: 'repeat'; expr: Expr; min: number; max: number };

const INFINITY = -1;

export class ContentExpressionError extends Error {}

// ── Tokenizer ────────────────────────────────────────────────────────────────

interface Token {
  kind: 'name' | 'punct';
  value: string;
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if ('()|+*?{},'.includes(ch)) {
      tokens.push({ kind: 'punct', value: ch });
      i++;
      continue;
    }
    // Node type and group names: letters, digits, _ - . (hyphen is used by
    // 'inline-text' / 'inline-image', dot keeps room for namespaced types)
    const match = /^[\w.-]+/.exec(source.slice(i));
    if (!match) {
      throw new ContentExpressionError(
        `Unexpected character '${ch}' in content expression '${source}'`
      );
    }
    tokens.push({ kind: 'name', value: match[0] });
    i += match[0].length;
  }
  return tokens;
}

// ── Parser ───────────────────────────────────────────────────────────────────

class Parser {
  private pos = 0;

  constructor(private readonly tokens: Token[], private readonly source: string) {}

  parse(): Expr {
    const expr = this.parseChoice();
    if (this.pos < this.tokens.length) {
      throw new ContentExpressionError(
        `Unexpected '${this.tokens[this.pos].value}' in content expression '${this.source}'`
      );
    }
    return expr;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private eat(value: string): boolean {
    if (this.peek()?.value === value) {
      this.pos++;
      return true;
    }
    return false;
  }

  private expect(value: string): void {
    if (!this.eat(value)) {
      throw new ContentExpressionError(
        `Expected '${value}' in content expression '${this.source}'`
      );
    }
  }

  private parseChoice(): Expr {
    const exprs = [this.parseSeq()];
    while (this.eat('|')) {
      const branch = this.parseSeq();
      // A dangling or doubled '|' is a typo, not an "empty alternative" — accepting
      // it silently would make the whole choice optional and let anything through.
      if (branch.type === 'empty') {
        throw new ContentExpressionError(
          `Empty alternative after '|' in content expression '${this.source}'`
        );
      }
      exprs.push(branch);
    }
    return exprs.length === 1 ? exprs[0] : { type: 'choice', exprs };
  }

  private parseSeq(): Expr {
    const exprs: Expr[] = [];
    while (this.atExprStart()) exprs.push(this.parseRepeat());
    if (exprs.length === 0) return { type: 'empty' };
    return exprs.length === 1 ? exprs[0] : { type: 'seq', exprs };
  }

  private atExprStart(): boolean {
    const token = this.peek();
    if (!token) return false;
    return token.kind === 'name' || token.value === '(';
  }

  private parseRepeat(): Expr {
    let expr = this.parseAtom();
    for (;;) {
      if (this.eat('+')) expr = { type: 'repeat', expr, min: 1, max: INFINITY };
      else if (this.eat('*')) expr = { type: 'repeat', expr, min: 0, max: INFINITY };
      else if (this.eat('?')) expr = { type: 'repeat', expr, min: 0, max: 1 };
      else if (this.eat('{')) expr = this.parseRange(expr);
      else break;
    }
    return expr;
  }

  private parseRange(expr: Expr): Expr {
    const min = this.parseInt();
    let max = min;
    if (this.eat(',')) {
      max = this.peek()?.value === '}' ? INFINITY : this.parseInt();
    }
    this.expect('}');
    if (max !== INFINITY && max < min) {
      throw new ContentExpressionError(
        `Invalid range {${min},${max}} in content expression '${this.source}'`
      );
    }
    return { type: 'repeat', expr, min, max };
  }

  private parseInt(): number {
    const token = this.peek();
    if (!token || token.kind !== 'name' || !/^\d+$/.test(token.value)) {
      throw new ContentExpressionError(
        `Expected a number in content expression '${this.source}'`
      );
    }
    this.pos++;
    return parseInt(token.value, 10);
  }

  private parseAtom(): Expr {
    if (this.eat('(')) {
      const expr = this.parseChoice();
      this.expect(')');
      return expr;
    }
    const token = this.peek();
    if (!token || token.kind !== 'name') {
      throw new ContentExpressionError(
        `Expected a node name in content expression '${this.source}'`
      );
    }
    this.pos++;
    return { type: 'name', value: token.value };
  }
}

// ── NFA ──────────────────────────────────────────────────────────────────────

/** edges[state] = list of transitions; `name === null` means an epsilon edge. */
type Edge = { name: string | null; to: number };

class NFA {
  readonly edges: Edge[][] = [];

  node(): number {
    this.edges.push([]);
    return this.edges.length - 1;
  }

  edge(from: number, to: number, name: string | null): void {
    this.edges[from].push({ name, to });
  }
}

function compile(expr: Expr, nfa: NFA, from: number): number {
  switch (expr.type) {
    case 'empty':
      return from;
    case 'name': {
      const to = nfa.node();
      nfa.edge(from, to, expr.value);
      return to;
    }
    case 'seq': {
      let cur = from;
      for (const sub of expr.exprs) cur = compile(sub, nfa, cur);
      return cur;
    }
    case 'choice': {
      const to = nfa.node();
      for (const sub of expr.exprs) {
        const end = compile(sub, nfa, from);
        nfa.edge(end, to, null);
      }
      return to;
    }
    case 'repeat': {
      let cur = from;
      // Mandatory copies
      for (let i = 0; i < expr.min; i++) cur = compile(expr.expr, nfa, cur);

      if (expr.max === INFINITY) {
        // Loop back so the body can repeat any number of further times
        const loopStart = nfa.node();
        nfa.edge(cur, loopStart, null);
        const loopEnd = compile(expr.expr, nfa, loopStart);
        nfa.edge(loopEnd, loopStart, null);
        const out = nfa.node();
        nfa.edge(cur, out, null);
        nfa.edge(loopStart, out, null);
        return out;
      }

      // Bounded: each optional copy may exit early
      const out = nfa.node();
      nfa.edge(cur, out, null);
      for (let i = expr.min; i < expr.max; i++) {
        cur = compile(expr.expr, nfa, cur);
        nfa.edge(cur, out, null);
      }
      return out;
    }
  }
}

function closure(nfa: NFA, states: Iterable<number>): Set<number> {
  const result = new Set<number>();
  const stack = [...states];
  while (stack.length) {
    const state = stack.pop()!;
    if (result.has(state)) continue;
    result.add(state);
    for (const edge of nfa.edges[state]) {
      if (edge.name === null) stack.push(edge.to);
    }
  }
  return result;
}

// ── Public API ───────────────────────────────────────────────────────────────

export interface MatchResult {
  valid: boolean;
  /** Index of the first child that could not be matched, when invalid. */
  failedAt?: number;
  /** True when the content ran out while the expression still required more. */
  incomplete?: boolean;
}

/**
 * A parsed content expression, ready to match against child lists.
 * Parsing is done once per expression and cached by {@link getContentMatch}.
 */
export class ContentMatch {
  private readonly nfa: NFA;
  private readonly start: number;
  private readonly accept: number;

  private constructor(readonly expression: string, expr: Expr) {
    this.nfa = new NFA();
    this.start = this.nfa.node();
    this.accept = compile(expr, this.nfa, this.start);
  }

  static parse(expression: string): ContentMatch {
    const trimmed = expression.trim();
    const tokens = tokenize(trimmed);
    const expr = new Parser(tokens, trimmed).parse();
    return new ContentMatch(trimmed, expr);
  }

  /** Names a child can be matched by: its own type plus its group. */
  private static namesFor(nodeType: string, ctx: ContentMatchContext): string[] {
    const group = ctx.groupOf(nodeType);
    return group ? [nodeType, group] : [nodeType];
  }

  match(childTypes: string[], ctx: ContentMatchContext): MatchResult {
    let states = closure(this.nfa, [this.start]);

    for (let i = 0; i < childTypes.length; i++) {
      const names = ContentMatch.namesFor(childTypes[i], ctx);
      const next = new Set<number>();
      for (const state of states) {
        for (const edge of this.nfa.edges[state]) {
          if (edge.name !== null && names.includes(edge.name)) next.add(edge.to);
        }
      }
      if (next.size === 0) return { valid: false, failedAt: i };
      states = closure(this.nfa, next);
    }

    if (!states.has(this.accept)) return { valid: false, incomplete: true };
    return { valid: true };
  }

  /** Whether an empty child list satisfies the expression. */
  matchesEmpty(): boolean {
    return closure(this.nfa, [this.start]).has(this.accept);
  }

  /**
   * Node type names this expression can start with, expanded from groups.
   * Used to fill in a required child when normalising pasted content.
   */
  firstTypes(ctx: ContentMatchContext, allTypes: string[]): string[] {
    const states = closure(this.nfa, [this.start]);
    const names = new Set<string>();
    for (const state of states) {
      for (const edge of this.nfa.edges[state]) {
        if (edge.name !== null) names.add(edge.name);
      }
    }
    const out: string[] = [];
    for (const name of names) {
      if (ctx.hasNodeType(name)) out.push(name);
      else for (const t of allTypes) if (ctx.groupOf(t) === name) out.push(t);
    }
    return out;
  }
}

const cache = new Map<string, ContentMatch>();

/** Parse (and cache) a content expression. Throws on malformed input. */
export function getContentMatch(expression: string): ContentMatch {
  let match = cache.get(expression);
  if (!match) {
    match = ContentMatch.parse(expression);
    cache.set(expression, match);
  }
  return match;
}
