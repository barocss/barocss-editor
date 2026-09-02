import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import { createSiteEditor } from '../src/site-kit';
import { getSiteSchemaDefinition } from '../src/site-schema';
import { createSampleSite } from '../src/sample-site';
import { registerSiteRenderers } from '../src/renderers';
import { digestOf, lastPublish, publishSaid, publishState, publishesOf } from '../src/publishes';

/**
 * **What a publish left behind**, which is the second thing this product needs before anybody can
 * use it at work.
 *
 * Asked as four things — *어디로 가는지, 누가 눌렀는지, 무엇이 나갔는지, 어떻게 되돌리는지* — and three
 * of them are answerable cheaply. The fourth is not, and these hold the line where it is drawn:
 *
 * - **Rolling back is not offered.** A copy of every published page in the document would multiply
 *   the file by the number of publishes, and a document that grows every time a reader presses a
 *   button is one they stop pressing.
 * - **Who is empty** until this product has accounts. A name invented by the tool would be a lie in
 *   a record whose entire value is being trustworthy.
 *
 * What is left is the question a reader actually asks — *is what is live the same as what I have?* —
 * and it is answered by comparing two strings.
 */
describe('what a publish leaves behind', () => {
  let editor: any;
  let store: DataStore;

  const run = async (command: string, payload?: unknown) => await editor.executeCommand(command, payload);
  const doc = () => ({ rootId: editor.getRootId(), getNode: (sid: string) => store.getNode(sid) });
  const state = () => publishState(doc() as never, editor.exportDocument());

  beforeEach(() => {
    registerSiteRenderers();
    const schema = createSchema('site', getSiteSchemaDefinition());
    store = new DataStore(undefined as never, schema as never);
    editor = createSiteEditor({ editable: true, schema, dataStore: store } as never);
    editor.loadDocument(createSampleSite(), 'site');
  });

  it('says nothing about a site nobody has published', () => {
    /*
     * Three answers rather than two, because *never* is not *behind*: a site nobody has published has
     * nothing wrong with it, and a builder that said 바뀐 것이 있습니다 on the day a reader started
     * would be one that cried wolf on day one.
     */
    expect(publishesOf(doc() as never)).toEqual([]);
    expect(state().state).toBe('never');
    expect(publishSaid('never')).toBe('아직 발행하지 않았습니다');
  });

  it('records when it happened and how much went', async () => {
    expect(await run('publishSite', { at: '2026-09-03T10:00:00.000Z' })).toBe(true);

    const said = publishesOf(doc() as never);
    expect(said).toHaveLength(1);
    expect(said[0].at).toBe('2026-09-03T10:00:00.000Z');
    /* Six: five pages and the post drawn through the template. */
    expect(said[0].pages).toBe(6);
    // Never invented — this product has no accounts, and a record's value is being trustworthy.
    expect(said[0].by).toBeUndefined();
  });

  it('takes its clock from the caller, because a package with one has tests that differ each run', async () => {
    await run('publishSite', { at: '2026-01-01T00:00:00.000Z' });
    expect(lastPublish(doc() as never)!.at).toBe('2026-01-01T00:00:00.000Z');
  });

  it('answers the question work actually asks', async () => {
    await run('publishSite', { at: '2026-09-03T10:00:00.000Z' });
    expect(state().state).toBe('current');
    expect(publishSaid('current', lastPublish(doc() as never))).toContain('2026-09-03 10:00');

    /*
     * And an edit puts it behind. The digest is of the **document** rather than of the output,
     * deliberately: comparing outputs means rendering the whole site to find out, and a publish that
     * produced identical HTML from an edited document is still one a reader wants to know about.
     */
    const page = ((store.getNode(editor.getRootId())?.content ?? []) as string[]).find(
      (sid) => store.getNode(sid)?.stype === 'surface'
    )!;
    await run('setPageInfo', { nodeId: page, description: '고친 설명' });

    expect(state().state).toBe('behind');
    expect(publishSaid('behind', lastPublish(doc() as never))).toContain('이후로 바뀐 것이');
  });

  it('remembers them in the order they happened', async () => {
    await run('publishSite', { at: '2026-09-01T00:00:00.000Z' });
    await run('publishSite', { at: '2026-09-02T00:00:00.000Z' });
    const said = publishesOf(doc() as never);
    expect(said.map((one) => one.at.slice(0, 10))).toEqual(['2026-09-01', '2026-09-02']);
    expect(lastPublish(doc() as never)!.at.slice(0, 10)).toBe('2026-09-02');
  });

  it('digests the file rather than the session', () => {
    /**
     * The **exported** document rather than the store's nodes, because that is what a file holds:
     * sids are minted per session, so hashing them would say a document had changed the moment it
     * was reopened — and a reader who opened their site and was told it was behind would learn to
     * ignore the answer.
     */
    const once = digestOf(editor.exportDocument());

    const schema = createSchema('site', getSiteSchemaDefinition());
    const second = new DataStore(undefined as never, schema as never);
    const other: any = createSiteEditor({ editable: true, schema, dataStore: second } as never);
    other.loadDocument(createSampleSite(), 'site');

    expect(digestOf(other.exportDocument())).toBe(once);
    // And it moves when the document does, which is the only other thing it has to do.
    expect(digestOf({ ...(editor.exportDocument() as any), address: '다른 주소' })).not.toBe(once);
  });

  it('records nothing when there was nothing to publish', async () => {
    /*
     * A record of a publish that produced no pages is a line in a history saying something happened
     * when it did not — which is the one way a history can be worse than none.
     */
    const empty: any = createSiteEditor({
      editable: true,
      schema: createSchema('site', getSiteSchemaDefinition()),
      dataStore: new DataStore(undefined as never, createSchema('site', getSiteSchemaDefinition()) as never)
    } as never);
    expect(await empty.executeCommand('publishSite', { at: '2026-09-03T00:00:00.000Z' })).toBe(false);
  });
});
