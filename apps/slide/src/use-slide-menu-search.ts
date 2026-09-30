import { useCallback, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { Editor, ModelSelection } from '@barocss/editor-core';
import type { EditorViewDOM } from '@barocss/editor-view-dom';
import { captureTextSelection } from '@barocss/office-editor-ui';
import { onApple, type MenuBarMenu, type SearchCommand } from '@barocss/office-ui';
import {
  slidesMenuEntry,
  slidesMenuId,
  slidesMenus,
  slidesSearchCommands,
  slidesSearchPayload,
  type SlidesMenuEntry
} from '@barocss/office-slides';

export type SlideMenuFileAction = 'create' | 'open' | 'save';
export type SlideMenuViewAction =
  'print' | 'library' | 'template' | 'size' | 'layout' | 'theme' |
  'audit' | 'map' | 'focus' | 'present' | 'scroll';
type SlideMenuDispatchEntry = Pick<SlidesMenuEntry, 'command' | 'view' | 'payload' | 'needs'>;

interface SlideMenuSearchInputs {
  editor: Editor | null;
  view: EditorViewDOM | null;
  current: string | undefined;
  slideNumber: number | undefined;
  answers: number;
  moveBy: 'press' | 'links';
  auditing: boolean;
  mapping: boolean;
  focused: boolean;
  onFileAction: (action: SlideMenuFileAction) => void;
  onViewAction: (action: SlideMenuViewAction) => void;
}

interface SlideMenuSearch {
  menus: MenuBarMenu[];
  searchCommands: SearchCommand[];
  commandOpen: boolean;
  setCommandOpen: Dispatch<SetStateAction<boolean>>;
  recentCommands: string[];
  commandError: string;
  dismissCommandError: () => void;
  openCommandSearch: () => void;
  pickSearchCommand: (id: string) => Promise<void>;
  onMenu: (id: string) => void;
  runEntry: (entry: SlideMenuDispatchEntry) => void;
}

export function useSlideMenuSearch({
  editor, view, current, slideNumber, answers, moveBy, auditing, mapping, focused,
  onFileAction, onViewAction
}: SlideMenuSearchInputs): SlideMenuSearch {
  const menus = useMemo<MenuBarMenu[]>(
    () =>
      slidesMenus(onApple()).map((menu) => ({
        id: menu.id,
        label: menu.label,
        blocks: menu.blocks.map((block) => ({
          id: block.id,
          items: block.items.map((item, index) => ({
            id: slidesMenuId(menu, block, index),
            label: item.label,
            hint: item.hint,
            title:
              item.view === 'scroll' && moveBy === 'links'
                ? '버튼으로만 이동하는 덱은 스크롤로 볼 수 없습니다 — 스크롤은 한 줄이기 때문입니다'
                : undefined,
            checked:
              item.view === 'audit'
                ? auditing
                : item.view === 'map'
                  ? mapping
                  : item.view === 'focus'
                    ? focused
                    : undefined,
            disabled: item.view === 'scroll' ? moveBy === 'links' : item.command
              ? !editor?.canExecuteCommand?.(
                  item.command,
                  (item.needs === 'slide' ? { ...item.payload, slideId: current } : item.payload) as never
                )
              : false
          }))
        }))
      })),
    [editor, answers, current, moveBy, auditing, mapping, focused]
  );

  const runEntry = useCallback(
    (entry: SlideMenuDispatchEntry) => {
      switch (entry.view) {
        case 'file.new':
          return onFileAction('create');
        case 'file.open':
          return onFileAction('open');
        case 'file.save':
          return onFileAction('save');
        case 'file.print':
          return onViewAction('print');
        case 'library':
        case 'template':
        case 'audit':
        case 'map':
        case 'focus':
        case 'present':
        case 'scroll':
          return onViewAction(entry.view);
        case 'dialog.size':
          return onViewAction('size');
        case 'dialog.layout':
          return onViewAction('layout');
        case 'dialog.theme':
          return onViewAction('theme');
        default:
          break;
      }

      if (entry.command) {
        void editor?.executeCommand(
          entry.command,
          (entry.needs === 'slide' ? { ...entry.payload, slideId: current } : entry.payload) as never
        );
      }
    },
    [editor, current, onFileAction, onViewAction]
  );

  const [commandOpen, setCommandOpen] = useState(false);
  const [recentCommands, setRecentCommands] = useState<string[]>([]);
  const [commandError, setCommandError] = useState('');
  const searchTarget = useRef<{ rootId: string; slideId?: string; selection?: ModelSelection } | undefined>(undefined);
  const searchEntries = useMemo(() => slidesSearchCommands(onApple()), []);
  const menuItems = menus.flatMap(menu => menu.blocks.flatMap(block => block.items));
  const searchCommands: SearchCommand[] = searchEntries.map(entry => {
    const menu = menuItems.find(item => item.id === entry.id);
    const disabled = !editor || (menu ? menu.disabled :
      (!!entry.control?.needsSlide && !current) || !editor.canExecuteCommand(entry.command!, slidesSearchPayload(entry, current, slideNumber) as never));
    return { ...entry, disabled, disabledReason: menu?.title ?? '현재 슬라이드 또는 선택한 객체에서는 실행할 수 없습니다.' };
  });
  const openCommandSearch = () => {
    const rootId = editor?.getRootId();
    if (!editor || !view || !rootId) return;
    searchTarget.current = { rootId, slideId: current, selection: structuredClone(captureTextSelection(editor, view, { allowBlurred: true }) ?? editor.selection ?? undefined) };
    setCommandError(''); setCommandOpen(true);
  };
  const pickSearchCommand = async (id: string) => {
    const target = searchTarget.current, entry = searchEntries.find(item => item.id === id);
    if (!editor || !target || !entry) return;
    // Reject a stale document or slide before restoring its captured selection.
    if (editor.getRootId() !== target.rootId || current !== target.slideId) {
      setCommandError('문서 또는 현재 슬라이드가 변경되었습니다. 명령을 다시 선택하세요.'); return;
    }
    try {
      if (target.selection) editor.updateSelection({ selection: target.selection, applySelectionToView: true });
      if (entry.command) {
        const payload = slidesSearchPayload(entry, target.slideId, slideNumber);
        if (!editor.canExecuteCommand(entry.command, payload as never) || !await editor.executeCommand(entry.command, payload as never)) {
          setCommandError('현재 선택에서 명령을 실행할 수 없습니다.'); return;
        }
      } else {
        if (menuItems.find(item => item.id === entry.id)?.disabled) { setCommandError('현재 상태에서 명령을 실행할 수 없습니다.'); return; }
        runEntry(entry);
      }
      setRecentCommands(previous => [id, ...previous.filter(value => value !== id)].slice(0, 5));
    } catch { setCommandError('명령을 실행하지 못했습니다. 다시 시도하세요.'); }
  };

  const onMenu = useCallback(
    (id: string) => {
      const entry = slidesMenuEntry(id);
      if (entry) runEntry(entry);
    },
    [runEntry]
  );

  return {
    menus, searchCommands, commandOpen, setCommandOpen, recentCommands, commandError,
    dismissCommandError: () => setCommandError(''), openCommandSearch, pickSearchCommand,
    onMenu, runEntry
  };
}
