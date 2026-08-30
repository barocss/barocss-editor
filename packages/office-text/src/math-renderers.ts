/**
 * Drawing an equation.
 *
 * Spans and CSS, which is what KaTeX produces too — mathematical typesetting on
 * the web is boxes stacked and shifted, not a different medium. A fraction is
 * two boxes and a rule; a superscript is a box raised and made smaller; a matrix
 * is a grid. What a browser cannot do on its own is the part that depends on a
 * font's MATH table — the italic corrections and the glyph-assembly recipes that
 * make a bracket grow to fit what it holds — and that is approximated here and
 * noted where it is.
 *
 * Every slot renders as an ordinary editable element holding its own children.
 * That is the whole reason for the shape of the model: the caret, the input path
 * and undo already work inside an element that holds text, so an equation is
 * edited in the document with nothing added but the moving between slots.
 *
 * An empty slot still draws — as a dotted box — because a slot that showed
 * nothing would be a place the caret can go and the author cannot see.
 */
import { define, element, slot } from '@barocss/dsl';

/** Two decimal places, which is as fine as an `em` is worth stating. */
const round = (value: number): number => Math.round(value * 100) / 100;

/** The class every slot carries, for the caret and the empty-box styling. */
export const MATH_SLOT_CLASS = 'w-math-slot';

const slotTemplate = (className: string) =>
  element('span', { className: `${MATH_SLOT_CLASS} ${className}` }, [slot('content')]);

/**
 * Register the equation renderers.
 *
 * Idempotent, so a second editor on the page does not double register.
 */
export function registerMathRenderers(): void {
  // ── The equation itself ──────────────────────────────────────────────────
  /**
   * Inline, and italic by default.
   *
   * A variable is italic by mathematical convention rather than by anybody's
   * choice, so it belongs to the zone and not to each run. `mathRun` turns it
   * off again for text that is not a variable.
   */
  define(
    'oMath',
    element('span', { className: 'w-math', style: { fontStyle: 'italic' } }, [slot('content')])
  );

  define(
    'oMathPara',
    element(
      'div',
      {
        className: 'w-math-para',
        style: (d: Record<string, any>) => ({
          textAlign: String(d.attributes?.alignment ?? 'center')
        })
      },
      [slot('content')]
    )
  );

  /**
   * A run of mathematical text.
   *
   * `literal` is Word's `m:nor`, and without it "sin" is three italic variables
   * multiplied by each other — which is what it means, if you take the
   * convention seriously, and not what anybody writing it intended.
   */
  define(
    'mathRun',
    element(
      'span',
      {
        className: 'w-math-run',
        /**
         * **Which alphabet the letters are in** — Word's `m:scr`.
         *
         * `roman`, `script`, `fraktur`, `double-struck`, `sans-serif` and `monospace` are not fonts
         * in maths, they are *meanings*: ℝ is the real numbers and R is a variable called R, and the
         * two are different symbols that a reader must be able to tell apart. Declared since the
         * math schema was written and drawn nowhere, so every one of them came out as an ordinary
         * italic letter.
         *
         * An attribute rather than a `font-family` here, because which face carries a given alphabet
         * is a decision about the fonts a product ships — see `style.css`.
         */
        'data-script': (d: Record<string, any>) =>
          typeof d.attributes?.script === 'string' && d.attributes.script.length > 0
            ? d.attributes.script
            : undefined,
        style: (d: Record<string, any>) => {
          const style = String(d.attributes?.style ?? '');
          return {
            fontStyle: d.attributes?.literal === true || style === 'p' || style === 'b'
              ? 'normal'
              : 'italic',
            fontWeight: style === 'b' || style === 'bi' ? 'bold' : 'normal'
          };
        }
      },
      [slot('content')]
    )
  );

  // ── Slots ────────────────────────────────────────────────────────────────
  define('mathNum', slotTemplate('w-math-num'));
  define('mathDen', slotTemplate('w-math-den'));
  define('mathElement', slotTemplate('w-math-e'));
  define('mathSup', slotTemplate('w-math-sup'));
  define('mathSub', slotTemplate('w-math-sub'));
  define('mathDeg', slotTemplate('w-math-deg'));
  define('mathFuncName', slotTemplate('w-math-fname'));
  define('mathLim', slotTemplate('w-math-lim'));

  // ── Constructs ───────────────────────────────────────────────────────────
  /**
   * A fraction.
   *
   * A column of two boxes with a rule between them, aligned on its middle so the
   * surrounding line runs through the bar rather than along the bottom of the
   * denominator.
   */
  define(
    'mathFraction',
    element(
      'span',
      {
        className: 'w-math-frac',
        /**
         * **Which of Word's four fractions this is** — and it read one of them.
         *
         * `bar` is the ordinary stacked fraction, `lin` writes the two slots side by side, `skw` sets
         * them on a diagonal with a solidus, and `noBar` stacks them with no rule at all — which is
         * how a binomial coefficient is written. `lin` was the only one the style function looked at,
         * so a skewed fraction came out stacked and a binomial came out with a bar through it.
         *
         * The bar itself is the stylesheet's, which is why this says which kind rather than drawing
         * it: `noBar` and `bar` differ only in a border.
         *
         * And the attribute is `data-type`, which `style.css` has had rules for since it was
         * written — `.w-math-frac[data-type='lin']` draws the solidus. **Nothing ever wrote it.** So
         * a linear fraction has never been drawn as one: two rules matching an attribute no renderer
         * emitted, and a stacked fraction where a solidus belonged.
         */
        'data-type': (d: Record<string, any>) => String(d.attributes?.type ?? 'bar'),
        style: (d: Record<string, any>) => ({
          display: 'inline-flex',
          flexDirection: 'column',
          alignItems: 'center',
          verticalAlign: 'middle',
          // A linear fraction is the same two slots written side by side, and a skewed one is those
          // two on a diagonal — both are a row; what separates them is the separator, in `style.css`.
          ...(d.attributes?.type === 'lin' || d.attributes?.type === 'skw'
            ? { flexDirection: 'row' }
            : {})
        })
      },
      [slot('content')]
    )
  );

  define('mathSuperscript', element('span', { className: 'w-math-sup-box' }, [slot('content')]));
  define('mathSubscript', element('span', { className: 'w-math-sub-box' }, [slot('content')]));
  define('mathSubSup', element('span', { className: 'w-math-subsup' }, [slot('content')]));
  define('mathPreSubSup', element('span', { className: 'w-math-presubsup' }, [slot('content')]));

  /**
   * A radical.
   *
   * The sign is drawn rather than typed: a `√` from the font is one size, and
   * the body it covers is whatever height it happens to be. A border along the
   * top of the body carries the bar across, and the hook is the glyph.
   */
  define(
    'mathRadical',
    element(
      'span',
      {
        className: 'w-math-rad',
        /*
         * Whether the degree is shown — Word's `m:degHide`, and on by default because a square root
         * is written `√` and not `²√`. It was declared and read nowhere, so a cube root and a square
         * root were the same drawing: the degree slot stays in the document either way, so an author
         * can put one back.
         */
        'data-hide-degree': (d: Record<string, any>) =>
          d.attributes?.hideDegree === false ? 'false' : 'true'
      },
      [slot('content')]
    )
  );

  /**
   * An n-ary operator.
   *
   * `undOvr` stacks the limits above and below the sign, which is what a
   * displayed sum looks like; `subSup` writes them beside it, which is what the
   * same sum looks like in the middle of a sentence. Word stores the choice
   * because it is the document's, not the operator's.
   */
  define(
    'mathNary',
    element(
      'span',
      {
        className: 'w-math-nary',
        'data-limits': (d: Record<string, any>) => String(d.attributes?.limitLocation ?? 'undOvr'),
        'data-char': (d: Record<string, any>) => String(d.attributes?.char ?? '∑'),
        /**
         * **Which limits are shown, and whether the sign grows to its contents.**
         *
         * A sum with no lower limit is written `∑` and not `∑` with an empty box under it, and Word
         * says so with `m:subHide` and `m:supHide` rather than by leaving the slot out — the slot
         * stays, so an author can put the limit back. All three were declared and drawn nowhere, so
         * an author who hid a limit got an empty box where it had been.
         */
        'data-hide-sub': (d: Record<string, any>) =>
          d.attributes?.hideSub === true ? 'true' : undefined,
        'data-hide-sup': (d: Record<string, any>) =>
          d.attributes?.hideSup === true ? 'true' : undefined,
        'data-grow': (d: Record<string, any>) => String(d.attributes?.grow !== false)
      },
      [slot('content')]
    )
  );

  /**
   * Delimiters.
   *
   * The brackets are their own elements rather than text in the slots, because
   * they belong to the construct and not to what is inside it — typing between
   * them must not be able to delete them. Chrome, so they are not copied and the
   * caret does not stop in them.
   *
   * They grow to fit. Word does it with the glyph-assembly recipes in a font's
   * MATH table — a bracket built from a top piece, a repeating middle and a
   * bottom — and there is no such table to read here. What there is instead is a
   * flex row whose brackets stretch to the height of the row, drawn as borders
   * with a radius rather than as glyphs. That needs no measuring, so it is exact
   * at every height and costs no layout pass; what it gives up is the shape of a
   * real bracket, which a curve fitted to a box only approximates. A brace is
   * beyond what borders can draw and keeps its glyph, unstretched.
   */
  const fence = (side: 'open' | 'close') =>
    element('span', {
      className: `w-math-fence w-math-fence-${side}`,
      'data-char': (d: Record<string, any>) =>
        String(d.attributes?.[side === 'open' ? 'open' : 'close'] ?? (side === 'open' ? '(' : ')')),
      'data-bc-chrome': 'true',
      contenteditable: 'false',
      'aria-hidden': 'true',
      // A click goes through the bracket to what it encloses. `contenteditable:
      // false` stops the caret *resting* in the bracket, but a click on one
      // still resolved to the delimiter itself — a node with no text — and the
      // next keystroke was refused, because a character can only be typed into
      // inline text. Aiming at a bracket is aiming at the equation, so the
      // bracket takes no pointer at all and the click lands on the content.
      style: { pointerEvents: 'none' }
    });

  define(
    'mathDelimiter',
    element(
      'span',
      {
        className: 'w-math-delim',
        // On the construct as well, so the stylesheet can pick a shape without
        // reaching into the children.
        'data-open': (d: Record<string, any>) => String(d.attributes?.open ?? '('),
        'data-close': (d: Record<string, any>) => String(d.attributes?.close ?? ')'),
        'data-grow': (d: Record<string, any>) => String(d.attributes?.grow !== false),
        /**
         * The character **between** the delimited items, and how tall the fences are drawn.
         *
         * `m:sepChr` is what separates a pair inside one set of brackets — a binomial's two rows have
         * none, a set-builder's has `|`. It was declared with a default of `|` and drawn nowhere, so
         * every multi-part delimiter came out with its parts run together.
         *
         * `shape` is `centered` or `match`: a centred fence is one glyph stretched about the middle,
         * a matching one follows the contents' own outline. The stylesheet decides how; this says
         * which, which is the document's half.
         */
        'data-separator': (d: Record<string, any>) => String(d.attributes?.separator ?? ''),
        'data-shape': (d: Record<string, any>) => String(d.attributes?.shape ?? 'centered')
      },
      [fence('open'), slot('content'), fence('close')]
    )
  );

  define('mathFunction', element('span', { className: 'w-math-func' }, [slot('content')]));
  define('mathLimitLower', element('span', { className: 'w-math-limlow' }, [slot('content')]));
  define('mathLimitUpper', element('span', { className: 'w-math-limupp' }, [slot('content')]));

  /**
   * A **matrix**, set the way the document asks.
   *
   * `columnAlignment`, `columnGap`, `rowGap` and `plcHide` are Word's `m:mPr` — how the columns line
   * up, how far apart they sit, and whether the placeholders of an empty cell are shown. The
   * stylesheet drew a fixed `gap: 0.15em 0.5em` and a fixed centring, so a matrix that asked for
   * anything else got the same one.
   *
   * The gaps are twips, like every other measurement in this repository, and become `em` here rather
   * than `px`: a matrix inside a fraction inside a superscript is drawn at a fraction of the body
   * size, and a gap in pixels would be the same gap at every one of them.
   */
  define(
    'mathMatrix',
    element(
      'span',
      {
        className: 'w-math-matrix',
        'data-align': (d: Record<string, any>) => String(d.attributes?.columnAlignment ?? 'center'),
        // Word hides an empty cell's placeholder box when the matrix asks; the stylesheet draws it.
        'data-placeholders': (d: Record<string, any>) =>
          d.attributes?.plcHide === true ? 'hidden' : 'shown',
        style: (d: Record<string, any>) => {
          const gap = (value: unknown): string | undefined =>
            typeof value === 'number' && Number.isFinite(value) ? `${round(value / 240)}em` : undefined;
          const rows = gap(d.attributes?.rowGap);
          const columns = gap(d.attributes?.columnGap);
          return rows !== undefined || columns !== undefined
            ? { gap: `${rows ?? '0.15em'} ${columns ?? '0.5em'}` }
            : {};
        }
      },
      [slot('content')]
    )
  );
  define('mathRow', element('span', { className: 'w-math-row' }, [slot('content')]));
  /**
   * A stack of equations, spaced the way the document asks.
   *
   * `maxDistance` and `objectDistance` are Word's `m:eqArrPr`: the first spaces the rows to the
   * tallest one so every gap matches, the second spaces them to each row's own height. Neither was
   * read, so a stack of equations was always set the second way and the reader had no say.
   */
  define(
    'mathArray',
    element(
      'span',
      {
        className: 'w-math-array',
        'data-spacing': (d: Record<string, any>) =>
          d.attributes?.maxDistance === true
            ? 'max'
            : d.attributes?.objectDistance === true
              ? 'object'
              : 'default'
      },
      [slot('content')]
    )
  );

  define(
    'mathAccent',
    element(
      'span',
      {
        className: 'w-math-accent',
        'data-char': (d: Record<string, any>) => String(d.attributes?.char ?? '̂')
      },
      [slot('content')]
    )
  );

  define(
    'mathBar',
    element(
      'span',
      {
        className: 'w-math-bar',
        'data-position': (d: Record<string, any>) => String(d.attributes?.position ?? 'top')
      },
      [slot('content')]
    )
  );

  define(
    'mathGroupChar',
    element(
      'span',
      {
        className: 'w-math-groupchar',
        'data-char': (d: Record<string, any>) => String(d.attributes?.char ?? '⏟'),
        'data-position': (d: Record<string, any>) => String(d.attributes?.position ?? 'bot'),
        /*
         * Where the *label* sits, which is not where the brace does: Word keeps `m:pos` for the
         * brace and `m:vertJc` for the text under or over it, so an author can put a brace beneath a
         * term and its label above. One was read and the other was not, so the label always followed
         * the brace.
         */
        'data-label-position': (d: Record<string, any>) =>
          String(d.attributes?.verticalAlign ?? 'bot')
      },
      [slot('content')]
    )
  );

  /**
   * A box round something, **and the lines drawn through it.**
   *
   * The four `hide*` switches were read and the two `strike*` were not — which is the half of a
   * border box that is not a border: Word's `m:strikeH` and `m:strikeV` draw a rule *through* the
   * contents, which is how a cancelled term is written. A box that asked to be struck out came out
   * merely boxed.
   */
  define(
    'mathBorderBox',
    element(
      'span',
      {
        className: 'w-math-borderbox',
        'data-strike': (d: Record<string, any>) => {
          const horizontal = d.attributes?.strikeHorizontal === true;
          const vertical = d.attributes?.strikeVertical === true;
          if (horizontal && vertical) return 'both';
          if (horizontal) return 'horizontal';
          if (vertical) return 'vertical';
          return undefined;
        },
        style: (d: Record<string, any>) => ({
          borderTop: d.attributes?.hideTop === true ? 'none' : '1px solid currentColor',
          borderBottom: d.attributes?.hideBottom === true ? 'none' : '1px solid currentColor',
          borderLeft: d.attributes?.hideLeft === true ? 'none' : '1px solid currentColor',
          borderRight: d.attributes?.hideRight === true ? 'none' : '1px solid currentColor'
        })
      },
      [slot('content')]
    )
  );

  /**
   * Something that takes room and shows nothing.
   *
   * Still rendered, and still editable: an author lines two equations up by
   * putting a copy of the wider one in a phantom, and they have to be able to
   * type it.
   */
  define(
    'mathPhantom',
    element(
      'span',
      {
        className: 'w-math-phantom',
        style: (d: Record<string, any>) => {
          /**
           * And **which of its dimensions it gives up.**
           *
           * A phantom that takes room and shows nothing is the default; Word's `m:zeroWid`,
           * `m:zeroAsc` and `m:zeroDesc` each take one of those dimensions back — a zero-width
           * phantom reserves height and no width, which is how a term is aligned above another
           * without pushing it sideways. All three were declared and none was read, so every
           * phantom took all of its room whatever it asked for.
           */
          const drawn: Record<string, string> = {
            visibility: d.attributes?.showContents === true ? 'visible' : 'hidden'
          };
          if (d.attributes?.zeroWidth === true) {
            drawn.width = '0';
            drawn.display = 'inline-block';
            drawn.overflow = 'hidden';
          }
          // Ascent is the part above the baseline and descent the part below, so giving one up is a
          // negative margin on that side — the box keeps its ink and stops claiming the space.
          if (d.attributes?.zeroAscent === true) drawn.marginTop = '-1em';
          if (d.attributes?.zeroDescent === true) drawn.marginBottom = '-0.3em';
          return drawn;
        }
      },
      [slot('content')]
    )
  );

  /**
   * A **box** round a run of maths, and the three things Word says about one.
   *
   * `noBreak` keeps it on one line, which is the whole reason a box exists in `m:box`. `differential`
   * and `operatorEmulator` are typesetting hints — the first says the box is a differential (`dx`)
   * and should be spaced as an operator's argument, the second that it behaves as an operator for
   * spacing. Drawn as attributes rather than as CSS because what they change is the *spacing rules
   * around* the box, which the stylesheet decides.
   */
  define(
    'mathBox',
    element(
      'span',
      {
        className: 'w-math-box',
        'data-no-break': (d: Record<string, any>) =>
          d.attributes?.noBreak === true ? 'true' : undefined,
        'data-differential': (d: Record<string, any>) =>
          d.attributes?.differential === true ? 'true' : undefined,
        'data-operator': (d: Record<string, any>) =>
          d.attributes?.operatorEmulator === true ? 'true' : undefined
      },
      [slot('content')]
    )
  );
}
