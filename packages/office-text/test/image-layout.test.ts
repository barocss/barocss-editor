import { describe, it, expect } from 'vitest';
import { imageCss, isInFlow, polygonCss, textBoxCss } from '../src/image-layout';

/**
 * Where a picture sits, and what the text does about it.
 *
 * The difference between an inline picture and a floating one is not
 * decoration: an inline picture moves with the words either side of it and a
 * floating one does not, so which it is decides what every line near it does.
 */
describe('a picture in the line', () => {
  it('is drawn as a very large character', () => {
    // Which is what an image with no wrapping is: it sits on the baseline and
    // moves with the words around it.
    expect(imageCss({ width: 1440, height: 720 })).toMatchObject({
      width: '96px',
      height: '48px',
      display: 'inline-block',
      verticalAlign: 'baseline'
    });
  });

  it('carries the size the document gives it', () => {
    // A picture with no size is one the browser guesses at, which changes the
    // layout the moment it loads and makes every measurement before that a lie.
    expect(imageCss({ width: 2880 }).width).toBe('192px');
    expect(imageCss({}).width).toBeUndefined();
    expect(imageCss(undefined).height).toBeUndefined();
  });
});

describe('a picture the text runs around', () => {
  it('floats, which is what shortens the lines beside it', () => {
    expect(imageCss({ wrap: 'square', side: 'left' }).float).toBe('left');
    expect(imageCss({ wrap: 'square' }).float).toBe('right');
  });

  it('follows its box when the document gives no shape to follow', () => {
    // A rectangle is the best answer available without an outline, and it is
    // what `square` already means.
    expect(imageCss({ wrap: 'tight', side: 'left' })).toMatchObject(
      imageCss({ wrap: 'square', side: 'left' })
    );
    expect(imageCss({ wrap: 'tight' }).shapeOutside).toBeUndefined();
  });

  it('follows the outline the document gives it', () => {
    // This is the whole of the difference between tight and square, and Word
    // stores it as a polygon — which is what CSS wants too.
    const css = imageCss({
      wrap: 'tight',
      wrapPolygon: [
        { x: 0, y: 0 },
        { x: 21600, y: 21600 },
        { x: 0, y: 21600 }
      ],
      shapeMargin: 180
    });
    expect(css.shapeOutside).toBe('polygon(0% 0%, 100% 100%, 0% 100%)');
    expect(css.shapeMargin).toBe('12px');
  });

  it('leaves a rectangle alone when the outline is not one', () => {
    // Two points is a line, and a float given a degenerate shape wraps nothing
    // at all — worse than the rectangle it would have been.
    expect(polygonCss([{ x: 0, y: 0 }, { x: 100, y: 100 }])).toBeUndefined();
    expect(polygonCss(undefined)).toBeUndefined();
  });

  it('reads the outline in Word units, whatever size the picture is', () => {
    // Nought to twenty-one thousand six hundred on each side regardless of the
    // real size, so the outline survives the picture being resized.
    expect(polygonCss([{ x: 10800, y: 0 }, { x: 21600, y: 21600 }, { x: 0, y: 21600 }])).toBe(
      'polygon(50% 0%, 100% 100%, 0% 100%)'
    );
  });

  it('keeps the distance from the text that it asks for', () => {
    expect(imageCss({ wrap: 'square', distanceLeft: 720, distanceTop: 360 })).toMatchObject({
      marginLeft: '48px',
      marginTop: '24px',
      marginRight: '0px',
      marginBottom: '0px'
    });
  });
});

describe('a picture with the text above and below it', () => {
  it('clears the line entirely', () => {
    // No text beside it at all: the paragraph stops above and starts again
    // below, which is what clearing means.
    expect(imageCss({ wrap: 'topAndBottom' })).toMatchObject({
      display: 'block',
      clear: 'both'
    });
  });
});

describe('a picture out of the flow', () => {
  it('sits behind the text without taking clicks meant for it', () => {
    const css = imageCss({ wrap: 'behind', offsetX: 1440, offsetY: 720 });
    expect(css).toMatchObject({
      position: 'absolute',
      left: '96px',
      top: '48px',
      zIndex: '-1',
      pointerEvents: 'none'
    });
  });

  it('sits in front when asked, and there takes them', () => {
    // A picture in front is meant to be seen and used; one behind is meant to
    // be seen through.
    const css = imageCss({ wrap: 'front' });
    expect(css.zIndex).toBe('1');
    expect(css.pointerEvents).toBeUndefined();
  });

  it('starts at the corner of its block when no offset is given', () => {
    expect(imageCss({ wrap: 'behind' })).toMatchObject({ left: '0px', top: '0px' });
  });
});

describe('what the paginator needs to know', () => {
  it('counts a picture in the flow and not one outside it', () => {
    // A picture in the flow adds height to its block and can push the text onto
    // the next page. One that is not adds nothing and cannot.
    for (const wrap of ['inline', 'square', 'tight', 'topAndBottom'] as const) {
      expect(isInFlow({ wrap })).toBe(true);
    }
    expect(isInFlow({ wrap: 'behind' })).toBe(false);
    expect(isInFlow({ wrap: 'front' })).toBe(false);
    expect(isInFlow(undefined)).toBe(true);
  });
});

/**
 * **A floating box of text**, which drew as a plain `<aside>` and read none of its seven attributes.
 *
 * A `textBox` is Word's anchored box: a size, something to be anchored to, a way the text around it
 * behaves, and an order in the stack. A box a reader gave a width and a wrap to came out the width
 * of the column, in the flow, pushing everything below it down.
 *
 * The rules were already written, because a floating box of text and a floating picture do the same
 * thing to the lines around them — that is what `wrapType` means, and Word spells it the same way
 * for both. What differed was the vocabulary, and `textBoxCss` is that translation.
 */
describe('a floating box of text', () => {
  it('takes the size the box asks for', () => {
    const css = textBoxCss({ width: 2880, height: 1440 });

    expect(css.width).toBe('192px');
    expect(css.height).toBe('96px');
  });

  /*
   * `square` is the default and the one that makes a box worth having: the lines beside it are
   * shorter and get their width back once it has been passed.
   */
  it('floats, on the side the box says', () => {
    expect(textBoxCss({ wrapType: 'square' }).float).toBe('right');
    expect(textBoxCss({ wrapType: 'square', horizontalAlign: 'left' }).float).toBe('left');
  });

  it('stops the text above and starts it again below, for topAndBottom', () => {
    const css = textBoxCss({ wrapType: 'topAndBottom' });

    expect(css.display).toBe('block');
    expect(css.clear).toBe('both');
  });

  /**
   * Out of the flow, and **in the order the box asks for**.
   *
   * `zOrder` is the one thing a text box says that a picture has no word for, so a reader who put
   * one box over another can say which is on top. `inFront` is the schema's spelling and `front` is
   * `imageCss`'s — the one place the two vocabularies disagree on a value rather than on a name, and
   * the reason `textBoxCss` exists rather than a rename at the call site.
   */
  it('leaves the flow, and stacks where the box says', () => {
    const front = textBoxCss({ wrapType: 'inFront', offsetX: 1440, offsetY: 720, zOrder: 3 });

    expect(front.position).toBe('absolute');
    expect(front.left).toBe('96px');
    expect(front.top).toBe('48px');
    expect(front.zIndex).toBe('4');

    const behind = textBoxCss({ wrapType: 'behind', zOrder: 3 });
    expect(behind.zIndex).toBe('2');
    // Nobody is meant to press a box behind the text, so it must not eat the presses.
    expect(behind.pointerEvents).toBe('none');
  });

  /*
   * And a box **in** the flow takes no `z-index`: two floats are ordered by where they are, and a
   * stacking order on them would say something the document did not.
   */
  it('does not stack a box that is still in the flow', () => {
    expect(textBoxCss({ wrapType: 'square', zOrder: 3 }).zIndex).toBeUndefined();
  });
});

