import { describe, it, expect } from 'vitest';
import { imageCss, isInFlow } from '../src/image-layout';

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
    // Word's `tight` follows the picture's outline. CSS can too, given a shape;
    // a document that supplies none is asking for `square`, and gets it.
    expect(imageCss({ wrap: 'tight', side: 'left' })).toMatchObject(
      imageCss({ wrap: 'square', side: 'left' })
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
