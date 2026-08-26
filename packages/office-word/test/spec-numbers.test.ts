import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createSchema } from '@barocss/schema';
import { getWordSchemaDefinition } from '../src/word-schema';
import { createWordEditor } from '../src/word-kit';
import { WORD_TOOLBAR, toolbarAttrs, toolbarCommands } from '../src/toolbar-model';
import { wordRulerAttrs } from '../src/ruler-model';

/**
 * The numbers in `docs/specs/word.md`, checked against the product they describe.
 *
 * ## Why a spec needs a test
 *
 * That document is the one thing in this repository the conformance harness cannot produce: it says
 * what Word *is* and what it deliberately is not, which is a question about intent. But it is full
 * of **numbers** — 107 node types, 60 toolbar controls, 21 settable attributes — and a number in
 * prose is the hand-kept list this whole harness replaced. *"Re-measured 2026-08-18, and five came
 * off"* is what a document does when nothing checks it.
 *
 * So the intent stays prose and the arithmetic is held here. A number that drifts fails by name, in
 * the commit that drifted it, and the fix is one edit to the sentence that has stopped being true.
 */
describe('the numbers in the Word spec', () => {
  const spec = readFileSync(join(__dirname, '..', '..', '..', 'docs', 'specs', 'word.md'), 'utf8');
  const schema = createSchema('word', getWordSchemaDefinition());

  /** Whether the document states this number, in any of the shapes it writes numbers in. */
  const states = (value: number) => new RegExp(`\\b${value.toLocaleString('en-US')}\\b|\\b${value}\\b`).test(spec);

  it('says how much document there is', () => {
    let attrs = 0;
    for (const [, node] of schema.nodes) attrs += Object.keys((node as { attrs?: object }).attrs ?? {}).length;

    expect(states(schema.nodes.size), `node types: ${schema.nodes.size}`).toBe(true);
    expect(states(attrs), `attribute slots: ${attrs}`).toBe(true);
  });

  it('says how many commands there are, and how many are Word’s own', () => {
    /*
     * Measured rather than listed, the way the harness measures `own`: build an editor with no kit
     * and one with the product's, and the difference is what this product adds.
     */
    const bare = new Set(createWordEditor({ kit: [] }).commandNames() as string[]);
    const all = createWordEditor().commandNames() as string[];
    const own = all.filter((name) => !bare.has(name));

    expect(states(all.length), `commands: ${all.length}`).toBe(true);
    expect(states(own.length), `Word's own: ${own.length}`).toBe(true);
  });

  it('says what the chrome is made of', () => {
    const controls = WORD_TOOLBAR.reduce((n, group) => n + group.controls.length, 0);
    expect(states(WORD_TOOLBAR.length), `toolbar groups: ${WORD_TOOLBAR.length}`).toBe(true);
    expect(states(controls), `toolbar controls: ${controls}`).toBe(true);
    expect(states(toolbarCommands().length), `toolbar commands: ${toolbarCommands().length}`).toBe(true);
  });

  it('says how much of what it draws a reader can set', () => {
    // The claim the whole "what is owed" table rests on, and the one that moves when a dialog is
    // built: every new control raises it and lowers the ratchet beside it.
    const settable = new Set([...toolbarAttrs(), ...wordRulerAttrs()]).size;
    expect(states(settable), `settable attributes: ${settable}`).toBe(true);
  });

  it('says the two ratchets it is measured against', () => {
    /*
     * Read out of the conformance test rather than restated, because two places holding one number
     * is exactly what this file exists to stop — and these two are the numbers a reader of the spec
     * will act on.
     */
    const conformance = readFileSync(join(__dirname, 'conformance.test.ts'), 'utf8');
    const ratchets = [...conformance.matchAll(/'every-[a-z-]+':\s*(\d+)/g)].map((one) => Number(one[1]));
    expect(ratchets.length, 'the conformance test declares its ratchets').toBeGreaterThan(0);
    for (const count of ratchets) expect(states(count), `ratchet: ${count}`).toBe(true);
  });
});
