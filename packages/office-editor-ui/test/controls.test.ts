import { describe, it, expect } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import { controlRows } from '../src/use-controls';

/**
 * **제품 크롬** — 선언을 읽어 표면으로 그리는 층, 그 자체를 검사합니다.
 *
 * The suite had `office-ui` (primitives) and `office-controls` (the shape of a declaration) and
 * nothing between them, so every app wrote its own wiring: three ribbons, 634 + 366 + 454 lines,
 * doing the same five things. Four of the five are product-neutral.
 *
 * These check the four, against **real products** — the four are devDependencies here for the same
 * reason they are in `office-controls`: they depend on this package, so a runtime import back would
 * be a cycle, and a test may look the other way. Whether one function can answer for four products
 * is a question only something that sees all four can ask.
 */
const wordEditor = async () => {
  const { createWordEditor } = await import('@barocss/office-word');
  const { getWordSchemaDefinition } = await import('@barocss/office-word');
  const schema = createSchema('word', getWordSchemaDefinition());
  const store = new DataStore(undefined as never, schema as never);
  return createWordEditor({ editable: true, schema, dataStore: store } as never) as never;
};

const noteEditor = async () => {
  const { createNoteEditor, getNoteSchemaDefinition } = await import('@barocss/office-note');
  const schema = createSchema('note', getNoteSchemaDefinition());
  const store = new DataStore(undefined as never, schema as never);
  return createNoteEditor({ editable: true, schema, dataStore: store } as never) as never;
};

describe('선언을 읽어 그릴 수 있는 줄로 바꾼다', () => {
  it('answers for a note’s controls, with state on the ones that toggle a mark', async () => {
    const { NOTE_TOOLBAR, noteControlsIn } = await import('@barocss/office-note');
    const editor = await noteEditor();

    const rows = controlRows(editor, NOTE_TOOLBAR);
    expect(rows.length).toBe(NOTE_TOOLBAR.length);

    /* Every row can be drawn: a key, something to read, and something to read about. */
    for (const one of rows) {
      expect(one.key).toBeTruthy();
      expect(one.label).toBeTruthy();
      expect(one.says).toBeTruthy();
    }

    /*
     * **`'off'`, never `undefined`.** A surface that has to decide what an absent state means is a
     * surface making a decision this layer already made — and a toggle with no state is a control
     * that does something and never says what.
     */
    for (const one of rows) expect(['on', 'off', 'mixed']).toContain(one.state);

    /* And a control that toggles nothing has nothing to be on about. */
    const inserts = controlRows(editor, noteControlsIn('block'));
    for (const one of inserts) expect(one.state).toBe('off');
  });

  it('answers for Word’s controls, which are nested and carry ids', async () => {
    const { WORD_TOOLBAR } = await import('@barocss/office-word');
    const editor = await wordEditor();

    const rows = controlRows(editor, WORD_TOOLBAR.flatMap((one) => one.controls));
    expect(rows.length).toBeGreaterThan(20);

    /*
     * Word declares `id`s because it has rows that run one command with different payloads. The keys
     * have to stay distinct — React drew eight `alignBlocks` children with one key once, kept the
     * first and dropped seven, and the site's ribbon had a 왼쪽 button and nothing else.
     */
    const keys = rows.map((one) => one.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('asks the editor whether each control may run, with the payload it carries', async () => {
    const { NOTE_TOOLBAR } = await import('@barocss/office-note');
    const editor = await noteEditor();

    /* Not `!can(command)` — `!can(command, payload)`. Two controls of one command differ only there. */
    const rows = controlRows(editor, NOTE_TOOLBAR);
    const asked: string[] = [];
    const watched = {
      ...editor,
      getSelectionSummary: () => editor.getSelectionSummary(),
      canExecuteCommand: (name: string) => {
        asked.push(name);
        return true;
      }
    } as never;

    const all = controlRows(watched, NOTE_TOOLBAR);
    expect(asked).toEqual(NOTE_TOOLBAR.map((one) => one.command));
    for (const one of all) expect(one.disabled).toBe(false);
    /* And with the real editor, a caret-less note refuses the mark commands. */
    expect(rows.some((one) => one.disabled)).toBe(true);
  });

  it('takes a product’s own answer for “may this run” and “what does a press do”', async () => {
    const { NOTE_TOOLBAR } = await import('@barocss/office-note');
    const editor = await noteEditor();

    /*
     * The two options exist because a product knows things the shared layer must not: the site sends
     * the open page with every command, and its 이모지 asks which one before it runs anything. A case
     * for either in here would be the shared surface learning a product's vocabulary.
     */
    const ran: string[] = [];
    const rows = controlRows(editor, NOTE_TOOLBAR, {
      can: (one) => one.command === 'toggleBold',
      onRun: (one) => ran.push(one.command)
    });

    expect(rows.filter((one) => !one.disabled).map((one) => one.control.command)).toEqual(['toggleBold']);
    rows[0].run();
    expect(ran).toEqual([rows[0].control.command]);
  });

  it('writes the chord the keymap actually binds, not the one a control remembers', async () => {
    const { SITE_KEYS, SITE_TOOLBAR } = await import('@barocss/office-site');
    const editor = await noteEditor();

    /*
     * A toolbar is where a reader **finds** a chord, so a chord written on a control that the keymap
     * has since moved is worse than none. The binding answers first and the declaration is the
     * fallback — which is the honest half of a product that does not own the engine's key map.
     */
    const withKeys = controlRows(editor, SITE_TOOLBAR, { keys: SITE_KEYS, apple: true });
    const without = controlRows(editor, SITE_TOOLBAR);
    expect(withKeys.filter((one) => one.shortcut).length).toBeGreaterThan(
      without.filter((one) => one.shortcut).length
    );
    /* And it is written the way this reader's platform writes one. */
    expect(withKeys.some((one) => (one.shortcut ?? '').includes('⌘'))).toBe(true);
    expect(
      controlRows(editor, SITE_TOOLBAR, { keys: SITE_KEYS, apple: false }).some((one) =>
        (one.shortcut ?? '').includes('Ctrl')
      )
    ).toBe(true);
  });
});

/**
 * **패키지가 무엇을 아는지, 그리고 무엇을 몰라야 하는지.**
 *
 * The name is the boundary: `office-ui` does not know about an editor and this does. The rule that
 * keeps that true is that **this package depends on no product** — that is what lets a product
 * depend on it, and a `if (product === 'word')` here would be the coupled-in-both-directions failure
 * `docs/SHARED-LAYER.md` opens with.
 *
 * Checked rather than promised, because it is the kind of thing a hurried import breaks silently.
 */
describe('이 패키지가 의존하는 것', () => {
  it('depends on no product, which is what lets a product depend on it', async () => {
    const { readFileSync } = await import('node:fs');
    const here = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

    const products = ['office-site', 'office-word', 'office-slides', 'office-note'];
    const runtime = Object.keys(here.dependencies ?? {});
    for (const one of products) {
      expect(
        runtime.includes(`@barocss/${one}`),
        `${one} 이 dependencies 에 있습니다 — 순환입니다`
      ).toBe(false);
    }

    /* They are devDependencies, and only so that a check can look the other way. */
    const dev = Object.keys(here.devDependencies ?? {});
    for (const one of products) expect(dev).toContain(`@barocss/${one}`);
  });

  it('draws with the primitives rather than reaching for a DOM of its own', async () => {
    const { readFileSync } = await import('node:fs');
    const here = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    /**
     * `office-ui` for the parts, `office-controls` for the shape, `office-icons` for the pictures and
     * `editor-core` for the one thing `office-ui` refuses to know. Those four were the whole list, and
     * this check is here so a fifth has to be argued for rather than typed.
     *
     * Two were argued for and added when `SlashMenu` moved in:
     *
     * - **`editor-view-dom`** — `selectionRectIn`, which is *where on the screen the caret is*. Only
     *   the view knows, because only the view drew it.
     * - **`extensions`** — `SlashCommandExtension`, whose `state` is the open menu. The declaration
     *   this surface reads lives in an extension rather than in a model file, which is a fact about
     *   where slash items are kept and not about this package.
     *
     * Both are the engine, not a product, so the rule the name states still holds: this knows an
     * editor and knows no product.
     */
    expect(Object.keys(here.dependencies ?? {}).sort()).toEqual([
      '@barocss/editor-core',
      '@barocss/editor-view-dom',
      '@barocss/extensions',
      '@barocss/office-controls',
      '@barocss/office-icons',
      '@barocss/office-ui'
    ]);
  });
});
