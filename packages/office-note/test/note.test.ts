import { describe, it, expect } from 'vitest';
import { createSchema } from '@barocss/schema';
import {
  NOTE_BLOCKS,
  NOTE_CONTENT,
  NOTE_TOOLBAR,
  getNoteSchemaDefinition,
  noteControlsIn,
  noteSlashItems
} from '../src/index';

/**
 * **한 편의 글이 자기 것을 갖는다.**
 *
 * A body was a corner of the site builder: its content model was the page's `block` group, its
 * toolbar was assembled out of the page's declarations, and its chrome was styled in the page's
 * stylesheet. Every one of those was a decision about writing being made by a page.
 *
 * So the claims here are all one claim in different words: **what a body may hold is said once**,
 * and everything a writer meets is a reading of it.
 */
describe('what a note may hold', () => {
  it('is the writing vocabulary and not the page’s', () => {
    /*
     * `block+` was the page's own group, so a body permitted a **폼, a 차트, a 목록 and a
     * canvasBlock** and did **not** permit a `picture` — which is `group: 'scene'`. Exactly
     * backwards, and invisible until somebody tried to put an image in a post.
     */
    expect(NOTE_BLOCKS).toContain('picture');
    expect(NOTE_BLOCKS).toContain('heading');
    expect(NOTE_BLOCKS).toContain('bTable');
    for (const one of ['frame', 'collection', 'chart', 'form', 'field', 'canvasBlock', 'instance', 'pageBreak', 'listItem']) {
      expect(NOTE_BLOCKS as readonly string[]).not.toContain(one);
    }
  });

  it('says it once, and the expression is a reading of the list', () => {
    /* Two spellings of *what a body may hold* is how a model and an editor come to disagree. */
    expect(NOTE_CONTENT).toBe(`(${NOTE_BLOCKS.join(' | ')})+`);
  });

  it('is a document of its own, starting at a `note`', () => {
    /**
     * The top node is **`note`** and not `surface`. `surface` is the shared schema's seam — a Word
     * document's pages, a deck's slides, a site's pages — and a body is none of those: nothing
     * paginates it and nothing lays it out beside its siblings. Giving it that name would make the
     * seam mean two things.
     */
    const schema: any = createSchema('note', getNoteSchemaDefinition());
    expect(schema.topNode).toBe('note');
    expect(String(schema.nodes.get('note')?.content)).toContain('heading');
    expect(String(schema.nodes.get('note')?.content)).toContain('resources?');
  });

  it('refuses a page’s block in a body, in the model rather than in a toolbar', () => {
    /*
     * The whole reason the package has a schema at all: a toolbar that is the only thing saying no
     * is a toolbar somebody works around with a paste.
     */
    const schema: any = createSchema('note', getNoteSchemaDefinition());
    const said = String(schema.nodes.get('note')?.content);
    expect(said).not.toContain('form');
    expect(said).not.toContain('collection');
  });
});

/**
 * **And its own chrome**, which is the half that was reported: *이 툴바가 기존 페이지 빌더 툴바랑
 * 연동되고 있음. 그러면 안돼.*
 */
describe('what a note’s bar offers', () => {
  it('has a row for every block a body may hold, and no others', () => {
    /*
     * Keyed by `NOTE_BLOCKS`, so a row for a block the schema refuses cannot be written and a block
     * with no row is a gap this counts. The site builder's own insert list is a flat array and has
     * needed a check to keep it honest; there is one list here.
     */
    /*
     * **At least one per block**, not exactly one: 목록 and 번호 목록 are one node type and two
     * doors, which is what a writer means by the two words.
     */
    const blocks = noteControlsIn('block');
    expect(blocks.length).toBeGreaterThanOrEqual(NOTE_BLOCKS.length);
    expect(blocks.map((one) => one.command)).toContain('insertPicture');
    expect(blocks.map((one) => one.command)).not.toContain('insertButton');
  });

  it('offers the four marks and not a colour, a size or a family', () => {
    /*
     * This list said `strikeThrough` too — written from the same wrong source as the row it checks,
     * so the two agreed about a name the model has never used. Two places agreeing is not evidence;
     * the check below asks the **toggle** instead, which cannot be written from a list.
     */
    /**
     * The styling rule, stated as an **absence**: the look of a paragraph in a post is the card's
     * answer when it draws it — *칠·여백·크기는 카드의 것* — so a body that could set its own would
     * stop following the design it is placed in.
     *
     * And it is enforced by `note-kit.ts` not registering those commands, not by hiding a control:
     * a hidden control is reachable by a key map and a paste.
     */
    const marks = noteControlsIn('mark').map((one) => one.mark);
    expect(marks).toEqual(['bold', 'italic', 'underline', 'strikethrough']);
    expect(NOTE_TOOLBAR.map((one) => one.command)).not.toContain('setFontColor');
    expect(NOTE_TOOLBAR.map((one) => one.command)).not.toContain('setFontSize');
    expect(NOTE_TOOLBAR.map((one) => one.command)).not.toContain('setFontFamily');
  });

  it('derives the `/` menu from the bar, so the two cannot come apart', () => {
    /*
     * A slash menu and a toolbar answer the same question — *what can I put here* — and the only
     * difference is how the reader asked. One list, three surfaces: the schema, the bar, the menu.
     */
    expect(noteSlashItems().map((one) => one.command)).toEqual(
      noteControlsIn('block').map((one) => one.command)
    );
  });

  it('gives every control a picture and a sentence, because both are drawn', () => {
    for (const one of NOTE_TOOLBAR) {
      expect(one.icon.length, one.command).toBeGreaterThan(0);
      expect(one.title.length, one.command).toBeGreaterThan(0);
    }
  });
});

/**
 * **선언한 것을 다 등록하는가** — the check that would have caught the thing the session found.
 *
 * The bar declared ten commands and the kit registered **none of them**: `insertHeading`,
 * `insertQuote` and the rest are `office-site`'s, so for as long as a host handed its own editor in,
 * a body's bar was pressing a page builder's buttons. It worked, for the wrong reason, in the one
 * place nobody had looked — and it surfaced only because the session stopped being borrowed.
 *
 * *A control that is offered and cannot run* is the fault this repository has recorded three times
 * about its own commands. This is the fourth, and the first one asked about in a package's own tests.
 */
describe('what a note’s kit registers', () => {
  it('has a command for every control its bar offers', async () => {
    const { DataStore } = await import('@barocss/datastore');
    const { createNoteEditor } = await import('../src/note-kit');
    const schema = createSchema('note', getNoteSchemaDefinition());
    const store = new DataStore(undefined as never, schema as never);
    const editor: any = createNoteEditor({ dataStore: store, schema, editable: true });

    const known = new Set<string>(editor.commandNames());
    const missing = NOTE_TOOLBAR.map((one) => one.command).filter((one) => !known.has(one));
    expect(missing).toEqual([]);
  });

  it('has a way in for every block, and every way in makes one', async () => {
    const { NOTE_INSERTS } = await import('../src/element-commands');
    /**
     * Two directions, and **not** two equal lengths — which is what this asserted first and is
     * wrong: 목록 and 번호 목록 are one node type and two doors. Written as one row per block, a
     * writer had no way to make a numbered list at all, and it was the browser that noticed — the
     * site's menu offered eleven rows in a body and this one offered ten.
     *
     * So: a block with no way in is a block nobody can make, and a command with no block is a dead
     * row. Both are checked; the counts are allowed to differ.
     */
    expect([...NOTE_INSERTS].sort()).toEqual(noteControlsIn('block').map((one) => one.command).sort());
    expect(NOTE_INSERTS.length).toBeGreaterThanOrEqual(NOTE_BLOCKS.length);
    expect(new Set(NOTE_INSERTS).size).toBe(NOTE_INSERTS.length);
  });
});

/**
 * **잡을 수 있으면 할 수 있는 것이 있어야 한다.**
 *
 * A body's second answer to a click is *hold this block*, and holding one is only worth anything if
 * something can then be done with it. The gap is invisible from either side alone: the selection
 * list says a picture can be held, the strip is a component nobody can read, and a picture a reader
 * could hold and not give a file to looked exactly like a picture they could.
 *
 * So the two declarations are compared. A held kind with neither a field nor an act of its own is
 * named here rather than discovered by pressing it.
 */
describe('what a held block offers', () => {
  it('has something to ask or something to do, for every kind a click can hold', async () => {
    const { NOTE_PICKED, actsFor, fieldsFor } = await import('../src/index');

    /*
     * **구분선 is the exemption, and it is a real one**: a line has no attributes, no words and no
     * size. What a reader does with one is move it or take it out, and both are acts every held
     * block has — see `NOTE_MOVES` — so it needs nothing of its own.
     */
    const exempt = new Set(['horizontalRule']);
    const empty = NOTE_PICKED.filter(
      (one) => !exempt.has(one) && fieldsFor(one).length === 0 && actsFor(one).length === 0
    );
    expect(empty).toEqual([]);
  });

  it('asks with a field and tells with an act, and never confuses the two', async () => {
    const { NOTE_ACTS, NOTE_FIELDS, NOTE_MOVES, NOTE_PICKED } = await import('../src/index');

    /* A field writes an attribute; an act runs a command. A row with both would be a row that lies. */
    for (const [kind, fields] of Object.entries(NOTE_FIELDS)) {
      expect(NOTE_PICKED).toContain(kind);
      for (const one of fields ?? []) {
        expect(one.attr).toBeTruthy();
        expect(one.label).toBeTruthy();
        /* A choice with nothing to choose is a control that draws an empty list. */
        if (one.kind === 'choice') expect((one.options ?? []).length).toBeGreaterThan(0);
        /* A file field says what it accepts, or a reader is offered every file on their machine. */
        if (one.kind === 'file') expect(one.accept).toBeTruthy();
      }
    }

    for (const [kind, acts] of Object.entries(NOTE_ACTS)) {
      expect(NOTE_PICKED).toContain(kind);
      for (const one of acts ?? []) expect(one.command && one.icon && one.title).toBeTruthy();
    }

    /*
     * And the pictures are `office-icons` names, never a character. A glyph drawn as an icon comes
     * out at a different weight in every font a reader has, which is why this repository has the
     * rule at all.
     */
    const { iconNames } = await import('@barocss/office-icons');
    const known = new Set<string>(iconNames());
    const unknown = [...Object.values(NOTE_ACTS).flat(), ...NOTE_MOVES]
      .map((one) => one!.icon)
      .filter((one) => !known.has(one));
    expect(unknown).toEqual([]);
  });
});

/**
 * **툴바가 묻는 마크 이름과, 명령이 쓰는 마크 이름은 같아야 한다.**
 *
 * They were not, for one of four: `toggleStrikeThrough` writes a mark called **`strikethrough`** and
 * this bar asked the selection about **`strikeThrough`**. `markState` looks the string up, finds
 * nothing and answers `off` — so 취소선 applied the mark correctly and the button never lit.
 *
 * Reported as *note 툴바에서 취소선만 버튼 상태 업데이트가 안되네*, and *only* is the whole tell: the
 * other three marks are one word each and cannot disagree with themselves. A row written from the
 * command list rather than from the mark is how the two came apart, and nothing could see it — a
 * name that is wrong in one of two places is invisible from either.
 *
 * So it is measured against what a toggle **actually writes**, not against a second list.
 */
describe('바가 묻는 마크와 명령이 쓰는 마크', () => {
  it('are the same name, for every mark the bar offers', async () => {
    const { DataStore } = await import('@barocss/datastore');
    const { createNoteEditor } = await import('../src/note-kit');
    const { markState } = await import('@barocss/editor-core');

    const schema = createSchema('note', getNoteSchemaDefinition());
    const store = new DataStore(undefined as never, schema as never);
    const editor: any = createNoteEditor({ dataStore: store, schema, editable: true });
    editor.loadDocument(
      { stype: 'note', content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: '한 문장입니다' }] }] },
      'marks'
    );

    const text = [...store.getNodes().values()].find((one: any) => one.stype === 'inline-text') as any;
    expect(text).toBeDefined();

    for (const one of noteControlsIn('mark')) {
      expect(one.mark).toBeTruthy();

      /* Select the whole run, run the toggle, and ask the bar's own question about the result. */
      editor.selectionManager.setSelection({
        type: 'range',
        startNodeId: text.sid,
        startOffset: 0,
        endNodeId: text.sid,
        endOffset: 5,
        collapsed: false
      });
      await editor.executeCommand(one.command);

      const said = markState(editor.getSelectionSummary(), one.mark!);
      expect(said, `${one.label}: 명령은 걸었는데 바는 '${said}'라고 합니다 — 이름이 다릅니다`).toBe('on');

      /* And off again, so the next mark starts from a clean run. */
      await editor.executeCommand(one.command);
    }
  });
});

/**
 * **제품 둘이 한 화면에 설 수 있는가.**
 *
 * Asked three ways — *note 를 word 안에서도 쓸 수 있잖아? word 랑 slide 를 동시에? word 를 4개로?* —
 * and they are one question: renderers register **globally by stype**, last write wins, so two
 * products cannot both be right about `paragraph`.
 *
 * Measured before the change, by registering both and diffing the registry: `office-word` replaced
 * **117 of `office-site`'s 125** — `paragraph`, `heading`, `list`, `inline-text`, `surface`, `frame`,
 * `picture` and every mark. Which product won was decided by import order.
 *
 * Everything downstream was already built for the answer: `EditorViewDOM` takes a registry, hands it
 * to its renderers, and a `{ global: false }` one looks locally first and falls back to the global.
 * The only thing with no way through was the **writing** end — `define` had the global registry named
 * in it. `intoRegistry` is that scope, and this is a note taking it.
 */
describe('노트는 자기 레지스트리에 그린다', () => {
  it('registers nothing globally, and draws its own prose vocabulary', async () => {
    const { getGlobalRegistry } = await import('@barocss/dsl');
    const { noteRegistry } = await import('../src/renderers');

    const held = (one: unknown) => (one as { _renderers: Map<string, unknown> })._renderers;
    const before = new Map(held(getGlobalRegistry()));

    const mine = noteRegistry();

    /* Its own: the note node, the prose vocabulary, and the three a body draws that office leaves out. */
    for (const one of ['note', 'paragraph', 'heading', 'list', 'inline-text', 'picture', 'mediaVideo', 'mediaEmbed']) {
      expect(held(mine).has(one), `${one} 이 노트 레지스트리에 없습니다`).toBe(true);
    }

    /**
     * And **the global registry is untouched**, which is the half that matters to a host. A site
     * that registered its own `list` used to get the text one back the moment a note was mounted —
     * a page's list drew as a `div` and four checks failed, from one line in the wrong order.
     */
    expect([...held(getGlobalRegistry()).keys()]).toEqual([...before.keys()]);
    for (const [name, was] of before) expect(held(getGlobalRegistry()).get(name)).toBe(was);
  });

  it('is built once, however many notes are mounted', async () => {
    const { noteRegistry } = await import('../src/renderers');
    /*
     * Renderers are pure declarations keyed by stype: twelve notes on a page want the same thirty of
     * them, not three hundred and sixty.
     */
    expect(noteRegistry()).toBe(noteRegistry());
  });

  it('lets a host keep its own answer for a stype the note also draws', async () => {
    const { RendererRegistry, intoRegistry, define, element, getGlobalRegistry } = await import('@barocss/dsl');
    const { noteRegistry } = await import('../src/renderers');

    /* A host that draws `paragraph` its own way — which is what every product does. */
    const host = new RendererRegistry({ global: false });
    intoRegistry(host as never, () => define('paragraph', element('section', { className: 'host-p' })));

    const held = (one: unknown) => (one as { _renderers: Map<string, unknown> })._renderers;
    expect(held(host).get('paragraph')).not.toBe(held(noteRegistry()).get('paragraph'));
    /* Neither of them is the global one, and the global one is still nobody's. */
    expect(held(getGlobalRegistry()).has('paragraph')).toBe(false);
  });
});
