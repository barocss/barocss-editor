import { describe, it, expect } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import { createSiteEditor } from '../src/site-kit';
import { getSiteSchemaDefinition } from '../src/site-schema';
import { createSampleSite } from '../src/sample-site';
import { setAttrs, transaction } from '@barocss/model';
import { breakageSaid, breaksIfGone, refCounts, refsFrom, refsIn } from '../src/refs';
import { datasetsOf, fieldsFrom, richRef, richTextsOf } from '../src/data';
import { usesOf } from '../src/components';
import { documentFaults } from '../src/faults';
import { pagesOf } from '../src/selection';

/**
 * **무엇이 무엇을 쓰는가**, as one walk.
 *
 * Three questions this product asks are about the **whole site** — who uses this definition, how
 * many links break if this page goes, does every reference resolve — and all three were separate
 * walks of every node of every page. They are the admin screen, so drawing it walked the document
 * three times over.
 *
 * The check that matters is not that the index is fast. It is that it **agrees**: an index that
 * counted differently from the walk it replaced would be a number a reader trusts and should not.
 */
describe('what refers to what', () => {
  const schema = createSchema('site', getSiteSchemaDefinition());
  const store = new DataStore(undefined as never, schema as never);
  const editor: any = createSiteEditor({ editable: true, schema, dataStore: store } as never);
  editor.loadDocument(createSampleSite(), 'site');
  const doc = { rootId: editor.getRootId(), getNode: (sid: string) => store.getNode(sid) };
  const refs = refsIn(doc as never);

  it('counts placements exactly as the walk it replaces does', () => {
    /*
     * `usesOf` is the sentence said before anybody edits a definition — *머리말이 6곳에서 쓰입니다* —
     * and a second implementation that disagreed would be worse than no number at all.
     */
    const walked = usesOf(doc as never);
    const indexed = refCounts(refs, 'component');
    for (const [id, count] of walked) expect(indexed.get(id) ?? 0, id).toBeGreaterThanOrEqual(count);
    /* Greater or equal, because the index counts one thing the walk does not — see below. */
    expect(indexed.get('site-header')).toBe(walked.get('site-header'));
  });

  it('counts a page drawn through a template as using it, which the walk did not', () => {
    /**
     * The first thing the index found, and it is a real gap rather than a difference of opinion.
     *
     * `usesOf` counts `instance` nodes. A page drawn through a template names it in `surface.template`
     * and is not a placement — so 글 페이지 read **0곳에서 사용 중** in the admin while two pages were
     * drawn through it, and a reader editing it would have been told they were changing nothing.
     */
    const indexed = refCounts(refs, 'component');
    expect(usesOf(doc as never).get('post-page') ?? 0).toBe(0);
    expect(indexed.get('post-page')).toBe(2);
    expect(indexed.get('dashboard-page')).toBe(1);
  });

  it('counts everything that names a page, not the third of it that is a link', () => {
    /**
     * **The number the delete dialog says**, and it was wrong — found by this test, in its previous
     * form, failing to fail.
     *
     * It compared the index against `linksTo` with a `toBeGreaterThanOrEqual` and a comment
     * explaining the slack: *the index also holds `goes` and a data cell*. Both halves were true and
     * the conclusion was not. The slack **was** the fault: `linksTo` counted link marks only, and its
     * own comment called that deliberate, so a dialog told a reader what deleting a page costs by
     * counting one of the three shapes that name one.
     *
     * Measured across the sample: 11 marks, 9 `goes`, 2 cells, 1 form's 감사 페이지. Six of the eight
     * pages under-reported — `/가격` said 3 where the answer is 8 — and the two blog posts said
     * **0**, which the dialog draws as *가리키는 것이 없습니다* about pages the blog list points at
     * from a data row. Wrong in the direction that loses work quietly.
     *
     * So the claim is no longer *agrees with the walk*. It is the three shapes, counted separately,
     * because they are three different repairs.
     */
    const pricing = pagesOf(doc as never).find((one) => one.path === '/가격')!;
    const breaks = breaksIfGone(refs, 'page', pricing.id);
    expect(breaks.links).toBe(3);
    expect(breaks.moves).toBe(5);
    expect(breaks.total).toBe(8);

    /* A page nothing links to, that something still points at — the case that read as safe. */
    const post = pagesOf(doc as never).find((one) => one.path === '/블로그/스택')!;
    const held = breaksIfGone(refs, 'page', post.id);
    expect(held.links).toBe(0);
    expect(held.cells).toBe(1);
    expect(held.total).toBe(1);
  });

  it('says only the parts that are not zero, because two of three usually are', () => {
    /*
     * *링크 3개, 이동 0개, 데이터 0칸* is three facts to read and one of them true. And the closing
     * sentence is per-kind: a broken link draws as ordinary words and a reader would never find it,
     * which is worth saying; a card that does nothing when clicked reports itself.
     */
    expect(breakageSaid({ links: 3, moves: 5, cells: 0, total: 8 })).toBe(
      '이 페이지를 가리키는 링크 3개, 이동 5개가 끊어집니다. 끊어진 링크는 그냥 글자로 보입니다.'
    );
    /* 개 takes 가 and 칸 takes 이 — the particle is decided by the count that lands last. */
    expect(breakageSaid({ links: 0, moves: 0, cells: 1, total: 1 })).toBe('이 페이지를 가리키는 데이터 1칸이 끊어집니다.');
    expect(breakageSaid({ links: 2, moves: 0, cells: 3, total: 5 })).toBe(
      '이 페이지를 가리키는 링크 2개, 데이터 3칸이 끊어집니다. 끊어진 링크는 그냥 글자로 보입니다.'
    );
    expect(breakageSaid({ links: 0, moves: 0, cells: 0, total: 0 })).toBe('이 페이지를 가리키는 것이 없습니다.');
  });

  it('says which page or definition each reference was written in', () => {
    /**
     * The field a split store keys by. When a page is its own document, *what uses what* stops being
     * a walk and becomes a row written when the page is saved — and this is that row.
     *
     * Carried down rather than walked up, which is the whole saving: walking up per node is the same
     * walk again, once per node.
     */
    const blog = pagesOf(doc as never).find((one) => one.path === '/블로그')!;
    const own = refsFrom(refs, blog.sid);
    expect(own.length).toBeGreaterThan(0);
    /* The blog names the 글 dataset and places the header — both written on that page. */
    expect(own.some((one) => one.kind === 'dataset' && one.to === '글')).toBe(true);
    expect(own.some((one) => one.kind === 'component' && one.to === 'site-header')).toBe(true);
    /* And nothing from another page is in it. */
    expect(own.every((one) => one.in === blog.sid)).toBe(true);
  });

  it('finds every kind of reference this schema has', () => {
    /*
     * Nine shapes in one table, deliberately: a reference is *a name that resolves somewhere else*,
     * and the three questions asked of them are the same whatever the name points at. A kind the
     * index cannot see is a kind the three questions are blind to.
     */
    const kinds = new Set(refs.map((one) => one.kind));
    for (const one of ['page', 'component', 'dataset', 'field', 'asset', 'variable', 'richText']) {
      expect(kinds.has(one as never), one).toBe(true);
    }
  });

  it('is one walk where there were three', () => {
    /*
     * Not a benchmark — a count of walks. The admin draws all three numbers, and the sample is 740
     * nodes; sixty pages is five thousand, on every keystroke that redraws it.
     */
    let visits = 0;
    const counting = {
      rootId: doc.rootId,
      getNode: (sid: string) => {
        visits += 1;
        return store.getNode(sid);
      }
    };
    const built = refsIn(counting as never);
    const one = visits;

    /*
     * And a **per-page** question costs nothing after it. This is the half that mattered most: the
     * admin's page table asked what points at each page once per row, so eight pages was eight walks
     * of the document — and `breaksIfGone` reads the array.
     */
    for (const page of pagesOf(doc as never)) breaksIfGone(built, 'page', page.id);
    expect(visits).toBe(one);

    visits = 0;
    usesOf(counting as never);
    documentFaults(counting as never, () => []);
    const two = visits;

    /* Two of the three questions already cost more than the one walk that answers all of them. */
    expect(one).toBeLessThan(two);
  });
});

/**
 * **What the report could not say**, which is the second half of what the index is for.
 *
 * `documentFaults` asked five resolution questions and each was written inside the walk, next to the
 * node type it was about: a placement's `componentId`, a `var:` on any attribute, a page's
 * `template`, a picture's `src`, and `linkFaults` over link marks. Five of the ten shapes this
 * schema uses to name something — and the five somebody had happened to think of.
 *
 * The measurement that made this an item rather than a tidy-up: delete two of the sample's pages and
 * two references in the document now point at nothing. The report said **zero**.
 */
describe('whether every name resolves', () => {
  const fresh = () => {
    const schema = createSchema('site', getSiteSchemaDefinition());
    const store = new DataStore(undefined as never, schema as never);
    const editor: any = createSiteEditor({ editable: true, schema, dataStore: store } as never);
    editor.loadDocument(createSampleSite(), 'site');
    return {
      editor,
      store,
      doc: { rootId: editor.getRootId(), getNode: (sid: string) => store.getNode(sid) }
    };
  };
  const said = (doc: any) => documentFaults(doc as never, { declares: () => [] }).map((one) => one.said);

  it('reports a page nothing links to, which is where the report was empty', async () => {
    /**
     * The two pages chosen deliberately: **no link mark points at either**. 홈 is reached by the
     * 시작하기 card's `이동`, and 블로그/스택 by a cell in the 글 dataset's row.
     *
     * So the old report's one page check — marks — found nothing to say, and the document was left
     * holding a card that goes nowhere and a list row pointing at a page that is gone. Both draw as
     * ordinary, working page furniture.
     */
    const { editor, doc } = fresh();
    const home = pagesOf(doc as never).find((one) => one.path === '/')!;
    const post = pagesOf(doc as never).find((one) => one.path === '/블로그/스택')!;

    expect(said(doc)).toEqual([]);
    await editor.executeCommand('removePage', { nodeId: home.sid });
    await editor.executeCommand('removePage', { nodeId: post.sid });

    /* And **where to go**, which is the difference between a fault and a complaint. */
    expect(said(doc)).toEqual([
      "'home' 페이지가 없습니다 — 눌러도 아무 일도 일어나지 않습니다",
      "'post-stack' 페이지가 없습니다 — 데이터의 한 칸이 가리킵니다"
    ]);
  });

  it('keeps 끊어진 링크 a kind of its own, because it is the one nothing shows', async () => {
    /*
     * A page named by a mark is not the same fault as a page named by a `goes`, and the difference is
     * not pedantry: an `<a>` with no href draws as ordinary words — no underline, no pointer, no
     * announcement — so it is the one of the three a reader cannot find by looking. A card that does
     * nothing when clicked reports itself the moment somebody clicks it.
     */
    const { editor, doc } = fresh();
    const products = pagesOf(doc as never).find((one) => one.path === '/제품')!;
    await editor.executeCommand('removePage', { nodeId: products.sid });

    const faults = documentFaults(doc as never, { declares: () => [] });
    const kinds = faults.filter((one) => one.said.includes('제품') || one.said.includes('products'));
    expect(kinds.filter((one) => one.kind === 'link')).toHaveLength(3);
    expect(kinds.filter((one) => one.kind === 'reference')).toHaveLength(1);
  });

  it('reports a summary whose 글 is not there, which had no check anywhere', async () => {
    /**
     * The kind that could not be checked at all, and the reason is the shape rather than an
     * oversight: a `richText` reference **only ever lives in a cell**, and no walk of attributes
     * reaches inside `records`.
     *
     * What it draws: the list still repeats, the title is still there, and the body is blank — a row
     * indistinguishable from one nobody has written yet.
     */
    const { editor, store, doc } = fresh();
    const dataset = datasetsOf(doc as never).find((one) => one.name === '글')!;
    const column = fieldsFrom((store.getNode(dataset.sid) as any)?.attributes?.fields).find((one) => one.kind === 'richText')!;
    expect(column).toBeTruthy();

    await editor.executeCommand('setDatasetCell', {
      nodeId: dataset.sid,
      row: 0,
      field: column.name,
      value: richRef('없는 글')
    });
    expect(said(doc)).toContain("'없는 글' 글이 없습니다 — 데이터의 한 칸이 가리킵니다");
  });

  it('reports a 글 no cell names, which the code promised and did not do', async () => {
    /**
     * **The mirror question.** `data-commands.ts` states the rule — *a `richText` is one cell's
     * value; when the row goes, the value goes* — and then, counting what is left, says
     * *`documentFaults` is where the orphan is reported*. It was not: written as a promise and never
     * kept, which is the exact failure `faults.ts` opens by describing about itself.
     *
     * ## And where an orphan comes from, which was measured before this was written
     *
     * Not from a reader's gesture. Two candidates were tried and neither produces one — retyping the
     * cell (the table refuses it, with the reason written down in `data-editor.tsx`: *a text box here
     * would be a reader typing over a reference and losing a paragraph*) and changing the column's
     * kind and back (the records are deliberately untouched, so the reference survives).
     *
     * So it is the case the rule's own comment named: *a document arrives from a file, and a file
     * can say anything*. Which is written here through the command rather than through the drawer,
     * because that is the shape an import has.
     */
    const { editor, store, doc } = fresh();
    const dataset = datasetsOf(doc as never).find((one) => one.name === '글')!;
    const column = fieldsFrom((store.getNode(dataset.sid) as any)?.attributes?.fields).find(
      (one) => one.kind === 'richText'
    )!;

    /* All four are named by a cell to begin with — two summaries and two bodies — so no orphan. */
    expect(richTextsOf(doc as never)).toHaveLength(4);
    expect(said(doc)).toEqual([]);

    await editor.executeCommand('setDatasetCell', {
      nodeId: dataset.sid,
      row: 0,
      field: column.name,
      value: '그냥 글자'
    });

    /* Still four nodes, and one of them now has nothing pointing at it. */
    expect(richTextsOf(doc as never)).toHaveLength(4);
    expect(said(doc)).toEqual(["'요약-스택' 글을 아무 칸도 가리키지 않습니다 — 글은 파일에 그대로 있습니다"]);
  });

  it('survives the column changing kind and back, which is why that is not the fault', async () => {
    /*
     * Measured because it was the second guess at how one is made, and the answer is the design
     * working: `setDatasetField` leaves the records exactly as they are when only the kind changes,
     * so a round trip through 글자 and back to 서식 있는 글 loses nothing. A check that reported an
     * orphan here would be reporting a reader's ordinary edit.
     */
    const { editor, store, doc } = fresh();
    const dataset = datasetsOf(doc as never).find((one) => one.name === '글')!;
    const column = fieldsFrom((store.getNode(dataset.sid) as any)?.attributes?.fields).find(
      (one) => one.kind === 'richText'
    )!;

    await editor.executeCommand('setDatasetField', { nodeId: dataset.sid, field: column.name, kind: 'text' });
    expect(said(doc)).toEqual([]);
    await editor.executeCommand('setDatasetField', { nodeId: dataset.sid, field: column.name, kind: 'richText' });
    expect(said(doc)).toEqual([]);
    expect(richTextsOf(doc as never)).toHaveLength(4);
  });

  it('is made permanent by the one act that does clean up, which is why it is reported', async () => {
    /*
     * Removing the column takes the words of every row with it — `_dropRich` reads the values *in
     * the rows*. So it drops the one a row still points at and leaves the orphan, and the reader is
     * then holding a document with writing nothing can reach and no way to have noticed.
     */
    const { editor, store, doc } = fresh();
    const dataset = datasetsOf(doc as never).find((one) => one.name === '글')!;
    const column = fieldsFrom((store.getNode(dataset.sid) as any)?.attributes?.fields).find(
      (one) => one.kind === 'richText'
    )!;

    await editor.executeCommand('setDatasetCell', { nodeId: dataset.sid, row: 0, field: column.name, value: '그냥 글자' });
    await editor.executeCommand('setDatasetField', { nodeId: dataset.sid, field: column.name, remove: true });

    /*
     * 요약-스택 is the orphan the retyped cell left; the two 본문 nodes are still named by their own
     * column, which is the case a row with **two** rich columns exists to keep honest — removing one
     * column must not take the other's words.
     */
    expect(richTextsOf(doc as never).map((one) => one.id)).toEqual(['요약-스택', '본문-스택', '본문-모델']);
    expect(said(doc)).toEqual(["'요약-스택' 글을 아무 칸도 가리키지 않습니다 — 글은 파일에 그대로 있습니다"]);
  });

  it('still says the sentences the checks it replaced said', async () => {
    /**
     * Two of the five had a test and three did not — `'x' 템플릿이 없습니다` and
     * `'x' 그림 파일이 없습니다` were written, shipped, and never run over a document, which is the
     * failure this package's fault module opens by describing about itself. They get one on the way
     * past.
     *
     * Written with `setAttrs` rather than through a command, deliberately: no command in this
     * product will *write* a dangling reference — `setPageTemplate` refuses a name it cannot find —
     * so this is the document a paste or an import leaves behind, which is the only way these arise.
     *
     * The wording matters beyond nostalgia: a page names a **틀** and a block names a
     * **컴포넌트**, and they are the same `component` reference. Telling a reader their page's
     * 컴포넌트 is missing sends them to the wrong panel.
     */
    const { editor, store, doc } = fresh();
    const find = (of: (node: any) => boolean): string => {
      let at = '';
      const walk = (sid: string, depth = 0) => {
        if (at || depth > 64) return;
        const node = store.getNode(sid) as any;
        if (node && of(node)) at = sid;
        for (const child of (node?.content ?? []) as unknown[]) if (typeof child === 'string') walk(child, depth + 1);
      };
      walk(doc.rootId);
      return at;
    };

    const page = pagesOf(doc as never)[0];
    await transaction(editor, [setAttrs(page.sid, { template: '없는 틀' })] as never).commit();
    expect(said(doc)).toContain("'없는 틀' 템플릿이 없습니다");

    /*
     * A picture, and it takes the sample's first one rather than one already naming a file: the
     * sample's only `asset:` is a video's **poster**, which is why the second sentence exists at all
     * — `그림 파일` when a picture asks and `파일` when anything else does.
     */
    const picture = find((node) => node.stype === 'picture');
    expect(picture).not.toBe('');
    await transaction(editor, [setAttrs(picture, { src: 'asset:없는 그림' })] as never).commit();
    expect(said(doc)).toContain("'없는 그림' 그림 파일이 없습니다");

    const poster = find((node) => String(node.attributes?.poster ?? '').startsWith('asset:'));
    expect(poster).not.toBe('');
    await transaction(editor, [setAttrs(poster, { poster: 'asset:없는 표지' })] as never).commit();
    expect(said(doc)).toContain("'없는 표지' 파일이 없습니다");

    const list = find((node) => node.stype === 'collection');
    await transaction(editor, [setAttrs(list, { source: '없는 데이터' })] as never).commit();
    expect(said(doc)).toContain("'없는 데이터' 데이터가 없습니다");
  });
});
