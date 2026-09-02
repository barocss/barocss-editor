import { describe, it, expect } from 'vitest';
import { PROVIDERS, embedSrc, idFrom, embedFaults, providerNamed } from '../src/embed';

/**
 * **An embed is a provider and an id**, and this is the arithmetic that turns the pair into an
 * address — asked in a millisecond, where a browser would take a page load and tell you less.
 */
describe('what a page embeds', () => {
  it('builds an address from a provider and an id', () => {
    expect(embedSrc('youtube', 'abc123')).toBe('https://www.youtube-nocookie.com/embed/abc123');
    expect(embedSrc('vimeo', '123456')).toBe('https://player.vimeo.com/video/123456');
  });

  it('draws nothing for a provider it does not know, rather than an iframe to anywhere', () => {
    /*
     * The point rather than a limitation: the alternative is a frame pointing at whatever a reader
     * pasted, on a page a stranger will open. Adding a provider is one line and a decision.
     */
    expect(embedSrc('없는곳', 'abc')).toBeUndefined();
    expect(providerNamed('없는곳')).toBeUndefined();
  });

  it('draws nothing for an empty id, because a frame with no source is a grey box', () => {
    expect(embedSrc('youtube', '')).toBeUndefined();
    expect(embedSrc('youtube', '   ')).toBeUndefined();
  });

  it('finds the id in what a reader pasted, whichever service it came from', () => {
    // Which is what they will do — telling somebody to find the id themselves is a computer's job.
    expect(idFrom('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toEqual({
      provider: 'youtube',
      id: 'dQw4w9WgXcQ'
    });
    expect(idFrom('https://youtu.be/dQw4w9WgXcQ')).toEqual({ provider: 'youtube', id: 'dQw4w9WgXcQ' });
    expect(idFrom('https://vimeo.com/123456789')).toEqual({ provider: 'vimeo', id: '123456789' });
  });

  it('trusts a string that matches nothing, because somebody who knows the id types the id', () => {
    expect(idFrom('dQw4w9WgXcQ')).toEqual({ id: 'dQw4w9WgXcQ' });
  });

  it('escapes what it is given, because an id arrives from a person', () => {
    expect(embedSrc('youtube', 'a b&c')).toBe('https://www.youtube-nocookie.com/embed/a%20b%26c');
  });

  it('says what is wrong, in the words a reader would use', () => {
    expect(embedFaults({ provider: 'youtube', id: 'abc' })).toEqual([]);
    expect(embedFaults({ provider: 'youtube', id: '' })[0]).toContain('무엇을 넣을지');
    expect(embedFaults({ provider: '없는곳', id: 'abc' })[0]).toContain('넣을 수 있는 곳');
  });

  it('uses a host that does not set a cookie before a visitor has pressed anything', () => {
    expect(PROVIDERS.find((one) => one.id === 'youtube')?.src('x')).toContain('youtube-nocookie');
  });

  /**
   * **And the fault list says so**, which is the half that matters: a frame with no source draws a
   * box, and a box is what an embed looks like *before it loads*. A reader cannot tell waiting from
   * wrong by looking — which is the shape every fault in that list has.
   */
  it('is reported by the document rather than left as a grey rectangle', async () => {
    const { createSchema } = await import('@barocss/schema');
    const { DataStore } = await import('@barocss/datastore');
    const { getSiteSchemaDefinition } = await import('../src/site-schema');
    const { registerSiteRenderers } = await import('../src/renderers');
    const { createSiteEditor } = await import('../src/site-kit');
    const { createSampleSite } = await import('../src/sample-site');
    const { documentFaults } = await import('../src/faults');

    registerSiteRenderers();
    const schema = createSchema('site', getSiteSchemaDefinition() as never);
    const store = new DataStore(undefined as never, schema as never);
    const editor: any = createSiteEditor({ editable: true, schema, dataStore: store } as never);
    editor.loadDocument(createSampleSite(), 'site');
    const rootId = editor.getRootId();
    const doc = { rootId, getNode: (sid: string) => store.getNode(sid) };

    // The sample wears one of each and neither is wrong, which is what a fixture is for.
    expect(documentFaults(doc as never).filter((one) => one.said.includes('넣을'))).toEqual([]);

    /** Every sid in the document, so a test finds a node by what it is. */
    const every = (sid: string, found: string[] = []): string[] => {
      found.push(sid);
      for (const child of ((store.getNode(sid) as any)?.content ?? []) as unknown[]) {
        if (typeof child === 'string') every(child, found);
      }
      return found;
    };
    const embed = every(rootId).find((sid) => (store.getNode(sid) as any)?.stype === 'mediaEmbed')!;
    await editor.executeCommand('setBlockFormat', { nodeIds: [embed], id: ' ' });
    expect(
      documentFaults(doc as never).some((one) => one.said.includes('무엇을 넣을지'))
    ).toBe(true);

    await editor.executeCommand('setBlockFormat', { nodeIds: [embed], provider: '없는곳', id: 'abc' });
    expect(
      documentFaults(doc as never).some((one) => one.said.includes('넣을 수 있는 곳'))
    ).toBe(true);
  });
});
