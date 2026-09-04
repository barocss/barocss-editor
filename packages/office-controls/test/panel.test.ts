import { describe, expect, it } from 'vitest';
import {
  panelAttrs,
  panelCommands,
  panelGroupsFor,
  panelRowShown,
  panelRowsFor,
  type PanelRow
} from '../src/panel';

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

  it('gives a heading one section, wherever its rows turn up', () => {
    /**
     * **This asserted the opposite**, with an argument: *twice, deliberately — a map keyed by label
     * would silently merge the two runs and move a row up the panel; this draws the heading again,
     * which is visible and therefore fixable, and the declaration says these are two runs.*
     *
     * It reads well and it is wrong, for a reason no declaration can prevent: a run is only
     * contiguous **after filtering**. Rows of a group are written together and `panelRowsFor` then
     * drops the ones a node type has no place for — so a heading that is one section in the file
     * becomes two on screen the moment a type sits out the middle of it.
     *
     * Measured on the site builder: a **page** drew `바탕 | 그림자 | 바탕 | 그림자`, two headings
     * each twice, and a `collection` drew 데이터 twice. React said so out loud — *Encountered two
     * children with the same key* — because a list keyed by label then has two children with one
     * key, and React's own warning ends *the behavior is unsupported*.
     *
     * Two sections under one heading is never a design. The label is the group; its **place** is
     * still where its first row is, so order is still meaning.
     */
    const groups = panelGroupsFor(panelRowsFor(rows, 'frame', 'block', () => true));
    expect(groups.map((one) => one.label)).toEqual(['선택', '배치']);
    /* The later row joins the section its heading already made, rather than starting a second one. */
    expect(groups[0].rows.map((one) => one.attr)).toEqual(['name', 'stype']);
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

/**
 * **조건이 붙은 행이 보이는가** — 한 답이어야 하는 질문이 두 답이었습니다.
 *
 * Written twice, in the site's inspector and the deck's properties, and the two disagreed on empty
 * string and empty array. That is the category `docs/SHARED-LAYER.md` opens with: *share what two
 * implementations disagreeing about would be a bug* — not a style difference, one of them wrong.
 */
describe('when 이 붙은 행', () => {
  const row = (when: { attr: string; is?: unknown[] } | undefined, single?: boolean) =>
    ({
      attr: 'x',
      group: 'g',
      label: 'x',
      ariaLabel: 'x',
      control: 'toggle',
      when,
      single
    }) as PanelRow;

  it('shows a row with no condition, always', () => {
    expect(panelRowShown(row(undefined), {})).toBe(true);
  });

  it('hides a row whose attribute is not set — and empty is not set', () => {
    const one = row({ attr: 'opens' });
    expect(panelRowShown(one, { opens: '메뉴' })).toBe(true);
    expect(panelRowShown(one, {})).toBe(false);
    expect(panelRowShown(one, { opens: null })).toBe(false);

    /**
     * **The two the two implementations disagreed about.**
     *
     * The site said *shown* for both, because it asked only `undefined || null`. A 처음부터 row
     * offered for a block whose `opens` a reader has just cleared is a row about nothing — and
     * `when` without `is` means *when that attribute is set*, which an empty string is not.
     */
    expect(panelRowShown(one, { opens: '' })).toBe(false);
    expect(panelRowShown(one, { opens: [] })).toBe(false);
    /* And an array with something in it is set. */
    expect(panelRowShown(one, { opens: ['메뉴'] })).toBe(true);
  });

  it('takes `is` as the whole of the condition when it is given', () => {
    const one = row({ attr: 'kind', is: ['a', 'b'] });
    expect(panelRowShown(one, { kind: 'a' })).toBe(true);
    expect(panelRowShown(one, { kind: 'c' })).toBe(false);
    /* Including when what it lists is the empty one — a deliberate `is: ['']` means it. */
    expect(panelRowShown(row({ attr: 'kind', is: [''] }), { kind: '' })).toBe(true);
  });

  it('hides a row that cannot answer for two things at once', () => {
    /* `single` — the site's alone until now, and the deck wants it the first time a row cannot. */
    expect(panelRowShown(row(undefined, true), {}, 1)).toBe(true);
    expect(panelRowShown(row(undefined, true), {}, 2)).toBe(false);
    expect(panelRowShown(row(undefined), {}, 2)).toBe(true);
  });
});
