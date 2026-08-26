import { describe, expect, it } from 'vitest';
import { panelAttrs, panelCommands, panelGroupsFor, panelRowsFor, type PanelRow } from '../src/panel';

/**
 * The shared panel shape, and the four questions every product asks of its own.
 *
 * Two products wrote this type separately within a week and Word's ruler is a third surface of the
 * same shape. What is tested here is only what is *shared* — a product's own rows are tested in the
 * product, against its own schema and its own commands.
 */
describe('a panel declaration', () => {
  const rows: PanelRow[] = [
    { attr: 'name', command: 'setName', group: '선택', tab: 'block', label: '이름', ariaLabel: '이름', control: 'text' },
    { attr: 'gap', command: 'setFormat', group: '배치', tab: 'block', label: '간격', ariaLabel: '간격', control: 'number', on: ['frame'] },
    { attr: 'columns', command: 'setFormat', group: '배치', tab: 'block', label: '열', ariaLabel: '열 수', control: 'number', on: ['frame'], when: { attr: 'layoutMode', is: ['grid'] } },
    { attr: 'fill', command: 'setFormat', group: '바탕', tab: 'style', label: '배경', ariaLabel: '배경', control: 'colour' },
    { attr: 'stype', group: '선택', tab: 'block', label: '종류', ariaLabel: '종류', control: 'static' },
    { attr: 'componentValue', writes: 'child', command: 'setValue', group: '값', tab: 'values', label: '값', ariaLabel: '값', control: 'values', on: ['instance'] }
  ];

  it('gives a row with no `on` to whatever the product calls anything', () => {
    /*
     * Passed in rather than guessed: a page's panel means every block by "anything" and a deck's
     * means every box on a slide, and a shared helper that guessed would have one product quietly
     * answering the other's question.
     */
    expect(panelRowsFor(rows, 'frame', 'block', (one) => one === 'frame').map((r) => r.attr)).toEqual([
      'name',
      'gap',
      'columns',
      'stype'
    ]);
    // Not a frame: the frame-only rows go, the rest stay.
    expect(panelRowsFor(rows, 'picture', 'block', () => true).map((r) => r.attr)).toEqual(['name', 'stype']);
    // And nothing at all is selected: a row with `on` needs a type to match against.
    expect(panelRowsFor(rows, undefined, 'block', () => true)).toEqual([]);
  });

  it('keeps a group contiguous, because order is what a panel means', () => {
    const groups = panelGroupsFor(panelRowsFor(rows, 'frame', 'block', () => true));
    expect(groups.map((one) => one.label)).toEqual(['선택', '배치', '선택']);
    /*
     * **Twice**, deliberately. A map keyed by label would silently merge the two runs and move a row
     * up the panel; this draws the heading again, which is visible and therefore fixable — the
     * declaration is what decides, and it says these are two runs.
     */
    expect(groups[2].rows.map((one) => one.attr)).toEqual(['stype']);
  });

  it('answers the two questions the harness asks', () => {
    expect(panelCommands(rows).sort()).toEqual(['setFormat', 'setName', 'setValue']);
    /*
     * `stype` is read and never written, and `componentValue` names a *node type* rather than an
     * attribute of the selected node — so neither is something a reader can change, which is what
     * `every-property-can-be-edited` is asking.
     */
    expect(panelAttrs(rows).sort()).toEqual(['fill', 'gap', 'columns', 'name'].sort());
  });

  it('counts the attributes a row writes without naming', () => {
    // A destination picker writes three because a reader chooses one thing; three rows would be two
    // controls nobody wants.
    expect(panelAttrs(rows, { gap: ['gapX', 'gapY'] })).toContain('gapX');
  });
});
