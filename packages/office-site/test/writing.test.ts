import { describe, it, expect } from 'vitest';
import { createSchema } from '@barocss/schema';
import { getSiteSchemaDefinition } from '../src/site-schema';
import { createSiteEditor } from '../src/site-kit';
import { SITE_PANEL, sitePanelRows } from '../src/panel-model';
import { WRITER_ATTRS, WRITER_COMMANDS, writerMayRun, writerMaySet } from '../src/writing';
import { siteToolbarCommands } from '../src/toolbar-model';
import { siteKeyCommands } from '../src/keymap';
import { sitePanelCommands } from '../src/panel-model';
import { siteMenuCommands } from '../src/menu-model';

/**
 * **글 고치기** — the mode in which a reader may change the words and nothing else.
 *
 * The value of a declaration like this is not that the list is short. It is that **four surfaces read
 * one list**, so the question that matters can be asked once: *is there a way to change the layout
 * from inside writing mode?* Hiding controls does not answer that; a list every surface consults
 * does.
 *
 * So these are mostly checks on the list itself — that everything in it exists, that nothing in it is
 * an act a writer should not have, and that the panel really does draw only what it names.
 */
describe('what a writer may do', () => {
  const editor: any = createSiteEditor({
    editable: true,
    schema: createSchema('site', getSiteSchemaDefinition())
  } as never);

  it('names only commands the product registers', () => {
    /*
     * A list naming a command nobody registers is a promise nothing can keep — the same check the
     * menubar carries, for the same reason: a declaration that only a check reads is a declaration
     * that only a check is true of.
     */
    const registered = new Set<string>(editor.commandNames() as string[]);
    const named = WRITER_COMMANDS.map((one) => one.split('.')[0]);
    expect(named.filter((one) => !registered.has(one))).toEqual([]);
  });

  it('lets a writer change the words, and the thing the words are about', () => {
    expect(writerMayRun('setPageInfo')).toBe(true);
    expect(writerMayRun('linkToPage')).toBe(true);
    expect(writerMayRun('linkToAddress')).toBe(true);
    // Undo belongs to whoever is doing the changing.
    expect(writerMayRun('undo')).toBe(true);
  });

  it('refuses everything that moves, resizes, adds or takes away', () => {
    /*
     * Not because those are dangerous — because they are somebody else's work, and the whole value
     * of the mode is that a writer can stop being careful.
     */
    for (const one of [
      'setBlockFormat',
      'insertSection',
      'insertHeading',
      'removeBlocks',
      'duplicateBlocks',
      'groupBlocks',
      'moveBlockInto',
      'setSizing',
      'insertWidth',
      'setPageTemplate',
      'publishSite'
    ]) {
      expect(writerMayRun(one), one).toBe(false);
    }
  });

  it('lets one command through for one node type, and no other', () => {
    /**
     * `setBlockFormat` is this product's 24-field command: it writes a heading's level *and* a
     * section's padding. So a list of command names alone cannot say what a writer may do with it,
     * and the entry is `setBlockFormat.picture` — a writer may change a **picture's** file and the
     * words that stand in for it, and nothing else through the same door.
     */
    expect(writerMayRun('setBlockFormat', 'picture')).toBe(true);
    expect(writerMayRun('setBlockFormat', 'frame')).toBe(false);
    expect(writerMayRun('setBlockFormat', 'heading')).toBe(false);
    expect(writerMayRun('setBlockFormat')).toBe(false);
    expect(writerMayRun(undefined)).toBe(false);
  });

  it('names only attributes some row actually offers', () => {
    /*
     * The other half of the same rule: an attribute a writer may set and no row offers is a
     * permission nothing can be reached through, and one that exists nowhere in the schema is a
     * typo nothing would ever have caught.
     */
    const offered = new Set(SITE_PANEL.flatMap((row) => [row.attr, ...(row.with ?? []).map((one) => one.attr)]));
    expect(WRITER_ATTRS.filter((one) => !offered.has(one))).toEqual([]);
  });

  it('offers a picture’s file and not its corners', () => {
    const picture = sitePanelRows('picture');
    const writeable = picture.filter((row) => writerMaySet(row.attr)).map((row) => row.attr);
    expect(writeable).toContain('src');
    expect(writeable).toContain('alt');
    // Everything else a picture has is somebody else's decision.
    expect(picture.filter((row) => writerMaySet(row.attr)).length).toBeLessThan(picture.length);
    expect(writerMaySet('cornerRadius')).toBe(false);
    expect(writerMaySet('sizing')).toBe(false);
  });

  it('leaves the page’s own words to the writer', () => {
    // A title and a description are words, and the person who writes the words writes those too.
    for (const one of ['name', 'description', 'path']) expect(writerMaySet(one), one).toBe(true);
  });
});

/**
 * **The question hiding controls does not answer.**
 *
 * A mode that greys the toolbar is a mode a reader gets out of by pressing something else — the
 * menubar, a chord, a row in the panel. So the check that matters is not *what is drawn* but *what
 * every declared surface offers*, asked against the one list.
 *
 * Which is the same shape as `every-command-can-be-reached`, turned around: that one asks whether a
 * command a product adds is reachable at all, and this asks whether one a **writer** must not run is
 * reachable from inside their mode.
 */
describe('what a writer can reach', () => {
  it('offers no way to change the layout, from any declared surface', () => {
    /*
     * Written as the four surfaces this product declares rather than as a search of the code: a
     * surface nothing declares is a surface no check can look at, which is the fault `toolbar-model`,
     * `keymap` and `menu-model` all exist to have already made once.
     */
    const surfaces = [
      ...siteToolbarCommands(),
      ...siteKeyCommands(),
      ...sitePanelCommands(),
      ...siteMenuCommands()
    ];

    /*
     * Every command a surface offers, that a writer may not run. This is expected to be **long** —
     * a builder is mostly acts a writer must not do — and its being long is the point: the app has
     * to consult the list rather than remember it, which is what `site.spec.ts` drives.
     */
    const refused = [...new Set(surfaces.filter((one) => !writerMayRun(one)))];
    expect(refused.length).toBeGreaterThan(20);

    /* And the ones a writer *may* run are all reachable, which is the other direction. */
    const reachable = new Set(surfaces);
    const named = WRITER_COMMANDS.map((one) => one.split('.')[0]);
    expect(named.filter((one) => !reachable.has(one))).toEqual([]);
  });
});
