import { describe, it, expect } from 'vitest';
import { DecoratorProcessor } from '../src/vnode/decorator/processor';
import { getGlobalRegistry } from '@barocss/dsl';
import type { Decorator } from '../src/vnode/decorator';

/**
 * Some things a reader needs to see are not about any characters: another
 * person's caret, the anchor of a comment that has no text yet, the point where
 * a page breaks in the middle of a paragraph.
 *
 * A range cannot say "here". The narrowest one covers a character, and covering
 * a character is a claim about that character — it would be underlined, or
 * highlighted, or struck through. So a decorator whose start equals its end
 * marks a position instead, and lands between the runs either side of it.
 */
describe('a decorator that marks a position', () => {
  const processor = new DecoratorProcessor(getGlobalRegistry());

  const at = (offset: number, sid = 'w1'): Decorator => ({
    sid,
    stype: 'caret',
    category: 'inline',
    target: { sid: 't1', startOffset: offset, endOffset: offset }
  });

  const over = (start: number, end: number): Decorator => ({
    sid: 'range',
    stype: 'highlight',
    category: 'inline',
    target: { sid: 't1', startOffset: start, endOffset: end }
  });

  it('sits between the two runs it falls between', () => {
    const runs = processor.splitTextByDecorators('Hello world', [at(5)]);

    expect(runs.map((run) => run.text)).toEqual(['Hello', '', ' world']);
    expect(runs[1].widget?.sid).toBe('w1');
    expect(runs[1].start).toBe(5);
    expect(runs[1].end).toBe(5);
  });

  it('does not claim the character next to it', () => {
    // Which is what a one-character range would do, and why a range cannot
    // stand in for a position
    const runs = processor.splitTextByDecorators('Hello', [at(2)]);
    expect(runs.filter((run) => run.text).map((run) => run.text)).toEqual(['He', 'llo']);
    expect(runs.every((run) => !run.decorator)).toBe(true);
  });

  it('can sit at the very start', () => {
    const runs = processor.splitTextByDecorators('Hello', [at(0)]);
    expect(runs[0].widget?.sid).toBe('w1');
    expect(runs[1].text).toBe('Hello');
  });

  it('can sit at the very end, past the last run', () => {
    const runs = processor.splitTextByDecorators('Hello', [at(5)]);
    expect(runs[runs.length - 1].widget?.sid).toBe('w1');
    expect(runs[0].text).toBe('Hello');
  });

  it('can sit in empty text, which is where a caret usually is', () => {
    // An empty paragraph is exactly where a collaborator's caret needs drawing
    const runs = processor.splitTextByDecorators('', [at(0)]);
    expect(runs.some((run) => run.widget?.sid === 'w1')).toBe(true);
  });

  it('holds several at one offset, in the order they were given', () => {
    const runs = processor.splitTextByDecorators('Hello', [at(2, 'a'), at(2, 'b')]);
    const widgets = runs.filter((run) => run.widget).map((run) => run.widget!.sid);
    expect(widgets).toEqual(['a', 'b']);
  });

  it('lives alongside a range that covers the same text', () => {
    const runs = processor.splitTextByDecorators('Hello world', [over(0, 5), at(2)]);

    // The range still applies to the text either side of the position
    const decorated = runs.filter((run) => run.decorator?.sid === 'range');
    expect(decorated.map((run) => run.text)).toEqual(['He', 'llo']);
    expect(runs.some((run) => run.widget)).toBe(true);
  });

  it('leaves text with no decorators as one run', () => {
    expect(processor.splitTextByDecorators('Hello', [])).toEqual([
      { text: 'Hello', start: 0, end: 5 }
    ]);
  });
});
