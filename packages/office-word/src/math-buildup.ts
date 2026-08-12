/**
 * Building an equation out of a line of text.
 *
 * This is how equations are actually written in Word. You do not assemble a
 * fraction from a menu — you type `a/b`, press space, and it becomes one. Murray
 * Sargent's linear format is the grammar, and the act of turning the line into
 * the structure is called build-up.
 *
 * It matters more than it looks. Every construct has slots, and reaching them
 * with Tab is only bearable once they exist; build-up is what creates them at
 * the speed someone can type. Without it an equation is a menu exercise.
 *
 * Pure: a string in, nodes out. What triggers it, where the text came from and
 * what replaces it are the caller's business.
 */

/** A node as the model stores it, before any ids exist. */
export interface MathNode {
  stype: string;
  attributes?: Record<string, unknown>;
  content?: (MathNode | { stype: 'inline-text'; text: string })[];
}

const run = (text: string): MathNode => ({
  stype: 'mathRun',
  // Digits and operators are not variables, so they are not italic. Word decides
  // this the same way, per character, and a run of one letter is the unit that
  // lets it.
  // A function name is upright too: `sin` in italic is s × i × n.
  attributes:
    /^[A-Za-z]+$/.test(text) && !MATH_FUNCTIONS.has(text) ? {} : { literal: true },
  content: [{ stype: 'inline-text', text }]
});

const slot = (stype: string, content: MathNode[]): MathNode => ({ stype, content });

/**
 * The symbols a backslash name stands for.
 *
 * A small set on purpose: these are the ones a keyboard cannot reach and a
 * writer of mathematics reaches for constantly. It is a table because that is
 * all it is — nothing here is worth deriving.
 */
export const MATH_SYMBOLS: Record<string, string> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', zeta: 'ζ',
  eta: 'η', theta: 'θ', lambda: 'λ', mu: 'μ', pi: 'π', rho: 'ρ',
  sigma: 'σ', tau: 'τ', phi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Pi: 'Π', Sigma: 'Σ',
  Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
  times: '×', div: '÷', pm: '±', mp: '∓', cdot: '·',
  leq: '≤', geq: '≥', neq: '≠', approx: '≈', equiv: '≡',
  infty: '∞', partial: '∂', nabla: '∇', in: '∈', notin: '∉',
  subset: '⊂', cup: '∪', cap: '∩', forall: '∀', exists: '∃',
  rightarrow: '→', leftarrow: '←', Rightarrow: '⇒', leftrightarrow: '↔',
  sum: '∑', prod: '∏', int: '∫'
};

/** Replace every `\name` that is known, and leave the rest as written. */
export function replaceSymbols(text: string): string {
  return text.replace(/\\([A-Za-z]+)/g, (whole, name: string) =>
    Object.prototype.hasOwnProperty.call(MATH_SYMBOLS, name) ? MATH_SYMBOLS[name] : whole
  );
}

/**
 * The operand ending at `end`, and where it starts.
 *
 * A bracketed group is one operand and the brackets are consumed — `(a+b)/c` is
 * a fraction whose numerator is `a+b`, not a fraction with brackets drawn round
 * its numerator. That is the whole reason to type the brackets: they say where
 * the operand ends, and once it is a fraction the two-dimensional form says it
 * instead.
 *
 * Otherwise an operand is the run of characters that cannot be an operator: a
 * name, a number, or a symbol.
 */
function operandBefore(text: string, end: number): { start: number; body: string } {
  if (end > 0 && text[end - 1] === ')') {
    let depth = 0;
    for (let at = end - 1; at >= 0; at--) {
      if (text[at] === ')') depth++;
      else if (text[at] === '(') {
        depth--;
        if (depth === 0) return { start: at, body: text.slice(at + 1, end - 1) };
      }
    }
  }

  let start = end;
  while (start > 0 && /[^\s+\-*/^_=(),]/.test(text[start - 1])) start--;
  return { start, body: text.slice(start, end) };
}

/** The operand starting at `start`, and where it ends. */
function operandAfter(text: string, start: number): { end: number; body: string } {
  if (text[start] === '(') {
    let depth = 0;
    for (let at = start; at < text.length; at++) {
      if (text[at] === '(') depth++;
      else if (text[at] === ')') {
        depth--;
        if (depth === 0) return { end: at + 1, body: text.slice(start + 1, at) };
      }
    }
  }

  let end = start;
  while (end < text.length && /[^\s+\-*/^_=(),]/.test(text[end])) end++;
  return { end, body: text.slice(start, end) };
}

/**
 * The names that are functions rather than variables multiplied together.
 *
 * `sin` italicised is s × i × n, which is what it means if the convention is
 * taken seriously and never what anybody writing it intended. Word keeps the
 * same list and sets them upright.
 */
export const MATH_FUNCTIONS = new Set([
  'sin', 'cos', 'tan', 'sec', 'csc', 'cot',
  'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh',
  'log', 'ln', 'lg', 'exp', 'lim', 'max', 'min', 'sup', 'inf',
  'det', 'dim', 'gcd', 'deg', 'arg', 'mod'
]);

/** The n-ary operators, and the characters that write them. */
const NARY_CHARS = new Set(['∑', '∏', '∫', '∮', '⋃', '⋂', '⨁', '⨂']);

/** Whatever a stretch of text is, once its own operators have been built up. */
function contentsOf(text: string): MathNode[] {
  const built = buildUp(text);
  return built ?? (text.length > 0 ? [run(text)] : []);
}

/**
 * Turn a line into the equation it describes, or null if it describes none.
 *
 * The leftmost operator is taken first, and when the operator after its right
 * operand is another of the same kind the whole remainder goes into that
 * operand — which is what makes `a/b/c` mean `a/(b/c)`. The linear format binds
 * to the right, and a reader who typed it expects the second solidus to be
 * inside the first denominator rather than beside it.
 *
 * An operator that is not part of the chain ends it: `a/b+c` is a fraction and
 * then `+c`, because `+` cannot continue a denominator.
 */
export function buildUp(line: string): MathNode[] | null {
  const text = replaceSymbols(line);
  if (text.trim().length === 0) return null;

  // `\matrix(a&b@c&d)` — rows separated by `@`, cells by `&`, which is Word's
  // own notation and what linearOf writes.
  const matrix = /\\matrix\s*\(/.exec(text);
  if (matrix) {
    const body = operandAfter(text, matrix.index + matrix[0].length - 1);
    if (body.body.length > 0) {
      return [
        ...contentsOf(text.slice(0, matrix.index)),
        {
          stype: 'mathMatrix',
          content: body.body.split('@').map((row) => ({
            stype: 'mathRow',
            content: row.split('&').map((cell) => slot('mathElement', contentsOf(cell)))
          }))
        },
        ...contentsOf(text.slice(body.end))
      ];
    }
  }

  // An n-ary operator carries its limits as scripts and then what it applies to:
  // `∑_(i=1)^n a`.
  for (let at = 0; at < text.length; at++) {
    if (!NARY_CHARS.has(text[at])) continue;

    let cursor = at + 1;
    let lower = '';
    let upper = '';
    for (let round = 0; round < 2; round++) {
      const mark = text[cursor];
      if (mark !== '_' && mark !== '^') break;
      const operand = operandAfter(text, cursor + 1);
      if (operand.body.length === 0) break;
      if (mark === '_') lower = operand.body;
      else upper = operand.body;
      cursor = operand.end;
    }

    if (lower.length === 0 && upper.length === 0) continue;

    const rest = text.slice(cursor).replace(/^\s+/, '');
    return [
      ...contentsOf(text.slice(0, at)),
      {
        stype: 'mathNary',
        attributes: { char: text[at] },
        content: [
          slot('mathSub', contentsOf(lower)),
          slot('mathSup', contentsOf(upper)),
          slot('mathElement', contentsOf(rest))
        ]
      }
    ];
  }

  // `lim_(x→0) f` — a name whose script is written under it rather than beside
  // it. Word calls these the lower-limit constructs, and `lim` with a subscript
  // beside it is not what anybody means by it.
  const limit = /(lim|max|min|sup|inf|liminf|limsup)\s*_/.exec(text);
  if (limit) {
    const under = operandAfter(text, limit.index + limit[0].length);
    if (under.body.length > 0) {
      const rest = text.slice(under.end).replace(/^\s+/, '');
      return [
        ...contentsOf(text.slice(0, limit.index)),
        {
          stype: 'mathLimitLower',
          content: [
            slot('mathElement', [
              {
                stype: 'mathRun',
                attributes: { literal: true },
                content: [{ stype: 'inline-text', text: limit[1] }]
              }
            ]),
            slot('mathLim', contentsOf(under.body))
          ]
        },
        ...contentsOf(rest)
      ];
    }
  }

  // `sin(x)` — a name that is a function applied to something, not letters
  // multiplied together.
  const applied = /([A-Za-z]+)\s*\(/.exec(text);
  if (applied && MATH_FUNCTIONS.has(applied[1])) {
    const argument = operandAfter(text, applied.index + applied[0].length - 1);
    if (argument.body.length > 0) {
      return [
        ...contentsOf(text.slice(0, applied.index)),
        {
          stype: 'mathFunction',
          content: [
            slot('mathFuncName', [
              {
                stype: 'mathRun',
                attributes: { literal: true },
                content: [{ stype: 'inline-text', text: applied[1] }]
              }
            ]),
            slot('mathElement', contentsOf(argument.body))
          ]
        },
        ...contentsOf(text.slice(argument.end))
      ];
    }
  }

  // `\sqrt(x)` and `\sqrt x` — a function-looking name that is really a
  // construct, so it is recognised before the operators.
  const radical = /\\sqrt\s*/.exec(text);
  if (radical) {
    const after = operandAfter(text, radical.index + radical[0].length);
    if (after.body.length > 0) {
      const before = text.slice(0, radical.index);
      return [
        ...contentsOf(before),
        {
          stype: 'mathRadical',
          content: [slot('mathDeg', []), slot('mathElement', contentsOf(after.body))]
        }
      ];
    }
  }

  for (let at = 0; at < text.length; at++) {
    const character = text[at];
    if (character !== '/' && character !== '^' && character !== '_') continue;

    const left = operandBefore(text, at);
    const right = operandAfter(text, at + 1);
    if (left.body.length === 0 || right.body.length === 0) continue;

    const head = contentsOf(text.slice(0, left.start));
    // Another operator of the same kind straight after: the chain binds right,
    // so everything left of here belongs to this operand.
    const chained = text[right.end] === character;
    const rightBody = chained ? text.slice(at + 1) : right.body;
    const tail = chained ? [] : contentsOf(text.slice(right.end));

    if (character === '/') {
      return [
        ...head,
        {
          stype: 'mathFraction',
          content: [
            slot('mathNum', contentsOf(left.body)),
            slot('mathDen', contentsOf(rightBody))
          ]
        },
        ...tail
      ];
    }

    // `x_1^2` is one thing with two scripts, not a superscript wrapped round a
    // subscript: the 1 and the 2 sit beside each other on the same x, and Word
    // stores it as a single construct so that both can be reached with Tab.
    if (character === '_' && text[right.end] === '^') {
      const upper = operandAfter(text, right.end + 1);
      if (upper.body.length > 0) {
        return [
          ...head,
          {
            stype: 'mathSubSup',
            content: [
              slot('mathElement', contentsOf(left.body)),
              slot('mathSub', contentsOf(right.body)),
              slot('mathSup', contentsOf(upper.body))
            ]
          },
          ...contentsOf(text.slice(upper.end))
        ];
      }
    }

    return [
      ...head,
      {
        stype: character === '^' ? 'mathSuperscript' : 'mathSubscript',
        content: [
          slot('mathElement', contentsOf(left.body)),
          slot(character === '^' ? 'mathSup' : 'mathSub', contentsOf(rightBody))
        ]
      },
      ...tail
    ];
  }

  // No operator left. A line that only had symbols in it has still become
  // something — `\alpha` is an equation — but a line that was already plain text
  // has not, and saying so is what lets the caller leave it alone.
  return text === line ? null : [run(text)];
}

/**
 * The line an equation would have been typed as.
 *
 * Word calls this the linear view, and offers it as a toggle: an equation has a
 * two-dimensional form and a one-dimensional one, and an author who wants to
 * rewrite a whole formula would rather edit the line than click through the
 * slots. It is also how an equation is copied into somewhere that has no
 * equations.
 *
 * Brackets go back in where the structure was carrying the grouping — `a+b` on
 * top of a fraction has to come back as `(a+b)/c`, or reading the line again
 * would give a different equation. That round trip is the test worth having.
 */
export function linearOf(nodes: readonly MathNode[] | undefined): string {
  return (nodes ?? []).map(linearOfNode).join('');
}

/** True when a stretch needs bracketing to survive being read back. */
function needsBrackets(text: string): boolean {
  // A single operand does not: `a/b` reads back as itself. Anything holding an
  // operator does, or the operator would rebind to the wrong side.
  return /[+\-*/^_=\s]/.test(text);
}

const bracketed = (text: string): string => (needsBrackets(text) ? `(${text})` : text);

function slotText(node: MathNode | undefined): string {
  return linearOf((node?.content ?? []) as MathNode[]);
}

function linearOfNode(node: MathNode | { stype: 'inline-text'; text: string }): string {
  if (node.stype === 'inline-text') return (node as { text: string }).text;

  const parts = ((node as MathNode).content ?? []) as MathNode[];
  const at = (index: number) => parts[index];

  switch (node.stype) {
    case 'mathRun':
      return slotText(node as MathNode);

    case 'oMath':
    case 'oMathPara':
      return slotText(node as MathNode);

    case 'mathFraction':
      return `${bracketed(slotText(at(0)))}/${bracketed(slotText(at(1)))}`;

    case 'mathSuperscript':
      return `${bracketed(slotText(at(0)))}^${bracketed(slotText(at(1)))}`;

    case 'mathSubscript':
      return `${bracketed(slotText(at(0)))}_${bracketed(slotText(at(1)))}`;

    case 'mathSubSup':
      return `${bracketed(slotText(at(0)))}_${bracketed(slotText(at(1)))}^${bracketed(slotText(at(2)))}`;

    case 'mathRadical': {
      const degree = slotText(at(0));
      const body = `(${slotText(at(1))})`;
      // A degree that is there is written; a square root has none, and Word
      // writes neither.
      return degree.length > 0 ? `\\root${bracketed(degree)}${body}` : `\\sqrt${body}`;
    }

    case 'mathDelimiter': {
      const open = String((node as MathNode).attributes?.open ?? '(');
      const close = String((node as MathNode).attributes?.close ?? ')');
      const separator = String((node as MathNode).attributes?.separator ?? '|');
      return open + parts.map((part) => slotText(part)).join(separator) + close;
    }

    // Always bracketed, for the same reason a function's argument is: what
    // follows a limit runs straight into it otherwise, and `lim_x→0 f` reads
    // back with the f inside the limit.
    case 'mathLimitLower':
      return `${slotText(at(0))}_(${slotText(at(1))})`;

    case 'mathLimitUpper':
      return `${slotText(at(0))}^(${slotText(at(1))})`;

    case 'mathFunction':
      // Always bracketed, whatever the argument is: `sin x` written without them
      // reads back as a variable called `sinx`, and the function is lost.
      return `${slotText(at(0))}(${slotText(at(1))})`;

    case 'mathNary': {
      const char = String((node as MathNode).attributes?.char ?? '∑');
      const lower = slotText(at(0));
      const upper = slotText(at(1));
      const body = slotText(at(2));
      return (
        char +
        (lower ? `_${bracketed(lower)}` : '') +
        (upper ? `^${bracketed(upper)}` : '') +
        (body ? ` ${body}` : '')
      );
    }

    case 'mathMatrix':
      // Rows separated by `@`, cells by `&` — Word's own notation for one.
      return `\\matrix(${parts.map((row) => (row.content ?? []).map((cell) => slotText(cell as MathNode)).join('&')).join('@')})`;

    default:
      // Anything without a linear form is still made of slots, and its contents
      // are worth more than nothing.
      return parts.map((part) => slotText(part)).join('');
  }
}
