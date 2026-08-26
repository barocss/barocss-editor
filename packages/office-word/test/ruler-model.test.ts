import { describe, expect, it } from 'vitest';
import { createSchema } from '@barocss/schema';
import { WORD_RULER, wordRulerAttrs, wordRulerCommands } from '../src/ruler-model';
import { toolbarAttrs, toolbarCommands } from '../src/toolbar-model';
import { getWordSchemaDefinition } from '../src/word-schema';
import { createWordEditor } from '../src/word-kit';

/**
 * Word's two writing surfaces, held to what a declaration can be wrong about.
 *
 * The harness now asks Word which attributes a reader can **set**, and the answer comes from these
 * two files and nowhere else — there is no property panel here. A row naming a command nobody
 * registers, or an attribute no node has, would make that answer confidently wrong, which is worse
 * than the `notYet` silence it replaced.
 */
describe('what Word declares a reader can change', () => {
  const schema = createSchema('word', getWordSchemaDefinition());
  const commands = new Set(createWordEditor().commandNames() as string[]);

  /** Anything the schema declares on any node type. */
  const declared = (name: string) =>
    [...schema.nodes.values()].some((one) => (one as any)?.attrs?.[name]);

  it('runs only commands the product registers', () => {
    expect(wordRulerCommands().filter((name) => !commands.has(name))).toEqual([]);
    // The ribbon's too, which nothing checked before `writes` gave it a reason to be read.
    expect(toolbarCommands().filter((name) => !commands.has(name))).toEqual([]);
  });

  it('writes only attributes the schema has', () => {
    /*
     * The failure this catches is the one the deck's declaration made six times: a name that is in
     * the writer's head and not in the schema. `every-property-can-be-edited` would then quietly
     * count an attribute that does not exist as covered, and the real one as uncovered.
     */
    expect(wordRulerAttrs().filter((name) => !declared(name))).toEqual([]);
    expect(toolbarAttrs().filter((name) => !declared(name))).toEqual([]);
  });

  it('is the only place a paragraph’s indents and tab stops can be set', () => {
    /*
     * Not a tidiness check — it is the claim that makes `tabs` exempt from `every-attribute-is-read`
     * (a layout pass reads it, not a renderer) and forbidden from being exempt from
     * `every-property-can-be-edited`. If a ribbon control ever grows an indent, this says so and the
     * two claims have to be re-decided together.
     */
    expect(wordRulerAttrs()).toContain('tabs');
    expect(wordRulerAttrs()).toContain('indentFirstLine');
    expect(toolbarAttrs()).not.toContain('tabs');
  });

  it('gives every dragged marker a name a reader would use', () => {
    // A ruler has no text on it: the label *is* the accessible name, and an unnamed marker is a
    // triangle a screen reader announces as a button.
    for (const one of WORD_RULER) expect(one.label.length, one.id).toBeGreaterThan(1);
    expect(new Set(WORD_RULER.map((one) => one.id)).size).toBe(WORD_RULER.length);
  });
});
