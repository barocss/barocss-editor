import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { Editor, ModelSelection } from '@barocss/editor-core';
import type { EditorViewDOM } from '@barocss/editor-view-dom';
import { captureTextSelection } from '@barocss/office-editor-ui';
import type { SearchCommand } from '@barocss/office-ui';

export interface SiteSearchEntry extends SearchCommand {
  command?: string;
  view?: string;
  payload?: Record<string, unknown>;
  needs?: string;
}
export interface SiteSearchContext {
  root?: string;
  page?: string;
  scopeRoot?: string;
  admin?: string;
  writing: boolean;
  preview: boolean;
  dataset?: string;
  mode: string;
}
interface Inputs {
  editor: Editor | null;
  view: EditorViewDOM | null;
  given: Editor | null;
  context: SiteSearchContext;
  revision: number;
  entries: readonly SiteSearchEntry[];
  menuItems: readonly { id: string; disabled?: boolean }[];
  payloadFor: (entry: SiteSearchEntry) => Record<string, unknown> | undefined;
  runEntry: (entry: SiteSearchEntry) => unknown;
}

export function useSiteMenuSearch({ editor, view, given, context, revision, entries,
  menuItems, payloadFor, runEntry }: Inputs) {
  const contextKey = JSON.stringify([context.root, context.page, context.scopeRoot, context.admin,
    context.writing, context.preview, context.dataset, context.mode]);
  const lifetime = useMemo(() => ({ editor, view, given, contextKey, generation: 0 }),
    [editor, view, given, contextKey]);
  const active = useRef<typeof lifetime | null>(lifetime);
  active.current = lifetime;
  const latest = useRef({ entries, menuItems, payloadFor, runEntry });
  latest.current = { entries, menuItems, payloadFor, runEntry };
  useEffect(() => {
    if (!editor) return;
    active.current = lifetime;
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
      if (active.current === lifetime) active.current = null;
      editor.off('editor:selection.model', selectionChanged);
      editor.off('editor:selection.change', selectionChanged);
      editor.off('editor:content.change', retire); editor.off('editor:editable.change', retire);
    };
  }, [editor, lifetime]);
  const capture = () => {
    const rootId = editor?.getRootId();
    return editor && rootId ? { lifetime, generation: lifetime.generation, rootId,
      root: editor.dataStore.getNode(rootId), version: editor.dataStore.getVersion(),
      editable: editor.isEditable, selection: JSON.stringify(editor.selection) } : undefined;
  };
  type Owner = ReturnType<typeof capture>;
  const owns = (owner: Owner) => !!editor && !!owner && active.current === owner.lifetime &&
    lifetime.generation === owner.generation && editor.getRootId() === owner.rootId &&
    editor.dataStore.getNode(owner.rootId) === owner.root && editor.dataStore.getVersion() === owner.version &&
    editor.isEditable === owner.editable && JSON.stringify(editor.selection) === owner.selection;
  const renderOwner = capture();
  const permitted = (entry: SiteSearchEntry) => {
    const item = latest.current.menuItems.find(item => item.id === entry.id);
    return !!editor && !context.preview && !!item && !item.disabled &&
      (!entry.command || (editor.isEditable && given?.isEditable === true &&
        given.canExecuteCommand(entry.command, latest.current.payloadFor(entry) as never)));
  };
  // The app's revision causes a render; each render reads current native capability.
  void revision;
  const searchCommands: SearchCommand[] = entries.map(entry => ({ ...entry,
    disabled: !permitted(entry),
    disabledReason: context.writing ? '글 고치기 모드 또는 현재 선택에서는 실행할 수 없습니다.'
      : '현재 페이지 또는 선택한 객체에서는 실행할 수 없습니다.'
  }));
  const [commandOpen, setOpen] = useState(false), openRef = useRef(false);
  const [error, setError] = useState(''), [recentIds, setRecentIds] = useState<string[]>([]);
  const target = useRef<{ owner: Owner; selection?: ModelSelection } | undefined>(undefined);
  const generation = useRef(0), renderedTarget = target.current;
  const setCommandOpen: Dispatch<SetStateAction<boolean>> = value => {
    const open = typeof value === 'function' ? value(openRef.current) : value;
    openRef.current = open;
    if (!open) target.current = undefined;
    setOpen(open);
  };
  const openCommandSearch = () => {
    if (!editor || !view || context.preview || !owns(renderOwner)) return;
    generation.current += 1;
    target.current = { owner: capture(), selection: structuredClone(
      captureTextSelection(editor, view, { allowBlurred: true }) ?? editor.selection ?? undefined) };
    setError(''); setCommandOpen(true);
  };
  const execute = async (id: string, captured: NonNullable<typeof renderedTarget>) => {
    const entry = latest.current.entries.find(entry => entry.id === id);
    if (!editor || !entry) return;
    if (!owns(renderOwner) || !owns(captured.owner)) {
      setError('문서 또는 편집 화면이 변경되었습니다. 명령을 다시 선택하세요.'); return;
    }
    if (!permitted(entry)) { setError('현재 선택에서 명령을 실행할 수 없습니다.'); return; }
    try {
      if (entry.command && captured.selection) editor.updateSelection({
        selection: captured.selection, applySelectionToView: true
      });
      if (await latest.current.runEntry(entry) === false) {
        setError('명령을 실행하지 못했습니다. 다시 시도하세요.'); return;
      }
      setRecentIds(previous => [id, ...previous.filter(value => value !== id)].slice(0, 5));
    } catch { setError('명령을 실행하지 못했습니다. 다시 시도하세요.'); }
  };
  const pickSearchCommand = async (id: string) => {
    if (renderedTarget && target.current === renderedTarget) await execute(id, renderedTarget);
  };
  const prepareSearchCommandPick = (id: string) => {
    const entry = latest.current.entries.find(entry => entry.id === id), captured = renderedTarget;
    if (!entry || !captured || target.current !== captured) return;
    if (!owns(renderOwner) || !owns(captured.owner)) {
      setError('문서 또는 편집 화면이 변경되었습니다. 명령을 다시 선택하세요.');
      setCommandOpen(false); return;
    }
    if (!permitted(entry)) return;
    const epoch = generation.current;
    let consumed = false;
    return () => {
      if (consumed) return;
      consumed = true;
      // Shared CommandSearch captures this before closing and dispatches after focus returns.
      if (generation.current === epoch) void execute(id, captured);
    };
  };
  return { commandOpen, setCommandOpen, error, dismiss: () => setError(''), recentIds,
    searchCommands, openCommandSearch, pickSearchCommand, prepareSearchCommandPick };
}
