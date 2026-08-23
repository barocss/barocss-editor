import { describe, it, expect } from 'vitest';
import { Schema } from '../src/schema';
import { getOfficeSchemaDefinition, SurfaceKind } from '../src/office-schema';

/**
 * One schema for the whole Office suite. Products differ in behaviour, not in
 * data model — so what matters here is that the single vocabulary keeps the flow
 * and canvas domains apart while letting them nest deliberately.
 */
const schema = new Schema('office', getOfficeSchemaDefinition() as any);
const n = (stype: string) => ({ stype });

describe('Office schema: one model, four products', () => {
  it('roots at document → surface+', () => {
    expect(schema.validateContent('document', [n('surface')]).valid).toBe(true);
    expect(schema.validateContent('document', []).valid).toBe(false);
    // A page cannot sit at the root without a surface around it
    expect(schema.validateContent('document', [n('paragraph')]).valid).toBe(false);
  });

  it('a surface holds flow content (Word, PageBuilder)', () => {
    expect(schema.validateContent('surface', [n('heading'), n('paragraph')]).valid).toBe(true);
    expect(schema.validateContent('surface', [n('list')]).valid).toBe(true);
  });

  it('a surface holds scene content (Slide, FigJam)', () => {
    expect(schema.validateContent('surface', [n('frame'), n('sticky')]).valid).toBe(true);
    expect(schema.validateContent('surface', [n('rectangle'), n('connector')]).valid).toBe(true);
  });

  it('keeps the two domains from mixing on one surface', () => {
    // 'block+ | scene*' is a choice, not a union of children
    expect(schema.validateContent('surface', [n('paragraph'), n('rectangle')]).valid).toBe(false);
  });
});

describe('domain isolation is by group, not by a second schema', () => {
  it('scene nodes cannot appear where blocks are expected', () => {
    expect(schema.validateContent('blockQuote', [n('rectangle')]).valid).toBe(false);
    expect(schema.validateContent('listItem', [n('sticky')]).valid).toBe(false);
  });

  it('blocks cannot appear where scene nodes are expected', () => {
    expect(schema.validateContent('group', [n('heading')]).valid).toBe(false);
    expect(schema.validateContent('canvasBlock', [n('paragraph')]).valid).toBe(false);
  });

  /**
   * A frame is the exception, and deliberately.
   *
   * It is a *layout box* — a thing that holds other things and decides where
   * they go — which is as useful in a document as on a slide, so it is a block
   * and it holds either kind. Two columns of text in a report and a row of
   * cards on a slide are the same node; what differs is what is in it, which is
   * the shape `surface` already had.
   *
   * The arrangement follows from the contents and needs no second mechanism:
   * blocks have no coordinates, so the browser lays them out, and scene nodes
   * carry `x` and `y`, so the model computes them.
   */
  it('a frame is a block, and holds either kind', () => {
    expect(schema.validateContent('listItem', [n('frame')]).valid).toBe(true);
    expect(schema.validateContent('frame', [n('paragraph'), n('list')]).valid).toBe(true);
    expect(schema.validateContent('frame', [n('rectangle'), n('ellipse')]).valid).toBe(true);
  });

  it('keeps the two kinds from mixing inside one frame', () => {
    // The same choice `surface` makes: one or the other, not a mixture.
    expect(schema.validateContent('frame', [n('paragraph'), n('rectangle')]).valid).toBe(false);
  });

  it('is still reachable on a canvas, which names it', () => {
    expect(schema.validateContent('surface', [n('frame'), n('sticky')]).valid).toBe(true);
    expect(schema.validateContent('group', [n('frame')]).valid).toBe(true);
  });

  /**
   * And not inside the one canvas that is already in the flow.
   *
   * `canvasBlock` is a drawing embedded in a document, and a frame is a block —
   * so a reader who wants an arrangement puts the frame *around* the drawing.
   * Naming it inside as well would offer a route that only reads as sensible
   * until you ask what it looks like.
   */
  it('is not offered inside a canvas that is itself in the flow', () => {
    expect(schema.validateContent('canvasBlock', [n('frame')]).valid).toBe(false);
    expect(schema.validateContent('canvasBlock', [n('rectangle')]).valid).toBe(true);
  });

  /**
   * A frame in the flow has no width, and that is not an omission.
   *
   * Every other placed node must state one — a shape of no size cannot be drawn
   * — but a frame in a document is as wide as the column it sits in, and a
   * width written into the file would be a number that goes stale the first
   * time a margin moves.
   */
  it('lets a frame in the flow take its width from the page', () => {
    expect(schema.validateAttributes('frame', {}).valid).toBe(true);
    expect(schema.validateAttributes('rectangle', {}).valid).toBe(false);
  });
});

describe('the seams between domains are deliberate', () => {
  it('a canvas can be embedded in flow content', () => {
    // canvasBlock is in group 'block', so a Word document can hold a diagram
    expect(schema.validateContent('surface', [n('paragraph'), n('canvasBlock')]).valid).toBe(true);
    expect(schema.validateContent('canvasBlock', [n('rectangle'), n('connector')]).valid).toBe(true);
  });

  it('rich text can be embedded on a canvas', () => {
    // textFrame and sticky hold blocks, so every text command works inside them
    expect(schema.validateContent('textFrame', [n('paragraph')]).valid).toBe(true);
    expect(schema.validateContent('sticky', [n('paragraph'), n('list')]).valid).toBe(true);
    expect(schema.validateContent('textFrame', [])).toHaveProperty('valid', false);
  });

  it('nests canvas in flow in canvas without a second schema', () => {
    expect(schema.validateContent('canvasBlock', [n('textFrame')]).valid).toBe(true);
    expect(schema.validateContent('textFrame', [n('canvasBlock')]).valid).toBe(true);
  });
});

describe('containers enforce their own shape', () => {
  /**
   * A group may be empty **to the schema**, and never is to a reader.
   *
   * This asserted the opposite, and the rule it was asserting is real: a group with
   * nothing in it is not a group. What made it wrong here is *when* validation runs — on
   * the whole transaction — and ungrouping has to pass through the empty state: the
   * children leave one at a time and the group is removed after the last one. With `+`
   * every ungroup was rejected with "Content of 'group' ended early", so the gesture
   * could not be expressed at all.
   *
   * It hid behind a second bug for a long time (`moveNode` wrote an alias into the
   * child's `parentId`, so the children never actually left the group's content) and only
   * surfaced when a connector became the first thing to walk *up* the tree.
   *
   * The rule now lives with the commands that make and unmake groups: grouping refuses
   * fewer than two shapes, and ungrouping deletes the group it empties.
   */
  it('may be empty, because ungrouping passes through that state', () => {
    expect(schema.validateContent('group', []).valid).toBe(true);
    expect(schema.validateContent('group', [n('rectangle')]).valid).toBe(true);
  });

  it('a frame may be empty', () => {
    expect(schema.validateContent('frame', []).valid).toBe(true);
  });

  it('atoms take no children', () => {
    expect(schema.getNodeType('rectangle')?.content).toBeUndefined();
  });

  it('a definition lives in the library, and declares before it draws', () => {
    /*
     * Not a page, not a box on a slide, and not a corner of `resources` either — which it was,
     * and which worked. What moved it is display and ownership: every definition in
     * `resources` is hidden as a group because none of them belongs on the screen, and a
     * component's is the one that does while it is being edited. A container whose whole
     * purpose is components can simply be shown, and is a thing to own — a name, a source,
     * a brand kit.
     */
    expect(schema.getNodeType('component')?.group).toBe('component');
    expect(schema.validateContent('components', [n('component')]).valid).toBe(true);
    expect(schema.validateContent('document', [n('surface'), n('components')]).valid).toBe(true);

    // Its variables first — the definition's interface — then what it is made of.
    expect(
      schema.validateContent('component', [n('componentVar'), n('rectangle'), n('frame')]).valid
    ).toBe(true);
    expect(schema.getNodeType('component')?.attrs?.id?.required).toBe(true);
  });

  it('declares its variables as nodes, so they can be checked', () => {
    // A blob of JSON in one attribute cannot be validated, probed or read by a panel without a
    // parser — the argument this schema has already made twice.
    const kinds = schema.getNodeType('componentVar')?.attrs?.kind?.options;
    expect(kinds).toEqual(['text', 'color', 'number', 'boolean', 'choice']);
    expect(schema.getNodeType('componentVar')?.attrs?.name?.required).toBe(true);
    expect(schema.getNodeType('componentValue')?.attrs?.name?.required).toBe(true);
  });

  it('a placement says what its variables are, then holds its parts', () => {
    expect(
      schema.validateContent('instance', [n('componentValue'), n('rectangle')]).valid
    ).toBe(true);
  });

  it('a placement of a component is not an atom, and that is the design', () => {
    /*
     * It was `atom: true`, which said a placement could only ever be *placed*. A placement
     * has to be able to differ — this card, with that number — and it holds its own boxes to
     * say so: an instance is to a component what a slide is to a layout (canvas-model §10).
     *
     * It is also what lets a reader add a whole region **inside** a placement and put things
     * under it, which is the thing every component system that resolves children at draw time
     * cannot do — there is nowhere to put them.
     */
    expect(schema.getNodeType('instance')?.content).toBe('componentValue* (scene | frame)*');
    expect(schema.validateContent('instance', [n('rectangle'), n('frame')]).valid).toBe(true);
  });
});

describe('the document vocabulary survives the merge', () => {
  it('keeps the standard compound structures it offers', () => {
    expect(
      schema.validateContent('bTable', [n('bTableHeader'), n('bTableBody')]).valid
    ).toBe(true);
    expect(schema.validateContent('list', [n('listItem'), n('listItem')]).valid).toBe(true);
    expect(schema.validateContent('listItem', [n('paragraph')]).valid).toBe(true);
  });

  /**
   * And declares none of what it does not offer.
   *
   * This test used to assert that `descList` and `bDetails` worked here, which
   * was true and was the fault: office took the standard schema's node set
   * entire, so a document could legally hold a description list, a disclosure
   * block or a video that no office product draws — the text in the file and
   * nothing on the page. Two products wrote the same twenty-three write-offs.
   *
   * They are still in the standard schema for a product whose domain is the web.
   * Office simply does not claim them.
   */
  it('declares nothing it has no way to draw', () => {
    for (const absent of [
      'callout',
      'pullQuote',
      'taskItem',
      'columns',
      'column',
      'descList',
      'bDetails',
      'bFigure',
      'mediaVideo',
      'chart',
      'emoji',
      'toc',
      'docSection'
    ]) {
      expect(schema.getNodeType(absent), `${absent}이 여전히 선언되어 있습니다`).toBeUndefined();
    }

    // The three office does differently rather than not at all: equations are
    // OMML node names, a page number is furniture the layout pass paints, and a
    // contents page is `tableOfContents`, computed from the headings.
    for (const instead of ['mathInline', 'mathBlock', 'fieldPageNumber', 'fieldPageCount']) {
      expect(schema.getNodeType(instead), `${instead}이 여전히 선언되어 있습니다`).toBeUndefined();
    }
  });

  it('keeps every standard mark', () => {
    for (const mark of ['bold', 'italic', 'link', 'highlight', 'fontColor']) {
      expect(schema.getMarkType(mark)).toBeDefined();
    }
  });

  it('names the surface kinds the built-in products use', () => {
    /*
     * Three, and a component's definition is deliberately not a fourth. It was, briefly, and
     * then every reader of the page sequence had to ask whether each page counted — two of
     * them leaked before the third was written. A definition is a **resource**, which is
     * where this document already keeps what pages refer to (canvas-model §10).
     */
    expect(Object.values(SurfaceKind)).toEqual(['flow', 'slide', 'board']);
    expect(schema.getNodeType('surface')?.attrs?.kind?.default).toBe('flow');
  });
});

describe('document metadata and referenced definitions', () => {
  it('roots at meta? surface+ resources?', () => {
    expect(schema.validateContent('document', [n('surface')]).valid).toBe(true);
    expect(schema.validateContent('document', [n('docMeta'), n('surface')]).valid).toBe(true);
    expect(schema.validateContent('document', [n('surface'), n('resources')]).valid).toBe(true);
    expect(
      schema.validateContent('document', [n('docMeta'), n('surface'), n('resources')]).valid
    ).toBe(true);
  });

  it('keeps meta and resources on the outside of the pages, in order', () => {
    // resources before surfaces, or meta after them, is not the same document
    expect(schema.validateContent('document', [n('resources'), n('surface')]).valid).toBe(false);
    expect(schema.validateContent('document', [n('surface'), n('docMeta')]).valid).toBe(false);
    // and neither may stand in for a page
    expect(schema.validateContent('document', [n('docMeta'), n('resources')]).valid).toBe(false);
  });

  it('holds the title as content, not as an attribute', () => {
    // A title carries marks and takes a cursor, so it is a node
    expect(schema.validateContent('docMeta', [n('docTitle')]).valid).toBe(true);
    expect(schema.validateContent('docTitle', [n('inline-text')]).valid).toBe(true);
    expect(schema.validateContent('docMeta', [n('docTitle'), n('docSubtitle'), n('docAuthor')]).valid).toBe(true);
    // ...and the inline field that displays it still exists in the flow
    expect(schema.getNodeType('fieldDocTitle')?.group).toBe('inline');
  });

  it('no longer lets a footnote body sit in the flow', () => {
    // This is the concrete bug the split fixes: as `group: block` these could
    // appear between two paragraphs on a page.
    for (const stype of ['footnoteDef', 'endnoteDef', 'commentThread', 'bibliography', 'indexBlock']) {
      expect(schema.getNodeType(stype)?.group).toBe('resource');
      expect(schema.validateContent('surface', [n('paragraph'), n(stype)]).valid).toBe(false);
    }
  });

  it('collects every definition under resources', () => {
    expect(
      schema.validateContent('resources', [
        n('footnoteDef'),
        n('endnoteDef'),
        n('commentThread'),
        n('surfaceNote'),
        n('docHeader'),
        n('docFooter'),
        n('bibliography')
      ]).valid
    ).toBe(true);
    // resources holds definitions, not pages or flow content
    expect(schema.validateContent('resources', [n('paragraph')]).valid).toBe(false);
    expect(schema.validateContent('resources', [n('surface')]).valid).toBe(false);
  });

  it('lets a definition hold full block content', () => {
    // A footnote is not limited to one line of text
    expect(schema.validateContent('footnoteDef', [n('paragraph'), n('list')]).valid).toBe(true);
    expect(schema.validateContent('commentThread', [n('paragraph')]).valid).toBe(true);
  });

  it('binds definitions by id reference, the way the mark vocabulary already does', () => {
    expect(schema.getMarkType('footnoteRef')?.attrs?.id?.required).toBe(true);
    expect(schema.getNodeType('footnoteDef')?.attrs?.id?.required).toBe(true);
    // a comment names what it is about; a speaker note names its slide
    expect(schema.getNodeType('commentThread')?.attrs?.targetId).toBeDefined();
    expect(schema.getNodeType('surfaceNote')?.attrs?.id?.required).toBe(true);
  });

  it('treats page furniture as a resource bound to a surface, or document-wide', () => {
    // surfaceId absent => applies to the whole document; present => one surface
    expect(schema.getNodeType('docHeader')?.attrs?.surfaceId?.required).toBeFalsy();
    expect(schema.getNodeType('docFooter')?.group).toBe('resource');
  });
});
