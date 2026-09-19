import { wordMenus, wordMenuId, type WordMenuEntry } from './menu-model';

export interface WordSearchCommand extends WordMenuEntry { id: string; category: string; keywords?: string }
/** Existing menu entries remain the source of their payloads and view actions. */
export function wordSearchCommands(apple: boolean): WordSearchCommand[] {
  const modifier = apple ? '⌘' : 'Ctrl+';
  return [
    ...wordMenus(apple).flatMap(menu => menu.blocks.flatMap(block => block.items.map((entry, index) => ({ ...entry, id: wordMenuId(menu, block, index), category: menu.label })))),
    ...[
      ['toggleBold', '굵게', `${modifier}B`], ['toggleItalic', '기울임꼴', `${modifier}I`], ['toggleUnderline', '밑줄', `${modifier}U`],
      ['toggleStrikeThrough', '취소선', ''], ['clearFormatting', '서식 지우기', ''],
      ['alignLeft', '왼쪽 정렬', ''], ['alignCenter', '가운데 정렬', ''], ['alignRight', '오른쪽 정렬', ''], ['alignJustify', '양쪽 정렬', ''],
      ['toggleBulletList', '글머리 기호 목록', ''], ['toggleOrderedList', '번호 목록', ''], ['setParagraph', '본문으로 변환', ''],
      ...Array.from({ length: 6 }, (_, index) => [`setHeading${index + 1}`, `제목 ${index + 1}`, '']),
    ].map(([command, label, hint]) => ({ id: `format:${command}`, command, label, hint, category: '글자·문단', keywords: command })),
  ];
}
