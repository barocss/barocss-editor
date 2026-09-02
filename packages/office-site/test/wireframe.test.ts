import { describe, it, expect } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import { createSiteEditor } from '../src/site-kit';
import { getSiteSchemaDefinition } from '../src/site-schema';
import { createSampleSite } from '../src/sample-site';
import { pagesOf } from '../src/selection';
import {
  WIREFRAME_CSS,
  WIREFRAME_NAMES,
  wireframeCss,
  wireframeName,
  wireframeRules
} from '../src/wireframe';

/**
 * **와이어프레임 보기** — the same page with the finish taken off.
 *
 * Asked as a choice between two things and it is neither: a filter cannot say *what a thing is*, and
 * a separate editor is a second document to keep in step — which is the work that makes a plan and a
 * design drift apart. So it is a third **view**, generated from the document the way `editorStateCss`
 * and `revealRules` already are.
 *
 * What is worth checking here is not how it looks. It is the two claims underneath: that the sheet
 * **cannot escape the boards that asked for it**, and that the names come from the *model* rather
 * than from an attribute the renderer would have to start writing.
 */
describe('a page with the finish taken off', () => {
  const schema = createSchema('site', getSiteSchemaDefinition());
  const store = new DataStore(undefined as never, schema as never);
  const editor: any = createSiteEditor({ editable: true, schema, dataStore: store } as never);
  editor.loadDocument(createSampleSite(), 'site');
  const doc = { rootId: editor.getRootId(), getNode: (sid: string) => store.getNode(sid) };
  const pages = pagesOf(doc as never);

  it('says what a box is, in the reader’s words', () => {
    expect(wireframeName({ stype: 'form' })).toBe('폼');
    expect(wireframeName({ stype: 'collection' })).toBe('데이터 목록');
    expect(wireframeName({ stype: 'bTable' })).toBe('표');
    expect(wireframeName({ stype: 'codeBlock' })).toBe('코드');
  });

  it('reads an embed’s provider rather than guessing', () => {
    // 넣은 것 says nothing: a map is looked at and a video is played, and the document knows which.
    expect(wireframeName({ stype: 'mediaEmbed', attributes: { provider: 'youtube' } })).toBe('영상');
    expect(wireframeName({ stype: 'mediaEmbed', attributes: { provider: 'map' } })).toBe('지도');
  });

  it('names nothing a reader can already see', () => {
    /*
     * The list is for boxes that are unreadable once they are grey. A heading is still a heading with
     * its colour taken away, and a label on it is a word competing with the words it names.
     *
     * `instance` is in here because it was in the *other* list first and came straight back out on the
     * first look at a real page: a placement is the most common block on the sample — the nav bar,
     * both buttons in the hero, every card — so labelling it put 컴포넌트 on a dozen things at once,
     * including over the words on a button.
     */
    expect(wireframeName({ stype: 'instance' })).toBeUndefined();
    expect(wireframeName({ stype: 'heading' })).toBeUndefined();
    expect(wireframeName({ stype: 'frame' })).toBeUndefined();
    expect(wireframeName(undefined)).toBeUndefined();
  });

  it('cannot reach a board that did not ask for it', () => {
    /*
     * The claim that matters most, because the sheet is `!important` throughout — which it has to be,
     * since the boards are drawn with inline styles by design and nothing else beats one. A rule that
     * escaped its scope would repaint the editor's own chrome in grey and there would be no way to
     * turn it off.
     */
    // Comments first, or every rule that has one above it reads as a selector called `/*`.
    const naked = WIREFRAME_CSS.replace(/\/\*[\s\S]*?\*\//g, '');
    const selectors = naked
      .split('{')
      .slice(0, -1)
      .map((one) => one.split('}').pop()!.trim())
      .filter((one) => one.length > 0);
    expect(selectors.length).toBeGreaterThan(6);
    for (const one of selectors) {
      for (const each of one.split(',')) {
        expect(each.trim(), each).toMatch(/^\[data-wireframe='true'\]/);
      }
    }
  });

  it('washes a photograph rather than emptying it, so its box is the box', () => {
    /*
     * The claim a browser had to settle, and it settled it the other way round from how this file
     * was first written. `content: url(<a 1×1 svg>)` empties a replaced element beautifully — hatch,
     * label, the lot — and it **moves it**: the check that compared picture boxes before and after
     * found 266×199 become 225×225 and four 61×20 logos become 2×2, because replacing the content
     * replaces the intrinsic size every `width: auto` image is laid out from.
     *
     * A wireframe whose boxes are the wrong size is worse than one with no captions on its
     * photographs — it is a layout the reader does not have. So the media is washed: `contrast(0)`
     * makes one flat grey, and nothing a layout can see is touched at all.
     */
    for (const tag of ['img', 'video', 'iframe']) {
      expect(WIREFRAME_CSS, tag).toMatch(new RegExp(`\\b${tag} \\{[^}]*filter: grayscale\\(1\\) contrast\\(0\\)`));
    }
    expect(WIREFRAME_CSS).not.toMatch(/content: url/);
    // And nothing anywhere collapses a box or takes it out of the flow, which is the same claim.
    expect(WIREFRAME_CSS).not.toMatch(/display:\s*none/);
    expect(WIREFRAME_CSS).not.toMatch(/\bwidth:|\bheight:|\bmargin:|\bpadding:/);
  });

  it('names the boxes on the page it was asked about, and no others', () => {
    const home = pages[0].sid;
    const rules = wireframeRules(store as never, home);
    /*
     * The sample has a data list on the home page, a video on 제품, a table on 가격, a form on 소개 and
     * a code block on 블로그 — one of each, deliberately, which is what makes this readable as a claim
     * rather than as a count.
     */
    expect(rules).toContain("content: '데이터 목록'");
    expect(rules).not.toContain("content: '표'");
    expect(wireframeRules(store as never, pages[2].sid)).toContain("content: '표'");
    expect(wireframeRules(store as never, pages[3].sid)).toContain("content: '폼'");
  });

  it('positions the box it names, or the label lands on the page’s corner', () => {
    // A label is absolutely placed, so a box left `static` hands it to whatever ancestor happens to
    // be positioned — which is how a name ends up in the corner of the page instead of on the thing.
    const rules = wireframeRules(store as never, pages[3].sid);
    expect(rules).toMatch(/position: relative !important/);
    // Top **right**: content starts at the top left of almost every box, so a label there sits on the
    // first line of a form and the first cell of a table.
    expect(rules).toMatch(/::before \{ content: '폼'; position: absolute; right: 0; top: 0/);
  });

  it('is one sheet, and says nothing about a page with nothing to name', () => {
    const empty = wireframeCss(store as never, 'site:없는것');
    expect(empty).toContain(WIREFRAME_CSS);
    expect(empty.trim().endsWith('}')).toBe(true);
  });

  it('holds no name the sample cannot produce', () => {
    /*
     * The other direction, and the one that keeps this list honest: a word in `WIREFRAME_NAMES` for a
     * node type this product does not have is a promise nothing can keep. Asked of the sample, which
     * carries one of everything on purpose.
     */
    const seen = new Set<string>();
    const look = (sid: string, depth: number) => {
      if (depth > 64) return;
      const node = store.getNode(sid) as any;
      if (!node) return;
      seen.add(String(node.stype));
      for (const child of node.content ?? []) if (typeof child === 'string') look(child, depth + 1);
    };
    look(editor.getRootId(), 0);
    expect(Object.keys(WIREFRAME_NAMES).filter((one) => !seen.has(one))).toEqual([]);
  });
});
