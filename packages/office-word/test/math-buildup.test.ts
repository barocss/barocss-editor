import { describe, it, expect } from 'vitest';
import { buildUp, linearOf, replaceSymbols, type MathNode } from '../src/math-buildup';

/**
 * Building an equation out of a line of text.
 *
 * This is how equations are written in Word: you type `a/b`, press space, and it
 * becomes a fraction. Without it every construct is a menu exercise, and the
 * slots Tab moves between have to be made by hand.
 */
const shape = (nodes: MathNode[] | null): string => {
  if (!nodes) return 'null';
  const of = (node: any): string => {
    if (node.stype === 'inline-text') return JSON.stringify(node.text);
    const inner = (node.content ?? []).map(of).join(',');
    return `${node.stype}(${inner})`;
  };
  return nodes.map(of).join('+');
};

describe('symbols', () => {
  it('replaces the names a keyboard cannot reach', () => {
    expect(replaceSymbols('\\alpha + \\beta')).toBe('α + β');
    expect(replaceSymbols('\\Omega \\leq \\infty')).toBe('Ω ≤ ∞');
  });

  it('leaves a name it does not know exactly as written', () => {
    // Silently eating it would make a typo vanish, which is worse than a
    // backslash left on the page.
    expect(replaceSymbols('\\notasymbol')).toBe('\\notasymbol');
  });
});

describe('fractions', () => {
  it('builds one from a solidus', () => {
    expect(shape(buildUp('a/b'))).toBe('mathFraction(mathNum(mathRun("a")),mathDen(mathRun("b")))');
  });

  it('takes a bracketed group as one operand and eats the brackets', () => {
    // That is what the brackets were for: they say where the numerator ends, and
    // once it is a fraction the two-dimensional form says it instead.
    expect(shape(buildUp('(a+b)/c'))).toBe(
      'mathFraction(mathNum(mathRun("a+b")),mathDen(mathRun("c")))'
    );
  });

  it('reads a chain from the right', () => {
    // a/(b/c), which is what the linear format means by it.
    expect(shape(buildUp('a/b/c'))).toBe(
      'mathFraction(mathNum(mathRun("a")),mathDen(mathFraction(mathNum(mathRun("b")),mathDen(mathRun("c")))))'
    );
  });

  it('keeps what was on either side of it', () => {
    expect(shape(buildUp('x=a/b'))).toBe(
      'mathRun("x=")+mathFraction(mathNum(mathRun("a")),mathDen(mathRun("b")))'
    );
  });
});

describe('scripts', () => {
  it('raises and lowers', () => {
    expect(shape(buildUp('x^2'))).toBe(
      'mathSuperscript(mathElement(mathRun("x")),mathSup(mathRun("2")))'
    );
    expect(shape(buildUp('x_1'))).toBe(
      'mathSubscript(mathElement(mathRun("x")),mathSub(mathRun("1")))'
    );
  });

  it('takes a bracketed exponent whole', () => {
    expect(shape(buildUp('e^(2x)'))).toBe(
      'mathSuperscript(mathElement(mathRun("e")),mathSup(mathRun("2x")))'
    );
  });
});

describe('radicals', () => {
  it('builds a square root, with the degree slot empty and waiting', () => {
    expect(shape(buildUp('\\sqrt(x)'))).toBe('mathRadical(mathDeg(),mathElement(mathRun("x")))');
  });

  it('takes the next operand when there are no brackets', () => {
    expect(shape(buildUp('\\sqrt 2'))).toBe('mathRadical(mathDeg(),mathElement(mathRun("2")))');
  });

  it('builds up what is inside it', () => {
    expect(shape(buildUp('\\sqrt(a/b)'))).toBe(
      'mathRadical(mathDeg(),mathElement(mathFraction(mathNum(mathRun("a")),mathDen(mathRun("b")))))'
    );
  });
});

describe('what is not an equation', () => {
  it('says so, rather than wrapping plain words in a structure', () => {
    // The caller leaves the line alone on null. Pressing space after an ordinary
    // sentence must not turn it into mathematics.
    expect(buildUp('hello there')).toBeNull();
    expect(buildUp('')).toBeNull();
    expect(buildUp('   ')).toBeNull();
  });

  it('counts a line that only gained a symbol as an equation', () => {
    expect(shape(buildUp('\\pi'))).toBe('mathRun("π")');
  });

  it('leaves an operator with nothing on one side of it alone', () => {
    expect(buildUp('a/')).toBeNull();
    expect(buildUp('/b')).toBeNull();
  });
});

describe('what is italic', () => {
  it('sets a variable in italic and a number upright', () => {
    // A variable is italic by mathematical convention; 2 is not a variable.
    const [fraction] = buildUp('x/2') as any[];
    expect(fraction.content[0].content[0].attributes).toEqual({});
    expect(fraction.content[1].content[0].attributes).toEqual({ literal: true });
  });
});

describe('the line an equation came from', () => {
  /** Build up, write back out, and see whether it says the same thing. */
  const roundTrip = (line: string) => linearOf(buildUp(line) ?? []);

  it('writes a fraction back as a solidus', () => {
    expect(roundTrip('a/b')).toBe('a/b');
  });

  it('puts the brackets back where the structure was carrying them', () => {
    // Without them the line reads back as a different equation, which is the
    // whole risk of a linear view.
    expect(roundTrip('(a+b)/c')).toBe('(a+b)/c');
  });

  it('leaves out brackets that were only telling the parser where to stop', () => {
    // `e^(2x)` comes back as `e^2x`, which reads as the same equation — the
    // brackets did their work when the line was first read and the structure
    // says it now. What matters is that the line means the same thing, not that
    // it is the same string.
    expect(roundTrip('e^(2x)')).toBe('e^2x');
    expect(buildUp('e^2x')).toEqual(buildUp('e^(2x)'));
  });

  it('keeps a chain meaning what it meant', () => {
    expect(roundTrip('a/b/c')).toBe('a/(b/c)');
    expect(buildUp(roundTrip('a/b/c'))).toEqual(buildUp('a/b/c'));
  });

  it('writes a square root as one, and a degree when there is one', () => {
    expect(roundTrip('\\sqrt(x)')).toBe('\\sqrt(x)');
    expect(roundTrip('\\sqrt(a/b)')).toBe('\\sqrt(a/b)');
  });

  it('leaves what was beside it beside it', () => {
    expect(roundTrip('x=a/b')).toBe('x=a/b');
  });

  it('writes delimiters and matrices in the notation they were typed in', () => {
    expect(
      linearOf([
        {
          stype: 'mathDelimiter',
          attributes: { open: '[', close: ']' },
          content: [{ stype: 'mathElement', content: [{ stype: 'mathRun', content: [{ stype: 'inline-text', text: 'x' }] }] }]
        }
      ])
    ).toBe('[x]');

    const cell = (text: string) => ({
      stype: 'mathElement',
      content: [{ stype: 'mathRun', content: [{ stype: 'inline-text', text }] }]
    });
    expect(
      linearOf([
        {
          stype: 'mathMatrix',
          content: [
            { stype: 'mathRow', content: [cell('a'), cell('b')] },
            { stype: 'mathRow', content: [cell('c'), cell('d')] }
          ]
        }
      ])
    ).toBe('\\matrix(a&b@c&d)');
  });
});
