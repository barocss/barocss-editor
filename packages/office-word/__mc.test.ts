import { describe, it, expect } from 'vitest';
import { markCss } from './src/mark-format';
import { characterCss } from './src/css';
describe('x', () => {
  it('maps', () => {
    console.log('markCss fontSize 40 =', JSON.stringify(markCss('fontSize', { size: 40 }, undefined)));
    console.log('markCss fontFamily  =', JSON.stringify(markCss('fontFamily', { family: 'Arial' }, undefined)));
    console.log('characterCss        =', JSON.stringify(characterCss({ fontSize: 40 } as never)));
    expect(1).toBe(1);
  });
});
