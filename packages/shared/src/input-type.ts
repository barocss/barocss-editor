/**
 * `beforeinput` 의 inputType 어휘
 *
 * 이 낱말들은 **브라우저의 것**이지 뷰의 것이 아니다. editor-view-dom 과
 * editor-view-react 가 각자 같은 목록을 손으로 적어 두면, 새 inputType 을
 * 다룰 때 한쪽만 고치게 된다. 그래서 목록은 여기 한 벌만 둔다.
 *
 * 여기 있는 것은 **분류**뿐이다. "그래서 preventDefault 를 하는가" 는 뷰의
 * 정책이므로 뷰에 남는다 — 같은 이름으로 두 질문을 묻지 않기 위해서다.
 */

/** 구조를 바꾸는 입력 — Enter / Shift+Enter */
export const STRUCTURAL_INPUT_TYPES = ['insertParagraph', 'insertLineBreak'] as const;

/** 실행 취소·다시 실행 */
export const HISTORY_INPUT_TYPES = ['historyUndo', 'historyRedo'] as const;

/** 서식 토글 — Ctrl/Cmd+B, I, U, Shift+S */
export const FORMAT_INPUT_TYPES = [
  'formatBold',
  'formatItalic',
  'formatUnderline',
  'formatStrikeThrough'
] as const;

/** 모델을 먼저 고쳐서 처리하는 삭제 */
export const DELETE_INPUT_TYPES = [
  'deleteContentBackward',
  'deleteContentForward',
  'deleteWordBackward',
  'deleteWordForward',
  'deleteByCut',
  'deleteByDrag'
] as const;

/**
 * getTargetRanges() 로 입력 자리를 먼저 정할 수 있는 삽입.
 * `insertCompositionText` 는 IME 경로가 따로 있으므로 여기 없다.
 */
export const INSERT_INPUT_TYPES = [
  'insertText',
  'insertFromPaste',
  'insertReplacementText'
] as const;

export type StructuralInputType = (typeof STRUCTURAL_INPUT_TYPES)[number];
export type HistoryInputType = (typeof HISTORY_INPUT_TYPES)[number];
export type FormatInputType = (typeof FORMAT_INPUT_TYPES)[number];
export type DeleteInputType = (typeof DELETE_INPUT_TYPES)[number];
export type InsertInputType = (typeof INSERT_INPUT_TYPES)[number];

const STRUCTURAL = new Set<string>(STRUCTURAL_INPUT_TYPES);
const HISTORY = new Set<string>(HISTORY_INPUT_TYPES);
const FORMAT = new Set<string>(FORMAT_INPUT_TYPES);
const DELETE = new Set<string>(DELETE_INPUT_TYPES);
const INSERT = new Set<string>(INSERT_INPUT_TYPES);

export function isStructuralInputType(inputType: string): boolean {
  return STRUCTURAL.has(inputType);
}

export function isHistoryInputType(inputType: string): boolean {
  return HISTORY.has(inputType);
}

export function isFormatInputType(inputType: string): boolean {
  return FORMAT.has(inputType);
}

export function isDeleteInputType(inputType: string): boolean {
  return DELETE.has(inputType);
}

export function isInsertInputType(inputType: string): boolean {
  return INSERT.has(inputType);
}

/** 서식 inputType → 커맨드 이름 */
export const FORMAT_COMMAND_BY_INPUT_TYPE: Readonly<Record<string, string>> = Object.freeze({
  formatBold: 'toggleBold',
  formatItalic: 'toggleItalic',
  formatUnderline: 'toggleUnderline',
  formatStrikeThrough: 'toggleStrikeThrough'
});

/** 서식 inputType 이면 커맨드 이름, 아니면 undefined */
export function getFormatCommand(inputType: string): string | undefined {
  return FORMAT_COMMAND_BY_INPUT_TYPE[inputType];
}
