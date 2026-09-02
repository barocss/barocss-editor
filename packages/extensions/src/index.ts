// Extension exports
export { hasRange } from './guards';
export * from './text';
export * from './align';
export * from './delete';
export * from './paragraph';
export * from './bold';
export * from './italic';
export * from './heading';
export * from './select-all';
export * from './indent';
export * from './underline';
export * from './strikethrough';
export * from './move-block';
export * from './escape';
export * from './list';
export * from './blockquote';
export * from './emoji';
export * from './link';
export * from './image';
export * from './code-block';
export * from './horizontal-rule';
export * from './table';
export * from './slash-command';
export * from './reorder';
export * from './hard-break';
export * from './code-mark';
export * from './highlight';
export * from './font-color';
export * from './sub-super';
export * from './math-inline';
export * from './page-break';
export * from './find-replace';
export * from './checklist';
export * from './callout';
export * from './math-block';
export * from './pull-quote';
export * from './columns';
export * from './toc';
export * from './details';
export * from './description-list';
export * from './figure';
export * from './media';
export * from './font-size';
export * from './font-family';
export * from './text-formatting';
export * from './mention';
export * from './footnote';
export * from './bookmark';
export * from './field';
export * from './doc-structure';

// Import classes
import { TextExtension } from './text';
import { BoldExtension } from './bold';
import { ItalicExtension } from './italic';
import { HeadingExtension } from './heading';
import { ParagraphExtension } from './paragraph';
import { SelectAllExtension } from './select-all';
import { AlignExtension } from './align';
import { DeleteExtension } from './delete';
import { MoveSelectionExtension } from './move-selection';
import { IndentExtension } from './indent';
import { UnderlineExtension } from './underline';
import { CopyPasteExtension } from './copy-paste';
import { EscapeExtension } from './escape';
import { MoveBlockExtension } from './move-block';
import { StrikeThroughExtension } from './strikethrough';
import { ListExtension } from './list';
import { BlockquoteExtension } from './blockquote';
import { LinkExtension } from './link';
import { ImageExtension } from './image';
import { CodeBlockExtension } from './code-block';
import { HorizontalRuleExtension } from './horizontal-rule';
import { TableExtension } from './table';
import { ChecklistExtension } from './checklist';
import { CalloutExtension } from './callout';
import { MathBlockExtension } from './math-block';
import { ReorderExtension } from './reorder';
import { HardBreakExtension } from './hard-break';
import { CodeMarkExtension } from './code-mark';
import { HighlightExtension } from './highlight';
import { FontColorExtension } from './font-color';
import { SubSuperExtension } from './sub-super';
import { EmojiExtension } from './emoji';
import { SlashCommandExtension } from './slash-command';
import { FindReplaceExtension } from './find-replace';
import { MathInlineExtension } from './math-inline';
import { PageBreakExtension } from './page-break';
import { PullQuoteExtension } from './pull-quote';
import { ColumnsExtension } from './columns';
import { TocExtension } from './toc';
import { DetailsExtension } from './details';
import { DescriptionListExtension } from './description-list';
import { FigureExtension } from './figure';
import { MediaExtension } from './media';
import { FontSizeExtension } from './font-size';
import { FontFamilyExtension } from './font-family';
import { TextFormattingExtension } from './text-formatting';
import { MentionExtension } from './mention';
import { FootnoteExtension } from './footnote';
import { BookmarkExtension } from './bookmark';
import { FieldExtension } from './field';
import { DocStructureExtension } from './doc-structure';
import type { Extension } from '@barocss/editor-core';
import { Editor, type EditorOptions } from '@barocss/editor-core';

export function createCoreExtensions(): Extension[] {
  return [
    new TextExtension(),
    new DeleteExtension(),
    new AlignExtension(),
    new ParagraphExtension(),
    new MoveSelectionExtension(),
    new SelectAllExtension(),
    new IndentExtension(),
    new CopyPasteExtension(),
    new EscapeExtension(),
    new HardBreakExtension(),
  ];
}

export function createBasicExtensions(): Extension[] {
  return [
    new BoldExtension(),
    new ItalicExtension(),
    new HeadingExtension(),
    new ListExtension(),
    new BlockquoteExtension()
  ];
}

export function createRichExtensions(): Extension[] {
  return [
    ...createBasicExtensions(),
    new UnderlineExtension(),
    new StrikeThroughExtension(),
    new LinkExtension(),
    new ImageExtension(),
    new CodeBlockExtension(),
    new HorizontalRuleExtension(),
    new TableExtension(),
    new ChecklistExtension(),
    new CalloutExtension(),
    new MathBlockExtension(),
    new MoveBlockExtension(),
    new ReorderExtension(),
    new CodeMarkExtension(),
    new HighlightExtension(),
    new FontColorExtension(),
    new SubSuperExtension(),
    new MathInlineExtension(),
    /*
     * Both in a kit at last. They were in none of the four, which is how an extension becomes
     * invisible: a product can only find it by reading this file's exports, and none of the three
     * ever did. `FindReplaceExtension` spent months being called a **stub** in three places for
     * exactly that reason — it was complete, and nothing installed it, which from a keyboard is the
     * same thing. See `every-extension-is-in-a-kit`, the sweep that found both.
     *
     * It could not have gone in a kit before: it drew its own panel into `document.body`, and a
     * shared model package building UI is one a product cannot use. That went, and this is what
     * being installable looks like.
     */
    new EmojiExtension(),
    new FindReplaceExtension(),
    new SlashCommandExtension(),
    new PageBreakExtension(),
    new PullQuoteExtension(),
    new ColumnsExtension(),
    new TocExtension(),
    new DetailsExtension(),
    new DescriptionListExtension(),
    new FigureExtension(),
    new MediaExtension(),
    new FontSizeExtension(),
    new FontFamilyExtension(),
    new TextFormattingExtension(),
    new MentionExtension(),
    new FootnoteExtension(),
    new BookmarkExtension(),
    new FieldExtension(),
    new DocStructureExtension(),
  ];
}

export const ExtensionSets = {
  basic: () => [
    new BoldExtension(),
    new ItalicExtension(),
    new UnderlineExtension()
  ],

  rich: () => createRichExtensions(),

  minimal: () => []
} as const;

// ── Editor construction ──────────────────────────────────────────────────────

/**
 * The extension set the editor used to install implicitly.
 *
 * It lives here, not in `@barocss/editor-core`: the engine has no business
 * knowing that `bold` or `list` exist. Products pick a kit instead of
 * inheriting one, which is what lets Word, Slide, PageBuilder and FigJam sit on
 * the same engine with different behaviour.
 */
export function createDefaultExtensions(): Extension[] {
  return [
    ...createCoreExtensions(),
    ...createBasicExtensions(),
    new UnderlineExtension(),
    new StrikeThroughExtension(),
    new EscapeExtension(),
    new MoveBlockExtension()
  ];
}

/**
 * Create an Editor with a kit installed.
 *
 * `new Editor()` on its own is a bare engine with no editing commands — that is
 * deliberate. Use this (or pass `extensions` yourself) to get a working editor.
 *
 * @param options Editor options. `extensions` are appended to the kit, so a
 *   product can add its own on top; pass `kit: []` to start from nothing.
 */
export function createEditor(
  options: EditorOptions & { kit?: Extension[] } = {}
): Editor {
  const { kit, extensions = [], ...rest } = options;
  return new Editor({
    ...rest,
    extensions: [...(kit ?? createDefaultExtensions()), ...extensions]
  });
}
