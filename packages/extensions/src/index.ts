// Extension exports
export * from './text';
export * from './delete';
export * from './paragraph';
export * from './bold';
export * from './italic';
export * from './heading';
export * from './select-all';
export * from './indent';

// 클래스들을 import
import { TextExtension } from './text';
import { BoldExtension } from './bold';
import { ItalicExtension } from './italic';
import { HeadingExtension } from './heading';
import { ParagraphExtension } from './paragraph';
import { SelectAllExtension } from './select-all';
import { DeleteExtension } from './delete';
import { MoveSelectionExtension } from './move-selection';
import { IndentExtension } from './indent';
import { CopyPasteExtension } from './copy-paste';
import type { Extension } from '@barocss/editor-core';

// Core Extension (기본적으로 항상 포함되는 필수 Extension)
// - TextExtension: insertText, deleteText 등 기본 텍스트 편집
// - DeleteExtension: delete command (Backspace, Delete 키)
// - ParagraphExtension: 기본 구조 (paragraph 생성 등)
// - IndentExtension: 구조적 들여쓰기/내어쓰기 (Tab/Shift+Tab)
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

// 편의 함수들
// 추가 Extension (Bold, Italic, Heading)
// 주의: Core Extension은 Editor 생성자에서 자동으로 등록되므로 여기서는 제외
export function createBasicExtensions(): Extension[] {
  return [
    new BoldExtension(),
    new ItalicExtension(),
    new HeadingExtension()
  ];
}

// 재사용 가능한 확장 세트들
// 주의: Core Extension은 Editor 생성자에서 자동으로 등록되므로 여기서는 제외
export const ExtensionSets = {
  // 기본 텍스트 편집 (Bold, Italic만)
  basic: () => [
    new BoldExtension(),
    new ItalicExtension()
  ],
  
  // 리치 텍스트 편집 (Bold, Italic, Heading만)
  rich: () => [
    new BoldExtension(),
    new ItalicExtension(),
    new HeadingExtension()
  ],
  
  // 미니멀 편집 (추가 Extension 없음)
  minimal: () => []
} as const;

