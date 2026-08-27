import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import { createSiteEditor } from '../src/site-kit';
import { getSiteSchemaDefinition } from '../src/site-schema';
import { createSampleSite } from '../src/sample-site';
import { definitionsOf } from '../src/components';
import { pagesOf } from '../src/selection';

/**
 * Renaming and removing one of a component's **variables**.
 *
 * `bindPartText` gave a template the half a reader needs to grow a card: name a variable that does
 * not exist and it is declared, name one that does and the part binds to it. The other half was hand
 * work — a variable could be created and then never renamed, retyped or taken away — so a card was
 * stuck with whatever its author called things the first time, and a typo in a name was permanent.
 *
 * ## Why both are one blast radius
 *
 * A variable's name is written down in **three** places and only one of them is the declaration:
 *
 * - the `componentVar` on the definition,
 * - every `componentBind` in the definition that says which part takes it,
 * - and a `componentValue` in **every placement**, on every page, including the template instance a
 *   data list draws once per row.
 *
 * Rename any two of those and the third goes on naming something that no longer exists — the parts
 * fall back to the definition's own words and every placement quietly loses its answer. Which is why
 * this is a command rather than four panel writes: the three have to move in one transaction, so one
 * undo puts them all back.
 */
describe('renaming and removing a component variable', () => {
  let editor: any;
  let store: DataStore;
  let doc: any;

  const run = async (command: string, payload?: unknown) => await editor.executeCommand(command, payload);
  const can = (command: string, payload?: unknown) => editor.canExecuteCommand(command, payload);
  const attrs = (sid: string) => ((store.getNode(sid) as any)?.attributes ?? {}) as Record<string, any>;

  /** The definition the sample calls `product-card`, and the parts inside it. */
  const card = () => definitionsOf(doc).find((one) => one.id === 'product-card')!;

  /** Every node of a kind inside the definition, as `{ sid, attributes }`. */
  const kids = (stype: string) =>
    ((store.getNode(card().sid) as any).content ?? [])
      .filter((sid: unknown): sid is string => typeof sid === 'string')
      .map((sid: string) => ({ sid, ...(store.getNode(sid) as any) }))
      .filter((one: any) => one.stype === stype);

  /** Every answer any placement anywhere gives, whatever page it is on. */
  const answersEverywhere = (): { sid: string; name: string; value: string }[] => {
    const out: { sid: string; name: string; value: string }[] = [];
    const walk = (sid: string, depth = 0) => {
      if (depth > 64) return;
      const node = store.getNode(sid) as any;
      if (!node) return;
      if (node.stype === 'componentValue') {
        out.push({ sid, name: String(node.attributes?.name ?? ''), value: String(node.attributes?.value ?? '') });
      }
      for (const child of (node.content ?? []) as unknown[]) if (typeof child === 'string') walk(child, depth + 1);
    };
    walk(editor.getRootId());
    return out;
  };

  /** A part inside the card, which is what a reader has selected when this row is offered. */
  const partIn = (partId: string): string => {
    let found = '';
    const walk = (sid: string, depth = 0) => {
      if (found || depth > 64) return;
      const node = store.getNode(sid) as any;
      if (!node) return;
      if (node.attributes?.partId === partId) found = sid;
      for (const child of (node.content ?? []) as unknown[]) if (typeof child === 'string') walk(child, depth + 1);
    };
    walk(card().sid);
    return found;
  };

  beforeEach(() => {
    const schema = createSchema('site', getSiteSchemaDefinition());
    store = new DataStore(undefined as never, schema as never);
    editor = createSiteEditor({ editable: true, schema, dataStore: store } as never);
    editor.loadDocument(createSampleSite(), 'site');
    doc = { rootId: editor.getRootId(), getNode: (sid: string) => store.getNode(sid) };
  });

  it('starts from a card that asks three things, so a failure below is the command', () => {
    expect(card().asks).toEqual(['이름', '설명', '가격']);
    expect(kids('componentBind')).toHaveLength(3);
  });

  it('moves the declaration, every binding and every answer in one go', async () => {
    const answered = answersEverywhere().filter((one) => one.name === '이름');
    // The sample places this card, so there is something to break.
    expect(answered.length).toBeGreaterThan(0);

    expect(await run('setComponentVar', { nodeId: partIn('p-name'), name: '이름', rename: '상품명' })).toBe(true);

    expect(card().asks).toEqual(['상품명', '설명', '가격']);
    expect(kids('componentBind').find((one: any) => one.attributes.part === 'p-name').attributes.var).toBe('상품명');
    // And the answers, wherever they are — a placement still naming `이름` would be a placement
    // answering a question nobody is asking, drawn as the definition's own fallback words.
    expect(answersEverywhere().filter((one) => one.name === '이름')).toHaveLength(0);
    expect(answersEverywhere().filter((one) => one.name === '상품명')).toHaveLength(answered.length);
  });

  it('keeps what each placement actually said, which is the point of moving them', async () => {
    const before = answersEverywhere()
      .filter((one) => one.name === '이름')
      .map((one) => one.value)
      .sort();
    await run('setComponentVar', { nodeId: partIn('p-name'), name: '이름', rename: '상품명' });

    const after = answersEverywhere()
      .filter((one) => one.name === '상품명')
      .map((one) => one.value)
      .sort();
    expect(after).toEqual(before);
  });

  it('is one entry in the history, because it is one thing a reader did', async () => {
    await run('setComponentVar', { nodeId: partIn('p-name'), name: '이름', rename: '상품명' });
    await run('undo');

    expect(card().asks).toEqual(['이름', '설명', '가격']);
    expect(kids('componentBind').find((one: any) => one.attributes.part === 'p-name').attributes.var).toBe('이름');
    expect(answersEverywhere().filter((one) => one.name === '상품명')).toHaveLength(0);
  });

  it('refuses a name another variable already has, rather than merging two', async () => {
    // Two questions with one name is a card where the second silently answers the first. A reader
    // meaning to merge them is doing something else, and would have to say so.
    expect(can('setComponentVar', { nodeId: partIn('p-name'), name: '이름', rename: '설명' })).toBe(false);
    expect(can('setComponentVar', { nodeId: partIn('p-name'), name: '이름', rename: '  설명  ' })).toBe(false);
    // Its own name is not a clash: a reader retyping the same thing has changed nothing.
    expect(can('setComponentVar', { nodeId: partIn('p-name'), name: '이름', rename: '이름' })).toBe(true);
  });

  it('refuses an empty name, and a variable that is not there', async () => {
    expect(can('setComponentVar', { nodeId: partIn('p-name'), name: '이름', rename: '   ' })).toBe(false);
    expect(can('setComponentVar', { nodeId: partIn('p-name'), name: '없는변수', rename: '무엇' })).toBe(false);
    // And a node that is not inside a definition at all — a heading on a page is nobody's part.
    const page = pagesOf(doc)[0].sid;
    const block = ((store.getNode(page) as any).content ?? [])[0];
    expect(can('setComponentVar', { nodeId: block, name: '이름', rename: '무엇' })).toBe(false);
  });

  it('changes what kind of thing a variable is, without touching what was answered', async () => {
    const before = answersEverywhere().filter((one) => one.name === '가격');
    expect(await run('setComponentVar', { nodeId: partIn('p-price'), name: '가격', kind: 'number' })).toBe(true);

    const declared = kids('componentVar').find((one: any) => one.attributes.name === '가격');
    expect(declared.attributes.kind).toBe('number');
    /*
     * The values are untouched on purpose. A `componentValue` is a **string** whatever the kind — the
     * schema says so, and says why: the kind is the contract for how to read it, and one shape means
     * one thing to write and one thing to diff. Converting them here would be this command deciding
     * what `0원` means as a number, which is a question only the reader can answer.
     */
    expect(answersEverywhere().filter((one) => one.name === '가격')).toEqual(before);
  });

  it('takes a variable away, and every binding and answer with it', async () => {
    expect(await run('removeComponentVar', { nodeId: partIn('p-price'), name: '가격' })).toBe(true);

    expect(card().asks).toEqual(['이름', '설명']);
    expect(kids('componentBind').map((one: any) => one.attributes.var)).toEqual(['이름', '설명']);
    expect(answersEverywhere().filter((one) => one.name === '가격')).toHaveLength(0);
  });

  it('leaves the part it was bound to drawing its own words', async () => {
    const part = partIn('p-price');
    await run('removeComponentVar', { nodeId: part, name: '가격' });

    // Still there, still a block, and no longer answering to anything: a variable being removed is
    // not the part being removed, and a card that lost its price row would be a card a reader has to
    // rebuild to undo a rename they regretted.
    expect(store.getNode(part)).toBeTruthy();
    expect(attrs(part).partId).toBe('p-price');
  });

  it('is one entry in the history too', async () => {
    const before = answersEverywhere().filter((one) => one.name === '가격').length;
    await run('removeComponentVar', { nodeId: partIn('p-price'), name: '가격' });
    await run('undo');

    expect(card().asks).toEqual(['이름', '설명', '가격']);
    expect(kids('componentBind')).toHaveLength(3);
    expect(answersEverywhere().filter((one) => one.name === '가격')).toHaveLength(before);
  });

  it('refuses to remove a variable that is not there', () => {
    expect(can('removeComponentVar', { nodeId: partIn('p-price'), name: '없는변수' })).toBe(false);
    expect(can('removeComponentVar', { nodeId: partIn('p-price') })).toBe(false);
  });

  it('reaches the card a data list draws, which is a placement nothing selects', async () => {
    /*
     * The one placement a reader can never click: a list's template instance is what the list draws
     * once per row, so it is not on any page. Its answers are `field:칸` references rather than
     * words, and a rename that skipped them would break exactly the card this feature exists to let
     * a reader grow.
     */
    const inList = answersEverywhere().filter((one) => one.value.startsWith('field:'));
    expect(inList.length).toBeGreaterThan(0);

    const named = inList.find((one) => one.name === '이름')!;
    expect(named).toBeTruthy();
    await run('setComponentVar', { nodeId: partIn('p-name'), name: '이름', rename: '상품명' });

    // The same node, renamed in place — and still pointing at the same column.
    expect(attrs(named.sid).name).toBe('상품명');
    expect(attrs(named.sid).value).toBe(named.value);
  });
});
