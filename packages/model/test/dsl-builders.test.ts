import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as model from '../src/index';

/**
 * A builder nobody can import is a builder that does not exist.
 *
 * ## What this is for
 *
 * `defineOperationDSL` makes a typed way to say an operation — `setAttrs(nodeId, attrs)` instead of
 * `{ type: 'setAttrs', payload: { nodeId, attrs } }` — and twenty-five files in `operations/` define
 * one. None of them were exported: that directory's index was a single side-effecting import, so
 * every builder in it worked and could not be reached.
 *
 * Including `setAttrs`, the most used operation in the repository — eighty-four hand-written objects
 * across three products. Which is the likeliest reason the habit exists at all: the first thing
 * anyone reached for was not there.
 *
 * So this asks the only question that matters about a builder: **can it be imported?** Nothing else
 * would have caught it. The types said yes, the tests passed, and the value was `undefined`.
 */
describe('every operation that defines a builder exports one', () => {
  /**
   * Every file that calls `defineOperationDSL`, and the name it exports.
   *
   * **One** directory, because one operation is one file — which is what this package's README says
   * and what `operations/index.ts` now records. There used to be two, and the second was where the
   * exports came from, so the documented kind was unreachable.
   */
  const at = join(__dirname, '..', 'src', 'operations');
  const builders = readdirSync(at)
    .filter((file) => file.endsWith('.ts') && file !== 'index.ts')
    .map((file) => ({ file, source: readFileSync(join(at, file), 'utf8') }))
    .filter((one) => one.source.includes('defineOperationDSL('))
    .flatMap((one) =>
      [...one.source.matchAll(/export const (\w+) = defineOperationDSL\(/g)].map((match) => ({
        file: one.file,
        name: match[1]
      }))
    );

  it('finds the builders at all, so an empty list cannot pass', () => {
    // A check that examines nothing passes without checking anything.
    expect(builders.length).toBeGreaterThan(60);
  });

  it.each(builders)('$file exports $name', ({ name }) => {
    expect(typeof (model as Record<string, unknown>)[name], `${name} is not importable`).toBe('function');
  });

  it('builds the shape the transaction runner takes', () => {
    // Both forms: named, and inside a `control(nodeId, [...])` where the target is added for it.
    expect(model.setAttrs('site:1', { gap: 240 })).toEqual({
      type: 'setAttrs',
      payload: { nodeId: 'site:1', attrs: { gap: 240 } }
    });
    expect(model.control('site:1', [model.setAttrs({ gap: 240 })])).toEqual([
      { type: 'setAttrs', payload: { nodeId: 'site:1', attrs: { gap: 240 } } }
    ]);
  });
});
