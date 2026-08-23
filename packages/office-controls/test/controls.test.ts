import { describe, it, expect } from 'vitest';
import type { SelectionSummary } from '@barocss/editor-core';
import {
  choiceOptions,
  commandsIn,
  iconsIn,
  currentChoice,
  currentPaletteColor,
  markTypesIn,
  stateOfAttribute,
  stateOfMark,
  type ChoiceControl,
  type Control,
  type PaletteControl
} from '../src/index';

/**
 * The layer between a control's declaration and what a drawing needs.
 *
 * Tested here, in a node environment with no DOM, because that is the whole
 * claim: turning a declaration into a value is arithmetic, and arithmetic is
 * milliseconds. It was tested through two products' toolbars before — which
 * meant the *shared* behaviour was only ever checked in the shape one product
 * happened to use it in.
 */

/** Enough of a summary to answer with. Written out rather than built from a
 *  document, because none of these functions has ever seen one. */
const summary = (over: Partial<SelectionSummary> = {}): SelectionSummary =>
  ({
    marks: [],
    mixedMarks: [],
    markAttributes: {},
    blockAttributes: {},
    mixedAttributes: [],
    empty: false,
    ...over
  }) as SelectionSummary;

const SIZES: ChoiceControl = {
  id: 'font-size',
  label: 'Size',
  command: 'setFontSize',
  key: 'size',
  markType: 'fontSize',
  attr: 'size',
  options: [11, 12, 14].map((points) => ({ value: points * 2, label: String(points) })),
  // Half-points stored, points read — the unit lives on the declaration.
  labelOf: (value) => String(Number(value) / 2)
};

describe('the options a choice offers', () => {
  it('is the presets when the current value is one of them', () => {
    expect(choiceOptions(SIZES, '24').map((option) => option.id)).toEqual(['22', '24', '28']);
  });

  /**
   * The one that mattered: a value outside the presets left the box blank, which
   * a reader reads as "the selection disagrees with itself" when it agrees
   * perfectly. A deck's layout sets its titles in 54pt and the control offers a
   * dozen round numbers.
   */
  it('puts a value the presets do not list in front of them', () => {
    const options = choiceOptions(SIZES, '108');
    expect(options[0]).toEqual({ id: '108', label: '54' });
    expect(options).toHaveLength(4);
  });

  it('offers only the presets when there is no current value', () => {
    // Null is "the selection disagrees", and there is nothing to add for it.
    expect(choiceOptions(SIZES, null)).toHaveLength(3);
  });

  it('shows an unlisted value as itself when the declaration says nothing', () => {
    const plain: ChoiceControl = { ...SIZES, labelOf: undefined };
    expect(choiceOptions(plain, '13')[0]).toEqual({ id: '13', label: '13' });
  });
});

describe('the value a choice shows', () => {
  it('is what the selection carries', () => {
    expect(currentChoice(SIZES, summary({ markAttributes: { fontSize: { size: 24 } } }))).toBe('24');
  });

  it('is nothing when the selection does not agree', () => {
    // A selection spanning two sizes *has* a value under the mark. Showing either
    // of them would apply it to the whole selection on the next change.
    expect(
      currentChoice(
        SIZES,
        summary({ mixedMarks: ['fontSize'], markAttributes: { fontSize: { size: 24 } } })
      )
    ).toBeNull();
  });

  it('falls back to what the text inherits, and only then', () => {
    let asked = 0;
    const inherited = () => {
      asked += 1;
      return 22;
    };

    expect(currentChoice(SIZES, summary({ markAttributes: { fontSize: { size: 24 } } }), inherited)).toBe('24');
    // Not asked at all when the selection answered: resolving a style cascade is
    // real work, and this runs on every render of every toolbar.
    expect(asked).toBe(0);

    expect(currentChoice(SIZES, summary(), inherited)).toBe('22');
    expect(asked).toBe(1);
  });

  it('is nothing when nothing inherits either', () => {
    expect(currentChoice(SIZES, summary(), () => undefined)).toBeNull();
  });

  /**
   * Disagreement beats anything inherited, and this is the test that was missing
   * here and present in Word's suite — which is how the regression was caught
   * when this moved rather than after it shipped.
   *
   * A selection over two fonts has no font. Answering with the style's font says
   * *this text is Georgia* about text that is half Georgia, which is the one
   * thing the empty box exists to say the opposite of.
   */
  it('stays empty for a selection that disagrees, whatever it would inherit', () => {
    expect(currentChoice(SIZES, summary({ mixedMarks: ['fontSize'] }), () => 22)).toBeNull();
  });
});

describe('the colour a palette shows', () => {
  const textColour: PaletteControl = {
    id: 'font-color',
    label: 'Colour',
    icon: 'font-color',
    command: 'setFontColor',
    key: 'color',
    markType: 'fontColor',
    attr: 'color',
    swatches: [{ value: '#000000', label: 'Black' }]
  };

  it('reads a mark for a colour that is a mark', () => {
    expect(
      currentPaletteColor(textColour, summary({ markAttributes: { fontColor: { color: '#c00' } } }))
    ).toBe('#c00');
  });

  it('reads an attribute for a colour that is a container’s', () => {
    const shading: PaletteControl = {
      ...textColour,
      markType: undefined,
      attr: undefined,
      cellAttribute: 'shading'
    };
    expect(currentPaletteColor(shading, summary(), { attributes: { shading: '#eee' } })).toBe('#eee');
    // An empty string is not a colour; a cell with no shading has no colour to
    // show, and reporting '' would draw the swatch as though it did.
    expect(currentPaletteColor(shading, summary(), { attributes: { shading: '' } })).toBeNull();
    expect(currentPaletteColor(shading, summary(), undefined)).toBeNull();
  });

  it('shows nothing across a selection that disagrees', () => {
    expect(currentPaletteColor(textColour, summary({ mixedMarks: ['fontColor'] }))).toBeNull();
  });
});

describe('reading a control’s state', () => {
  it('is three-valued for a mark, and says which mark it is', () => {
    const bold = stateOfMark('bold');
    expect(bold.markType).toBe('bold');
    expect(bold(summary({ marks: ['bold'] }))).toBe('on');
    expect(bold(summary({ mixedMarks: ['bold'] }))).toBe('mixed');
    expect(bold(summary())).toBe('off');
  });

  it('is three-valued for a block attribute, and names no mark', () => {
    const centred = stateOfAttribute('alignment', 'center');
    expect((centred as { markType?: string }).markType).toBeUndefined();
    expect(centred(summary({ blockAttributes: { alignment: 'center' } }))).toBe('on');
    // Mixed before equal: a selection over a left-aligned and a centred
    // paragraph agrees on neither, and `off` would re-align both on one click.
    expect(
      centred(summary({ blockAttributes: { alignment: 'center' }, mixedAttributes: ['alignment'] }))
    ).toBe('mixed');
    expect(centred(summary({ blockAttributes: { alignment: 'left' } }))).toBe('off');
  });
});

describe('what a toolbar names', () => {
  const groups = [
    {
      id: 'text',
      controls: [
        { id: 'bold', label: 'Bold', icon: 'bold', command: 'toggleBold', state: stateOfMark('bold') },
        {
          id: 'align-center',
          label: 'Centre',
          icon: 'align-center',
          command: 'setAlignment',
          state: stateOfAttribute('alignment', 'center')
        }
      ] as Control[]
    }
  ];

  it('lists the marks it reads and nothing else', () => {
    // The alignment control has a state and no mark; a check asking the schema
    // about `alignment` would fail on a name the schema is right not to have.
    expect(markTypesIn(groups)).toEqual(['bold']);
  });

  it('lists the commands it runs, palettes included', () => {
    const palette: PaletteControl = {
      id: 'font-color',
      label: 'Colour',
      icon: 'font-color',
      command: 'setFontColor',
      clearCommand: 'clearFontColor',
      key: 'color',
      swatches: []
    };

    // The palettes are the half a hand-written copy of this forgets, and what a
    // check cannot see it reports as fine.
    expect(commandsIn(groups, [palette])).toEqual([
      'toggleBold',
      'setAlignment',
      'setFontColor',
      'clearFontColor'
    ]);
  });

  /**
   * The acts it asks pictures for, which is a different question from the commands.
   *
   * `every-icon-has-a-picture` asks the icon table about these — from the
   * *declaration*, so a control on a tab nobody opened counts, which is exactly what
   * the products' browser tests cannot see.
   */
  it('lists the icons it asks for, palettes included and each once', () => {
    const palette: PaletteControl = {
      id: 'font-color',
      label: 'Colour',
      icon: 'font-color',
      command: 'setFontColor',
      key: 'color',
      swatches: []
    };
    expect(iconsIn(groups, [palette])).toEqual(['bold', 'align-center', 'font-color']);

    // One act, however many controls perform it: a toolbar and a context menu both
    // offering 복제 is one picture to have.
    const twice = [
      { id: 'a', controls: [{ id: 'a', label: 'A', icon: 'duplicate', command: 'x' }] as Control[] },
      { id: 'b', controls: [{ id: 'b', label: 'B', icon: 'duplicate', command: 'y' }] as Control[] }
    ];
    expect(iconsIn(twice)).toEqual(['duplicate']);
  });

  it('counts one command once, however many controls run it', () => {
    const twice = [
      { id: 'a', controls: [{ id: 'x', label: 'X', icon: 'add', command: 'same' }] as Control[] },
      { id: 'b', controls: [{ id: 'y', label: 'Y', icon: 'add', command: 'same' }] as Control[] }
    ];
    expect(commandsIn(twice)).toEqual(['same']);
  });
});
