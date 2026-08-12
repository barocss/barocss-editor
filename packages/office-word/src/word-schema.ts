/**
 * The Word schema.
 *
 * Word is a **product** over the shared Office model, not a separate model: this
 * builds on `getOfficeSchemaDefinition()` and adds what a word processor needs on
 * top — paragraph formatting, named styles, sections, multi-level numbering,
 * table formatting, tracked changes and comment anchors.
 *
 * Three conventions run through it:
 *
 * 1. **A `surface` is a section, not a physical page.** Word text is a flow that
 *    gets paginated; physical pages are a layout artifact produced by the product,
 *    not data. A section is the unit that owns page setup, so that is what a
 *    surface represents here. A one-section document has exactly one surface.
 *
 * 2. **Definitions live in `resources`, references live in the flow.** Styles,
 *    numbering definitions, footnote bodies and comment threads are all
 *    referenced by id from where they are used. This is the mechanism the Office
 *    schema already establishes; Word just adds more definition types.
 *
 * 3. **Range-scoped formatting is a mark; node-scoped formatting is an
 *    attribute.** Anything that can apply to part of a text node has to be a
 *    mark, because marks carry ranges and attributes do not. That is why tracked
 *    insertions and comment anchors are marks.
 */
import { mathDefinitions } from './math-schema';
import {
  getOfficeSchemaDefinition,
  type NodeTypeDefinition,
  type MarkDefinition,
  type SchemaDefinition
} from '@barocss/schema';
import {
  characterFormatAttrs,
  pageSetupAttrs,
  paragraphFormatAttrs,
  revisionAttrs,
  tableCellFormatAttrs,
  tableFormatAttrs,
  tableRowFormatAttrs
} from './formatting';

const RESOURCE = 'resource';

/**
 * Definitions a Word document refers to but does not lay out: styles, numbering,
 * and the document's own defaults.
 */
function wordResourceDefinitions(): Record<string, NodeTypeDefinition> {
  return {
    /**
     * A named style. `type` says what it may be applied to, and `basedOn` forms
     * the inheritance chain the product resolves. Formatting is held as
     * attributes rather than child nodes because a style is a value, not content
     * — nothing in it is separately editable or addressable.
     */
    styleDef: {
      name: 'styleDef',
      group: RESOURCE,
      atom: true,
      attrs: {
        id: { type: 'string', required: true },
        name: { type: 'string', required: true },
        type: { type: 'string', default: 'paragraph' }, // paragraph | character | table | numbering
        basedOn: { type: 'string', required: false },
        /** Style applied to the paragraph that follows one in this style. */
        next: { type: 'string', required: false },
        /** Character style linked to this paragraph style, and vice versa. */
        link: { type: 'string', required: false },
        isDefault: { type: 'boolean', default: false },
        /** Hidden from the style gallery but still applied. */
        semiHidden: { type: 'boolean', default: false },
        quickFormat: { type: 'boolean', default: false },
        priority: { type: 'number', required: false },
        /** Prevents the user from changing it. */
        locked: { type: 'boolean', default: false },
        ...paragraphFormatAttrs(),
        ...characterFormatAttrs(),
        ...tableFormatAttrs()
      }
    },

    /**
     * A multi-level list definition: nine levels, each with its own format and
     * indentation. Paragraphs point at it with `numId` + `numLevel`.
     *
     * Levels are child nodes rather than attributes because a level is a
     * repeating structure with its own identity, and users edit them one at a
     * time in the list-definition dialog.
     */
    numberingDef: {
      name: 'numberingDef',
      group: RESOURCE,
      content: 'numberingLevel+',
      attrs: {
        id: { type: 'string', required: true },
        name: { type: 'string', required: false },
        /** Abstract definitions are shared; a concrete one may override levels. */
        abstractId: { type: 'string', required: false },
        multiLevelType: { type: 'string', default: 'multilevel' } // singleLevel | multilevel | hybridMultilevel
      }
    },
    numberingLevel: {
      name: 'numberingLevel',
      // No group: a level is only ever reachable through numberingDef's content
      // expression, never as a free-standing block or resource.
      atom: true,
      attrs: {
        level: { type: 'number', required: true }, // 0-8
        format: { type: 'string', default: 'decimal' }, // decimal | bullet | upperRoman | lowerLetter ...
        /** Pattern such as "%1.%2." — %n substitutes the counter at level n. */
        text: { type: 'string', required: false },
        start: { type: 'number', default: 1 },
        /** Restart this level's counter when the given level increments. */
        restartAfterLevel: { type: 'number', required: false },
        alignment: { type: 'string', default: 'left' },
        /** How the number is separated from the text. */
        suffix: { type: 'string', default: 'tab' }, // tab | space | nothing
        indentLeft: { type: 'number', required: false },
        indentHanging: { type: 'number', required: false },
        fontFamily: { type: 'string', required: false },
        isLegal: { type: 'boolean', default: false }
      }
    },

    /** Document-wide defaults every style ultimately falls back to. */
    docDefaults: {
      name: 'docDefaults',
      group: RESOURCE,
      atom: true,
      attrs: {
        ...paragraphFormatAttrs(),
        ...characterFormatAttrs()
      }
    },

    /**
     * Document settings that are neither content nor formatting: proofing state,
     * tracked-changes mode, protection.
     */
    docSettings: {
      name: 'docSettings',
      group: RESOURCE,
      atom: true,
      attrs: {
        trackRevisions: { type: 'boolean', default: false },
        defaultTabStop: { type: 'number', default: 720 },
        evenAndOddHeaders: { type: 'boolean', default: false },
        mirrorMargins: { type: 'boolean', default: false },
        hyphenationAuto: { type: 'boolean', default: false },
        hyphenationZone: { type: 'number', required: false },
        consecutiveHyphenLimit: { type: 'number', required: false },
        footnotePosition: { type: 'string', default: 'pageBottom' }, // pageBottom | beneathText | sectEnd | docEnd
        footnoteNumberFormat: { type: 'string', default: 'decimal' },
        footnoteNumberStart: { type: 'number', default: 1 },
        footnoteRestart: { type: 'string', default: 'continuous' }, // continuous | eachSect | eachPage
        endnotePosition: { type: 'string', default: 'docEnd' },
        endnoteNumberFormat: { type: 'string', default: 'lowerRoman' },
        protectionType: { type: 'string', required: false }, // readOnly | comments | trackedChanges | forms
        language: { type: 'string', required: false }
      }
    },

    /**
     * A person referenced by revisions and comments. Held once so renaming an
     * author does not mean rewriting every mark.
     */
    personDef: {
      name: 'personDef',
      group: RESOURCE,
      atom: true,
      attrs: {
        id: { type: 'string', required: true },
        name: { type: 'string', required: true },
        initials: { type: 'string', required: false },
        email: { type: 'string', required: false },
        color: { type: 'string', required: false }
      }
    }
  };
}

/** Block-level nodes Word adds to the flow. */
function wordBlockDefinitions(): Record<string, NodeTypeDefinition> {
  return {
    /**
     * A content control (Word's structured document tag): a labelled region that
     * may be locked, bound to data, or act as a form field.
     */
    contentControl: {
      name: 'contentControl',
      group: 'block',
      content: 'block+',
      attrs: {
        id: { type: 'string', required: true },
        tag: { type: 'string', required: false },
        title: { type: 'string', required: false },
        controlType: { type: 'string', default: 'richText' }, // richText | plainText | dropDown | date | checkbox | picture | repeating
        placeholder: { type: 'string', required: false },
        lockContent: { type: 'boolean', default: false },
        lockDelete: { type: 'boolean', default: false },
        /** XPath into the custom XML part, for data-bound controls. */
        dataBinding: { type: 'string', required: false },
        ...revisionAttrs()
      }
    },

    /**
     * A floating text box or shape anchored to a position in the flow. The body
     * is ordinary block content, so every text command works inside it.
     */
    textBox: {
      name: 'textBox',
      group: 'block',
      content: 'block+',
      attrs: {
        anchorTo: { type: 'string', default: 'paragraph' }, // paragraph | page | margin | character
        wrapType: { type: 'string', default: 'square' }, // inline | square | tight | through | topAndBottom | behind | inFront
        horizontalAlign: { type: 'string', required: false },
        verticalAlign: { type: 'string', required: false },
        offsetX: { type: 'number', default: 0 },
        offsetY: { type: 'number', default: 0 },
        width: { type: 'number', required: false },
        height: { type: 'number', required: false },
        zOrder: { type: 'number', default: 0 },
        ...revisionAttrs()
      }
    },

    /** Explicit page and column breaks. Soft breaks come from pagination. */
    pageBreak: { name: 'pageBreak', group: 'block', atom: true, attrs: { ...revisionAttrs() } },
    columnBreak: { name: 'columnBreak', group: 'block', atom: true, attrs: { ...revisionAttrs() } },

    /** A generated table of contents or table of figures. */
    tableOfContents: {
      name: 'tableOfContents',
      group: 'block',
      // Holds the last generated result so the document renders without recompute.
      content: 'block*',
      attrs: {
        levels: { type: 'string', default: '1-3' },
        styleFilter: { type: 'string', required: false },
        useHyperlinks: { type: 'boolean', default: true },
        showPageNumbers: { type: 'boolean', default: true },
        rightAlignPageNumbers: { type: 'boolean', default: true },
        leader: { type: 'string', default: 'dot' },
        caption: { type: 'string', required: false } // 'Figure' / 'Table' for a table of figures
      }
    }
  };
}

/** Inline nodes Word adds. */
function wordInlineDefinitions(): Record<string, NodeTypeDefinition> {
  return {
    /** A tab character, which Word models as a run element rather than as text. */
    tab: { name: 'tab', group: 'inline', atom: true },
    /** Non-breaking hyphen and optional (soft) hyphen. */
    noBreakHyphen: { name: 'noBreakHyphen', group: 'inline', atom: true },
    softHyphen: { name: 'softHyphen', group: 'inline', atom: true },

    /** Cross-reference and sequence fields, alongside the Office field set. */
    fieldRef: {
      name: 'fieldRef',
      group: 'inline',
      atom: true,
      attrs: {
        targetId: { type: 'string', required: true },
        format: { type: 'string', default: 'text' }, // text | pageNumber | paragraphNumber | aboveBelow
        useHyperlink: { type: 'boolean', default: true }
      }
    },
    fieldSeq: {
      name: 'fieldSeq',
      group: 'inline',
      atom: true,
      attrs: {
        sequence: { type: 'string', required: true }, // 'Figure', 'Table', ...
        format: { type: 'string', default: 'decimal' },
        restartLevel: { type: 'number', required: false }
      }
    },
    fieldStyleRef: {
      name: 'fieldStyleRef',
      group: 'inline',
      atom: true,
      attrs: {
        styleId: { type: 'string', required: true },
        searchFromBottom: { type: 'boolean', default: false }
      }
    },
    /** A footnote or endnote's own number, as rendered inside its body. */
    noteNumber: { name: 'noteNumber', group: 'inline', atom: true }
  };
}

/**
 * Marks Word adds.
 *
 * Each of these applies to a *range* inside a text node, which is exactly why it
 * cannot be an attribute: tracked changes and comments both need to cover part of
 * a paragraph.
 */
function wordMarkDefinitions(): Record<string, MarkDefinition> {
  return {
    /** Text inserted while change tracking was on. */
    insertion: {
      name: 'insertion',
      group: 'revision',
      attrs: {
        id: { type: 'string', required: true },
        author: { type: 'string', required: true },
        date: { type: 'string', required: false }
      }
    },
    /**
     * Text deleted while change tracking was on. The text stays in the document
     * — that is the whole point — and the product renders it struck through
     * until the change is accepted.
     */
    deletion: {
      name: 'deletion',
      group: 'revision',
      attrs: {
        id: { type: 'string', required: true },
        author: { type: 'string', required: true },
        date: { type: 'string', required: false }
      }
    },
    /** Formatting changed while tracking was on; `before` holds the old format. */
    formatChange: {
      name: 'formatChange',
      group: 'revision',
      attrs: {
        id: { type: 'string', required: true },
        author: { type: 'string', required: true },
        date: { type: 'string', required: false },
        before: { type: 'string', required: false }
      }
    },
    /** Text moved as a unit; the pair shares `moveId`. */
    moveFrom: {
      name: 'moveFrom',
      group: 'revision',
      attrs: { id: { type: 'string', required: true }, moveId: { type: 'string', required: true }, author: { type: 'string', required: true } }
    },
    moveTo: {
      name: 'moveTo',
      group: 'revision',
      attrs: { id: { type: 'string', required: true }, moveId: { type: 'string', required: true }, author: { type: 'string', required: true } }
    },

    /**
     * The anchor for a comment. The thread body lives in `resources`; this only
     * says which range it is about — mirroring how `footnoteRef` works.
     */
    commentRef: {
      name: 'commentRef',
      group: 'annotation',
      attrs: { id: { type: 'string', required: true } }
    },

    /** A cross-reference target that covers a range rather than a point. */
    bookmark: {
      name: 'bookmark',
      group: 'annotation',
      attrs: { id: { type: 'string', required: true }, name: { type: 'string', required: true } }
    },

    /** Endnote reference, alongside the existing footnoteRef. */
    endnoteRef: {
      name: 'endnoteRef',
      group: 'text-style',
      attrs: { id: { type: 'string', required: true } }
    },

    /** Character-level properties Word has that the standard mark set lacks. */
    allCaps: { name: 'allCaps', group: 'text-style' },
    doubleStrike: { name: 'doubleStrike', group: 'text-style' },
    vanish: { name: 'vanish', group: 'text-style' },
    outlineText: { name: 'outlineText', group: 'text-style' },
    shadowText: { name: 'shadowText', group: 'text-style' },
    emboss: { name: 'emboss', group: 'text-style' },
    imprint: { name: 'imprint', group: 'text-style' },
    noProof: { name: 'noProof', group: 'text-style' },
    /** Applies a named character style to a range. */
    charStyle: {
      name: 'charStyle',
      group: 'text-style',
      attrs: { styleId: { type: 'string', required: true } }
    }
  };
}

/**
 * The Word schema: the Office model plus word-processor formatting.
 *
 * Existing Office node types are re-declared where Word needs more attributes on
 * them (paragraphs gain formatting, tables gain borders, surfaces gain page
 * setup); their content models are unchanged, so a document authored in another
 * product still validates.
 */
export function getWordSchemaDefinition(): SchemaDefinition {
  const office = getOfficeSchemaDefinition();

  return {
    topNode: 'document',
    nodes: {
      ...office.nodes,

      /**
       * A picture, which in Word is a good deal more than a source.
       *
       * How the text behaves around it is the important part: an inline picture
       * is a very large character and moves with the words either side of it,
       * and a floating one does not, so which it is decides what every line
       * near it does. Sizes and distances are twips like everything else the
       * document measures.
       */
      'inline-image': {
        ...office.nodes['inline-image'],
        attrs: {
          ...office.nodes['inline-image'].attrs,
          width: { type: 'number', required: false },
          height: { type: 'number', required: false },
          // inline | square | tight | topAndBottom | behind | front
          wrap: { type: 'string', default: 'inline' },
          side: { type: 'string', required: false },   // left | right
          distanceTop: { type: 'number', required: false },
          distanceBottom: { type: 'number', required: false },
          distanceLeft: { type: 'number', required: false },
          distanceRight: { type: 'number', required: false },
          offsetX: { type: 'number', required: false },
          offsetY: { type: 'number', required: false },
          // The outline the text follows for `tight`, in Word's own square of
          // 0..21600 a side — so it survives the picture being resized.
          wrapPolygon: { type: 'array', required: false },
          shapeMargin: { type: 'number', required: false }
        }
      },

      /** A surface in Word is a *section*: the unit that owns page setup. */
      surface: {
        ...office.nodes.surface,
        attrs: {
          ...office.nodes.surface.attrs,
          kind: { type: 'string', default: 'flow' },
          /** How this section begins relative to the previous one. */
          sectionStart: { type: 'string', default: 'nextPage' }, // continuous | nextPage | nextColumn | evenPage | oddPage
          headerId: { type: 'string', required: false },
          footerId: { type: 'string', required: false },
          firstPageHeaderId: { type: 'string', required: false },
          firstPageFooterId: { type: 'string', required: false },
          evenPageHeaderId: { type: 'string', required: false },
          evenPageFooterId: { type: 'string', required: false },
          ...pageSetupAttrs()
        }
      },

      paragraph: {
        ...office.nodes.paragraph,
        attrs: {
          ...office.nodes.paragraph.attrs,
          ...paragraphFormatAttrs(),
          ...revisionAttrs()
        }
      },
      heading: {
        ...office.nodes.heading,
        attrs: {
          ...office.nodes.heading.attrs,
          ...paragraphFormatAttrs(),
          ...revisionAttrs()
        }
      },
      list: {
        ...office.nodes.list,
        attrs: { ...office.nodes.list.attrs, numId: { type: 'string', required: false } }
      },
      listItem: {
        ...office.nodes.listItem,
        attrs: {
          ...office.nodes.listItem.attrs,
          ...paragraphFormatAttrs(),
          ...revisionAttrs(),
          // After the spread: paragraphFormatAttrs leaves numLevel unset
          // ("inherit"), but a list item is always at some level, and top level
          // is the sensible default.
          numLevel: { type: 'number', default: 0 }
        }
      },

      bTable: {
        ...office.nodes.bTable,
        attrs: { ...office.nodes.bTable.attrs, ...tableFormatAttrs(), ...revisionAttrs() }
      },
      bTableRow: {
        ...office.nodes.bTableRow,
        attrs: { ...office.nodes.bTableRow.attrs, ...tableRowFormatAttrs(), ...revisionAttrs() }
      },
      bTableCell: {
        ...office.nodes.bTableCell,
        attrs: { ...office.nodes.bTableCell.attrs, ...tableCellFormatAttrs(), ...revisionAttrs() }
      },
      bTableHeaderCell: {
        ...office.nodes.bTableHeaderCell,
        attrs: { ...office.nodes.bTableHeaderCell.attrs, ...tableCellFormatAttrs(), ...revisionAttrs() }
      },

      ...wordBlockDefinitions(),
      ...wordInlineDefinitions(),
      ...wordResourceDefinitions(),
      // Equations, shaped like OMML. See math-schema for why the names are
      // Word's rather than LaTeX's.
      ...mathDefinitions()
    },
    marks: {
      ...office.marks,
      ...wordMarkDefinitions()
    }
  };
}
