import { describe, it, expect, beforeEach } from 'vitest';
import { getGlobalRegistry } from '@barocss/dsl';
import { EditorViewDOM } from '@barocss/editor-view-dom';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import { WORD_ENV_KEY, createTextEnv } from '@barocss/office-text';
import { createSiteEditor } from '../src/site-kit';
import { getSiteSchemaDefinition } from '../src/site-schema';
import { registerSiteRenderers } from '../src/renderers';
import { createSampleSite } from '../src/sample-site';
import { SITE_ENV_KEY, createSiteEnv } from '../src/breakpoints';
import { pagesOf, isCode } from '../src/selection';
import { exportPage } from '../src/export-html';

/**
 * A **code block on a page**, drawn by the block itself.
 *
 * This is the one node type here that owns its element: `external({ managesDOM: true })`, mounted by
 * the renderer, filled by Prism. Everything a check can be wrong about lives in the seam between
 * those two — so the tests below draw it the way the app draws it (an `EditorViewDOM` over a store)
 * rather than calling the component with props a test made up, which would only prove the component
 * agrees with itself.
 */
describe('a code block on a page', () => {
  let editor: any;
  let store: DataStore;
  let doc: any;
  let home: string;

  beforeEach(() => {
    registerSiteRenderers();
    const schema = createSchema('site', getSiteSchemaDefinition());
    store = new DataStore(undefined as never, schema as never);
    editor = createSiteEditor({ editable: true, schema, dataStore: store } as never);
    editor.loadDocument(createSampleSite(), 'site');
    doc = { rootId: editor.getRootId(), getNode: (sid: string) => store.getNode(sid) };
    home = pagesOf(doc)[0].sid;
  });

  /** Put a code block on the page, in the language given, and hand back its sid. */
  const put = async (language: string, code?: string): Promise<string> => {
    // Selected: the first band on the page. A page itself is not something a block is added *to* —
    // `insertCode` answers false there, which is the command being right rather than the test being
    // clever.
    const band = ((store.getNode(home) as { content?: string[] })?.content ?? [])[0] as string;
    editor.executeCommand('setNode', { nodeIds: [band] });
    await editor.executeCommand('insertCode');

    const made = editor.selection?.nodeIds?.[0] as string;
    expect(isCode(doc, made)).toBe(true);

    if (language) await editor.executeCommand('setBlockFormat', { language });
    if (code !== undefined) {
      const run = ((store.getNode(made) as { content?: string[] })?.content ?? [])[0] as string;
      await editor.executeCommand('replaceText', {
        range: {
          startNodeId: run,
          startOffset: 0,
          endNodeId: run,
          endOffset: (store.getNode(run) as { text?: string })?.text?.length ?? 0
        },
        text: code
      });
    }
    return made;
  };

  /** What the editor draws, as the app draws it. */
  const drawn = (): HTMLElement => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const view = new EditorViewDOM(editor, {
      container: host,
      registry: getGlobalRegistry(),
      rootId: home,
      env: {
        [WORD_ENV_KEY]: createTextEnv({
          rootId: editor.getRootId(),
          getNode: (sid: string) => store.getNode(sid) as never
        } as never),
        [SITE_ENV_KEY]: createSiteEnv('desktop')
      }
    } as never);
    view.render(undefined, { sync: true });
    return host;
  };

  it('is a pre and nothing around it', async () => {
    const sid = await put('typescript');
    const host = drawn();

    const found = host.querySelector(`[data-bc-sid="${sid}"]`) as HTMLElement;
    expect(found).toBeTruthy();
    // The element the renderer placed **is** the component's own. A wrapper here would mean the
    // block's own place on the page is a div, and the editing layer would open over the wrong rect.
    expect(found.tagName).toBe('PRE');
    expect(found.className).toContain('st-code');
  });

  it('carries the characters that were typed, through the store', async () => {
    await put('typescript', 'const 값 = 1;');
    const pre = drawn().querySelector('pre.st-code') as HTMLElement;
    // The words reach the component as `props.content`, which holds child **ids** in a store. A
    // component should not have to know that, and this is what says so.
    expect(pre.textContent).toBe('const 값 = 1;');
  });

  it('colours what Prism knows, and says nothing about what it does not', async () => {
    await put('typescript', 'const 값 = 1;');
    const coloured = drawn().querySelector('pre.st-code') as HTMLElement;
    expect(coloured.querySelector('.token.keyword')?.textContent).toBe('const');
    expect(coloured.getAttribute('data-language')).toBe('typescript');

    // A language nobody has chosen yet is not a wrong one: the characters, and no claim.
    store = new DataStore(undefined as never, createSchema('site', getSiteSchemaDefinition()) as never);
    editor = createSiteEditor({
      editable: true,
      schema: createSchema('site', getSiteSchemaDefinition()),
      dataStore: store
    } as never);
    editor.loadDocument(createSampleSite(), 'site');
    doc = { rootId: editor.getRootId(), getNode: (sid: string) => store.getNode(sid) };
    home = pagesOf(doc)[0].sid;
    await put('', 'const 값 = 1;');
    const plain = drawn().querySelector('pre.st-code') as HTMLElement;
    expect(plain.querySelector('.token')).toBeNull();
    expect(plain.textContent).toBe('const 값 = 1;');
    expect(plain.hasAttribute('data-language')).toBe(false);
  });

  it('is not somewhere the caret can go', async () => {
    const sid = await put('typescript');
    const pre = drawn().querySelector(`[data-bc-sid="${sid}"]`) as HTMLElement;
    expect(pre.getAttribute('contenteditable')).toBe('false');
    expect(pre.getAttribute('spellcheck')).toBe('false');
    expect(isCode(doc, sid)).toBe(true);
  });

  it('re-colours when the language changes, in the element it already had', async () => {
    const sid = await put('typescript', 'const 값 = 1;');
    const host = drawn();
    const before = host.querySelector(`[data-bc-sid="${sid}"]`) as HTMLElement;
    expect(before.querySelector('.token.keyword')).toBeTruthy();

    await editor.executeCommand('setBlockFormat', { language: 'json' });
    editor._viewDOM?.render?.(undefined, { sync: true });

    const after = host.querySelector(`[data-bc-sid="${sid}"]`) as HTMLElement;
    // The same element, not a new one: what a component owns is not thrown away and rebuilt when a
    // property of it changes.
    expect(after).toBe(before);
    expect(after.getAttribute('data-language')).toBe('json');
  });

  it('reaches the exported page as the reader saw it', async () => {
    await put('typescript', 'const 값 = 1;');
    const html = exportPage(editor, home).html;
    expect(html).toContain('token keyword');
    expect(html).toContain('const');
    // No editor in the export: a visitor reads code, and nothing here opens one.
    expect(html).not.toContain('st-code-layer');
  });
});
