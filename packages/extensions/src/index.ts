// Extension exports
export * from './text';
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
export * from './floating-toolbar';
export * from './drag-drop';
export * from './find-replace';
export * from './checklist';
export * from './callout';
export * from './math-block';
export * from './comment';
export * from './styles';

// Import classes
import { TextExtension } from './text';
import { BoldExtension } from './bold';
import { ItalicExtension } from './italic';
import { HeadingExtension } from './heading';
import { ParagraphExtension } from './paragraph';
import { SelectAllExtension } from './select-all';
import { DeleteExtension } from './delete';
import { MoveSelectionExtension } from './move-selection';
import { IndentExtension } from './indent';
import { UnderlineExtension } from './underline';
import { CopyPasteExtension } from './copy-paste';
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
import { CommentExtension } from './comment';
import type { Extension } from '@barocss/editor-core';

export function createCoreExtensions(): Extension[] {
  return [
    new TextExtension(),
    new DeleteExtension(),
    new ParagraphExtension(),
    new MoveSelectionExtension(),
    new SelectAllExtension(),
    new IndentExtension(),
    new CopyPasteExtension()
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
    new LinkExtension(),
    new ImageExtension(),
    new CodeBlockExtension(),
    new HorizontalRuleExtension(),
    new TableExtension(),
    new ChecklistExtension(),
    new CalloutExtension(),
    new MathBlockExtension(),
    new CommentExtension()
  ];
}

export const ExtensionSets = {
  basic: () => [
    new BoldExtension(),
    new ItalicExtension(),
    new UnderlineExtension()
  ],
  
  rich: () => [
    new BoldExtension(),
    new ItalicExtension(),
    new UnderlineExtension(),
    new HeadingExtension(),
    new LinkExtension(),
    new ImageExtension(),
    new CodeBlockExtension(),
    new HorizontalRuleExtension(),
    new TableExtension(),
    new ChecklistExtension(),
    new CalloutExtension(),
    new MathBlockExtension(),
    new CommentExtension()
  ],
  
  minimal: () => []
} as const;

