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
  attributes: /^[A-Za-z]+$/.test(text) ? {} : { literal: true },
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
