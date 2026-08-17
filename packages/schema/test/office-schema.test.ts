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
    expect(schema.validateContent('listItem', [n('frame')]).valid).toBe(false);
  });

  it('blocks cannot appear where scene nodes are expected', () => {
    expect(schema.validateContent('frame', [n('paragraph')]).valid).toBe(false);
    expect(schema.validateContent('group', [n('heading')]).valid).toBe(false);
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
  it('a group must not be empty', () => {
    expect(schema.validateContent('group', [])).toHaveProperty('valid', false);
    expect(schema.validateContent('group', [n('rectangle')]).valid).toBe(true);
  });

  it('a frame may be empty', () => {
    expect(schema.validateContent('frame', []).valid).toBe(true);
  });

  it('atoms take no children', () => {
    expect(schema.getNodeType('rectangle')?.content).toBeUndefined();
    expect(schema.getNodeType('instance')?.content).toBeUndefined();
  });
});

describe('the document vocabulary survives the merge', () => {
  it('keeps the standard compound structures working', () => {
    expect(
      schema.validateContent('bTable', [n('bTableHeader'), n('bTableBody')]).valid
    ).toBe(true);
    expect(schema.validateContent('descList', [n('descTerm'), n('descDef')]).valid).toBe(true);
    expect(schema.validateContent('bDetails', [n('bSummary'), n('paragraph')]).valid).toBe(true);
  });

  it('keeps every standard mark', () => {
    for (const mark of ['bold', 'italic', 'link', 'highlight', 'fontColor']) {
      expect(schema.getMarkType(mark)).toBeDefined();
    }
  });

  it('names the surface kinds the built-in products use', () => {
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
    expect(schema.getNodeType('surfaceNote')?.attrs?.surfaceId?.required).toBe(true);
  });

  it('treats page furniture as a resource bound to a surface, or document-wide', () => {
    // surfaceId absent => applies to the whole document; present => one surface
    expect(schema.getNodeType('docHeader')?.attrs?.surfaceId?.required).toBeFalsy();
    expect(schema.getNodeType('docFooter')?.group).toBe('resource');
  });
});
