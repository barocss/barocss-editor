import { describe, it, expect } from 'vitest';
import { DEFAULT_TAB_INTERVAL, leaderStyle, resolveTab, tabStopsOf } from '../src/tabs';
import type { TabStop } from '../src/tabs';

/**
 * How far a tab has to stretch.
 *
 * A tab is an instruction to move to the next stop, not a character of a fixed
 * width, so the answer depends on where the tab happens to sit — and that is
 * only known once the line has been measured. These pin the arithmetic that
 * decision rests on, which is the part that can be wrong in a way that looks
 * like a font problem.
 */
const at = (pos: number, align?: TabStop['align'], leader?: TabStop['leader']): TabStop => ({
  pos,
  align,
  leader
});

const options = { interval: 96, limit: 600 };

describe('the stops a paragraph names', () => {
  it('come back in order, whatever order they were written in', () => {
    expect(tabStopsOf({ tabs: [at(300), at(100), at(200)] }).map((s) => s.pos)).toEqual([
      100, 200, 300
    ]);
  });

  it('default to a plain left stop with no leader', () => {
    expect(tabStopsOf({ tabs: [{ pos: 100 }] })[0]).toEqual({
      pos: 100,
      align: 'left',
      leader: 'none'
    });
  });

  it('ignore entries that name no usable position', () => {
    // A document can carry anything; a stop with no position is not a stop, and
    // a negative one is behind the margin.
    expect(tabStopsOf({ tabs: [{ align: 'right' }, { pos: -10 }, { pos: 'x' }, at(50)] })).toEqual([
      { pos: 50, align: 'left', leader: 'none' }
    ]);
  });

  it('treats a format with no tabs, or none at all, as naming none', () => {
    expect(tabStopsOf({})).toEqual([]);
    expect(tabStopsOf(undefined)).toEqual([]);
    expect(tabStopsOf({ tabs: 'left' })).toEqual([]);
  });
});

describe('reaching a stop', () => {
  it('stretches to the next one past where it starts', () => {
    expect(resolveTab(40, 0, [at(100), at(300)], options).width).toBe(60);
  });

  it('skips the stops already behind it', () => {
    // Two tabs in a row land on successive stops rather than both on the first.
    expect(resolveTab(120, 0, [at(100), at(300)], options).stop).toBe(300);
  });

  it('ends the following text at a right stop, rather than starting it there', () => {
    // Which is what a right stop is: a promise about where the text finishes.
    // A header with a name on the left and a title ending at the margin is this
    // and nothing else.
    const tab = resolveTab(100, 80, [at(400, 'right')], options);
    expect(tab.width).toBe(220);
    expect(100 + tab.width + 80).toBe(400);
  });

  it('centres the following text on a centre stop', () => {
    const tab = resolveTab(100, 80, [at(400, 'center')], options);
    expect(100 + tab.width + 40).toBe(400);
  });

  it('moves on when the text is too wide to fit before the stop', () => {
    // Never backwards. Word goes to the next stop instead, because a tab that
    // shrank would put the text before where it already is.
    const tab = resolveTab(100, 400, [at(400, 'right'), at(600, 'right')], options);
    expect(tab.stop).toBe(600);
    expect(tab.width).toBeGreaterThanOrEqual(0);
  });

  it('falls back to the default interval past the last named stop', () => {
    // A document that names one stop still has the rest of the line to cross.
    expect(resolveTab(250, 0, [at(200)], options).stop).toBe(288);
  });

  it('uses the default interval when nothing is named at all', () => {
    expect(resolveTab(0, 0, [], options).stop).toBe(96);
    expect(resolveTab(100, 0, [], options).stop).toBe(192);
  });

  it('stops at the end of the line rather than pushing text off the page', () => {
    const tab = resolveTab(580, 0, [], options);
    expect(tab.width).toBe(20);
    expect(resolveTab(600, 0, [], options).width).toBe(0);
  });

  it('does not hang when a document says the interval is zero', () => {
    expect(resolveTab(10, 0, [], { interval: 0, limit: 600 }).width).toBe(590);
  });

  it('carries the leader of the stop it reached', () => {
    expect(resolveTab(0, 0, [at(100, 'right', 'dot')], options).leader).toBe('dot');
    // The default stops have none: a leader is something a document asks for.
    expect(resolveTab(0, 0, [], options).leader).toBe('none');
  });
});

describe('the default interval', () => {
  it('is half an inch, the same step as the indent button', () => {
    // A tabbed line and an indented one lining up is the point.
    expect(DEFAULT_TAB_INTERVAL).toBe(720);
  });
});

describe('drawing the leader', () => {
  it('draws each kind as the rule it is', () => {
    expect(leaderStyle('dot').borderBottom).toContain('dotted');
    expect(leaderStyle('hyphen').borderBottom).toContain('dashed');
    expect(leaderStyle('underscore').borderBottom).toContain('solid');
  });

  it('draws nothing when the tab crosses blank space', () => {
    expect(leaderStyle('none')).toEqual({});
  });
});
