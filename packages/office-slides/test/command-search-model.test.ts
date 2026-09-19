import { describe, expect, it } from 'vitest';
import { slidesSearchCommands, slidesSearchPayload } from '../src/command-search-model';

describe('Slides search command targets', () => {
  const entries = slidesSearchCommands(false);
  it('places new slides after the displayed slide and adjusts slide order by its position', () => {
    const entry = (command: string) => entries.find(item => item.command === command)!;
    expect(slidesSearchPayload(entry('insertSlide'), 'second', 2)).toEqual({ after: 'second' });
    expect(slidesSearchPayload(entry('duplicateSlide'), 'second', 2)).toEqual({ slideId: 'second' });
    expect(slidesSearchPayload(entries.find(item => item.id === 'toolbar:slide-up')!, 'second', 2)).toEqual({ slideId: 'second', to: 0 });
    expect(slidesSearchPayload(entries.find(item => item.id === 'toolbar:slide-down')!, 'second', 2)).toEqual({ slideId: 'second', to: 2 });
  });
  it('preserves shape command parameters and never falls back to the first slide', () => {
    expect(slidesSearchPayload(entries.find(item => item.command === 'insertRectangle')!, 'second', 2)).toEqual({ slideId: 'second' });
    expect(slidesSearchPayload(entries.find(item => item.id === 'toolbar:flip-h')!, 'second', 2)).toEqual({ axis: 'x', slideId: 'second' });
  });
  it('keeps one menu command and excludes file pickers without a search execution path', () => {
    expect(entries.filter(item => item.command === 'duplicateBoxes')).toHaveLength(1);
    expect(entries.some(item => item.control?.needsFile)).toBe(false);
    expect(new Set(entries.map(item => item.id)).size).toBe(entries.length);
  });
});
