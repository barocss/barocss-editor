/**
 * Word's equations, as Word stores them.
 *
 * The shape is OMML's — Office MathML, the `m:` namespace that sits inside
 * WordprocessingML — node for node and slot for slot. Not because OMML is a nice
 * design, but because the model is the part that cannot be changed later: the
 * typesetting can be rewritten any afternoon, and a document already written
 * cannot. A structure that matches what Word writes is one that can be read from
 * and written back to a .docx without inventing a translation for something the
 * format has no room for.
 *
 * The whole of it is one idea repeated: every construct is a node with **named
 * slots**, and every slot holds a sequence of runs and further constructs. A
 * fraction has a numerator and a denominator; a radical has a degree and a body;
 * a matrix has rows of cells. Nothing else. That is what makes an equation
 * editable in the document rather than in a dialogue — a slot is an ordinary
 * editable container, so the caret, the input path and undo all work in it
 * already, and what has to be added is only the moving between slots.
 *
 * Named after OMML rather than after LaTeX on purpose. LaTeX is an input syntax
 * and a fine one, but `\frac` carries no numerator *slot* — it has arguments,
 * positionally — and a model built on it would have to be translated at both
 * ends of every file.
 */
import type { NodeTypeDefinition } from '@barocss/schema';

/** The group a slot's contents belong to: runs and the constructs. */
const MATH = 'math';

/** Anything that may sit inside a slot. */
const MATH_CONTENT = 'math*';

const str = (): { type: 'string'; required: false } => ({ type: 'string', required: false });
const bool = (value = false): { type: 'boolean'; default: boolean } => ({
  type: 'boolean',
  default: value
});

/**
 * A slot: a named, editable hole in a construct.
 *
 * They are separate node types rather than one type with a role attribute
 * because the schema is what says a fraction has exactly a numerator and a
 * denominator. A single slot type would let a fraction hold three of them and
 * only the renderer would object, which is the sort of document fault that
 * survives a save and turns up in somebody else's Word.
 */
const slot = (name: string, _doc: string): NodeTypeDefinition => ({
  name,
  group: 'mathSlot',
  content: MATH_CONTENT
});

/**
 * Word's equation nodes.
 *
 * `oMath` is the equation itself and is inline content: an equation in the
 * middle of a sentence is part of that sentence, and Word stores it inside the
 * paragraph alongside the ordinary runs. `oMathPara` is the display form — an
 * equation on its own, centred by default — and is a block.
 */
export function mathDefinitions(): Record<string, NodeTypeDefinition> {
  return {
    oMathPara: {
      name: 'oMathPara',
      group: 'block',
      content: 'oMath+',
      attrs: {
        /** Word's `m:jc`: centre, centreGroup, left, right. */
        alignment: { type: 'string', default: 'center' }
      }
    },

    oMath: {
      name: 'oMath',
      group: 'inline',
      content: MATH_CONTENT
    },

    /**
     * A run of mathematical text.
     *
     * Separate from an ordinary run because the rules differ: a variable in a
     * math zone is italic by convention, and `literal` is what exempts the text
     * that is not a variable — Word's `m:nor`. `script` chooses the alphabet
     * (script, fraktur, double-struck and so on), which in Unicode is a
     * different set of code points and not a font choice.
     */
    mathRun: {
      name: 'mathRun',
      group: MATH,
      content: 'inline-text*',
      attrs: {
        style: str(), // p | b | i | bi — Word's m:sty
        script: str(), // roman | script | fraktur | double-struck | sans-serif | monospace
        literal: bool() // m:nor: text, not a variable
      }
    },

    // ── Slots ────────────────────────────────────────────────────────────────
    mathNum: slot('mathNum', "A fraction's numerator."),
    mathDen: slot('mathDen', "A fraction's denominator."),
    mathElement: slot('mathElement', 'The thing a construct is about — OMML calls it m:e.'),
    mathSup: slot('mathSup', 'What is raised.'),
    mathSub: slot('mathSub', 'What is lowered.'),
    mathDeg: slot('mathDeg', "A radical's degree, empty for a square root."),
    mathFuncName: slot('mathFuncName', 'The name of the function being applied.'),
    mathLim: slot('mathLim', 'What is written under or over.'),

    // ── Constructs ───────────────────────────────────────────────────────────
    /** A fraction. `type` is Word's bar, skewed, linear or no-bar. */
    mathFraction: {
      name: 'mathFraction',
      group: MATH,
      content: 'mathNum mathDen',
      attrs: { type: { type: 'string', default: 'bar' } } // bar | skw | lin | noBar
    },

    mathSuperscript: { name: 'mathSuperscript', group: MATH, content: 'mathElement mathSup' },
    mathSubscript: { name: 'mathSubscript', group: MATH, content: 'mathElement mathSub' },
    mathSubSup: { name: 'mathSubSup', group: MATH, content: 'mathElement mathSub mathSup' },
    /** Sub- and superscript written in front, as in prescripts on an isotope. */
    mathPreSubSup: { name: 'mathPreSubSup', group: MATH, content: 'mathSub mathSup mathElement' },

    mathRadical: {
      name: 'mathRadical',
      group: MATH,
      content: 'mathDeg mathElement',
      attrs: { hideDegree: bool(true) } // m:degHide
    },

    /**
     * An n-ary operator: a sum, an integral, a product.
     *
     * `limitLocation` is the difference between limits above and below the sign
     * and limits written as scripts beside it, which is a typographic choice
     * Word leaves to the document rather than to the operator.
     */
    mathNary: {
      name: 'mathNary',
      group: MATH,
      content: 'mathSub mathSup mathElement',
      attrs: {
        char: { type: 'string', default: '∑' }, // m:chr
        limitLocation: { type: 'string', default: 'undOvr' }, // undOvr | subSup
        grow: bool(true),
        hideSub: bool(),
        hideSup: bool()
      }
    },

    /**
     * Delimiters: brackets, and what is between them.
     *
     * Several elements rather than one, because `(a, b)` is one delimiter around
     * two things separated by `m:sepChr` — not a bracket around a string that
     * happens to contain a comma.
     */
    mathDelimiter: {
      name: 'mathDelimiter',
      group: MATH,
      content: 'mathElement+',
      attrs: {
        open: { type: 'string', default: '(' }, // m:begChr
        close: { type: 'string', default: ')' }, // m:endChr
        separator: { type: 'string', default: '|' }, // m:sepChr
        grow: bool(true),
        shape: { type: 'string', default: 'centered' } // centered | match
      }
    },

    /** A function applied to something: sin, log, and the like. */
    mathFunction: { name: 'mathFunction', group: MATH, content: 'mathFuncName mathElement' },

    mathLimitLower: { name: 'mathLimitLower', group: MATH, content: 'mathElement mathLim' },
    mathLimitUpper: { name: 'mathLimitUpper', group: MATH, content: 'mathElement mathLim' },

    /**
     * A matrix, as rows of cells.
     *
     * The cells are the ordinary element slot, so everything that can be written
     * anywhere can be written in a cell, including another matrix.
     */
    mathMatrix: {
      name: 'mathMatrix',
      group: MATH,
      content: 'mathRow+',
      attrs: {
        columnAlignment: { type: 'string', default: 'center' }, // m:mcJc
        columnGap: { type: 'number', required: false },
        rowGap: { type: 'number', required: false },
        plcHide: bool()
      }
    },
    mathRow: { name: 'mathRow', group: 'mathSlot', content: 'mathElement+' },

    /** A stack of equations aligned on a common point. */
    mathArray: {
      name: 'mathArray',
      group: MATH,
      content: 'mathElement+',
      attrs: { maxDistance: bool(), objectDistance: bool() }
    },

    /** An accent written over the element: a hat, a tilde, a vector arrow. */
    mathAccent: {
      name: 'mathAccent',
      group: MATH,
      content: 'mathElement',
      attrs: { char: { type: 'string', default: '̂' } }
    },

    /** A bar over or under the element. */
    mathBar: {
      name: 'mathBar',
      group: MATH,
      content: 'mathElement',
      attrs: { position: { type: 'string', default: 'top' } } // top | bot
    },

    /** A brace or arrow drawn over or under the element, with a label. */
    mathGroupChar: {
      name: 'mathGroupChar',
      group: MATH,
      content: 'mathElement',
      attrs: {
        char: { type: 'string', default: '⏟' },
        position: { type: 'string', default: 'bot' },
        verticalAlign: { type: 'string', default: 'bot' }
      }
    },

    /** A box drawn round the element, or an invisible one used for spacing. */
    mathBorderBox: {
      name: 'mathBorderBox',
      group: MATH,
      content: 'mathElement',
      attrs: {
        hideTop: bool(),
        hideBottom: bool(),
        hideLeft: bool(),
        hideRight: bool(),
        strikeHorizontal: bool(),
        strikeVertical: bool()
      }
    },

    /**
     * Something that takes room and shows nothing.
     *
     * Word's `m:phant`, and it is how an author lines two equations up by hand:
     * a phantom of the wider one holds the space the narrower one lacks.
     */
    mathPhantom: {
      name: 'mathPhantom',
      group: MATH,
      content: 'mathElement',
      attrs: {
        showContents: bool(),
        zeroWidth: bool(),
        zeroAscent: bool(),
        zeroDescent: bool()
      }
    },

    /**
     * A grouping that changes no appearance.
     *
     * It exists so that operators and line breaks can be told what to treat as
     * one thing — Word's `m:box` with `m:opEmu` and friends.
     */
    mathBox: {
      name: 'mathBox',
      group: MATH,
      content: 'mathElement',
      attrs: { operatorEmulator: bool(), noBreak: bool(), differential: bool() }
    }
  };
}
