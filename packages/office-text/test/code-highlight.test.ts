import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CODE_HIGHLIGHT_CSS, paintCode } from '../src/code-highlight';

/**
 * Colour in a code block, painted as **ranges**.
 *
 * The whole reason it is ranges: a code block is drawn as one flat run, and that is what makes it
 * editable by the ordinary text stack. Wrapping tokens in elements would turn one text node into
 * forty, and every offset in that stack is a walk over those — which is where the caret bugs in this
 * repository have all lived. `CSS.highlights` changes no element and no text node at all.
 *
 * jsdom has neither `CSS.highlights` nor `Highlight`, so the two are stood in for here. That is not
 * a compromise: what is being tested is *which characters get which name*, and a stand-in that
 * records the ranges says it more directly than a browser could.
 */
describe('painting a code block', () => {
  const painted = new Map<string, { start: number; end: number }[]>();

  beforeEach(() => {
    painted.clear();
    class FakeHighlight {
      ranges: Range[];
      constructor(...ranges: Range[]) {
        this.ranges = ranges;
      }
    }
    (globalThis as any).Highlight = FakeHighlight;
    (globalThis as any).CSS = {
      highlights: {
        set: (name: string, held: any) => {
          painted.set(
            name,
            held.ranges.map((one: Range) => ({ start: one.startOffset, end: one.endOffset }))
          );
        },
        delete: (name: string) => painted.delete(name)
      }
    };
  });

  afterEach(() => {
    delete (globalThis as any).Highlight;
    delete (globalThis as any).CSS;
  });

  /** A code block drawn the way the renderer draws one: a `pre` around one flat run. */
  const block = (code: string, language = '') => {
    document.body.innerHTML = '';
    const pre = document.createElement('pre');
    pre.className = 'w-code';
    pre.setAttribute('data-language', language);
    const outer = document.createElement('span');
    outer.className = 'w-text';
    const inner = document.createElement('span');
    inner.textContent = code;
    outer.append(inner);
    pre.append(outer);
    document.body.append(pre);
    return pre;
  };

  const words = (code: string, kind: string) =>
    (painted.get(`code-${kind}`) ?? []).map((one) => code.slice(one.start, one.end));

  it('leaves the drawing exactly as it found it', () => {
    const code = 'const x = 1;';
    const pre = block(code, 'js');
    const before = pre.innerHTML;
    paintCode(document);
    // Not one element added, not one text node split. This is the whole argument for the API.
    expect(pre.innerHTML).toBe(before);
    expect(pre.querySelectorAll('*')).toHaveLength(2);
  });

  it('finds the four things a code sample is made of', () => {
    const code = 'const n = 42; // why\nconst s = "hi";';
    block(code, 'js');
    paintCode(document);

    expect(words(code, 'keyword')).toEqual(['const', 'const']);
    expect(words(code, 'number')).toEqual(['42']);
    expect(words(code, 'string')).toEqual(['"hi"']);
    expect(words(code, 'comment')).toEqual(['// why']);
  });

  it('knows keywords per language, and nothing where the language is not said', () => {
    const code = 'def hello(): pass';
    block(code, 'python');
    paintCode(document);
    // `python` resolves through the alias table; `def` and `pass` are its words, not JavaScript's.
    expect(words(code, 'keyword')).toEqual(['def', 'pass']);

    block(code, '');
    paintCode(document);
    /*
     * A block that has not been told its language is a block nobody has told yet, not one in the
     * wrong language — so the words are left the text's colour rather than guessed at.
     */
    expect(words(code, 'keyword')).toEqual([]);
  });

  it('lets a comment and a string swallow what is inside them', () => {
    const code = '// const "x"\nconst y = "// not a comment";';
    block(code, 'js');
    paintCode(document);

    expect(words(code, 'comment')).toEqual(['// const "x"']);
    expect(words(code, 'keyword')).toEqual(['const']);
    expect(words(code, 'string')).toEqual(['"// not a comment"']);
  });

  it('takes an escaped quote as part of the string', () => {
    const code = 'const s = "a \\" b";';
    block(code, 'js');
    paintCode(document);
    expect(words(code, 'string')).toEqual(['"a \\" b"']);
  });

  it('paints across two runs, because a paste can make one', () => {
    document.body.innerHTML = '';
    const pre = document.createElement('pre');
    pre.className = 'w-code';
    pre.setAttribute('data-language', 'js');
    for (const part of ['const ', 'x = 1;']) {
      const span = document.createElement('span');
      span.className = 'w-text';
      span.textContent = part;
      pre.append(span);
    }
    document.body.append(pre);
    paintCode(document);

    /*
     * The schema says `inline*`, so a code block may hold more than one run even though it holds one
     * today. The offsets are counted across them rather than per node, which is the difference
     * between a highlight that survives a paste and one that silently moves.
     */
    expect(painted.get('code-keyword')).toHaveLength(1);
    expect(painted.get('code-number')).toHaveLength(1);
  });

  it('does nothing at all where the browser has no such thing', () => {
    delete (globalThis as any).CSS;
    const pre = block('const x = 1;', 'js');
    const before = pre.innerHTML;
    expect(() => paintCode(document)).not.toThrow();
    expect(pre.innerHTML).toBe(before);
  });

  it('names a colour for every kind it paints', () => {
    for (const kind of ['comment', 'string', 'number', 'keyword']) {
      expect(CODE_HIGHLIGHT_CSS).toContain(`::highlight(code-${kind})`);
    }
  });
});
