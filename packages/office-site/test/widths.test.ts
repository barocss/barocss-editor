import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import { createSiteEditor } from '../src/site-kit';
import { getSiteSchemaDefinition } from '../src/site-schema';
import { createSampleSite } from '../src/sample-site';
import {
  BREAKPOINTS,
  SITE_ENV_KEY,
  baseOf,
  createSiteEnv,
  overridableIn,
  screenOf,
  scopesFor,
  widthsOf,
  type SiteWidth
} from '../src/breakpoints';
import { attrsAt, attrsThrough, overridesOf } from '../src/responsive';
import { neverShown, shownAt, shownSomewhere } from '../src/presence';
import { DEVICES, deviceMatches, deviceNamed } from '../src/devices';
import { overrideFaults } from '../src/responsive';
import { documentFaults } from '../src/faults';
import { pagesOf } from '../src/selection';

/**
 * **The widths a site is designed at**, which used to be a `const` with three entries.
 *
 * Asked as three things that turned out to be one — *사이즈를 더 추가할 수도 있지 않을까 / 순서도 바꿀
 * 수 있어야할 듯 / 미리보기에 실제 장치 테두리가 있으면* — and the missing fact under all three is that
 * the list belongs to the document.
 *
 * What is worth checking is not that a list can be read. It is the four rules that make a *changing*
 * list safe: the widest is the base whatever it is called, an override at a width that no longer
 * exists is kept and not applied, the last width cannot be removed, and a name is never renamed.
 */
describe('the widths a site is designed at', () => {
  let editor: any;
  let store: DataStore;

  const run = async (command: string, payload?: unknown) => await editor.executeCommand(command, payload);
  const widths = () => widthsOf(store as never, editor.getRootId());

  beforeEach(() => {
    const schema = createSchema('site', getSiteSchemaDefinition());
    store = new DataStore(undefined as never, schema as never);
    editor = createSiteEditor({ editable: true, schema, dataStore: store } as never);
    editor.loadDocument(createSampleSite(), 'site');
  });

  it('is the three every site starts with, until a document says otherwise', () => {
    /*
     * The half that makes this change invisible to every document already written: a site that has
     * said nothing about widths is drawn exactly as it was.
     */
    expect(widths()).toEqual(BREAKPOINTS);
    expect(widths().map((one) => one.id)).toEqual(['desktop', 'tablet', 'mobile']);
  });

  it('takes the widest as the base, whatever it is called', () => {
    // `desktop` used to be written into the code as the base. It is the widest, which is a different
    // fact that happens to be true of it — and stops being true the moment a reader adds a wider one.
    expect(baseOf()).toBe('desktop');
    expect(
      baseOf([
        { id: 'watch', label: '워치', width: 200, viewport: 200 },
        { id: 'wall', label: '벽', width: 2560, viewport: 1440 }
      ])
    ).toBe('wall');
    expect(overridableIn()).toEqual(['tablet', 'mobile']);
  });

  it('resolves narrowest-first by size, not by a list of three names', () => {
    /*
     * `scopesFor` was `['mobile', 'tablet', 'desktop']`, so a fourth width had nowhere to go. Sorted
     * by size, a width inserted between two resolves between them — which is the whole point of being
     * able to add one.
     */
    const four = [
      ...BREAKPOINTS,
      { id: 'phone-small', label: '작은 휴대폰', width: 320, viewport: 780 }
    ];
    expect(scopesFor('phone-small', four)).toEqual(['phone-small', 'mobile', 'tablet', 'desktop']);
    expect(scopesFor('tablet', four)).toEqual(['tablet', 'desktop']);
    // A width the list does not have resolves as the base alone: nothing to apply, nothing to guess.
    expect(scopesFor('없는폭', four)).toEqual(['desktop']);
  });

  it('applies the scopes it is given, narrowest last word', () => {
    const attrs = { gap: 10, overrides: { mobile: { gap: 2 }, tablet: { gap: 6 } } };
    expect(attrsThrough(attrs, ['mobile', 'tablet', 'desktop']).gap).toBe(2);
    expect(attrsThrough(attrs, ['tablet', 'desktop']).gap).toBe(6);
    // The base alone applies nothing, which is what makes the widest width *be* the node.
    expect(attrsThrough(attrs, ['desktop']).gap).toBe(10);
  });

  it('keeps an override written at a width the document no longer has', () => {
    /**
     * The rule that matters most, and the one that had to change when the list stopped being a
     * constant: `overridesOf` used to filter to the three it knew about.
     *
     * Deleting a width is not a reason to destroy the work done at it. A file that silently lost half
     * a design because somebody tidied a list is the worst kind of data loss, because nothing on
     * screen says it happened — so the override is **kept and never applied**, and putting the width
     * back brings the design back with it.
     */
    const attrs = { gap: 10, overrides: { mobile: { gap: 2 }, '없는폭': { gap: 99 } } };
    expect(Object.keys(overridesOf(attrs))).toEqual(['mobile', '없는폭']);
    expect(attrsAt(attrs, 'mobile').gap).toBe(2);
    // Never applied, because it is in no scope the document resolves through.
    expect(attrsThrough(attrs, ['mobile', 'tablet', 'desktop']).gap).toBe(2);
  });

  it('writes the default three the first time a reader adds a fourth', async () => {
    /*
     * Because the three are a *default*, not nodes. A first insert that wrote one width alone would
     * make `widthsOf` return it by itself, and three boards would silently become one.
     */
    expect(await run('insertWidth', {})).toBe(true);
    const now = widths();
    expect(now).toHaveLength(4);
    expect(now.slice(0, 3).map((one) => one.id)).toEqual(['desktop', 'tablet', 'mobile']);
    // A step narrower than the narrowest, floored at 320 — see `_insert`.
    expect(now[3].width).toBe(320);
  });

  it('fills the numbers in from a device, and remembers which one', async () => {
    await run('insertWidth', { device: 'phone-small' });
    const made = widths()[3];
    const device = deviceNamed('phone-small')!;
    expect(made.width).toBe(device.width);
    expect(made.viewport).toBe(device.viewport);
    expect(made.device).toBe('phone-small');
    expect(deviceMatches(made)).toBe(true);

    /*
     * And a reader who then types their own number keeps the device **name** and stops matching it,
     * which is what `deviceMatches` is for: a panel that went on saying 작은 휴대폰 would be claiming
     * a shape the page is not drawn at.
     */
    await run('setWidth', { name: made.id, size: 500 });
    expect(deviceMatches(widths()[3])).toBe(false);
  });

  it('refuses the last width, because a site with none has no boards', async () => {
    await run('insertWidth', {});
    for (const one of ['desktop', 'tablet', 'mobile']) {
      expect(await run('removeWidth', { name: one })).toBe(true);
    }
    expect(widths()).toHaveLength(1);
    expect(editor.canExecuteCommand('removeWidth', { name: widths()[0].id })).toBe(false);
  });

  it('refuses a name the document does not have', () => {
    expect(editor.canExecuteCommand('setWidth', { name: '없는폭' })).toBe(false);
    expect(editor.canExecuteCommand('removeWidth', { name: '없는폭' })).toBe(false);
    expect(editor.canExecuteCommand('moveWidth', { name: '없는폭', to: 0 })).toBe(false);
  });

  it('moves one to where it should end up, and refuses a place it is already in', async () => {
    await run('insertWidth', {});
    expect(widths().map((one) => one.id)).toEqual(['desktop', 'tablet', 'mobile', 'width-4']);

    expect(await run('moveWidth', { name: 'width-4', to: 0 })).toBe(true);
    expect(widths().map((one) => one.id)).toEqual(['width-4', 'desktop', 'tablet', 'mobile']);
    /*
     * The order is the document's and it is *only* the order the boards sit in — the resolution sorts
     * by size, so putting the narrowest first changes nothing about what the page draws.
     */
    expect(scopesFor('width-4', widths())).toEqual(['width-4', 'mobile', 'tablet', 'desktop']);
    // And 320 is narrower than 390, so the phone does not resolve through it — size decides, always.
    expect(scopesFor('mobile', widths())).toEqual(['mobile', 'tablet', 'desktop']);

    expect(editor.canExecuteCommand('moveWidth', { name: 'width-4', to: 0 })).toBe(false);
    expect(editor.canExecuteCommand('moveWidth', { name: 'width-4', to: 9 })).toBe(false);
  });

  it('gives a fresh name rather than trusting one that is taken', async () => {
    await run('insertWidth', { name: 'mobile' });
    // Two widths called `mobile` would make one board two and every `overrides` key ambiguous.
    expect(widths().filter((one) => one.id === 'mobile')).toHaveLength(1);
    expect(widths()[3].id).toBe('width-4');
  });

  it('offers devices whose numbers are the ones it claims', () => {
    // A short list on purpose: forty phones is a table that is wrong within a year.
    expect(DEVICES.length).toBeGreaterThan(3);
    for (const one of DEVICES) {
      expect(one.width, one.name).toBeGreaterThan(0);
      expect(one.viewport, one.name).toBeGreaterThan(0);
      expect(deviceMatches({ width: one.width, viewport: one.viewport, device: one.name }), one.name).toBe(true);
    }
    expect(deviceNamed('없는장치')).toBeUndefined();
    expect(deviceMatches(undefined)).toBe(false);
  });
});

/**
 * **And the state every document actually opens in**, which the tests above never wore.
 *
 * Every one of them ran `insertWidth` first, so the document had a `widths` box before anything else
 * was tried — and the reader's document does not. Reported in five words: *순서 이동 눌러도 동작을
 * 안해*, and the panel was offering three widths that are a **default rather than nodes**, so every
 * command pointed at a name no node had.
 *
 * The fix is the one `insertWidth` already made: the **first change materialises the list**. Which is
 * also why this block is separate — a fixture that has to add a width before it can test moving one
 * is a fixture that cannot see this at all.
 */
describe('a document that has said nothing about widths', () => {
  let editor: any;
  let store: DataStore;

  const run = async (command: string, payload?: unknown) => await editor.executeCommand(command, payload);
  const widths = () => widthsOf(store as never, editor.getRootId());

  beforeEach(() => {
    const schema = createSchema('site', getSiteSchemaDefinition());
    store = new DataStore(undefined as never, schema as never);
    editor = createSiteEditor({ editable: true, schema, dataStore: store } as never);
    editor.loadDocument(createSampleSite(), 'site');
  });

  it('offers all three, because that is what it is drawing at', () => {
    expect(editor.canExecuteCommand('moveWidth', { name: 'mobile', to: 0 })).toBe(true);
    expect(editor.canExecuteCommand('removeWidth', { name: 'tablet' })).toBe(true);
    expect(editor.canExecuteCommand('setWidth', { name: 'desktop', label: '큰 화면' })).toBe(true);
  });

  it('moves one, writing the list down on the way', async () => {
    expect(await run('moveWidth', { name: 'mobile', to: 0 })).toBe(true);
    expect(widths().map((one) => one.id)).toEqual(['mobile', 'desktop', 'tablet']);
  });

  it('takes one away, and the other two stay', async () => {
    expect(await run('removeWidth', { name: 'tablet' })).toBe(true);
    expect(widths().map((one) => one.id)).toEqual(['desktop', 'mobile']);
  });

  it('changes one, and does not invent the other two', async () => {
    expect(await run('setWidth', { name: 'mobile', size: 360 })).toBe(true);
    const now = widths();
    expect(now.map((one) => one.id)).toEqual(['desktop', 'tablet', 'mobile']);
    expect(now[2].width).toBe(360);
    // The two it did not touch are the numbers they always were, not defaults re-derived.
    expect(now[0].width).toBe(1280);
    expect(now[1].viewport).toBe(1112);
  });

  it('refuses a name it is not drawing at, even now', () => {
    expect(editor.canExecuteCommand('moveWidth', { name: '없는폭', to: 0 })).toBe(false);
    expect(editor.canExecuteCommand('removeWidth', { name: '없는폭' })).toBe(false);
  });
});

/**
 * **What a changing list of widths makes wrong elsewhere**, which is the usual shape of turning a
 * constant into data: a constant is a place where nothing can be *wrong*, and the moment it becomes
 * data every reader of it has to be honest.
 */
describe('what the fault list says about widths', () => {
  let editor: any;
  let store: DataStore;
  const run = async (command: string, payload?: unknown) => await editor.executeCommand(command, payload);
  const widths = () => widthsOf(store as never, editor.getRootId());

  beforeEach(() => {
    const schema = createSchema('site', getSiteSchemaDefinition());
    store = new DataStore(undefined as never, schema as never);
    editor = createSiteEditor({ editable: true, schema, dataStore: store } as never);
    editor.loadDocument(createSampleSite(), 'site');
  });

  it('does not call a width the document declares undrawn', async () => {
    /*
     * It did. `overrideFaults` asked `OVERRIDABLE` — the three every site starts with — so a reader
     * who added a fourth width and said something at it was told *'width-4' 너비는 그려지지 않습니다*
     * about a width their own document declares. A fault list calling correct work wrong is worse
     * than one that does not check, because the reader believes it.
     */
    await run('insertWidth', {});
    const said = { overrides: { 'width-4': { gap: 30 } } };
    expect(overrideFaults(said, ['gap'], widths())).toEqual([]);
    // And a name no width has is still a fault, which is what the check is for.
    expect(overrideFaults({ overrides: { watch: { gap: 30 } } }, ['gap'], widths())).toEqual([
      "'watch' 너비는 그려지지 않습니다"
    ]);
  });

  it('says which widths a placed block is off the side of', async () => {
    /**
     * The one fault absolute placement produces on its own, and the reason this product treats
     * placement as a **decoration layer** rather than a peer of stacking: a page re-flows, and a
     * block at coordinates opts out — so a card at x=900 on a 1280 board is simply not on a 390 one,
     * and nothing on the wide board a reader is looking at says so.
     *
     * Measured rather than moralised. Not *you promised to place this at every width*, which is a
     * lecture; which widths it is outside of, which is a fact and a thing to go and fix.
     */
    const doc = { rootId: editor.getRootId(), getNode: (sid: string) => store.getNode(sid) };
    const page = pagesOf(doc as never)[0];
    const block = ((store.getNode(page.sid) as any)?.content ?? [])[0] as string;

    await run('setBlockFormat', {
      nodeIds: [block],
      position: 'absolute',
      /* 900 CSS pixels: inside the desktop board, outside both narrower ones. */
      insetLeft: 900 * 15,
      insetTop: 40 * 15
    });

    const said = documentFaults(doc as never, { widths: widths() }).filter((one) => one.sid === block);
    expect(said).toHaveLength(1);
    expect(said[0].kind).toBe('width');
    expect(said[0].said).toContain('태블릿');
    expect(said[0].said).toContain('모바일');
    expect(said[0].said).not.toContain('데스크톱');
  });

  it('says nothing when a narrower width has been placed', async () => {
    // Which is the whole point of saying it: a reader who has done the work is not told off for it.
    const doc = { rootId: editor.getRootId(), getNode: (sid: string) => store.getNode(sid) };
    const page = pagesOf(doc as never)[0];
    const block = ((store.getNode(page.sid) as any)?.content ?? [])[0] as string;

    await run('setBlockFormat', { nodeIds: [block], position: 'absolute', insetLeft: 900 * 15 });
    for (const [at, left] of [['tablet', 400], ['mobile', 40]] as const) {
      await run('setBlockFormat', { nodeIds: [block], at, insetLeft: left * 15 });
    }

    expect(
      documentFaults(doc as never, { widths: widths() }).filter((one) => one.sid === block)
    ).toEqual([]);
  });

  it('says nothing about a block the page lays out', () => {
    // A stacked block has no coordinates to be outside of — its parent decided where it is.
    const doc = { rootId: editor.getRootId(), getNode: (sid: string) => store.getNode(sid) };
    expect(
      documentFaults(doc as never, { widths: widths() }).filter((one) =>
        one.said.includes('화면 밖에')
      )
    ).toEqual([]);
  });
});

/**
 * **어느 폭이 기준인가** — the one fact about the list that decides what every page means.
 *
 * A node says `gap: 40` and `{ mobile: { gap: 6 } }`: the first is what it means at the base width
 * and the second is what differs. So *which one is the base* is not a detail about the list — it is
 * the meaning of every unqualified attribute in the document.
 */
describe('the width a node’s own attributes are', () => {
  const schema = createSchema('site', getSiteSchemaDefinition());
  let store: DataStore;
  let editor: any;

  beforeEach(() => {
    store = new DataStore(undefined as never, schema as never);
    editor = createSiteEditor({ editable: true, schema, dataStore: store } as never);
    editor.loadDocument(createSampleSite(), 'site');
  });

  const widths = () => widthsOf(store as never, editor.getRootId());

  it('is the widest when the document has not said', () => {
    /* Which is what every document written before this said, and what a reader who has never
       thought about it means. */
    expect(baseOf(widths())).toBe('desktop');
    expect(overridableIn(widths())).toEqual(['tablet', 'mobile']);
  });

  it('does not move when a wider width is added — which is the trap it closes', async () => {
    /**
     * The whole reason the document has to say it.
     *
     * It was **computed** — the widest — and that is right until somebody adds a width. Add a 1920
     * board and it becomes the widest, so every unqualified attribute on every page silently stops
     * meaning *at 1280* and starts meaning *at 1920*: a document that did not change, meaning
     * something else, and every page that was right at 1280 now overriding nothing.
     */
    await editor.executeCommand('setBaseWidth', { name: 'desktop' });
    await editor.executeCommand('insertWidth', { name: 'wide', label: '와이드', size: 1920 });

    const now = widths();
    expect(now.some((one) => one.id === 'wide')).toBe(true);
    /* The widest is 와이드 and the base is still 데스크톱, which is the point. */
    expect([...now].sort((a, b) => b.width - a.width)[0].id).toBe('wide');
    expect(baseOf(now)).toBe('desktop');
    /* And 와이드 is now a width an override may be written at, which it could not be as the base. */
    expect(overridableIn(now)).toContain('wide');
  });

  it('is a reference, so a width that is gone falls back rather than to nothing', async () => {
    /*
     * A document mid-edit is a document a reader is still holding. A dangling name is reported by
     * `overrideFaults`; it is not a reason to draw nothing.
     */
    await editor.executeCommand('setBaseWidth', { name: 'mobile' });
    expect(baseOf(widths())).toBe('mobile');

    await editor.executeCommand('removeWidth', { name: 'mobile' });
    expect(baseOf(widths())).toBe('desktop');
  });

  it('lets a reader pin the base it already has, which is not a no-op', async () => {
    /**
     * The comparison this got wrong first, and it is worth stating because *refuse an edit that
     * changes nothing* is a rule this product follows everywhere else and is the wrong rule here.
     *
     * The base **is** the widest until the document says otherwise. So naming the width that
     * already happens to be widest moves the document from *implicitly the widest* to **explicitly
     * this** — a different document, and the gesture a reader needs most: pin the base, *then* add a
     * wider board. The first version refused the pin, and the board silently became the base.
     */
    expect(editor.canExecuteCommand('setBaseWidth', { name: 'desktop' })).toBe(true);
    await editor.executeCommand('setBaseWidth', { name: 'desktop' });
    /* And *now* it changes nothing, because the document says it. */
    expect(editor.canExecuteCommand('setBaseWidth', { name: 'desktop' })).toBe(false);
    expect(editor.canExecuteCommand('setBaseWidth', { name: 'mobile' })).toBe(true);
    /* A width this document does not have is refused whatever it says. */
    expect(editor.canExecuteCommand('setBaseWidth', { name: '없는것' })).toBe(false);
  });

  it('changes what an unqualified attribute means, which is the whole of it', async () => {
    /**
     * Read through `attrsAt`, which is what the drawing and the panel both ask — so this is the
     * claim as a reader would meet it rather than as the list would state it.
     *
     * A node saying `gap: 40` with `{ mobile: { gap: 6 } }` means 40 **at the base**. Move the base
     * to mobile and the node's own 40 is what mobile draws, and the override becomes a thing said
     * about a width that is no longer underneath it.
     */
    const said = { gap: 40, overrides: { mobile: { gap: 6 } } };
    expect(attrsThrough(said, scopesFor('desktop', widths())).gap).toBe(40);
    expect(attrsThrough(said, scopesFor('mobile', widths())).gap).toBe(6);

    await editor.executeCommand('setBaseWidth', { name: 'mobile' });
    const now = widths();
    expect(baseOf(now)).toBe('mobile');
    /* 데스크톱 is now narrower-than-base in the cascade's terms: it takes the node's own answer. */
    expect(attrsThrough(said, scopesFor('desktop', now)).gap).toBe(40);
  });
});

/**
 * **어느 폭에 있는가** — the fact two surfaces needed and neither could ask for.
 *
 * `isHidden` reads what a node says at its **base**; `neverShown` asks whether it is hidden
 * everywhere, which is what a *draft* is and what the export drops. Between them is the ordinary
 * case — a block that is on some widths and not others — and nothing had named it, so the layer list
 * drew a mobile-only hamburger as **hidden**: a block a reader put there on purpose, marked as
 * though it were a draft, with no way to tell the two apart.
 */
describe('which widths a block is on', () => {
  const schema = createSchema('site', getSiteSchemaDefinition());
  const store = new DataStore(undefined as never, schema as never);
  const editor: any = createSiteEditor({ editable: true, schema, dataStore: store } as never);
  editor.loadDocument(createSampleSite(), 'site');

  it('is all of them when a node says nothing', () => {
    expect(shownAt(undefined)).toEqual(['desktop', 'tablet', 'mobile']);
    expect(shownAt({})).toEqual(['desktop', 'tablet', 'mobile']);
    expect(shownSomewhere({})).toBe(false);
  });

  it('tells a design apart from a draft, which is the whole point', () => {
    /*
     * Three states and the middle one had no name: on every width, on **some**, on none. A draft is
     * the third; the second is a mobile navigation, and `isHidden` said the same word for both.
     */
    const design = { visible: false, overrides: { mobile: { visible: true } } };
    const draft = { visible: false };

    expect(shownAt(design)).toEqual(['mobile']);
    expect(shownSomewhere(design)).toBe(true);
    expect(neverShown(design)).toBe(false);

    expect(shownAt(draft)).toEqual([]);
    expect(shownSomewhere(draft)).toBe(false);
    expect(neverShown(draft)).toBe(true);

    /* And the other direction, which is the same design said from the wide end. */
    const wide = { overrides: { mobile: { visible: false } } };
    expect(shownAt(wide)).toEqual(['desktop', 'tablet']);
    expect(shownSomewhere(wide)).toBe(true);
  });

  it('answers in the document’s own widths, not in three constants', () => {
    const four = [...BREAKPOINTS, { id: 'wide', label: '와이드', width: 1920, viewport: 900 }];
    expect(shownAt({ overrides: { mobile: { visible: false } } }, four)).toEqual([
      'desktop',
      'tablet',
      'wide'
    ]);
    /* A block on every width of a four-width site is still on every width. */
    expect(shownSomewhere({}, four)).toBe(false);
  });

  it('is worn by the sample, which is where the fault was', () => {
    /*
     * The sample's only two width-conditional blocks are a nav bar and a hamburger, and both are
     * inside the header **definition** — which is why the page's layer list never showed either, and
     * why this is checked against the document rather than against a page.
     */
    const found: { name: string; on: string[] }[] = [];
    const walk = (sid: string, depth: number) => {
      if (depth > 40) return;
      const node = store.getNode(sid) as any;
      if (!node) return;
      const attrs = (node.attributes ?? {}) as Record<string, unknown>;
      if (shownSomewhere(attrs)) found.push({ name: String(attrs.name ?? node.stype), on: shownAt(attrs) });
      for (const child of node.content ?? []) if (typeof child === 'string') walk(child, depth + 1);
    };
    walk(editor.getRootId(), 0);

    expect(found).toEqual([
      { name: '내비게이션', on: ['desktop', 'tablet'] },
      { name: '메뉴 열기', on: ['mobile'] }
    ]);
    /* And **neither is a draft**, which is what the list was calling them. */
    expect(found.every((one) => one.on.length > 0)).toBe(true);
  });
});

/**
 * **화면 높이 follows the document's own list**, which is the half a constant would get wrong.
 *
 * `minScreens` draws as the board's window height in the editor, because a board is a `div` on a
 * plane rather than an iframe. *Which* window height is a fact about the document: a reader who adds
 * a 1920 board and gives it a 1080 window has said something `BREAKPOINTS` does not know, and reading
 * the constant would draw their hero at a laptop's height on it.
 *
 * So it rides on the env beside `scopes`, for the reason `scopes` is there — a renderer is handed a
 * node and an env, and the list of widths is neither.
 */
describe('the window a board is a view onto', () => {
  /** An env as a host hands one to a renderer — the site's answers under the key they travel on. */
  const createSiteEnvFor = (at: never | 'desktop' | 'mobile', published: boolean, widths?: SiteWidth[]) => ({
    [SITE_ENV_KEY]: createSiteEnv(at as never, published, widths)
  });

  it('is the width’s own, including one the document added', () => {
    const mine: SiteWidth[] = [
      { id: 'width-4' as never, label: '와이드', width: 1920, viewport: 1080, icon: 'screen-desktop', device: 'laptop' },
      ...BREAKPOINTS
    ];

    expect(screenOf(createSiteEnvFor('width-4' as never, false, mine))).toBe(1080);
    expect(screenOf(createSiteEnvFor('mobile', false, mine))).toBe(844);
  });

  it('is nothing on a published page, which is the browser answering', () => {
    /* `100dvh` there, and the board's substitution nowhere in the file a visitor gets. */
    expect(screenOf(createSiteEnvFor('desktop', true))).toBeUndefined();
  });

  it('is nothing for a host that says no width at all', () => {
    // A drawing with no site env is every other product's drawing, and it says nothing about screens.
    expect(screenOf(undefined)).toBeUndefined();
    expect(screenOf({})).toBeUndefined();
  });
});
