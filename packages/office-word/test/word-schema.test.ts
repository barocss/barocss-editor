import { describe, it, expect } from 'vitest';
import { Schema } from '@barocss/schema';
import { getWordSchemaDefinition } from '../src/word-schema';

const schema = new Schema('word', getWordSchemaDefinition() as any);
const n = (stype: string) => ({ stype });
const attrs = (stype: string) => schema.getNodeType(stype)?.attrs ?? {};

describe('Word builds on the shared Office model', () => {
  it('keeps the Office root shape', () => {
    expect(schema.validateContent('document', [n('docMeta'), n('surface'), n('resources')]).valid).toBe(true);
    expect(schema.validateContent('document', [n('surface')]).valid).toBe(true);
  });

  it('keeps documents from other products valid', () => {
    // A surface holding canvas content still validates — Word may not edit it,
    // but it must not corrupt it on round-trip.
    expect(schema.validateContent('surface', [n('frame'), n('sticky')]).valid).toBe(true);
  });

  it('keeps the shared marks alongside its own', () => {
    for (const mark of ['bold', 'italic', 'link', 'footnoteRef']) {
      expect(schema.getMarkType(mark)).toBeDefined();
    }
    for (const mark of ['insertion', 'deletion', 'commentRef', 'charStyle']) {
      expect(schema.getMarkType(mark)).toBeDefined();
    }
  });
});

describe('a surface is a section, not a page', () => {
  it('carries page setup', () => {
    const a = attrs('surface');
    expect(a.pageWidth?.default).toBe(12240);
    expect(a.marginTop?.default).toBe(1440);
    expect(a.orientation?.default).toBe('portrait');
    expect(a.columnCount?.default).toBe(1);
  });

  it('says how the section begins', () => {
    expect(attrs('surface').sectionStart?.default).toBe('nextPage');
  });

  it('references its own headers and footers rather than embedding them', () => {
    const a = attrs('surface');
    for (const key of ['headerId', 'footerId', 'firstPageHeaderId', 'evenPageFooterId']) {
      expect(a[key]).toBeDefined();
    }
    // the bodies stay in resources
    expect(schema.getNodeType('docHeader')?.group).toBe('resource');
  });

  it('carries page numbering, which restarts per section in Word', () => {
    const a = attrs('surface');
    expect(a.pageNumberFormat).toBeDefined();
    expect(a.pageNumberStart).toBeDefined();
  });
});

describe('paragraph formatting', () => {
  it('records alignment, indentation and spacing', () => {
    const a = attrs('paragraph');
    for (const key of [
      'alignment', 'indentLeft', 'indentFirstLine', 'indentHanging',
      'spacingBefore', 'spacingAfter', 'spacingLine', 'spacingLineRule'
    ]) {
      expect(a[key]).toBeDefined();
    }
  });

  it('records the pagination controls that make a paragraph a layout unit', () => {
    const a = attrs('paragraph');
    expect(a.keepNext).toBeDefined();
    expect(a.keepLines).toBeDefined();
    expect(a.pageBreakBefore).toBeDefined();
    expect(a.widowControl?.default).toBe(true);
  });

  it('points at a named style as well as holding direct formatting', () => {
    // Both, not either: "clear direct formatting" only means something if the
    // style reference survives it.
    const a = attrs('paragraph');
    expect(a.styleId).toBeDefined();
    expect(a.alignment).toBeDefined();
  });

  it('points at a numbering definition and level', () => {
    expect(attrs('paragraph').numId).toBeDefined();
    expect(attrs('paragraph').numLevel).toBeDefined();
    expect(attrs('listItem').numLevel?.default).toBe(0);
  });

  it('applies the same formatting to headings and list items', () => {
    expect(attrs('heading').alignment).toBeDefined();
    expect(attrs('listItem').indentLeft).toBeDefined();
  });
});

describe('named styles', () => {
  it('lives in resources, not in the flow', () => {
    expect(schema.getNodeType('styleDef')?.group).toBe('resource');
    expect(schema.validateContent('resources', [n('styleDef')]).valid).toBe(true);
    expect(schema.validateContent('surface', [n('styleDef')]).valid).toBe(false);
  });

  it('carries an inheritance chain and a follow-on style', () => {
    const a = attrs('styleDef');
    expect(a.id?.required).toBe(true);
    expect(a.name?.required).toBe(true);
    expect(a.basedOn).toBeDefined();
    expect(a.next).toBeDefined();
    expect(a.link).toBeDefined();
  });

  it('can describe paragraph, character and table formatting', () => {
    const a = attrs('styleDef');
    expect(a.alignment).toBeDefined();     // paragraph
    expect(a.fontFamily).toBeDefined();    // character
    expect(a.cellMarginLeft).toBeDefined(); // table
  });

  it('has document-wide defaults to fall back to', () => {
    expect(schema.getNodeType('docDefaults')?.group).toBe('resource');
    expect(attrs('docDefaults').fontSize).toBeDefined();
  });
});

describe('multi-level numbering', () => {
  it('is a definition with levels as children', () => {
    expect(schema.getNodeType('numberingDef')?.group).toBe('resource');
    expect(schema.validateContent('numberingDef', [n('numberingLevel')]).valid).toBe(true);
    // a definition with no levels is not a definition
    expect(schema.validateContent('numberingDef', []).valid).toBe(false);
  });

  it('keeps a level unreachable except through its definition', () => {
    expect(schema.getNodeType('numberingLevel')?.group).toBeUndefined();
    expect(schema.validateContent('resources', [n('numberingLevel')]).valid).toBe(false);
    expect(schema.validateContent('surface', [n('numberingLevel')]).valid).toBe(false);
  });

  it('describes format, pattern, start and restart per level', () => {
    const a = attrs('numberingLevel');
    expect(a.level?.required).toBe(true);
    expect(a.format?.default).toBe('decimal');
    expect(a.text).toBeDefined();          // "%1.%2."
    expect(a.start?.default).toBe(1);
    expect(a.restartAfterLevel).toBeDefined();
    expect(a.suffix?.default).toBe('tab');
  });
});

describe('table formatting', () => {
  it('describes the table, its rows and its cells', () => {
    expect(attrs('bTable').layout?.default).toBe('auto');
    expect(attrs('bTable').grid).toBeDefined();
    expect(attrs('bTableRow').isHeader?.default).toBe(false);
    expect(attrs('bTableRow').cantSplit?.default).toBe(false);
    expect(attrs('bTableCell').verticalAlign?.default).toBe('top');
    expect(attrs('bTableCell').textDirection).toBeDefined();
  });

  it('keeps borders and shading on every level that can carry them', () => {
    for (const stype of ['paragraph', 'bTable', 'bTableCell', 'surface']) {
      expect(attrs(stype).borderTopStyle).toBeDefined();
    }
    for (const stype of ['paragraph', 'bTable', 'bTableCell']) {
      expect(attrs(stype).shadingFill).toBeDefined();
    }
  });

  it('keeps the merge attributes the Office model already had', () => {
    expect(attrs('bTableCell').colspan?.default).toBe(1);
    expect(attrs('bTableCell').rowspan?.default).toBe(1);
  });
});

describe('tracked changes', () => {
  it('models insert, delete and format changes as marks, because they cover ranges', () => {
    for (const mark of ['insertion', 'deletion', 'formatChange']) {
      const m = schema.getMarkType(mark);
      expect(m?.group).toBe('revision');
      expect(m?.attrs?.author?.required).toBe(true);
      expect(m?.attrs?.id?.required).toBe(true);
    }
  });

  it('pairs a move with a shared id', () => {
    expect(schema.getMarkType('moveFrom')?.attrs?.moveId?.required).toBe(true);
    expect(schema.getMarkType('moveTo')?.attrs?.moveId?.required).toBe(true);
  });

  it('records revision authorship on block nodes too', () => {
    for (const stype of ['paragraph', 'bTableRow', 'contentControl']) {
      expect(attrs(stype).revisionAuthor).toBeDefined();
    }
  });

  it('has a tracking switch and an author registry', () => {
    expect(attrs('docSettings').trackRevisions?.default).toBe(false);
    expect(attrs('personDef').name?.required).toBe(true);
  });
});

describe('comments and cross-references', () => {
  it('anchors a comment with a mark and keeps the thread in resources', () => {
    // Same split as footnoteRef/footnoteDef, which the Office model established
    expect(schema.getMarkType('commentRef')?.attrs?.id?.required).toBe(true);
    expect(schema.getNodeType('commentThread')?.group).toBe('resource');
  });

  it('marks a bookmark over a range and references it by id', () => {
    expect(schema.getMarkType('bookmark')?.attrs?.name?.required).toBe(true);
    expect(attrs('fieldRef').targetId?.required).toBe(true);
  });

  it('numbers captions with sequence fields', () => {
    expect(attrs('fieldSeq').sequence?.required).toBe(true);
    expect(schema.getNodeType('fieldSeq')?.group).toBe('inline');
  });

  it('keeps endnotes symmetrical with footnotes', () => {
    expect(schema.getMarkType('endnoteRef')?.attrs?.id?.required).toBe(true);
    expect(schema.getNodeType('endnoteDef')?.group).toBe('resource');
  });
});

describe('Word block and inline additions', () => {
  it('has content controls that wrap block content', () => {
    expect(schema.validateContent('surface', [n('contentControl')]).valid).toBe(true);
    expect(schema.validateContent('contentControl', [n('paragraph')]).valid).toBe(true);
    expect(attrs('contentControl').controlType?.default).toBe('richText');
  });

  it('has floating text boxes with wrap settings', () => {
    expect(schema.validateContent('textBox', [n('paragraph')]).valid).toBe(true);
    expect(attrs('textBox').wrapType?.default).toBe('square');
    expect(attrs('textBox').anchorTo?.default).toBe('paragraph');
  });

  it('has explicit page and column breaks', () => {
    expect(schema.validateContent('surface', [n('paragraph'), n('pageBreak')]).valid).toBe(true);
    expect(schema.validateContent('surface', [n('columnBreak')]).valid).toBe(true);
  });

  it('has a table of contents that stores its generated result', () => {
    expect(schema.validateContent('tableOfContents', [n('paragraph')]).valid).toBe(true);
    expect(attrs('tableOfContents').levels?.default).toBe('1-3');
  });

  it('has the inline run elements Word models as nodes rather than text', () => {
    for (const stype of ['tab', 'noBreakHyphen', 'softHyphen', 'noteNumber']) {
      expect(schema.getNodeType(stype)?.group).toBe('inline');
    }
    expect(schema.validateContent('paragraph', [n('inline-text'), n('tab')]).valid).toBe(true);
  });
});

describe('measurement conventions', () => {
  it('uses twips for lengths and half-points for font size, as Word does', () => {
    // US Letter is 8.5in x 11in => 12240 x 15840 twips; a 1in margin is 1440.
    expect(attrs('surface').pageWidth?.default).toBe(12240);
    expect(attrs('surface').pageHeight?.default).toBe(15840);
    expect(attrs('surface').marginLeft?.default).toBe(1440);
    // fontSize has no default: unset means "inherit", not "12pt"
    expect(attrs('docDefaults').fontSize?.default).toBeUndefined();
  });
});
