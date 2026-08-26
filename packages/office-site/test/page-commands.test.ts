import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import { createSiteEditor } from '../src/site-kit';
import { getSiteSchemaDefinition } from '../src/site-schema';
import { createSampleSite } from '../src/sample-site';
import { pagesOf } from '../src/selection';
import { linkFaults } from '../src/page-link';

/**
 * The four things a reader could not do to a page.
 *
 * Make one, copy one, move one, take one away — and until this file existed, none of them. The
 * sample's five pages are five pages because `sample-site.ts` wrote them in TypeScript, which is the
 * same finding the datasets produced and the same shape: the *view* was finished against a document
 * only a developer could change.
 *
 * Each is checked for what it did **and** for undoing cleanly, following the deck's suite, because
 * that is what a command can silently fail at: `transaction` collects the operations' inverses and
 * *is* undo, so a command assembled out of an operation that declines to say how to undo it reports
 * success and leaves the reader unable to take it back.
 */
describe('the commands a page has', () => {
  let editor: any;
  let store: DataStore;

  const doc = () => ({ rootId: editor.getRootId(), getNode: (sid: string) => store.getNode(sid) });
  const pages = () => pagesOf(doc() as never);
  const names = () => pages().map((page) => page.name);
  const run = async (name: string, payload?: Record<string, unknown>) =>
    await editor.executeCommand(name, payload);
  const can = (name: string, payload?: Record<string, unknown>) => editor.canExecuteCommand(name, payload);

  /** What a page holds, by node type — which is how "the header came with it" is asked. */
  const shapeOf = (sid: string) =>
    (((store.getNode(sid) as any)?.content ?? []) as string[]).map((child) => (store.getNode(child) as any)?.stype);

  beforeEach(() => {
    const schema = createSchema('site', getSiteSchemaDefinition());
    store = new DataStore(undefined as never, schema as never);
    editor = createSiteEditor({ editable: true, schema, dataStore: store } as never);
    editor.loadDocument(createSampleSite(), 'site');
  });

  describe('making one', () => {
    it('puts it after the page it follows, with an address nothing else has', async () => {
      const [, products] = pages();
      expect(await run('insertPage', { nodeId: products.sid })).toBe(true);

      expect(names()).toEqual(['홈', '제품', '페이지 6', '가격', '소개', '블로그']);
      const made = pages()[2];
      expect(made.path).toBe('/page-6');
      expect(new Set(pages().map((page) => page.id)).size).toBe(6);
      expect(new Set(pages().map((page) => page.path)).size).toBe(6);
    });

    it('appends when nothing is named, which is where a reader is looking', async () => {
      expect(await run('insertPage')).toBe(true);
      expect(names()[5]).toBe('페이지 6');
    });

    it('arrives wearing the navigation of the page it follows', async () => {
      // A placement, so the new page **follows the same definition** rather than a copy of it:
      // editing the header still changes every page, including this one.
      await run('insertPage', { nodeId: pages()[0].sid });
      const made = pages()[1];

      expect(shapeOf(made.sid)).toEqual(['instance', 'heading', 'instance']);
      const [head] = (store.getNode(made.sid) as any).content;
      expect((store.getNode(head) as any).attributes.componentId).toBe('site-header');
    });

    it('has somewhere to type, because an empty page is legal and useless', async () => {
      await run('insertPage');
      const made = pages()[5];
      const heading = (store.getNode(made.sid) as any).content.find(
        (sid: string) => (store.getNode(sid) as any).stype === 'heading'
      );
      expect((store.getNode(heading) as any).attributes.level).toBe(1);
    });

    it('is one thing to undo', async () => {
      await run('insertPage');
      await editor.undo();
      expect(names()).toEqual(['홈', '제품', '가격', '소개', '블로그']);
    });
  });

  describe('copying one', () => {
    it('keeps the words and mints an identity, because a link resolves through the id', async () => {
      const [, products] = pages();
      expect(await run('duplicatePage', { nodeId: products.sid })).toBe(true);

      const copy = pages()[2];
      expect(copy.name).toBe('제품 사본');
      expect(copy.path).toBe('/제품-2');
      /*
       * The **id** is the one thing a copy must not keep. Two pages with one id is a link that goes
       * to whichever comes first, which is a link that works and points at the wrong page — the
       * failure this whole reference pattern exists to avoid.
       */
      expect(copy.id).not.toBe(products.id);
      expect(new Set(pages().map((page) => page.id)).size).toBe(6);
    });

    it('copies the contents, marks and all', async () => {
      await run('duplicatePage', { nodeId: pages()[0].sid });
      const copy = pages()[1];

      expect(shapeOf(copy.sid)).toEqual(shapeOf(pages()[0].sid));

      /*
       * And the copy's own words keep **what covers them** — which `copyOf` did not do until a
       * duplicated slide came back with its title in the wrong weight. The home page colours a
       * sentence of its hero, and that is the mark being followed here.
       *
       * The navigation is deliberately *not* what this asks about: those links live in the
       * `site-header` **definition**, and the page holds a placement of it. A copied page follows
       * the same definition rather than a copy of it, which is why editing the header still changes
       * every page — including this one.
       */
      expect(markedIn(copy.sid).map((one) => one.text)).toEqual(markedIn(pages()[0].sid).map((one) => one.text));
      expect(markedIn(copy.sid).length).toBeGreaterThan(0);
      expect(markedIn(copy.sid)[0].marks).toEqual(markedIn(pages()[0].sid)[0].marks);
    });

    it('is one thing to undo', async () => {
      await run('duplicatePage', { nodeId: pages()[0].sid });
      await editor.undo();
      expect(names()).toEqual(['홈', '제품', '가격', '소개', '블로그']);
    });
  });

  describe('taking one away', () => {
    it('removes the page and everything on it', async () => {
      const [, products] = pages();
      expect(await run('removePage', { nodeId: products.sid })).toBe(true);
      expect(names()).toEqual(['홈', '가격', '소개', '블로그']);
    });

    it('says what it broke, rather than refusing', async () => {
      /*
       * Removing a page breaks the links into it either way, and a command that refused would leave
       * a reader hunting for links to delete before they could delete a page. So the answer is a
       * report: every page of the sample links to 제품, and after it is gone every one of those says
       * so — which is the whole reason `linkFaults` exists.
       */
      expect(linkFaults(doc() as never)).toEqual([]);
      await run('removePage', { nodeId: pages()[1].sid });

      const faults = linkFaults(doc() as never);
      expect(faults.length).toBeGreaterThan(0);
      expect(new Set(faults.map((one) => one.missing))).toEqual(new Set(['products']));
    });

    it('refuses the last page, which is a document this product cannot draw', async () => {
      for (const page of pages().slice(1)) await run('removePage', { nodeId: page.sid });
      expect(names()).toEqual(['홈']);

      expect(can('removePage', { nodeId: pages()[0].sid })).toBe(false);
      expect(await run('removePage', { nodeId: pages()[0].sid })).toBe(false);
      expect(names()).toEqual(['홈']);
    });

    it('is one thing to undo, with the page’s contents intact', async () => {
      const before = shapeOf(pages()[1].sid);
      await run('removePage', { nodeId: pages()[1].sid });
      await editor.undo();

      expect(names()).toEqual(['홈', '제품', '가격', '소개', '블로그']);
      expect(shapeOf(pages()[1].sid)).toEqual(before);
    });
  });

  describe('reordering', () => {
    it('moves a page to the position asked for', async () => {
      expect(await run('movePage', { nodeId: pages()[3].sid, to: 0 })).toBe(true);
      expect(names()).toEqual(['소개', '홈', '제품', '가격', '블로그']);
    });

    it('refuses a move that changes nothing, and one that goes nowhere', () => {
      const [home] = pages();
      // An edit that undoes to the same document is an entry in the history a reader cannot see the
      // point of pressing Ctrl+Z over.
      expect(can('movePage', { nodeId: home.sid, to: 0 })).toBe(false);
      expect(can('movePage', { nodeId: home.sid, to: 5 })).toBe(false);
      expect(can('movePage', { nodeId: home.sid, to: -1 })).toBe(false);
      expect(can('movePage', { nodeId: home.sid, to: 1.5 })).toBe(false);
    });

    it('is one thing to undo', async () => {
      await run('movePage', { nodeId: pages()[3].sid, to: 0 });
      await editor.undo();
      expect(names()).toEqual(['홈', '제품', '가격', '소개', '블로그']);
    });
  });

  describe('what is not a page', () => {
    it('refuses a block, a definition and a sid that is nothing', () => {
      const block = ((store.getNode(pages()[0].sid) as any).content ?? [])[1];
      for (const command of ['duplicatePage', 'removePage']) {
        expect(can(command, { nodeId: block })).toBe(false);
        expect(can(command, { nodeId: 'site:없음' })).toBe(false);
        expect(can(command, {})).toBe(false);
      }
    });
  });

  /** Every run under a page that carries a mark, in document order. */
  function markedIn(sid: string): any[] {
    const found: any[] = [];
    const walk = (one: string) => {
      const node = store.getNode(one) as any;
      if (!node) return;
      if (Array.isArray(node.marks) && node.marks.length > 0) found.push(node);
      for (const child of node.content ?? []) if (typeof child === 'string') walk(child);
    };
    walk(sid);
    return found;
  }
});
