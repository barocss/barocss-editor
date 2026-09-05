import { describe, it, expect } from 'vitest';
import {
  isStructuralInputType,
  isHistoryInputType,
  isFormatInputType,
  isDeleteInputType,
  isInsertInputType,
  getFormatCommand,
  DELETE_INPUT_TYPES,
  INSERT_INPUT_TYPES
} from './input-type';

describe('inputType 어휘', () => {
  it('구조 입력은 Enter 와 Shift+Enter 둘뿐이다', () => {
    expect(isStructuralInputType('insertParagraph')).toBe(true);
    expect(isStructuralInputType('insertLineBreak')).toBe(true);
    expect(isStructuralInputType('insertOrderedList')).toBe(false);
    expect(isStructuralInputType('historyUndo')).toBe(false);
  });

  it('히스토리는 구조와 따로 묻는다', () => {
    expect(isHistoryInputType('historyUndo')).toBe(true);
    expect(isHistoryInputType('historyRedo')).toBe(true);
    expect(isHistoryInputType('insertParagraph')).toBe(false);
  });

  it('서식 넷은 각자 커맨드 이름을 갖는다', () => {
    expect(isFormatInputType('formatBold')).toBe(true);
    expect(getFormatCommand('formatBold')).toBe('toggleBold');
    expect(getFormatCommand('formatItalic')).toBe('toggleItalic');
    expect(getFormatCommand('formatUnderline')).toBe('toggleUnderline');
    expect(getFormatCommand('formatStrikeThrough')).toBe('toggleStrikeThrough');
    expect(getFormatCommand('formatSuperscript')).toBeUndefined();
    expect(isFormatInputType('formatSuperscript')).toBe(false);
  });

  it('삭제는 여섯이고, 조합 삭제는 여기 없다', () => {
    expect(DELETE_INPUT_TYPES).toHaveLength(6);
    for (const t of DELETE_INPUT_TYPES) expect(isDeleteInputType(t)).toBe(true);
    expect(isDeleteInputType('deleteByComposition')).toBe(false);
    expect(isDeleteInputType('deleteEntireSoftLine')).toBe(false);
  });

  it('삽입은 셋이고, IME 조합은 여기 없다', () => {
    expect(INSERT_INPUT_TYPES).toHaveLength(3);
    for (const t of INSERT_INPUT_TYPES) expect(isInsertInputType(t)).toBe(true);
    expect(isInsertInputType('insertCompositionText')).toBe(false);
    expect(isInsertInputType('insertParagraph')).toBe(false);
  });

  it('갈래끼리 겹치지 않는다', () => {
    const all = [
      ...DELETE_INPUT_TYPES,
      ...INSERT_INPUT_TYPES,
      'insertParagraph',
      'insertLineBreak',
      'historyUndo',
      'historyRedo',
      'formatBold'
    ];
    for (const t of all) {
      const hits = [
        isStructuralInputType(t),
        isHistoryInputType(t),
        isFormatInputType(t),
        isDeleteInputType(t),
        isInsertInputType(t)
      ].filter(Boolean).length;
      expect(hits).toBe(1);
    }
  });
});
