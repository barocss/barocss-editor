import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Editor, ModelSelection } from '@barocss/editor-core';

const recordedTransactions: any[][] = [];
const commitMock = vi.fn();

vi.mock('@barocss/model', () => {
  return {
    transaction: (_editor: Editor, operations: any[], _opts?: any) => {
      recordedTransactions.push(operations);
      return { commit: commitMock };
    },
    addChild: (parentId: string, child: any, position?: number) => ({
      type: 'addChild', payload: { parentId, child, position }
    }),
    removeChild: (parentId: string, childId: string) => ({
      type: 'removeChild', payload: { parentId, childId }
    }),
    toggleMark: (startId: string, startOff: number, endId: string, endOff: number, markType: string, attrs?: any) => ({
      type: 'toggleMark', payload: { range: { startNodeId: startId, startOffset: startOff, endNodeId: endId, endOffset: endOff }, markType, attrs }
    }),
    applyMark: (startId: string, startOff: number, endId: string, endOff: number, markType: string, attrs?: any) => ({
      type: 'applyMark', payload: { range: { startNodeId: startId, startOffset: startOff, endNodeId: endId, endOffset: endOff }, markType, attrs }
    }),
    splitTextNode: (nodeId: string, offset: number) => ({
      type: 'splitTextNode', payload: { nodeId, offset }
    }),
    control: (_target: string, ops: any[]) => ops,
  };
});

const defaultSelection: ModelSelection = {
  type: 'range',
  startNodeId: 'text-1',
  startOffset: 0,
  endNodeId: 'text-1',
  endOffset: 5,
  collapsed: false,
  direction: 'forward'
};

function createFakeEditor(dataStore?: any, sel?: ModelSelection): any {
  const commands: Record<string, any> = {};
  return {
    registerCommand: (cmd: any) => { commands[cmd.name] = cmd; },
    __getCommand(name: string) { return commands[name]; },
    selection: sel ?? defaultSelection,
    dataStore: dataStore ?? {
      getNode: (id: string) => {
        if (id === 'text-1') return { sid: 'text-1', stype: 'inline-text', text: 'Hello', parentId: 'para-1' };
        if (id === 'para-1') return { sid: 'para-1', stype: 'paragraph', content: ['text-1'], parentId: 'doc-1' };
        if (id === 'doc-1') return { sid: 'doc-1', stype: 'document', content: ['para-1'] };
        return null;
      },
      getActiveSchema: () => ({
        getNodeType: (stype: string) => {
          if (['paragraph', 'heading', 'blockQuote', 'codeBlock', 'list'].includes(stype)) return { group: 'block' };
          if (['inline-text', 'hardBreak', 'emoji'].includes(stype)) return { group: 'inline' };
          if (stype === 'document') return { group: 'document' };
          return { group: 'block' };
        }
      }),
      getRootNodeId: () => 'doc-1',
    }
  };
}

describe('PullQuoteExtension', () => {
  beforeEach(() => { recordedTransactions.length = 0; commitMock.mockReset(); commitMock.mockResolvedValue({ success: true }); });

  it('insertPullQuote registers and creates a pullQuote node', async () => {
    const { PullQuoteExtension } = await import('../src/pull-quote');
    const editor = createFakeEditor();
    const ext = new PullQuoteExtension();
    ext.onCreate(editor);

    const cmd = editor.__getCommand('insertPullQuote');
    expect(cmd).toBeDefined();

    await cmd.execute(editor, { text: 'A great quote' });
    expect(commitMock).toHaveBeenCalledTimes(1);
    expect(recordedTransactions[0][0].type).toBe('addChild');
    expect(recordedTransactions[0][0].payload.child.stype).toBe('pullQuote');
  });
});

describe('ColumnsExtension', () => {
  beforeEach(() => { recordedTransactions.length = 0; commitMock.mockReset(); commitMock.mockResolvedValue({ success: true }); });

  it('insertColumns creates a columns node with 2 columns by default', async () => {
    const { ColumnsExtension } = await import('../src/columns');
    const editor = createFakeEditor();
    const ext = new ColumnsExtension();
    ext.onCreate(editor);

    const cmd = editor.__getCommand('insertColumns');
    expect(cmd).toBeDefined();

    await cmd.execute(editor);
    expect(commitMock).toHaveBeenCalledTimes(1);
    const child = recordedTransactions[0][0].payload.child;
    expect(child.stype).toBe('columns');
    expect(child.content).toHaveLength(2);
    expect(child.content[0].stype).toBe('column');
  });

  it('insertColumns creates specified number of columns', async () => {
    const { ColumnsExtension } = await import('../src/columns');
    const editor = createFakeEditor();
    const ext = new ColumnsExtension();
    ext.onCreate(editor);

    await editor.__getCommand('insertColumns').execute(editor, { count: 3 });
    expect(recordedTransactions[0][0].payload.child.content).toHaveLength(3);
  });

  it('addColumn adds a column to existing columns node', async () => {
    const { ColumnsExtension } = await import('../src/columns');
    const ds = {
      ...createFakeEditor().dataStore,
      getNode: (id: string) => {
        if (id === 'cols-1') return { sid: 'cols-1', stype: 'columns', content: ['col-1'] };
        return createFakeEditor().dataStore.getNode(id);
      }
    };
    const editor = createFakeEditor(ds);
    const ext = new ColumnsExtension();
    ext.onCreate(editor);

    await editor.__getCommand('addColumn').execute(editor, { columnsId: 'cols-1' });
    expect(commitMock).toHaveBeenCalledTimes(1);
    expect(recordedTransactions[0][0].payload.child.stype).toBe('column');
  });

  /**
   * The columns have to **be there** — which this test used not to say.
   *
   * It handed the command `cols-1` and `col-2` over a store that answers `null` for both, and
   * asserted that a `removeChild` transaction came out. That is the command building an operation
   * against two ids naming nothing: the validator would refuse it, the document would not move, and
   * the command would report success. The test was asserting the bug.
   *
   * It broke the day the guard started asking whether the pair is real, which is the right way round
   * — and it is a small example of the shape this package's conformance run exists to correct: a
   * fake store and a mocked commit can only check the operation a command *builds*, never whether
   * anything happens.
   */
  it('removeColumn removes a column that is there, and leaves the last one alone', async () => {
    const { ColumnsExtension } = await import('../src/columns');
    const twoColumns = {
      getNode: (id: string) => {
        if (id === 'cols-1') return { sid: 'cols-1', stype: 'columns', content: ['col-1', 'col-2'] };
        if (id === 'col-1' || id === 'col-2') return { sid: id, stype: 'column', content: [], parentId: 'cols-1' };
        return null;
      }
    };
    const editor = createFakeEditor(twoColumns);
    const ext = new ColumnsExtension();
    ext.onCreate(editor);

    await editor.__getCommand('removeColumn').execute(editor, { columnsId: 'cols-1', columnId: 'col-2' });
    expect(commitMock).toHaveBeenCalledTimes(1);
    expect(recordedTransactions[0][0].type).toBe('removeChild');

    // And a `columns` holds `column+`: emptying it is a document the schema will not take.
    const one = createFakeEditor({
      getNode: (id: string) =>
        id === 'cols-1'
          ? { sid: 'cols-1', stype: 'columns', content: ['col-1'] }
          : id === 'col-1'
            ? { sid: 'col-1', stype: 'column', content: [], parentId: 'cols-1' }
            : null
    });
    new ColumnsExtension().onCreate(one);
    expect(one.__getCommand('removeColumn').canExecute(one, { columnsId: 'cols-1', columnId: 'col-1' })).toBe(false);
  });
});

describe('TocExtension', () => {
  beforeEach(() => { recordedTransactions.length = 0; commitMock.mockReset(); commitMock.mockResolvedValue({ success: true }); });

  it('insertToc creates a toc atom node', async () => {
    const { TocExtension } = await import('../src/toc');
    const editor = createFakeEditor();
    const ext = new TocExtension();
    ext.onCreate(editor);

    await editor.__getCommand('insertToc').execute(editor);
    expect(commitMock).toHaveBeenCalledTimes(1);
    expect(recordedTransactions[0][0].payload.child.stype).toBe('toc');
  });
});

describe('DetailsExtension', () => {
  beforeEach(() => { recordedTransactions.length = 0; commitMock.mockReset(); commitMock.mockResolvedValue({ success: true }); });

  it('insertDetails creates a bDetails node with bSummary and paragraph', async () => {
    const { DetailsExtension } = await import('../src/details');
    const editor = createFakeEditor();
    const ext = new DetailsExtension();
    ext.onCreate(editor);

    await editor.__getCommand('insertDetails').execute(editor, { summary: 'Click to expand' });
    expect(commitMock).toHaveBeenCalledTimes(1);
    const child = recordedTransactions[0][0].payload.child;
    expect(child.stype).toBe('bDetails');
    expect(child.content[0].stype).toBe('bSummary');
    expect(child.content[0].content[0].text).toBe('Click to expand');
    expect(child.content[1].stype).toBe('paragraph');
  });
});

describe('DescriptionListExtension', () => {
  beforeEach(() => { recordedTransactions.length = 0; commitMock.mockReset(); commitMock.mockResolvedValue({ success: true }); });

  it('insertDescriptionList creates a descList with term and def', async () => {
    const { DescriptionListExtension } = await import('../src/description-list');
    const editor = createFakeEditor();
    const ext = new DescriptionListExtension();
    ext.onCreate(editor);

    await editor.__getCommand('insertDescriptionList').execute(editor);
    expect(commitMock).toHaveBeenCalledTimes(1);
    const child = recordedTransactions[0][0].payload.child;
    expect(child.stype).toBe('descList');
    expect(child.content[0].stype).toBe('descTerm');
    expect(child.content[1].stype).toBe('descDef');
  });
});

describe('FigureExtension', () => {
  beforeEach(() => { recordedTransactions.length = 0; commitMock.mockReset(); commitMock.mockResolvedValue({ success: true }); });

  it('insertFigure creates a bFigure with inline-image', async () => {
    const { FigureExtension } = await import('../src/figure');
    const editor = createFakeEditor();
    const ext = new FigureExtension();
    ext.onCreate(editor);

    await editor.__getCommand('insertFigure').execute(editor, { src: 'img.png', alt: 'test', caption: 'Fig 1' });
    expect(commitMock).toHaveBeenCalledTimes(1);
    const child = recordedTransactions[0][0].payload.child;
    expect(child.stype).toBe('bFigure');
    expect(child.content[0].stype).toBe('inline-image');
    expect(child.content[1].stype).toBe('bFigcaption');
  });
});

describe('MediaExtension', () => {
  beforeEach(() => { recordedTransactions.length = 0; commitMock.mockReset(); commitMock.mockResolvedValue({ success: true }); });

  it('insertVideo creates a mediaVideo node', async () => {
    const { MediaExtension } = await import('../src/media');
    const editor = createFakeEditor();
    const ext = new MediaExtension();
    ext.onCreate(editor);

    await editor.__getCommand('insertVideo').execute(editor, { src: 'video.mp4' });
    expect(commitMock).toHaveBeenCalledTimes(1);
    expect(recordedTransactions[0][0].payload.child.stype).toBe('mediaVideo');
  });

  it('insertAudio creates a mediaAudio node', async () => {
    const { MediaExtension } = await import('../src/media');
    const editor = createFakeEditor();
    const ext = new MediaExtension();
    ext.onCreate(editor);

    await editor.__getCommand('insertAudio').execute(editor, { src: 'audio.mp3' });
    expect(commitMock).toHaveBeenCalledTimes(1);
    expect(recordedTransactions[0][0].payload.child.stype).toBe('mediaAudio');
  });

  it('insertEmbed creates a mediaEmbed node', async () => {
    const { MediaExtension } = await import('../src/media');
    const editor = createFakeEditor();
    const ext = new MediaExtension();
    ext.onCreate(editor);

    await editor.__getCommand('insertEmbed').execute(editor, { provider: 'youtube', id: 'abc123' });
    expect(commitMock).toHaveBeenCalledTimes(1);
    expect(recordedTransactions[0][0].payload.child.stype).toBe('mediaEmbed');
  });

  it('insertVideo returns false without src', async () => {
    const { MediaExtension } = await import('../src/media');
    const editor = createFakeEditor();
    const ext = new MediaExtension();
    ext.onCreate(editor);

    const result = await editor.__getCommand('insertVideo').execute(editor, {});
    expect(result).toBe(false);
    expect(commitMock).not.toHaveBeenCalled();
  });
});

describe('FontSizeExtension', () => {
  beforeEach(() => { recordedTransactions.length = 0; commitMock.mockReset(); commitMock.mockResolvedValue({ success: true }); });

  it('setFontSize applies fontSize mark', async () => {
    const { FontSizeExtension } = await import('../src/font-size');
    const editor = createFakeEditor();
    const ext = new FontSizeExtension();
    ext.onCreate(editor);

    await editor.__getCommand('setFontSize').execute(editor, { selection: defaultSelection, size: '18px' });
    expect(commitMock).toHaveBeenCalledTimes(1);
    expect(recordedTransactions[0][0].type).toBe('applyMark');
    expect(recordedTransactions[0][0].payload.markType).toBe('fontSize');
    expect(recordedTransactions[0][0].payload.attrs).toEqual({ size: '18px' });
  });

  it('removeFontSize toggles off fontSize mark', async () => {
    const { FontSizeExtension } = await import('../src/font-size');
    const editor = createFakeEditor();
    const ext = new FontSizeExtension();
    ext.onCreate(editor);

    await editor.__getCommand('removeFontSize').execute(editor, { selection: defaultSelection });
    expect(commitMock).toHaveBeenCalledTimes(1);
    expect(recordedTransactions[0][0].type).toBe('toggleMark');
    expect(recordedTransactions[0][0].payload.markType).toBe('fontSize');
  });
});

describe('FontFamilyExtension', () => {
  beforeEach(() => { recordedTransactions.length = 0; commitMock.mockReset(); commitMock.mockResolvedValue({ success: true }); });

  it('setFontFamily applies fontFamily mark', async () => {
    const { FontFamilyExtension } = await import('../src/font-family');
    const editor = createFakeEditor();
    const ext = new FontFamilyExtension();
    ext.onCreate(editor);

    await editor.__getCommand('setFontFamily').execute(editor, { selection: defaultSelection, family: 'Georgia' });
    expect(commitMock).toHaveBeenCalledTimes(1);
    expect(recordedTransactions[0][0].payload.markType).toBe('fontFamily');
    expect(recordedTransactions[0][0].payload.attrs).toEqual({ family: 'Georgia' });
  });
});

describe('TextFormattingExtension', () => {
  beforeEach(() => { recordedTransactions.length = 0; commitMock.mockReset(); commitMock.mockResolvedValue({ success: true }); });

  it('toggleSmallCaps toggles smallCaps mark', async () => {
    const { TextFormattingExtension } = await import('../src/text-formatting');
    const editor = createFakeEditor();
    const ext = new TextFormattingExtension();
    ext.onCreate(editor);

    await editor.__getCommand('toggleSmallCaps').execute(editor, { selection: defaultSelection });
    expect(commitMock).toHaveBeenCalledTimes(1);
    expect(recordedTransactions[0][0].payload.markType).toBe('smallCaps');
  });

  it('toggleKbd toggles kbd mark', async () => {
    const { TextFormattingExtension } = await import('../src/text-formatting');
    const editor = createFakeEditor();
    const ext = new TextFormattingExtension();
    ext.onCreate(editor);

    await editor.__getCommand('toggleKbd').execute(editor, { selection: defaultSelection });
    expect(commitMock).toHaveBeenCalledTimes(1);
    expect(recordedTransactions[0][0].payload.markType).toBe('kbd');
  });

  it('toggleSpoiler toggles spoiler mark', async () => {
    const { TextFormattingExtension } = await import('../src/text-formatting');
    const editor = createFakeEditor();
    const ext = new TextFormattingExtension();
    ext.onCreate(editor);

    await editor.__getCommand('toggleSpoiler').execute(editor, { selection: defaultSelection });
    expect(commitMock).toHaveBeenCalledTimes(1);
    expect(recordedTransactions[0][0].payload.markType).toBe('spoiler');
  });

  it('setLetterSpacing applies letterSpacing mark with value', async () => {
    const { TextFormattingExtension } = await import('../src/text-formatting');
    const editor = createFakeEditor();
    const ext = new TextFormattingExtension();
    ext.onCreate(editor);

    await editor.__getCommand('setLetterSpacing').execute(editor, { selection: defaultSelection, value: '0.2em' });
    expect(commitMock).toHaveBeenCalledTimes(1);
    expect(recordedTransactions[0][0].payload.markType).toBe('letterSpacing');
    expect(recordedTransactions[0][0].payload.attrs).toEqual({ spacing: '0.2em' });
  });

  it('setLineHeight applies lineHeight mark', async () => {
    const { TextFormattingExtension } = await import('../src/text-formatting');
    const editor = createFakeEditor();
    const ext = new TextFormattingExtension();
    ext.onCreate(editor);

    await editor.__getCommand('setLineHeight').execute(editor, { selection: defaultSelection, value: '2.0' });
    expect(commitMock).toHaveBeenCalledTimes(1);
    expect(recordedTransactions[0][0].payload.markType).toBe('lineHeight');
  });

  it('setBorder applies border mark with multi attrs', async () => {
    const { TextFormattingExtension } = await import('../src/text-formatting');
    const editor = createFakeEditor();
    const ext = new TextFormattingExtension();
    ext.onCreate(editor);

    await editor.__getCommand('setBorder').execute(editor, { selection: defaultSelection, attrs: { style: 'dashed', width: '2px', color: '#ff0000' } });
    expect(commitMock).toHaveBeenCalledTimes(1);
    expect(recordedTransactions[0][0].payload.markType).toBe('border');
    expect(recordedTransactions[0][0].payload.attrs).toEqual({ style: 'dashed', width: '2px', color: '#ff0000' });
  });

  it('setSpanLang applies spanLang mark', async () => {
    const { TextFormattingExtension } = await import('../src/text-formatting');
    const editor = createFakeEditor();
    const ext = new TextFormattingExtension();
    ext.onCreate(editor);

    await editor.__getCommand('setSpanLang').execute(editor, { selection: defaultSelection, attrs: { lang: 'ko', dir: 'ltr' } });
    expect(commitMock).toHaveBeenCalledTimes(1);
    expect(recordedTransactions[0][0].payload.markType).toBe('spanLang');
  });
});

describe('MentionExtension', () => {
  beforeEach(() => { recordedTransactions.length = 0; commitMock.mockReset(); commitMock.mockResolvedValue({ success: true }); });

  it('insertMention applies mention mark with id', async () => {
    const { MentionExtension } = await import('../src/mention');
    const editor = createFakeEditor();
    const ext = new MentionExtension();
    ext.onCreate(editor);

    await editor.__getCommand('insertMention').execute(editor, { selection: defaultSelection, id: 'user-42' });
    expect(commitMock).toHaveBeenCalledTimes(1);
    expect(recordedTransactions[0][0].payload.markType).toBe('mention');
    expect(recordedTransactions[0][0].payload.attrs).toEqual({ id: 'user-42' });
  });

  it('insertMention returns false without id', async () => {
    const { MentionExtension } = await import('../src/mention');
    const editor = createFakeEditor();
    const ext = new MentionExtension();
    ext.onCreate(editor);

    const result = await editor.__getCommand('insertMention').execute(editor, { selection: defaultSelection });
    expect(result).toBe(false);
  });
});

describe('FootnoteExtension', () => {
  beforeEach(() => { recordedTransactions.length = 0; commitMock.mockReset(); commitMock.mockResolvedValue({ success: true }); });

  it('insertFootnote creates footnoteDef + footnoteRef mark', async () => {
    const { FootnoteExtension } = await import('../src/footnote');
    const editor = createFakeEditor();
    const ext = new FootnoteExtension();
    ext.onCreate(editor);

    await editor.__getCommand('insertFootnote').execute(editor, { id: 'fn-1', text: 'See reference', selection: defaultSelection });
    expect(commitMock).toHaveBeenCalledTimes(1);
    expect(recordedTransactions[0]).toHaveLength(2);
    expect(recordedTransactions[0][0].type).toBe('addChild');
    expect(recordedTransactions[0][0].payload.child.stype).toBe('footnoteDef');
    expect(recordedTransactions[0][1].type).toBe('applyMark');
    expect(recordedTransactions[0][1].payload.markType).toBe('footnoteRef');
  });

  it('insertFootnoteRef applies footnoteRef mark only', async () => {
    const { FootnoteExtension } = await import('../src/footnote');
    const editor = createFakeEditor();
    const ext = new FootnoteExtension();
    ext.onCreate(editor);

    await editor.__getCommand('insertFootnoteRef').execute(editor, { id: 'fn-1', selection: defaultSelection });
    expect(commitMock).toHaveBeenCalledTimes(1);
    expect(recordedTransactions[0][0].payload.markType).toBe('footnoteRef');
  });
});

describe('BookmarkExtension', () => {
  beforeEach(() => { recordedTransactions.length = 0; commitMock.mockReset(); commitMock.mockResolvedValue({ success: true }); });

  it('insertBookmark creates a bookmarkAnchor inline atom', async () => {
    const { BookmarkExtension } = await import('../src/bookmark');
    const editor = createFakeEditor();
    const ext = new BookmarkExtension();
    ext.onCreate(editor);

    await editor.__getCommand('insertBookmark').execute(editor, { id: 'bm-1', selection: defaultSelection });
    expect(commitMock).toHaveBeenCalledTimes(1);
    expect(recordedTransactions[0][0].payload.child.stype).toBe('bookmarkAnchor');
    expect(recordedTransactions[0][0].payload.child.attributes.id).toBe('bm-1');
  });
});

describe('FieldExtension', () => {
  beforeEach(() => { recordedTransactions.length = 0; commitMock.mockReset(); commitMock.mockResolvedValue({ success: true }); });

  it('insertFieldPageNumber creates fieldPageNumber atom', async () => {
    const { FieldExtension } = await import('../src/field');
    const editor = createFakeEditor();
    const ext = new FieldExtension();
    ext.onCreate(editor);

    await editor.__getCommand('insertFieldPageNumber').execute(editor, { selection: defaultSelection });
    expect(commitMock).toHaveBeenCalledTimes(1);
    expect(recordedTransactions[0][0].payload.child.stype).toBe('fieldPageNumber');
  });

  it('insertFieldDateTime creates fieldDateTime with format attr', async () => {
    const { FieldExtension } = await import('../src/field');
    const editor = createFakeEditor();
    const ext = new FieldExtension();
    ext.onCreate(editor);

    await editor.__getCommand('insertFieldDateTime').execute(editor, { selection: defaultSelection, format: 'YYYY-MM-DD' });
    expect(commitMock).toHaveBeenCalledTimes(1);
    expect(recordedTransactions[0][0].payload.child.stype).toBe('fieldDateTime');
    expect(recordedTransactions[0][0].payload.child.attributes.format).toBe('YYYY-MM-DD');
  });

  it('insertFieldDocTitle creates fieldDocTitle atom', async () => {
    const { FieldExtension } = await import('../src/field');
    const editor = createFakeEditor();
    const ext = new FieldExtension();
    ext.onCreate(editor);

    await editor.__getCommand('insertFieldDocTitle').execute(editor, { selection: defaultSelection });
    expect(commitMock).toHaveBeenCalledTimes(1);
    expect(recordedTransactions[0][0].payload.child.stype).toBe('fieldDocTitle');
  });

  it('insertFieldAuthor creates fieldAuthor atom', async () => {
    const { FieldExtension } = await import('../src/field');
    const editor = createFakeEditor();
    const ext = new FieldExtension();
    ext.onCreate(editor);

    await editor.__getCommand('insertFieldAuthor').execute(editor, { selection: defaultSelection });
    expect(commitMock).toHaveBeenCalledTimes(1);
    expect(recordedTransactions[0][0].payload.child.stype).toBe('fieldAuthor');
  });
});

describe('DocStructureExtension', () => {
  beforeEach(() => { recordedTransactions.length = 0; commitMock.mockReset(); commitMock.mockResolvedValue({ success: true }); });

  it('insertDocSection creates a docSection with paragraph', async () => {
    const { DocStructureExtension } = await import('../src/doc-structure');
    const editor = createFakeEditor();
    const ext = new DocStructureExtension();
    ext.onCreate(editor);

    await editor.__getCommand('insertDocSection').execute(editor);
    expect(commitMock).toHaveBeenCalledTimes(1);
    expect(recordedTransactions[0][0].payload.child.stype).toBe('docSection');
    expect(recordedTransactions[0][0].payload.child.content[0].stype).toBe('paragraph');
  });

  it('insertChart creates a chart atom with attrs', async () => {
    const { DocStructureExtension } = await import('../src/doc-structure');
    const editor = createFakeEditor();
    const ext = new DocStructureExtension();
    ext.onCreate(editor);

    await editor.__getCommand('insertChart').execute(editor, { attrs: { title: 'Sales', values: '10,20,30' } });
    expect(commitMock).toHaveBeenCalledTimes(1);
    const child = recordedTransactions[0][0].payload.child;
    expect(child.stype).toBe('chart');
    expect(child.attributes.title).toBe('Sales');
    expect(child.attributes.values).toBe('10,20,30');
  });

  /*
   * `insertEndnote` used to be here, and this test is why it is worth saying where it went rather
   * than deleting the line: it inserted an **empty** `endnoteDef` into the flow with no reference
   * pointing at it, and this test passed on exactly that. A body nothing refers to is not a note, and
   * under the office schema `endnoteDef` is a resource that cannot sit in the flow at all.
   *
   * It is in `footnote.ts` now, beside the footnote, where the two halves are one gesture — see
   * `clear-formatting-and-notes.test.ts`.
   */

  it('insertBibliography creates bibliography block', async () => {
    const { DocStructureExtension } = await import('../src/doc-structure');
    const editor = createFakeEditor();
    const ext = new DocStructureExtension();
    ext.onCreate(editor);

    await editor.__getCommand('insertBibliography').execute(editor);
    expect(commitMock).toHaveBeenCalledTimes(1);
    expect(recordedTransactions[0][0].payload.child.stype).toBe('bibliography');
  });

  it('insertDocHeader creates docHeader block', async () => {
    const { DocStructureExtension } = await import('../src/doc-structure');
    const editor = createFakeEditor();
    const ext = new DocStructureExtension();
    ext.onCreate(editor);

    await editor.__getCommand('insertDocHeader').execute(editor);
    expect(commitMock).toHaveBeenCalledTimes(1);
    expect(recordedTransactions[0][0].payload.child.stype).toBe('docHeader');
  });

  it('insertDocFooter creates docFooter block', async () => {
    const { DocStructureExtension } = await import('../src/doc-structure');
    const editor = createFakeEditor();
    const ext = new DocStructureExtension();
    ext.onCreate(editor);

    await editor.__getCommand('insertDocFooter').execute(editor);
    expect(commitMock).toHaveBeenCalledTimes(1);
    expect(recordedTransactions[0][0].payload.child.stype).toBe('docFooter');
  });
});

describe('HardBreakExtension', () => {
  beforeEach(() => { recordedTransactions.length = 0; commitMock.mockReset(); commitMock.mockResolvedValue({ success: true }); });

  it('insertHardBreak inserts a hardBreak atom', async () => {
    const { HardBreakExtension } = await import('../src/hard-break');
    const editor = createFakeEditor();
    const ext = new HardBreakExtension();
    ext.onCreate(editor);

    const cmd = editor.__getCommand('insertHardBreak');
    expect(cmd).toBeDefined();
    expect(cmd.canExecute(editor)).toBe(true);
  });
});

describe('CodeMarkExtension', () => {
  beforeEach(() => { recordedTransactions.length = 0; commitMock.mockReset(); commitMock.mockResolvedValue({ success: true }); });

  it('toggleCode toggles code mark', async () => {
    const { CodeMarkExtension } = await import('../src/code-mark');
    const editor = createFakeEditor();
    const ext = new CodeMarkExtension();
    ext.onCreate(editor);

    await editor.__getCommand('toggleCode').execute(editor, { selection: defaultSelection });
    expect(commitMock).toHaveBeenCalledTimes(1);
    expect(recordedTransactions[0][0].payload.markType).toBe('code');
  });
});

describe('HighlightExtension', () => {
  beforeEach(() => { recordedTransactions.length = 0; commitMock.mockReset(); commitMock.mockResolvedValue({ success: true }); });

  it('toggleHighlight uses default color', async () => {
    const { HighlightExtension } = await import('../src/highlight');
    const editor = createFakeEditor();
    const ext = new HighlightExtension();
    ext.onCreate(editor);

    await editor.__getCommand('toggleHighlight').execute(editor, { selection: defaultSelection });
    expect(commitMock).toHaveBeenCalledTimes(1);
    expect(recordedTransactions[0][0].payload.markType).toBe('highlight');
    expect(recordedTransactions[0][0].payload.attrs).toEqual({ color: '#ffeb3b' });
  });

  it('toggleHighlight uses custom color', async () => {
    const { HighlightExtension } = await import('../src/highlight');
    const editor = createFakeEditor();
    const ext = new HighlightExtension();
    ext.onCreate(editor);

    await editor.__getCommand('toggleHighlight').execute(editor, { selection: defaultSelection, color: '#00ff00' });
    expect(commitMock).toHaveBeenCalledTimes(1);
    expect(recordedTransactions[0][0].payload.attrs).toEqual({ color: '#00ff00' });
  });
});

describe('SubSuperExtension', () => {
  beforeEach(() => { recordedTransactions.length = 0; commitMock.mockReset(); commitMock.mockResolvedValue({ success: true }); });

  it('toggleSubscript toggles subscript mark', async () => {
    const { SubSuperExtension } = await import('../src/sub-super');
    const editor = createFakeEditor();
    const ext = new SubSuperExtension();
    ext.onCreate(editor);

    await editor.__getCommand('toggleSubscript').execute(editor, { selection: defaultSelection });
    expect(commitMock).toHaveBeenCalledTimes(1);
    expect(recordedTransactions[0][0].payload.markType).toBe('subscript');
  });

  it('toggleSuperscript toggles superscript mark', async () => {
    const { SubSuperExtension } = await import('../src/sub-super');
    const editor = createFakeEditor();
    const ext = new SubSuperExtension();
    ext.onCreate(editor);

    await editor.__getCommand('toggleSuperscript').execute(editor, { selection: defaultSelection });
    expect(commitMock).toHaveBeenCalledTimes(1);
    expect(recordedTransactions[0][0].payload.markType).toBe('superscript');
  });
});

describe('PageBreakExtension', () => {
  beforeEach(() => { recordedTransactions.length = 0; commitMock.mockReset(); commitMock.mockResolvedValue({ success: true }); });

  it('insertPageBreak creates a pageBreak atom', async () => {
    const { PageBreakExtension } = await import('../src/page-break');
    const editor = createFakeEditor();
    const ext = new PageBreakExtension();
    ext.onCreate(editor);

    const cmd = editor.__getCommand('insertPageBreak');
    expect(cmd).toBeDefined();
  });
});

describe('FontColorExtension', () => {
  beforeEach(() => { recordedTransactions.length = 0; commitMock.mockReset(); commitMock.mockResolvedValue({ success: true }); });

  it('setFontColor applies fontColor mark', async () => {
    const { FontColorExtension } = await import('../src/font-color');
    const editor = createFakeEditor();
    const ext = new FontColorExtension();
    ext.onCreate(editor);

    await editor.__getCommand('setFontColor').execute(editor, { selection: defaultSelection, color: '#ff0000' });
    expect(commitMock).toHaveBeenCalledTimes(1);
    expect(recordedTransactions[0][0].payload.markType).toBe('fontColor');
  });

  it('setBgColor applies bgColor mark, in the attribute the schema declares', async () => {
    const { FontColorExtension } = await import('../src/font-color');
    const editor = createFakeEditor();
    const ext = new FontColorExtension();
    ext.onCreate(editor);

    await editor.__getCommand('setBgColor').execute(editor, { selection: defaultSelection, color: '#00ff00' });
    expect(commitMock).toHaveBeenCalledTimes(1);
    expect(recordedTransactions[0][0].payload.markType).toBe('bgColor');
    /*
     * The attribute as well as the type, which is what this test was missing: it wrote `color` for
     * months, the schema declares `bgColor`, every reader asks for it by name — so the command
     * reported success and painted nothing, and this assertion passed the whole time. The check
     * that holds every mark command to its schema is in `office-word`, where a real editor can run
     * them; this one keeps the fault from coming back where it lives.
     */
    expect(recordedTransactions[0][0].payload.attrs).toEqual({ bgColor: '#00ff00' });
  });
});

describe('MathInlineExtension', () => {
  beforeEach(() => { recordedTransactions.length = 0; commitMock.mockReset(); commitMock.mockResolvedValue({ success: true }); });

  it('insertMathInline inserts a mathInline atom', async () => {
    const { MathInlineExtension } = await import('../src/math-inline');
    const editor = createFakeEditor();
    const ext = new MathInlineExtension();
    ext.onCreate(editor);

    const cmd = editor.__getCommand('insertMathInline');
    expect(cmd).toBeDefined();
  });
});
