import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
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
  'audit' | 'map' | 'focus' | 'ruler' | 'present' | 'scroll';
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
  menuLifetimeKey: string;
  searchCommands: SearchCommand[];
  commandOpen: boolean;
  setCommandOpen: Dispatch<SetStateAction<boolean>>;
  recentCommands: string[];
  commandError: string;
  dismissCommandError: () => void;
  openCommandSearch: () => void;
  pickSearchCommand: (id: string) => Promise<void>;
  prepareSearchCommandPick: (id: string) => (() => void) | undefined;
  onMenu: (id: string) => void;
  runEntry: (entry: SlideMenuDispatchEntry) => void;
}

export function useSlideMenuSearch({
  editor, view, current, slideNumber, answers, moveBy, auditing, mapping, focused,
  onFileAction, onViewAction
}: SlideMenuSearchInputs): SlideMenuSearch {
  // A popup owns the native editor generation, not only its reusable document ID.
  const lifetimeNumber = useRef(0);
  const lifetime = useMemo(() => ({ editor, view, current, id: ++lifetimeNumber.current, generation: 0 }),
    [editor, view, current, onFileAction, onViewAction]);
  const activeLifetime = useRef<typeof lifetime | null>(lifetime);
  activeLifetime.current = lifetime;
  useEffect(() => {
    if (!editor) return;
    activeLifetime.current = lifetime;
    let selection = JSON.stringify(editor.selection);
    const retire = () => { lifetime.generation += 1; };
    const selectionChanged = () => {
      const next = JSON.stringify(editor.selection);
      if (next !== selection) { selection = next; retire(); }
    };
    editor.on('editor:selection.model', selectionChanged);
    editor.on('editor:selection.change', selectionChanged);
    editor.on('editor:content.change', retire);
    editor.on('editor:editable.change', retire);
    return () => {
      if (activeLifetime.current === lifetime) activeLifetime.current = null;
      editor.off('editor:selection.model', selectionChanged);
      editor.off('editor:selection.change', selectionChanged);
      editor.off('editor:content.change', retire); editor.off('editor:editable.change', retire);
    };
  }, [editor, lifetime]);
  const captureOwner = () => {
    const rootId = editor?.getRootId();
    return editor && rootId ? { lifetime, generation: lifetime.generation, rootId,
      root: editor.dataStore.getNode(rootId), version: editor.dataStore.getVersion(),
      editable: editor.isEditable, selection: JSON.stringify(editor.selection) } : undefined;
  };
  type Owner = ReturnType<typeof captureOwner>;
  const owns = (owner: Owner) => !!editor && !!owner && activeLifetime.current === owner.lifetime &&
    owner.lifetime.generation === owner.generation && editor.getRootId() === owner.rootId &&
    editor.dataStore.getNode(owner.rootId) === owner.root && editor.dataStore.getVersion() === owner.version &&
    editor.isEditable === owner.editable && JSON.stringify(editor.selection) === owner.selection;
  const renderOwner = captureOwner();
  const needsWrite = (entry: SlideMenuDispatchEntry) =>
    ['template', 'dialog.size', 'dialog.layout', 'dialog.theme'].includes(entry.view ?? '');
  const canDispatch = (entry: SlideMenuDispatchEntry) => !!editor &&
    !(needsWrite(entry) && !editor.isEditable) && !(entry.view === 'scroll' && moveBy === 'links') &&
    (!entry.command || editor.canExecuteCommand(entry.command,
      (entry.needs === 'slide' ? { ...entry.payload, slideId: current } : entry.payload) as never));
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
            disabled: !canDispatch(item)
          }))
        }))
      })),
    [editor, answers, current, moveBy, auditing, mapping, focused, editor?.isEditable]
  );

  const runEntry = (entry: SlideMenuDispatchEntry) => {
    if (!owns(renderOwner) || !canDispatch(entry)) return;
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
      case 'ruler':
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
  };

  const [commandOpen, setCommandOpenState] = useState(false);
  const commandOpenRef = useRef(false);
  const [recentCommands, setRecentCommands] = useState<string[]>([]);
  const [commandError, setCommandError] = useState('');
  const searchTarget = useRef<{ owner: Owner; slideId?: string; selection?: ModelSelection } | undefined>(undefined);
  const searchGeneration = useRef(0);
  const renderedSearchTarget = searchTarget.current;
  const setCommandOpen: Dispatch<SetStateAction<boolean>> = next => {
    const open = typeof next === 'function' ? next(commandOpenRef.current) : next;
    commandOpenRef.current = open;
    if (!open) searchTarget.current = undefined;
    setCommandOpenState(open);
  };
  const searchEntries = useMemo(() => slidesSearchCommands(onApple()), []);
  const menuItems = menus.flatMap(menu => menu.blocks.flatMap(block => block.items));
  const searchCommands: SearchCommand[] = searchEntries.map(entry => {
    const menu = menuItems.find(item => item.id === entry.id);
    const disabled = !editor || (menu ? menu.disabled :
      (!!entry.control?.needsSlide && !current) || !editor.canExecuteCommand(entry.command!, slidesSearchPayload(entry, current, slideNumber) as never));
    return { ...entry, disabled, disabledReason: menu?.title ?? '현재 슬라이드 또는 선택한 객체에서는 실행할 수 없습니다.' };
  });
  const openCommandSearch = () => {
    if (!editor || !view || !owns(renderOwner)) return;
    searchGeneration.current += 1;
    searchTarget.current = { owner: captureOwner(), slideId: current, selection: structuredClone(captureTextSelection(editor, view, { allowBlurred: true }) ?? editor.selection ?? undefined) };
    setCommandError(''); setCommandOpen(true);
  };
  const executeSearchCommand = async (id: string, target: NonNullable<typeof renderedSearchTarget>) => {
    const entry = searchEntries.find(item => item.id === id);
    if (!editor || !entry) return;
    // Reject a stale document or slide before restoring its captured selection.
    if (!owns(renderOwner) || !owns(target.owner) || current !== target.slideId) {
      setCommandError('문서 또는 현재 슬라이드가 변경되었습니다. 명령을 다시 선택하세요.'); return;
    }
    try {
      if (entry.command) {
        const payload = slidesSearchPayload(entry, target.slideId, slideNumber);
        if (!editor.canExecuteCommand(entry.command, payload as never)) {
          setCommandError('현재 선택에서 명령을 실행할 수 없습니다.'); return;
        }
        if (target.selection) editor.updateSelection({ selection: target.selection, applySelectionToView: true });
        if (!await editor.executeCommand(entry.command, payload as never)) {
          setCommandError('현재 선택에서 명령을 실행할 수 없습니다.'); return;
        }
      } else {
        if (!canDispatch(entry)) { setCommandError('현재 상태에서 명령을 실행할 수 없습니다.'); return; }
        runEntry(entry);
      }
      setRecentCommands(previous => [id, ...previous.filter(value => value !== id)].slice(0, 5));
    } catch { setCommandError('명령을 실행하지 못했습니다. 다시 시도하세요.'); }
  };

  const pickSearchCommand = async (id: string) => {
    const target = renderedSearchTarget;
    if (target && searchTarget.current === target) await executeSearchCommand(id, target);
  };
  const prepareSearchCommandPick = (id: string) => {
    const target = renderedSearchTarget, entry = searchEntries.find(item => item.id === id);
    if (!editor || !target || searchTarget.current !== target || !entry ||
      !owns(renderOwner) || !owns(target.owner)) return;
    const permitted = entry.command
      ? editor.canExecuteCommand(entry.command, slidesSearchPayload(entry, target.slideId, slideNumber) as never)
      : canDispatch(entry);
    if (!permitted) return;
    const generation = searchGeneration.current;
    let consumed = false;
    // CommandSearch captures this before closing and invokes it after focus returns.
    // A raw close has no dispatch ticket; reopening invalidates the captured ticket.
    return () => {
      if (consumed) return;
      consumed = true;
      if (searchGeneration.current === generation) void executeSearchCommand(id, target);
    };
  };

  const onMenu = (id: string) => {
    const entry = slidesMenuEntry(id);
    if (entry) runEntry(entry);
  };

  return {
    menus, menuLifetimeKey: `${lifetime.id}:${lifetime.generation}`, searchCommands, commandOpen, setCommandOpen, recentCommands, commandError,
    dismissCommandError: () => setCommandError(''), openCommandSearch, pickSearchCommand, prepareSearchCommandPick,
    onMenu, runEntry
  };
}
