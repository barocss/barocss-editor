import { WORD_FONTS, WORD_FONT_SIZES } from '@barocss/office-controls';
import { describe, it, expect } from 'vitest';
import { Schema } from '@barocss/schema';
import { getWordSchemaDefinition } from '../src/word-schema';
import {
  cellAttributeState,
  choiceOptions,
  currentPaletteColor,
  currentStyle,
  tableLookState,
  toolbarCommands,
  toolbarMarkTypes,
  WORD_STYLES,
  WORD_TOOLBAR,
  WORD_TEXT_COLOR,
  WORD_CELL_SHADING
} from '../src/toolbar-model';
import { WORD_KEYBINDINGS } from '../src/word-keymap';
import type { SelectionSummary } from '@barocss/editor-core';

const definition = getWordSchemaDefinition() as any;
const schema = new Schema('word', definition);

/**
 * The toolbar curates rather than mirroring — a schema with forty marks does not
 * make a usable toolbar, and Word's own shows a dozen. But what it curates has
 * to be real: a control naming a mark the schema does not define is a button
 * that is always off, and nobody notices, because an off button looks like an
 * off button.
 */
describe('what the toolbar names', () => {
  it('reads only marks the schema defines', () => {
    for (const type of toolbarMarkTypes()) {
      expect(schema.getMarkType(type), `mark '${type}' is not in the schema`).toBeDefined();
    }
  });

  it('names the styles by node types the schema defines', () => {
    for (const style of WORD_STYLES) {
      expect(schema.getNodeType(style.stype), `node '${style.stype}' is not in the schema`).toBeDefined();
    }
  });

  it('runs only commands the key map also knows', () => {
    // Not a rule about implementation — a command can exist without a shortcut —
    // but a toolbar button and a shortcut for the same thing should not drift
    // into two different command names.
    const bound = new Set(WORD_KEYBINDINGS.map((binding) => binding.command));
    const shared = toolbarCommands().filter((command) => bound.has(command));
    expect(shared.length).toBeGreaterThan(0);
  });

  it('gives every control an id, a label and a command', () => {
    for (const control of WORD_TOOLBAR.flatMap((group) => group.controls)) {
      expect(control.id).toBeTruthy();
      // The label is what a screen reader announces; an icon alone says nothing
      expect(control.label).toBeTruthy();
      expect(control.command).toBeTruthy();
    }
  });

  it('does not repeat an id', () => {
    const ids = WORD_TOOLBAR.flatMap((group) => group.controls).map((control) => control.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('which style the dropdown shows', () => {
  const summary = (over: Partial<SelectionSummary>): SelectionSummary =>
    ({
      marks: [],
      mixedMarks: [],
      markAttributes: {},
      blocks: [],
      blockAttributes: {},
      mixedAttributes: [],
      collapsed: false,
      empty: false,
      ...over
    }) as SelectionSummary;

  it('shows the entry when the blocks agree', () => {
    expect(currentStyle(summary({ blockAttributes: { stype: 'paragraph' } }))).toBe('paragraph');
    expect(currentStyle(summary({ blockAttributes: { stype: 'heading', level: 2 } }))).toBe('heading2');
  });

  it('shows nothing when they do not', () => {
    // Showing one of them is how a dropdown applies a style to a selection that
    // had two.
    expect(currentStyle(summary({ mixedAttributes: ['stype'] }))).toBeNull();
    expect(
      currentStyle(summary({ blockAttributes: { stype: 'heading' }, mixedAttributes: ['level'] }))
    ).toBeNull();
  });

  it('shows nothing for a block the dropdown does not offer', () => {
    // A table is a block, and "table" is not a paragraph style
    expect(currentStyle(summary({ blockAttributes: { stype: 'bTable' } }))).toBeNull();
  });
});

describe('which of its style’s regions a table asks for', () => {
  const table = (look?: string) => ({ sid: 't', stype: 'bTable', attributes: look ? { look } : {} });

  it('reads them off the table rather than off the selection', () => {
    // The caret is in a paragraph in a cell; what the table around it asks for
    // is three walks up from there, so the host answers and the control asks.
    expect(tableLookState('firstRow', table('firstRow,bandedRows'))).toBe('on');
    expect(tableLookState('lastRow', table('firstRow,bandedRows'))).toBe('off');
  });

  it('answers with the default look for a table that records none', () => {
    expect(tableLookState('firstRow', table())).toBe('on');
    expect(tableLookState('bandedColumns', table())).toBe('off');
  });

  it('is off outside a table, where there is nothing to be on about', () => {
    expect(tableLookState('firstRow', undefined)).toBe('off');
  });
});

/**
 * The model has to stay drawable by anything.
 *
 * The engine renders through either a DOM or a React renderer. A product that
 * shipped its toolbar as DOM would force every host to be a DOM host; one that
 * shipped it as React would force React on all of them.
 */
describe('the toolbar model', () => {
  it('touches no DOM', async () => {
    // Read from the package root, which is where vitest runs
    const source = await import('node:fs').then((fs) =>
      fs.readFileSync('src/toolbar-model.ts', 'utf8')
    );

    // Comments are stripped first. Searching the raw source matched the word
    // "document" in prose — this file cannot explain what it does without using
    // it — and a rule that fails on its own explanation teaches people to write
    // worse comments rather than better code.
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/\/\/[^\n]*/g, ' ');

    for (const global of ['document.', 'window.', 'HTMLElement', 'createElement']) {
      expect(code, `toolbar-model references ${global}`).not.toContain(global);
    }
  });

  it('is data a host can walk without running anything', () => {
    for (const group of WORD_TOOLBAR) {
      expect(Array.isArray(group.controls)).toBe(true);
      for (const control of group.controls) {
        // A host needs the label and the icon to draw it, and the command to
        // wire it — none of which should require calling into the product.
        expect(typeof control.label).toBe('string');
        expect(typeof control.icon).toBe('string');
        expect(typeof control.command).toBe('string');
      }
    }
  });
});

describe('what a control reads off the cell it is in', () => {
  const cell = (attributes: Record<string, unknown> = {}) =>
    ({ sid: 'c', stype: 'bTableCell', attributes });

  it('is on while the cell already has the value it sets', () => {
    const middle = { key: 'verticalAlign', value: 'center' };
    expect(cellAttributeState(middle, cell({ verticalAlign: 'center' }))).toBe('on');
    expect(cellAttributeState(middle, cell({ verticalAlign: 'bottom' }))).toBe('off');
  });

  it('lets one of a group speak for a cell that says nothing', () => {
    // A cell with no vertical alignment sits at the top, so the top button is on
    // for a cell nobody has touched — which is what the page shows.
    const top = { key: 'verticalAlign', value: 'top', whenUnset: true };
    const bottom = { key: 'verticalAlign', value: 'bottom' };
    expect(cellAttributeState(top, cell())).toBe('on');
    expect(cellAttributeState(bottom, cell())).toBe('off');
    expect(cellAttributeState(top, cell({ verticalAlign: 'bottom' }))).toBe('off');
  });

  it('is off outside a cell', () => {
    expect(cellAttributeState({ key: 'verticalAlign', value: 'top', whenUnset: true }, undefined))
      .toBe('off');
  });
});

/*
 * **칸 글자 방향의 순환은 `office-text` 에서 묻는다** — `table-commands.ts` 가 그리로 갔다.
 * 기능은 그것이 사는 층에서 묻고, 여기서는 툴바가 그것을 부르는지만 남는다
 * (`docs/specs/testing.md`).
 */

/**
 * The colour controls, and where each reads its current value.
 *
 * Two palettes, one shape. Text colour is a *mark* on a range and cell shading
 * is an *attribute* on a node, and neither the component that draws swatches nor
 * the model that lists them should have to know which — so the palette says
 * where to look and this answers.
 *
 * `setFontColor` was registered in Word's kit from the day the kit had marks and
 * was on no toolbar: this word processor could not change the colour of its own
 * text. The palette exists because the same control answers both.
 */
describe('what colour a palette shows', () => {
  const summary = (over: Partial<SelectionSummary>): SelectionSummary =>
    ({
      marks: [],
      mixedMarks: [],
      markAttributes: {},
      blocks: [],
      blockAttributes: {},
      mixedAttributes: [],
      collapsed: false,
      empty: false,
      ...over
    }) as SelectionSummary;

  it('reads a mark, for text', () => {
    expect(
      currentPaletteColor(
        WORD_TEXT_COLOR,
        summary({ markAttributes: { fontColor: { color: 'C00000' } } })
      )
    ).toBe('C00000');
  });

  /**
   * Nothing rather than one of them. A palette showing red for a selection that
   * is half red and half blue is a palette that applies red to all of it on the
   * next press.
   */
  it('shows nothing when the selection disagrees', () => {
    expect(
      currentPaletteColor(
        WORD_TEXT_COLOR,
        summary({ mixedMarks: ['fontColor'], markAttributes: { fontColor: { color: 'C00000' } } })
      )
    ).toBeNull();
  });

  it('shows nothing when there is no colour, which is not white', () => {
    expect(currentPaletteColor(WORD_TEXT_COLOR, summary({}))).toBeNull();
  });

  it('reads an attribute, for a cell', () => {
    const cell = { sid: 'c', stype: 'bTableCell', attributes: { shadingFill: 'FFC000' } } as never;
    expect(currentPaletteColor(WORD_CELL_SHADING, summary({}), cell)).toBe('FFC000');
  });

  /**
   * An empty fill is how this schema says "no shading" — the store skips a write
   * that compares equal to what is there, so clearing has to write a real value
   * rather than remove the attribute. The palette has to read it back as none.
   */
  it('treats an empty fill as no shading', () => {
    const cell = { sid: 'c', stype: 'bTableCell', attributes: { shadingFill: '' } } as never;
    expect(currentPaletteColor(WORD_CELL_SHADING, summary({}), cell)).toBeNull();
    expect(currentPaletteColor(WORD_CELL_SHADING, summary({}), undefined)).toBeNull();
  });

  it('offers the same colours to both, and no duplicates', () => {
    const values = WORD_TEXT_COLOR.swatches.map((swatch) => swatch.value);
    expect(new Set(values).size).toBe(values.length);
    expect(WORD_CELL_SHADING.swatches).toEqual(WORD_TEXT_COLOR.swatches);
    // Bare hex, the way Word stores a colour and the way `normalizeColor` reads
    // one. A `#` here would round-trip into a document as an unrecognised value.
    for (const value of values) expect(value).toMatch(/^[0-9A-F]{6}$/);
  });
});

/**
 * Delete is bound to taking a table away, and only where that is what it means.
 *
 * `inTable` is true with a caret in any cell, and binding Delete on it would make
 * Backspace the most destructive key in the product: a reader deleting a
 * character would lose the table. `tableSelected` is only true after the handle
 * at a table's corner has been used, which is the gesture that means "this table,
 * as one thing" — and the last of the four selection types to get a producer.
 */
describe('what Delete is allowed to remove', () => {
  const bindings = WORD_KEYBINDINGS.filter((binding) => binding.command === 'deleteTable');

  it('is bound to Delete and Backspace', () => {
    expect(bindings.map((binding) => binding.key).sort()).toEqual(['Backspace', 'Delete']);
  });

  it('is guarded by the table being selected, not by being in one', () => {
    for (const binding of bindings) {
      expect(binding.when, `${binding.key}이 표 안이기만 하면 지웁니다`).toContain('tableSelected');
      expect(binding.when).not.toContain('inTable');
    }
  });

  /**
   * And **every** plain Delete binding is guarded by something being *selected*, which is what
   * makes the guard load-bearing rather than decorative: one binding on the same key with a looser
   * guard would win somewhere, and the key it would win on is the destructive one.
   *
   * It used to say "nothing else takes these keys at all", and a drawing's shapes are the second
   * thing that can be selected in a page. The rule the first binding was written for is the one
   * worth holding: *selected*, never "somewhere inside".
   */
  it('lets nothing take a plain Delete without something being selected', () => {
    const plain = WORD_KEYBINDINGS.filter(
      (binding) => binding.key === 'Delete' || binding.key === 'Backspace'
    );
    expect(plain.map((binding) => binding.command).sort()).toEqual([
      'deleteShapes',
      'deleteShapes',
      'deleteTable',
      'deleteTable'
    ]);
    for (const binding of plain) {
      expect(binding.when, `${binding.key}(${binding.command})의 조건이 선택이 아닙니다`).toMatch(
        /Selected/
      );
      expect(binding.when).not.toContain('inTable');
    }
  });
});

/**
 * A value the presets do not list is still the value.
 *
 * A deck's layouts are set in whatever the designer chose — 54pt for a title —
 * and the size control offers a dozen round numbers. A value outside them left
 * the box blank, which reads as *the selection disagrees with itself* when it
 * agrees perfectly.
 *
 * Here rather than in either app: it was fixed in the deck's ribbon with a
 * comment saying Word had the same gap and it was logged rather than copied. A
 * gap logged in one product and fixed in the other is the thing this repository
 * keeps finding and calling a defect.
 */
describe('the options a choice control offers', () => {
  it('is the presets, when the value is one of them', () => {
    const options = choiceOptions(WORD_FONT_SIZES, '24');
    expect(options).toHaveLength(WORD_FONT_SIZES.options.length);
    expect(options[0].id).toBe(String(WORD_FONT_SIZES.options[0].value));
  });

  it('puts an unlisted value at the front, so the box is never blank', () => {
    // 26 half-points is 13pt, which no preset offers.
    const options = choiceOptions(WORD_FONT_SIZES, '26');
    expect(options).toHaveLength(WORD_FONT_SIZES.options.length + 1);
    expect(options[0]).toEqual({ id: '26', label: '13' });
  });

  /**
   * The label is the model's business, not the app's. The document stores
   * half-points and a reader reads points, and an app that divided by two would
   * be an app that knew a `.docx` detail.
   */
  it('shows an unlisted value in the unit a reader reads', () => {
    expect(choiceOptions(WORD_FONT_SIZES, '27')[0].label).toBe('13.5');
    // A control with no unit of its own shows the value as it is.
    expect(choiceOptions(WORD_FONTS, 'Comic Sans')[0]).toEqual({
      id: 'Comic Sans',
      label: 'Comic Sans'
    });
  });

  it('leaves the list alone when there is no value to show', () => {
    expect(choiceOptions(WORD_FONT_SIZES, null)).toHaveLength(WORD_FONT_SIZES.options.length);
  });
});
