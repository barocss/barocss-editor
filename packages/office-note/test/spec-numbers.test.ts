import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DataStore } from '@barocss/datastore';
import { createSchema, getOfficeSchemaDefinition } from '@barocss/schema';
import { getNoteSchemaDefinition, NOTE_BLOCKS } from '../src/note-schema';
import { createNoteEditor } from '../src/note-kit';
import { NOTE_KEYBINDINGS } from '../src/note-keymap';
import { NOTE_TOOLBAR } from '../src/toolbar-model';

/**
 * The numbers in `docs/specs/note.md`, checked against the product they describe.
 *
 * The same reason `office-word/test/spec-numbers.test.ts` exists, in that file's words: *"the intent
 * stays prose and the arithmetic is held here. A number that drifts fails by name, in the commit
 * that drifted it."*
 *
 * ## And this spec's numbers carry more weight than Word's
 *
 * `note.md` says the product exists to test one claim — *one document engine, several products* —
 * and its evidence is **how small it is**: three declared nodes, two keybindings, a 257-line app.
 * If those grow quietly the document stops being evidence and becomes a story. So the small numbers
 * are the ones held hardest here, including the ones about **other** packages: the 35,727 lines of
 * chrome still in the other three apps is the comparison the argument rests on.
 */
describe('the numbers in the Note spec', () => {
  const ROOT = join(__dirname, '..', '..', '..');
  const spec = readFileSync(join(ROOT, 'docs', 'specs', 'note.md'), 'utf8');

  /** Whether the document states this number, in any of the shapes it writes numbers in. */
  const states = (value: number) =>
    new RegExp(`\\b${value.toLocaleString('en-US')}\\b|\\b${value}\\b`).test(spec);

  /**
   * Lines of `.ts`/`.tsx` under a directory — **counted the way `wc -l` counts**, which is newline
   * characters rather than the pieces a split leaves. Every other line count in these documents came
   * from `wc -l`, and two counting methods is how a comparison stops comparing: the first draft of
   * this file used `split('\n').length` and reported 258 for a directory the docs call 257.
   */
  const linesIn = (...parts: string[]): number => {
    const at = join(ROOT, ...parts);
    let total = 0;
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === 'dist') continue;
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(path);
          continue;
        }
        if (!/\.tsx?$/.test(entry.name)) continue;
        total += (readFileSync(path, 'utf8').match(/\n/g) ?? []).length;
      }
    };
    walk(at);
    return total;
  };

  const editor = () => {
    const schema = createSchema('note', getNoteSchemaDefinition());
    return createNoteEditor({ dataStore: new DataStore(undefined, schema), schema, editable: true });
  };

  it('says how much document there is, and how little of it note declares', () => {
    const note = getNoteSchemaDefinition();
    const nodes = Object.keys(note.nodes).length;
    let attrs = 0;
    for (const one of Object.values(note.nodes)) {
      attrs += Object.keys((one as { attrs?: object })?.attrs ?? {}).length;
    }

    /*
     * **What note declares** is the difference from the schema it builds on — measured the way the
     * harness measures `own`, not listed. Three is the claim the whole document rests on.
     */
    const office = Object.keys(getOfficeSchemaDefinition().nodes);
    const own = Object.keys(note.nodes).filter((name) => !office.includes(name));

    expect(states(nodes), `nodes: ${nodes}`).toBe(true);
    expect(states(attrs), `attribute slots: ${attrs}`).toBe(true);
    expect(states(Object.keys(note.marks ?? {}).length), `marks: ${Object.keys(note.marks ?? {}).length}`).toBe(true);
    expect(own.length, `note declares: ${own.join(', ')}`).toBe(3);
    expect(states(own.length), `declared by note: ${own.length}`).toBe(true);
    expect(states(NOTE_BLOCKS.length), `block kinds: ${NOTE_BLOCKS.length}`).toBe(true);
  });

  it('says how many commands a note has, and how many of its table', () => {
    const names = editor().commandNames() as string[];
    const table = names.filter((name) => /[Cc]ell|[Rr]ow|[Cc]olumn|[Tt]able/.test(name));

    expect(states(names.length), `commands: ${names.length}`).toBe(true);
    expect(states(table.length), `table commands: ${table.length}`).toBe(true);
  });

  it('says the keymap is two lines, and which two', () => {
    /*
     * **The number this document is most about.** Word declares 71; the distance between the two is
     * the measurement the product exists to take. If note's grows, the sentence explaining why it is
     * short has to be rewritten rather than the number quietly bumped.
     */
    expect(NOTE_KEYBINDINGS.length, 'note adds two keys').toBe(2);
    expect(states(NOTE_KEYBINDINGS.length), `note's keys: ${NOTE_KEYBINDINGS.length}`).toBe(true);
    expect(NOTE_KEYBINDINGS.map((one) => one.key).sort()).toEqual(['Shift+Tab', 'Tab']);

    const registered = (editor() as unknown as {
      keybindings?: { _bindings?: Map<unknown, { source?: string }> };
    }).keybindings?._bindings;
    const all = [...(registered?.values() ?? [])];
    expect(states(all.length), `keybindings in total: ${all.length}`).toBe(true);
    expect(
      all.filter((one) => one?.source !== 'core').length,
      'exactly note’s two outrank the engine’s'
    ).toBe(2);
  });

  it('says what the bar is made of', () => {
    const rows = NOTE_TOOLBAR.length;
    expect(states(rows), `toolbar rows: ${rows}`).toBe(true);
  });

  it('says how small the product and its app are, and what the comparison is', () => {
    const pkg = linesIn('packages', 'office-note', 'src');
    const app = linesIn('apps', 'note', 'src');
    const others = linesIn('apps', 'word', 'src') + linesIn('apps', 'slide', 'src') + linesIn('apps', 'site', 'src');

    expect(states(pkg), `office-note: ${pkg}`).toBe(true);
    expect(states(app), `apps/note: ${app}`).toBe(true);
    /*
     * The other three apps' chrome. Held here because `note.md` uses it as the comparison that makes
     * 257 mean something, and a comparison nobody checks is the hand-kept list this harness replaced.
     */
    expect(states(others), `chrome still in the other three apps: ${others}`).toBe(true);
  });

  it('says how many browser tests stand behind it', () => {
    const dir = join(ROOT, 'apps', 'note', 'tests');
    let tests = 0;
    for (const entry of readdirSync(dir)) {
      if (!/\.spec\.ts$/.test(entry)) continue;
      const text = readFileSync(join(dir, entry), 'utf8');
      tests += (text.match(/^\s*(?:it|test)\(/gm) ?? []).length;
    }
    expect(statSync(dir).isDirectory()).toBe(true);
    expect(states(tests), `browser tests: ${tests}`).toBe(true);
  });
});
