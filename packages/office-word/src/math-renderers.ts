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
        style: (d: Record<string, any>) => ({
          display: 'inline-flex',
          flexDirection: 'column',
          alignItems: 'center',
          verticalAlign: 'middle',
          // Word's skewed and linear fractions are the same two slots written
          // differently; only the bar changes.
          ...(d.attributes?.type === 'lin' ? { flexDirection: 'row' } : {})
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
  define('mathRadical', element('span', { className: 'w-math-rad' }, [slot('content')]));

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
        'data-char': (d: Record<string, any>) => String(d.attributes?.char ?? '∑')
      },
      [slot('content')]
    )
  );

  /**
   * Delimiters.
   *
   * The brackets are drawn as their own elements rather than as text in the
   * slots, because they belong to the construct and not to what is inside it —
   * typing between them must not be able to delete them.
   *
   * They do not yet grow to fit. Word's do, using the glyph-assembly recipes in
   * a font's MATH table; the nearest thing available here is to measure the
   * contents and scale a glyph, which is a layout pass and comes next.
   */
  define(
    'mathDelimiter',
    element(
      'span',
      {
        className: 'w-math-delim',
        'data-open': (d: Record<string, any>) => String(d.attributes?.open ?? '('),
        'data-close': (d: Record<string, any>) => String(d.attributes?.close ?? ')')
      },
      [slot('content')]
    )
  );

  define('mathFunction', element('span', { className: 'w-math-func' }, [slot('content')]));
  define('mathLimitLower', element('span', { className: 'w-math-limlow' }, [slot('content')]));
  define('mathLimitUpper', element('span', { className: 'w-math-limupp' }, [slot('content')]));

  define('mathMatrix', element('span', { className: 'w-math-matrix' }, [slot('content')]));
  define('mathRow', element('span', { className: 'w-math-row' }, [slot('content')]));
  define('mathArray', element('span', { className: 'w-math-array' }, [slot('content')]));

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
        'data-position': (d: Record<string, any>) => String(d.attributes?.position ?? 'bot')
      },
      [slot('content')]
    )
  );

  define(
    'mathBorderBox',
    element(
      'span',
      {
        className: 'w-math-borderbox',
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
        style: (d: Record<string, any>) => ({
          visibility: d.attributes?.showContents === true ? 'visible' : 'hidden'
        })
      },
      [slot('content')]
    )
  );

  define('mathBox', element('span', { className: 'w-math-box' }, [slot('content')]));
}
