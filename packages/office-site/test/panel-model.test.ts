import { describe, expect, it } from 'vitest';
import { createSchema } from '@barocss/schema';
import { SITE_PANEL, sitePanelAttrs, sitePanelCommands, sitePanelGroups, sitePanelRows } from '../src/panel-model';
import { VALUE_FORMATS } from '@barocss/office-canvas';
import { SELECTABLE } from '../src/selection';
import { getSiteSchemaDefinition } from '../src/site-schema';
import { createSiteEditor } from '../src/site-kit';
import { SELECTABLE } from '../src/selection';

/**
 * The panel, held to the things a declaration can be wrong about.
 *
 * The conformance harness asks the two questions that matter about it — which commands it reaches
 * and which attributes it can set — and it can only ask them because this file exists. What it
 * cannot ask is whether the declaration is *coherent*: a row naming a command nobody registers, or a
 * node type the schema does not have, draws nothing and fails no check, because a row that never
 * appears is a row that never disagrees with anything.
 *
 * That is the failure mode of every declaration: it is only worth what somebody checks about it.
 */
describe('what the panel declares', () => {
  const schema = createSchema('site', getSiteSchemaDefinition());
  const commands = new Set(createSiteEditor().commandNames() as string[]);

  it('names only commands the product registers', () => {
    // A row wired to a name nobody registered is a control that does nothing when pressed — and the
    // harness would count it as *reachable*, which is worse than not declaring it at all.
    const unknown = sitePanelCommands().filter((name) => !commands.has(name));
    expect(unknown).toEqual([]);
  });

  it('names only node types the schema has', () => {
    // A row `on: ['textBox']` never draws, because no node is one. It looks like coverage in this
    // file and is nothing on screen.
    const missing = SITE_PANEL.flatMap((row) => row.on ?? []).filter((type) => !schema.nodes.has(type));
    expect([...new Set(missing)]).toEqual([]);
  });

  it('sets only attributes those node types declare', () => {
    /*
     * The row writes `cornerRadius` and the node has no such attribute: the command runs, the
     * document takes it, the validator drops it, and the panel shows a value that never lands.
     * Measured against the schema rather than against the renderer on purpose — the renderer's
     * question is `every-attribute-is-read`'s, and this one is about the *declaration*.
     */
    const wrong: string[] = [];
    for (const row of SITE_PANEL) {
      if (!row.command) continue;
      /*
       * A row that writes a **child node** names a node type rather than an attribute — the schema
       * prefers declarations made of nodes, and a placement's answers are `componentValue`
       * children. This test is what found that one field was meaning two things.
       */
      if (row.writes === 'child') {
        expect(schema.nodes.has(row.attr), `${row.label} writes ${row.attr}`).toBe(true);
        continue;
      }
      /*
       * `of` where a row writes a node other than the one that shows it — a site's address appears in
       * the page's pane and belongs to the **document**. Exactly one row does this and it says so;
       * without the field this check reported it, correctly, as a row lying about what it writes.
       */
      /*
       * A row that writes a **mark** names one, and a mark is not an attribute of anything.
       *
       * The schema declares marks in their own vocabulary — a run carries them, no node type lists
       * them under `attrs` — so asking `attrs[row.attr]` about `fontSize` answers no forever. The
       * check is the same claim either way and it is worth keeping both halves: *the thing this row
       * writes exists in the schema*. Only where to look for it changes.
       */
      if (schema.marks?.has?.(row.attr)) continue;

      const types = row.of ? [row.of] : (row.on ?? [...SELECTABLE]);
      const anywhere = types.some((type) => (schema.nodes.get(type) as any)?.attrs?.[row.attr]);
      if (!anywhere) wrong.push(`${row.group} › ${row.label} sets ${row.attr}, which none of ${types.join('/')} declares`);
    }
    expect(wrong).toEqual([]);
  });

  it('gives every choice something to choose from', () => {
    // A `choice` with no options draws an empty dropdown. The three list kinds get theirs from the
    // document, which is exactly why they are kinds and not options.
    const empty = SITE_PANEL.filter((row) => row.control === 'choice' && !row.options?.length);
    expect(empty.map((row) => row.attr)).toEqual([]);
  });

  it('calls no two rows the same thing', () => {
    /*
     * An accessible name has to be unique in the panel, and two rows called 이름 — one for a block
     * and one for a page — are ambiguous to a screen reader and to a test alike. They are in
     * different panes, which is why `label` may repeat and `ariaLabel` may not.
     */
    const names = SITE_PANEL.map((row) => row.ariaLabel);
    expect(new Set(names).size).toBe(names.length);
  });

  it('shows a stack’s arrangement only for a stack', () => {
    const stack = sitePanelRows('frame').map((row) => row.attr);
    const text = sitePanelRows('paragraph').map((row) => row.attr);

    expect(stack).toContain('layoutMode');
    expect(stack).toContain('gap');
    // A paragraph arranges nothing, and a 방향 row on one is a control that would do nothing.
    expect(text).not.toContain('layoutMode');
    // But the things every block has are still there.
    expect(text).toContain('sizing');
    expect(text).toContain('fill');
  });

  it('keeps the page out of the block panes, and the blocks out of the page one', () => {
    // A page is the board rather than a block — `SELECTABLE` leaves it out — so its rows are reached
    // by selecting nothing, and no block row may appear beside them.
    const surface = sitePanelRows('surface');
    /*
     * Five about the page, and four about **what the site is set in** — the document's answer,
     * reached the same way its address is: by selecting nothing.
     */
    /*
     * The page's own five, the four about **what the site is set in**, and the four about **what the
     * published folder holds** — a tab's picture, what a crawler is told, and which page a host
     * serves for an address it cannot match. All of them are reached the same way: by selecting
     * nothing, which is what the page pane is.
     *
     * `noIndex` twice, and that is not a collision: one is the **site's** and one is this **page's**,
     * which the check about duplicate attributes tells apart by `of`.
     */
    expect(surface.map((row) => row.attr).sort()).toEqual([
      'address',
      'baseSize',
      'bodyFace',
      'description',
      'headingFace',
      'icon',
      'image',
      'name',
      'noIndex',
      'noIndex',
      'notFound',
      'path',
      'scale'
    ]);
    expect(sitePanelRows('frame').every((row) => row.tab !== 'page')).toBe(true);
  });

  it('groups in the order it lists, so moving a row moves it on screen', () => {
    const groups = sitePanelGroups('frame', 'block').map((one) => one.label);
    expect(groups).toEqual(['선택', '배치', '크기', '위치', '누르면', '열림']);
    // And a group is contiguous: two runs of one label would draw the heading twice.
    expect(new Set(groups).size).toBe(groups.length);
  });

  it('counts only what a reader can change as settable', () => {
    const settable = sitePanelAttrs();
    expect(settable).toContain('gap');
    // The kind of block is read out, never typed — a row with no command contributes nothing here,
    // which is what makes `editable` an honest answer to "what can a reader change".
    expect(settable).not.toContain('stype');
  });
});

/**
 * What the panel does when a reader **empties** a field.
 *
 * Held here rather than in a browser because it is arithmetic — which payload the row sends — and
 * because the fault it holds was invisible in a browser too: the field went blank, the command
 * reported success, and the attribute kept its old value. `undefined` was being dropped by the
 * transaction's own copy of the operation (`JSON.parse(JSON.stringify(...))` has no word for it),
 * so the removal branch `setAttrs` documents could not be reached from a command at all.
 */
describe('taking a value back', () => {
  it('removes the attribute rather than leaving what was there', async () => {
    const { DataStore } = await import('@barocss/datastore');
    const { createSchema } = await import('@barocss/schema');
    const { createSiteEditor } = await import('../src/site-kit');
    const { getSiteSchemaDefinition } = await import('../src/site-schema');
    const { createSampleSite } = await import('../src/sample-site');
    const { pagesOf } = await import('../src/selection');
    const { namedBlock } = await import('./helpers');

    const schema = createSchema('site', getSiteSchemaDefinition());
    const store = new DataStore(undefined as never, schema as never);
    const editor: any = createSiteEditor({ editable: true, schema, dataStore: store } as never);
    editor.loadDocument(createSampleSite(), 'site');

    const doc = { rootId: editor.getRootId(), getNode: (sid: string) => store.getNode(sid) };
    const hero = namedBlock(doc, pagesOf(doc as never)[0].sid, '히어로');
    const attrs = () => (store.getNode(hero) as any).attributes;

    await editor.executeCommand('setBlockFormat', { nodeIds: [hero], at: 'desktop', minWidth: 3000 });
    expect(attrs().minWidth).toBe(3000);

    await editor.executeCommand('setBlockFormat', { nodeIds: [hero], at: 'desktop', minWidth: undefined });
    expect('minWidth' in attrs()).toBe(false);
  });

  it('answers for all four sides when the shorthand is written', async () => {
    const { DataStore } = await import('@barocss/datastore');
    const { createSchema } = await import('@barocss/schema');
    const { createSiteEditor } = await import('../src/site-kit');
    const { getSiteSchemaDefinition } = await import('../src/site-schema');
    const { createSampleSite } = await import('../src/sample-site');
    const { pagesOf } = await import('../src/selection');
    const { namedBlock } = await import('./helpers');

    const schema = createSchema('site', getSiteSchemaDefinition());
    const store = new DataStore(undefined as never, schema as never);
    const editor: any = createSiteEditor({ editable: true, schema, dataStore: store } as never);
    editor.loadDocument(createSampleSite(), 'site');

    const doc = { rootId: editor.getRootId(), getNode: (sid: string) => store.getNode(sid) };
    const hero = namedBlock(doc, pagesOf(doc as never)[0].sid, '히어로');
    const attrs = () => (store.getNode(hero) as any).attributes;

    // The hero states four different sides, which is why its shorthand shows nothing.
    expect(attrs().paddingTop).not.toBe(attrs().paddingBottom);

    /*
     * What the panel sends when a reader types into 안쪽 여백: the shorthand, and the four sides
     * taken back. Without the second half the number does nothing at all — four stated sides go on
     * overriding the shorthand, and the reader watches a value they typed have no effect.
     */
    await editor.executeCommand('setBlockFormat', {
      nodeIds: [hero],
      at: 'desktop',
      paddingTop: undefined,
      paddingRight: undefined,
      paddingBottom: undefined,
      paddingLeft: undefined,
      padding: 360
    });

    expect(attrs().padding).toBe(360);
    for (const side of ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft']) {
      expect(side in attrs()).toBe(false);
    }
  });
});

/**
 * **The two rows about how a value reads**, which are the surface half of the finding that a card's
 * question was answered with a string and drawn exactly as stored.
 */
describe('what a variable holds, and how it reads', () => {
  it('offers both, on the part a variable is bound to', () => {
    const rows = sitePanelRows('paragraph').filter((row) => row.group === '컴포넌트 변수');
    expect(rows.map((one) => one.control)).toContain('varKind');
    expect(rows.map((one) => one.control)).toContain('varFormat');
    // Both write the declaration, so one undo puts a card back — and neither is a second command.
    for (const one of rows.filter((r) => r.control === 'varKind' || r.control === 'varFormat')) {
      expect(one.command).toBe('setComponentVar');
      expect(one.writes).toBe('child');
    }
  });

  it('offers a format for the kinds that have one, and for no others', () => {
    // A text variable reads as itself and always will, so there is no list for it — which is what
    // makes the row absent rather than present with one option in it.
    expect(Object.keys(VALUE_FORMATS).sort()).toEqual(['date', 'number']);
    for (const [kind, formats] of Object.entries(VALUE_FORMATS)) {
      // The first is always *as it is*, so a reader can take the reading back.
      expect(formats[0].id).toBe('');
      expect(formats.length).toBeGreaterThan(2);
      expect(kind).toBeTruthy();
    }
  });
});

/**
 * **No two rows write one attribute for one node type.**
 *
 * A guard rather than a fix: nothing in the panel does this today, and it was written while chasing
 * something that turned out not to be it — a field's 보낼 이름 looked as though it might collide with
 * the generic 이름 row, and `field` is not in `SELECTABLE`, so that row was never offered for one.
 *
 * It is worth keeping anyway, and the reason is the shape of the thing it would catch: two rows on
 * one attribute is a panel where setting either silently changes the other, and the browser's control
 * sweep **cannot see it** — that check asks *did this control write something*, and the second row
 * does write something. It writes over the first. This is the question that can be asked
 * exhaustively, of every node type, without a browser.
 */
describe('a row per attribute', () => {
  it('offers each attribute once, for every node type a reader can select', () => {
    const clashes: string[] = [];

    for (const stype of [...SELECTABLE, 'surface']) {
      const seen = new Map<string, { label: string; when?: { attr: string; is?: unknown[] } }>();
      for (const row of sitePanelRows(stype)) {
        // A row with no command reads rather than writes — the width note, the kind. Two of those
        // about one attribute is not a collision, it is a label and a value.
        if (!row.command) continue;
        /*
         * And a row that writes a **child node** names a node type rather than an attribute — which
         * is what `writes: 'child'` says. The four rows of 컴포넌트 변수 are all about a
         * `componentVar` and write different fields of it through different payload keys, which the
         * model does not declare and this therefore cannot compare. Not a collision; a different
         * question, and one nothing asks yet.
         */
        if (row.writes === 'child') continue;
        /*
         * And two rows a reader can **never see together** are not a collision. `when` decides which
         * of a pair is drawn, so a `position` that is `absolute` shows W beside X and Y, and one that
         * is anything else shows 최대 폭 under 크기 — the same attribute under the name each kind of
         * block needs, and only ever one of them on screen.
         *
         * Compared rather than assumed: the two conditions clash only if some value satisfies both.
         * A row with no `when` is satisfied by everything, so it still collides with anything.
         */
        const key = `${row.tab}:${row.attr}:${row.of ?? ''}`;
        const held = seen.get(key);
        const apart = (a?: { attr: string; is?: unknown[] }, b?: { attr: string; is?: unknown[] }) =>
          !!a?.is && !!b?.is && a.attr === b.attr && !a.is.some((one) => b.is!.includes(one));
        if (held && !apart(held.when, row.when)) {
          clashes.push(`${stype}: ${held.label} and ${row.label} both write ${row.attr}`);
        } else if (!held) {
          seen.set(key, { label: row.label, when: row.when });
        }
      }
    }

    expect(clashes).toEqual([]);
  });
});
