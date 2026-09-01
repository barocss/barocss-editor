import { describe, it, expect, beforeAll } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import { createSiteEditor } from '../src/site-kit';
import { getSiteSchemaDefinition } from '../src/site-schema';
import { registerSiteRenderers } from '../src/renderers';
import { createSampleSite } from '../src/sample-site';
import { pagesOf } from '../src/selection';
import { closerScript, drawnHtml, exportPage } from '../src/export-html';
import { documentFaults } from '../src/faults';
import {
  answerNameOf,
  formFaults,
  hiddenFields,
  inputTypeOf,
  needsUpload,
  serviceNamed,
  servicesOf
} from '../src/form';

/**
 * **A form**: what a visitor sends, and where it goes.
 *
 * The one block on an ordinary site with no node behind it, and the first thing in this product
 * whose point is not what it *looks* like: a form drawn perfectly and pointed nowhere is identical on
 * screen to one that works, right up until somebody presses 보내기 and nobody ever hears from them.
 * So half of what is worth testing here is about the document rather than the drawing.
 */
describe('what a visitor sends', () => {
  it('calls the answer what the person reading the messages will see', () => {
    // Not the label: they get `email`, not 이메일 주소.
    expect(answerNameOf({ name: 'email', label: '이메일 주소' })).toBe('email');
    expect(answerNameOf({ label: 'Your email' })).toBe('your-email');
    /*
     * And a Korean label has nothing usable in it — a name travels in a form encoding and would
     * arrive percent-encoded as somebody's spreadsheet column heading. So it falls back to where the
     * field sits, which is ugly and unique, rather than to something pretty and repeated.
     */
    expect(answerNameOf({ label: '하고 싶은 말' }, 2)).toBe('field-3');
  });

  it('asks the browser its own question about what kind of answer it is', () => {
    // `type="email"` is a phone showing the right keyboard and a browser checking the address for
    // free — neither of which a `text` box styled to look like an email field gets.
    expect(inputTypeOf('email')).toBe('email');
    expect(inputTypeOf('tel')).toBe('tel');
    expect(inputTypeOf('paragraph')).toBe('text');
  });

  it('says a form that goes nowhere is wrong, because the screen cannot', () => {
    const fields = [{ label: '이름', kind: 'text' }, { kind: 'submit' }];
    const post: any = { sid: 's', name: '문의함', endpoint: 'https://example.com/f', method: 'post' };
    expect(formFaults({ sends: '문의함' }, fields, post)).toEqual([]);

    // Nothing chosen: a reader who has not finished.
    expect(formFaults({}, fields)[0]).toContain('보낼 곳을 고르지 않았습니다');
    /*
     * And a name that points at nothing, which is a **different** fault worth telling apart: somebody
     * removed the connection out from under a form that still names it. The same shape as a link to a
     * page that was deleted, and just as invisible on screen.
     */
    expect(formFaults({ sends: '문의함' }, fields, undefined)[0]).toContain('연결이 없습니다');
    // Chosen, present, and with no address in it yet.
    expect(
      formFaults({ sends: '문의함' }, fields, { ...post, endpoint: '' })[0]
    ).toContain('주소가 없습니다');

    // No way to send: a form a visitor can fill in and cannot submit.
    expect(formFaults({ sends: '문의함' }, [{ kind: 'text', label: 'a' }], post)[0]).toContain(
      '보내기 단추'
    );
    // And two answers under one name, which is a message with one of them silently missing.
    expect(
      formFaults(
        { sends: '문의함' },
        [{ name: 'email', kind: 'text' }, { name: 'email', kind: 'text' }, { kind: 'submit' }],
        post
      ).join(' ')
    ).toContain('두 번');
  });
});

describe('a form on a page', () => {
  let editor: any;
  let store: DataStore;
  let home: string;
  let made: string;

  beforeAll(async () => {
    registerSiteRenderers();
    const schema = createSchema('site', getSiteSchemaDefinition());
    store = new DataStore(undefined as never, schema as never);
    editor = createSiteEditor({ editable: true, schema, dataStore: store } as never);
    editor.loadDocument(createSampleSite(), 'site');
    const doc = { rootId: editor.getRootId(), getNode: (sid: string) => store.getNode(sid) };
    home = pagesOf(doc as never)[0].sid;

    const before = new Set(((store.getNode(home) as any).content ?? []) as string[]);
    await editor.executeCommand('insertForm', { pageId: home });
    made = (((store.getNode(home) as any).content ?? []) as string[]).find((sid) => !before.has(sid))!;
  });

  it('arrives with a connection, and the connection arrives empty', () => {
    /*
     * Two nodes and one undo: a form, and the place its answers go. The address is the one thing only
     * a reader can supply — there is no default destination and none of this product's own — so it is
     * left blank and *reported*, rather than the form looking finished and sending into nothing.
     *
     * The sample already has a connection, so this form points at **that** one rather than minting a
     * second: five forms on a site are five references to one address, which is the whole reason the
     * address is not on the form.
     */
    expect((store.getNode(made) as any).attributes.sends).toBe('문의함');

    const doc = { rootId: editor.getRootId(), getNode: (sid: string) => store.getNode(sid) };
    // Clean, because the sample's connection has an address in it.
    expect(documentFaults(doc as never, {}).filter((one) => one.kind === 'form')).toEqual([]);
  });

  it('reports the form when the connection it names has no address', async () => {
    await editor.executeCommand('setServiceInfo', { name: '문의함', endpoint: '' });
    const doc = { rootId: editor.getRootId(), getNode: (sid: string) => store.getNode(sid) };
    const faults = documentFaults(doc as never, {}).filter((one) => one.kind === 'form');
    // Every form that names it, because that is what a shared address means.
    expect(faults.length).toBeGreaterThan(0);
    expect(faults[0].said).toContain('주소가 없습니다');
    await editor.executeCommand('setServiceInfo', {
      name: '문의함',
      endpoint: 'https://formspree.io/f/your-id'
    });
  });

  it('draws a label a visitor keeps, rather than one that vanishes as they type', () => {
    const html = drawnHtml(editor, home);
    // A real `<label for>` above the control. Labelling with the placeholder is the commonest
    // accessibility fault on the web, and the words go the moment somebody types.
    expect(html).toMatch(/<label class="st-label" for="f-[^"]+"[^>]*>이름<\/label>/);
    // The browser's own question about what kind of answer it is: a phone shows the right keyboard
    // and the address is checked for free.
    expect(html).toContain('type="email"');
    expect(html).toContain('<textarea');
  });

  it('reaches the visitor as a form a browser knows what to do with', async () => {
    await editor.executeCommand('setServiceInfo', { name: '문의함', endpoint: 'https://example.com/f' });

    const html = exportPage(editor, home).html;
    // Resolved from the name at the moment it is published: one address, however many forms.
    expect(html).toContain('action="https://example.com/f"');
    expect(html).toContain('method="post"');
    // A real submit, so the Enter key sends it and a keyboard can reach the end of the form.
    expect(html).toMatch(/<button[^>]*type="submit"/);
    expect(html).not.toContain('disabled');
    expect(html).not.toContain('readonly');
    // And still no script anywhere: a form that works on a page whose JavaScript failed.
    expect(html).not.toContain('<script');
  });

  it('does not let a form hold another form, which a browser would not keep', () => {
    /*
     * The HTML parser moves an inner `<form>` out and leaves an empty one behind, so what is in the
     * document stops being what is on the page. Refused by the schema rather than by a comment —
     * `every-drawing-keeps-its-children` reported it the minute the node existed.
     */
    const inside = ((store.getNode(made) as any).content ?? []) as string[];
    expect(inside.length).toBeGreaterThan(0);
    expect(
      editor.dataStore.schema?.canContain?.('form', 'form') ??
        getSiteSchemaDefinition().nodes.form.content.includes('form')
    ).toBeFalsy();
  });
});

/**
 * **The picture a shared link shows** — the last thing missing from the head, and the half of an
 * unfurl anybody actually looks at.
 *
 * A title and a description with no image is the card a chat draws as two lines of grey text. The
 * rule worth holding is not that the tag is written but that it is **absolute or absent**: Open
 * Graph will not take a relative address, and a tag that is present and wrong is worse than one that
 * is missing, because nothing ever reports it.
 */
describe('what a shared link shows', () => {
  const site = () => {
    registerSiteRenderers();
    const schema = createSchema('site', getSiteSchemaDefinition());
    const store = new DataStore(undefined as never, schema as never);
    const editor: any = createSiteEditor({ editable: true, schema, dataStore: store } as never);
    editor.loadDocument(createSampleSite(), 'site');
    const doc = { rootId: editor.getRootId(), getNode: (sid: string) => store.getNode(sid) };
    return { editor, store, home: pagesOf(doc as never)[0].sid };
  };

  it('writes the picture, and the card size that stops it being a thumbnail', async () => {
    const { editor, home } = site();
    await editor.executeCommand('setPageInfo', {
      nodeId: home,
      image: 'https://example.com/hero.png'
    });
    const html = exportPage(editor, home).html;
    expect(html).toContain('<meta property="og:image" content="https://example.com/hero.png">');
    // Without this, X draws the small square thumbnail whatever the picture is.
    expect(html).toContain('name="twitter:card" content="summary_large_image"');
  });

  it('joins a relative one onto the site’s address, and refuses it without one', async () => {
    const { editor, store, home } = site();
    await editor.executeCommand('setPageInfo', { nodeId: home, image: '/share.png' });

    // No site address: no tag at all, rather than one a crawler cannot resolve.
    expect(exportPage(editor, home).html).not.toContain('og:image');

    await editor.executeCommand('setSiteAddress', { address: 'https://barocss.com' });
    expect(exportPage(editor, home).html).toContain(
      '<meta property="og:image" content="https://barocss.com/share.png">'
    );
    void store;
  });
});

/**
 * **The one line of script this product ships**, and the pages that do not get it.
 *
 * A visitor on a phone opens the menu and taps a link. To another page it closes for free — the next
 * page is a new document and the checkbox starts unchecked. To an **anchor on the same page** it does
 * not: nothing navigates, so nothing resets, and the menu stays over the section they just asked for.
 *
 * There is no CSS answer. A `<label>` around the link does not fire (HTML skips label activation when
 * the click lands on interactive content), `:target` goes on matching so the hamburger cannot reopen
 * the menu, and a second switch is two controls for one gesture. So: one line, and only where the two
 * things that need it are both on the page.
 */
describe('closing a menu a visitor tapped through', () => {
  const host = (html: string): HTMLElement => {
    const el = document.createElement('div');
    el.innerHTML = html;
    return el;
  };

  it('ships nothing at all on a page that has no reason for it', () => {
    // Neither half.
    expect(closerScript(host('<a href="/제품">제품</a>'))).toBe('');
    // An opener and no same-page link — which is every page of the sample.
    expect(closerScript(host('<input class="st-open-switch"><a href="/제품">제품</a>'))).toBe('');
  });

  it('ships it when a page has both, and it is one listener', () => {
    const said = closerScript(host('<input class="st-open-switch"><a href="#가격">가격</a>'));
    expect(said).toContain('addEventListener');
    expect(said).toContain('st-open-switch:checked');
    // Not a runtime: one event, one line, and nothing else on the page depends on it.
    expect(said.split('addEventListener')).toHaveLength(2);
    expect(said.length).toBeLessThan(300);
  });

  it('leaves the sample with no script in it, which is the point of the guard', () => {
    const { editor, home } = (() => {
      registerSiteRenderers();
      const schema = createSchema('site', getSiteSchemaDefinition());
      const store = new DataStore(undefined as never, schema as never);
      const one: any = createSiteEditor({ editable: true, schema, dataStore: store } as never);
      one.loadDocument(createSampleSite(), 'site');
      const doc = { rootId: one.getRootId(), getNode: (sid: string) => store.getNode(sid) };
      return { editor: one, home: pagesOf(doc as never)[0].sid };
    })();

    // Five pages, a hamburger, a menu, an accordion's worth of switches — and no `<script>`.
    expect(exportPage(editor, home).html).not.toContain('<script');
  });
});

/**
 * **Where the answers go** — a connection with a name on it, not an address on the form.
 *
 * The fourth reference of the shape this schema uses everywhere: `var:이름` for a colour,
 * `componentId` for a card, a dataset's `name` for rows, and now this. The argument is the same one
 * each time and it is not tidiness — a site with five forms had five copies of one address, so
 * changing services meant finding all five, and the one that was missed goes on posting to an
 * endpoint nobody reads. Silently, because a form that posts somewhere wrong looks exactly like a
 * form that works.
 */
describe('where the answers go', () => {
  const site = () => {
    registerSiteRenderers();
    const schema = createSchema('site', getSiteSchemaDefinition());
    const store = new DataStore(undefined as never, schema as never);
    const editor: any = createSiteEditor({ editable: true, schema, dataStore: store } as never);
    editor.loadDocument(createSampleSite(), 'site');
    const doc = { rootId: editor.getRootId(), getNode: (sid: string) => store.getNode(sid) };
    return { editor, store, doc, pages: pagesOf(doc as never) };
  };

  it('keeps the address once, however many forms name it', async () => {
    const { editor, doc, pages } = site();

    // A second form, on a different page from the sample's own.
    await editor.executeCommand('insertForm', { pageId: pages[0].sid });
    expect(servicesOf(doc as never)).toHaveLength(1);

    /*
     * One edit, and **both** pages publish the new address. That is the whole of what the name buys,
     * and it is the thing an address-per-form cannot do at all.
     */
    await editor.executeCommand('setServiceInfo', { name: '문의함', endpoint: 'https://x.test/f' });
    for (const page of [pages[0].sid, pages[3].sid]) {
      expect(exportPage(editor, page).html).toContain('action="https://x.test/f"');
    }
  });

  it('publishes no action at all when the connection has no address', async () => {
    const { editor, pages } = site();
    await editor.executeCommand('setServiceInfo', { name: '문의함', endpoint: '' });

    /*
     * Not `action=""`, which a browser resolves to **this page** — so pressing 보내기 would reload
     * the page and look for all the world like the message went somewhere.
     */
    const html = exportPage(editor, pages[3].sid).html;
    expect(html).toContain('st-form');
    expect(html).not.toContain('action=');
  });

  it('is found by name, and answers with nothing for a name that is not there', () => {
    const { doc } = site();
    expect(serviceNamed(doc as never, '문의함')?.method).toBe('post');
    expect(serviceNamed(doc as never, '없는 것')).toBeUndefined();
    expect(serviceNamed(doc as never, undefined)).toBeUndefined();
  });
});

/**
 * **The browser's own form, finished** — and the visitor coming back.
 *
 * Most of a form feature is the browser's: `type="email"` is a phone showing the right keyboard and
 * an address checked before anything is sent, a `<select>` is a list that cannot be misspelled, and a
 * `required` tick is consent given rather than assumed. All of it runs with scripts off, in the
 * visitor's own language, and it is what makes insisting on a real `<form>` worth the trouble.
 */
describe('what a form can ask', () => {
  const published = () => {
    registerSiteRenderers();
    const schema = createSchema('site', getSiteSchemaDefinition());
    const store = new DataStore(undefined as never, schema as never);
    const editor: any = createSiteEditor({ editable: true, schema, dataStore: store } as never);
    editor.loadDocument(createSampleSite(), 'site');
    const doc = { rootId: editor.getRootId(), getNode: (sid: string) => store.getNode(sid) };
    const about = pagesOf(doc as never).find((one: any) => one.id === 'about')!;
    return { editor, doc, html: exportPage(editor, about.sid).html };
  };

  it('draws a list a visitor cannot misspell, unanswered until they choose', () => {
    const { html } = published();
    expect(html).toContain('<select');
    expect(html).toContain('<option value="도입 문의"');
    /*
     * An **empty first option**, which is the half that matters: without it a browser reports the
     * first entry as the answer and every message arrives saying whatever happened to be at the top
     * — a `required` list that is never actually unanswered.
     */
    expect(html).toMatch(/<option value=""[^>]*>[^<]*<\/option>\s*<option value="도입 문의"/);
  });

  it('puts the tick’s words after its box, and lets a visitor click them', () => {
    const { html } = published();
    /*
     * Every other field is a question with a box under it; a tick is a statement with a box in front
     * of it. And it is the one field whose label a visitor **clicks**, which wrapping buys and
     * pointing at does not: a 14-pixel target becomes the whole sentence.
     */
    expect(html).toMatch(/<label class="st-field st-tick[^"]*"[^>]*>\s*<input[^>]*type="checkbox"/);
    expect(html).toContain('개인정보 수집에 동의합니다');
    // Consent given rather than assumed — which in Korea is not a preference.
    expect(html).toMatch(/type="checkbox"[^>]*required/);
  });

  it('hands the browser the limits, and never a regular expression', () => {
    const { html } = published();
    expect(html).toContain('maxlength="2000"');
    /*
     * `pattern` is deliberately absent: it is a language a reader has to learn and cannot debug, and
     * this schema turned that down once already when a list's filter became `where` + `equals`. A
     * pattern worth having is a **kind**.
     */
    expect(html).not.toContain('pattern=');
  });

  it('reports a list with nothing to choose from', () => {
    // The same shape as a form with no destination: correct on screen, useless in the world.
    const said = formFaults(
      { sends: 'x' },
      [{ label: '무엇에 대해', kind: 'choice' }, { kind: 'submit' }],
      { sid: 's', name: 'x', endpoint: 'https://e', method: 'post' } as never
    );
    expect(said.join(' ')).toContain('고를 것이 없습니다');
  });
});

describe('what happens after it is sent', () => {
  const site = () => {
    registerSiteRenderers();
    const schema = createSchema('site', getSiteSchemaDefinition());
    const store = new DataStore(undefined as never, schema as never);
    const editor: any = createSiteEditor({ editable: true, schema, dataStore: store } as never);
    editor.loadDocument(createSampleSite(), 'site');
    const doc = { rootId: editor.getRootId(), getNode: (sid: string) => store.getNode(sid) };
    return { editor, doc, about: pagesOf(doc as never).find((one: any) => one.id === 'about')!.sid };
  };

  it('brings the visitor back to this site rather than the service’s page', async () => {
    const { editor, about } = site();

    /*
     * **Absolute, or not at all.** A service redirecting a browser has no page to resolve a relative
     * address against — the same rule `og:url` and `og:image` follow. A site that has not said where
     * it lives publishes no return rather than one that sends somebody nowhere.
     */
    expect(exportPage(editor, about).html).not.toContain('_next');

    await editor.executeCommand('setSiteAddress', { address: 'https://barocss.com' });
    const html = exportPage(editor, about).html;
    expect(html).toMatch(/<input type="hidden" name="_next" value="https:\/\/barocss\.com\/"/);
  });

  it('ships the trap empty, which is the whole mechanism', async () => {
    const { editor, about } = site();
    await editor.executeCommand('setSiteAddress', { address: 'https://barocss.com' });
    // A person never sees it and never fills it; a form-filler that fills every input marks itself.
    expect(exportPage(editor, about).html).toMatch(/<input type="hidden" name="_gotcha" value=""/);
  });

  it('is the service’s vocabulary, said once for the whole site', async () => {
    const { editor, doc, about } = site();
    await editor.executeCommand('setSiteAddress', { address: 'https://barocss.com' });
    await editor.executeCommand('setServiceInfo', { name: '문의함', returnField: '_redirect' });

    // `_next`, `_redirect`, `_returnUrl` — every service spells it differently, which is exactly why
    // it is on the connection rather than on each form.
    expect(exportPage(editor, about).html).toContain('name="_redirect"');
    expect(serviceNamed(doc as never, '문의함')?.returnField).toBe('_redirect');
  });

  it('is nothing at all when the service says nothing', () => {
    /*
     * Asked of `hiddenFields` rather than of a drawing, because `drawnHtml` is the **export's** own
     * drawing and therefore already the published side. That a board ships none of this is the same
     * `published` flag the form's `action` uses, held in the browser suite where there is a board.
     */
    expect(hiddenFields(undefined, 'https://x')).toEqual([]);
    expect(hiddenFields({ name: 'x', method: 'post' } as never, 'https://x')).toEqual([]);
    // A return with nowhere to return **to** is left out rather than published empty: a service
    // handed an empty `_next` either ignores it or redirects to nothing, and neither is debuggable.
    expect(hiddenFields({ name: 'x', method: 'post', returnField: '_next' } as never)).toEqual([]);
  });
});

/**
 * **A file, and the one thing a form has to say differently because of it.**
 *
 * Every other field kind changes only itself. A file changes the *form*: a browser sends one as
 * `application/x-www-form-urlencoded` unless told otherwise, and that encoding cannot carry a file —
 * so a form with a file field and no `enctype` sends every other answer and **silently drops the
 * attachment**. Nothing errors, nothing is logged, and the person who attached it has no idea.
 */
describe('a form that asks for a file', () => {
  const asking = (kind: string) => ({ kind, name: '무엇' });

  it('is the browser’s own file input', () => {
    expect(inputTypeOf('file')).toBe('file');
  });

  it('says the form has to be encoded for it, and only then', () => {
    expect(needsUpload([asking('file'), asking('text')])).toBe(true);
    // Every form already published is byte-for-byte what it was.
    expect(needsUpload([asking('text'), asking('email'), asking('checkbox')])).toBe(false);
    expect(needsUpload([])).toBe(false);
  });

  /**
   * And the half this product **cannot** check, said out loud rather than guessed.
   *
   * Whether the address at the far end accepts `multipart/form-data` is a fact about somebody else's
   * service. A builder that assumed it does would be telling a reader their form works while the
   * file is dropped at the far end — which is this fault list's whole subject: a thing that looks
   * completely fine and loses the one answer that mattered.
   */
  it('asks the reader to check the connection takes one', () => {
    const said = formFaults(
      { sends: '문의함' },
      [asking('file'), { kind: 'submit', name: '보내기' }],
      { name: '문의함', label: '문의함', endpoint: 'https://example.test/f', method: 'post', sid: 's' } as never
    );
    expect(said.some((one) => one.includes('multipart/form-data'))).toBe(true);
  });

  it('says nothing about a form with no file in it', () => {
    const said = formFaults(
      { sends: '문의함' },
      [asking('text'), { kind: 'submit', name: '보내기' }],
      { name: '문의함', label: '문의함', endpoint: 'https://example.test/f', method: 'post', sid: 's' } as never
    );
    expect(said.some((one) => one.includes('multipart/form-data'))).toBe(false);
  });
});
