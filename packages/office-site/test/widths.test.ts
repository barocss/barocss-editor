import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import { createSiteEditor } from '../src/site-kit';
import { getSiteSchemaDefinition } from '../src/site-schema';
import { createSampleSite } from '../src/sample-site';
import { BREAKPOINTS, baseOf, overridableIn, scopesFor, widthsOf } from '../src/breakpoints';
import { attrsAt, attrsThrough, overridesOf } from '../src/responsive';
import { DEVICES, deviceMatches, deviceNamed } from '../src/devices';

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
