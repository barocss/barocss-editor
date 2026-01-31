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
import { MoveBlockExtension } from './move-block';
import { CopyPasteExtension } from './copy-paste';
import { ListExtension } from './list';
import type { Extension } from '@barocss/editor-core';

// Core Extension (required extensions that are always included by default)
// - TextExtension: basic text editing (insertText, deleteText, etc.)
// - DeleteExtension: delete command (Backspace, Delete keys)
// - ParagraphExtension: basic structure (paragraph creation, etc.)
// - IndentExtension: structural indentation/outdentation (Tab/Shift+Tab)
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

// Convenience functions
// Additional Extensions (Bold, Italic, Heading, List)
// Note: Core Extensions are automatically registered in Editor constructor, so they are excluded here
export function createBasicExtensions(): Extension[] {
  return [
    new BoldExtension(),
    new ItalicExtension(),
    new HeadingExtension(),
    new ListExtension()
  ];
}

// Reusable extension sets
// Note: Core Extensions are automatically registered in Editor constructor, so they are excluded here
export const ExtensionSets = {
  // Basic text editing (Bold, Italic only)
  basic: () => [
    new BoldExtension(),
    new ItalicExtension(),
    new UnderlineExtension()
  ],
  
  // Rich text editing (Bold, Italic, Heading only)
  rich: () => [
    new BoldExtension(),
    new ItalicExtension(),
    new UnderlineExtension(),
    new HeadingExtension()
  ],
  
  // Minimal editing (no additional Extensions)
  minimal: () => []
} as const;

