import { chordFor, keyLabel, taughtKeys } from '@barocss/office-controls';
import { SLIDES_KEYS } from './keymap';
import { slidesMenus, slidesMenuId, type SlidesMenuEntry } from './menu-model';
import { SLIDES_TOOLBAR, slidesToolbarPayload, type SlidesToolbarControl } from './toolbar-model';

export interface SlidesSearchCommand extends SlidesMenuEntry {
  id: string; category: string; keywords?: string; control?: SlidesToolbarControl;
}
const categories: Record<string, string> = {
  slide: '슬라이드', character: '글자', paragraph: '문단', list: '목록', insert: '삽입',
  order: '객체 순서', align: '객체 정렬', table: '표', group: '객체 그룹',
};
export function slidesSearchCommands(apple: boolean): SlidesSearchCommand[] {
  const menus = slidesMenus(apple).flatMap(menu => menu.blocks.flatMap(block => block.items.map((entry, index) => ({
    ...entry, id: slidesMenuId(menu, block, index), category: menu.label, keywords: entry.command ?? entry.view,
  }))));
  const keys = taughtKeys(SLIDES_KEYS);
  return [...menus, ...SLIDES_TOOLBAR.flatMap(group => group.controls
    .filter(control => !control.needsFile && !menus.some(entry => entry.command === control.command))
    .map(control => ({ id: `toolbar:${control.id}`, label: control.label, command: control.command, payload: control.payload,
      control, category: categories[group.id] ?? group.id, keywords: control.command, hint: keyLabel(chordFor(keys, control), apple) })))];
}
export function slidesSearchPayload(entry: SlidesSearchCommand, current?: string, number?: number) {
  if (entry.control) return slidesToolbarPayload(entry.control, current, number);
  if (entry.command === 'insertSlide') return { ...entry.payload, after: current };
  return entry.needs === 'slide' ? { ...entry.payload, slideId: current } : entry.payload;
}
