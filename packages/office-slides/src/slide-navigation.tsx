import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button, ChoiceSelect, Icon, IconButton, Toolbar } from '@barocss/office-ui';
import { useEditorRevision } from '@barocss/office-editor-ui';
import { Filmstrip, type FilmstripProps } from './filmstrip';
import './slide-navigation.css';

export interface SlideNavigationProps extends FilmstripProps {
  /** Definitions are surfaces in their own right, not slide one. */
  definitionLabel?: string;
}

/** A single native filmstrip, with UI-only folding below the stage. */
export function SlideNavigation(props: SlideNavigationProps) {
  const { editor, current, slides, readOnly = false, lifetimeKey, definitionLabel } = props;
  useEditorRevision(editor);
  const owner = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const returnFocus = useRef(false);
  const renameVisible = useRef(false);
  renameVisible.current = open;
  const rootId = editor?.getRootId();
  const nativeRoot = rootId ? editor?.dataStore.getNode(rootId) : undefined;
  const editable = editor?.isEditable;
  const context = useMemo(() => ({}), [editor, rootId, lifetimeKey, current, readOnly, editable]);
  const latest = useRef({ editor, nativeRoot, lifetimeKey, current, slides, readOnly, open, context, onSelect: props.onSelect });
  latest.current = { editor, nativeRoot, lifetimeKey, current, slides, readOnly, open, context, onSelect: props.onSelect };
  useLayoutEffect(() => { renameVisible.current = false; setOpen(false); }, [editor, nativeRoot, lifetimeKey, readOnly, editable]);
  useLayoutEffect(() => {
    if (open) {
      const current = panel.current?.querySelector<HTMLButtonElement>('[data-current="true"]') ?? panel.current?.querySelector<HTMLButtonElement>('[data-slide]');
      current?.focus({ preventScroll: true });
    }
    else if (returnFocus.current) {
      returnFocus.current = false;
      owner.current?.querySelector<HTMLButtonElement>('[data-filmstrip-toggle]')?.focus({ preventScroll: true });
    }
  }, [open]);
  const at = slides.findIndex(slide => slide.sid === current);
  const choose = (sid: string) => {
    const now = latest.current;
    if (!owner.current?.isConnected || owner.current.closest('[hidden], [inert]') ||
      nativeRoot !== now.nativeRoot || lifetimeKey !== now.lifetimeKey || current !== now.current ||
      !now.slides.some(slide => slide.sid === sid)) return;
    if (sid !== now.current) now.onSelect(sid);
  };
  const close = () => {
    returnFocus.current = true;
    renameVisible.current = false; setOpen(false);
  };
  const addSlide = async () => {
    const now = latest.current;
    if (!editor || now.editor !== editor || !now.open || now.readOnly || !editor.isEditable ||
      !panel.current?.isConnected || panel.current.closest('[hidden], [inert]') ||
      nativeRoot !== now.nativeRoot || nativeRoot !== editor.dataStore.getNode(editor.getRootId()!) ||
      lifetimeKey !== now.lifetimeKey || current !== now.current || !now.slides.some(slide => slide.sid === current) ||
      !editor.canExecuteCommand('insertSlide', { after: current })) return;
    const payload = { after: current };
    const previous = new Set(slides.map(slide => slide.sid));
    let replaced = false;
    let committedRoot: typeof nativeRoot;
    const retire = ({ transaction }: { transaction: unknown }) => { if (!transaction) replaced = true; };
    const revoke = () => { replaced = true; };
    const committed = (event: { command: string; payload?: unknown; success: boolean }) => {
      if (event.command === 'insertSlide' && event.payload === payload && event.success) {
        committedRoot = editor.dataStore.getNode(rootId!);
      }
    };
    editor.on('editor:content.change', retire);
    editor.on('editor:editable.change', revoke);
    editor.on('editor:command.after', committed);
    try {
      if (!await editor.executeCommand('insertSlide', payload)) return;
      const fresh = latest.current;
      // The command may replace the root node. Only its own completed root may
      // hand focus to the new slide; a load, permission change or later edit retires it.
      if (replaced || !committedRoot || fresh.context !== context || fresh.readOnly || !editor.isEditable ||
        !owner.current?.isConnected || owner.current.closest('[hidden], [inert]') ||
        editor.getRootId() !== rootId || editor.dataStore.getNode(rootId!) !== committedRoot) return;
      const children = Array.isArray(committedRoot.content) ? committedRoot.content as string[] : [];
      const added = children.filter(sid => !previous.has(sid))
        .map(sid => editor.dataStore.getNode(sid)).filter(node => node?.stype === 'surface' && node.attributes?.kind === 'slide');
      if (added.length === 1 && added[0]?.sid) fresh.onSelect(added[0].sid);
    } finally {
      editor.off('editor:content.change', retire);
      editor.off('editor:editable.change', revoke);
      editor.off('editor:command.after', committed);
    }
  };
  return <div ref={owner} className="sl-slide-navigation" data-slide-navigation data-expanded={open}>
    <div ref={panel} id={panelId} className="sl-slide-navigation-panel" data-filmstrip-panel hidden={!open} inert={!open}
      onKeyDown={event => {
        if (event.key !== 'Escape' || event.defaultPrevented || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229 ||
          (event.target instanceof Element && event.target.closest('input, [role="listbox"], [role="menu"]'))) return;
        event.preventDefault(); event.stopPropagation(); close();
      }}>
      <div className="sl-slide-navigation-heading">
        <IconButton label="새 슬라이드" preserveFocus disabled={readOnly || !editable || at < 0 || !editor?.canExecuteCommand('insertSlide', { after: current })}
          onClick={addSlide}><Icon name="add" /></IconButton>
        <span className="sl-slide-navigation-title">슬라이드 <span>{slides.length}</span></span>
        <Button aria-label="슬라이드 탐색 접기" tone="quiet" className="sl-slide-navigation-fold"
          onMouseDown={event => event.preventDefault()}
          onPointerDownCapture={() => { renameVisible.current = false; }}
          onClick={close}><Icon name="disclosed" /></Button>
      </div>
      <Filmstrip {...props} orientation="horizontal" thumbnailWidth={props.thumbnailWidth ?? 160} active={open}
        canRename={() => renameVisible.current && !panel.current?.closest('[hidden], [inert]')}
        onSelect={choose} />
    </div>
    <div className="sl-slide-navigation-folded" hidden={open} inert={open}>
    <Toolbar variant="compact" surface="floating" shape="pill" label="슬라이드 페이지 도구" className="sl-slide-navigation-tools">
      <IconButton label="이전 슬라이드" disabled={at <= 0} preserveFocus onClick={() => { if (at > 0) choose(slides[at - 1].sid); }}><Icon name="previous-page" /></IconButton>
      <ChoiceSelect className="sl-slide-navigation-choice" portalContainer={owner} ariaLabel="현재 슬라이드" value={current ?? null}
        disabled={slides.length === 0 || at < 0} onChange={choose}
        options={[...(at < 0 && current ? [{ id: current, label: definitionLabel ?? '정의 편집' }] : []),
          ...slides.map(slide => ({ id: slide.sid, label: String(slide.number) }))]} />
      <span className="sl-count" aria-label="전체 슬라이드 수">/ {slides.length}</span>
      <IconButton label="다음 슬라이드" disabled={at < 0 || at >= slides.length - 1} preserveFocus onClick={() => { if (at >= 0 && at < slides.length - 1) choose(slides[at + 1].sid); }}><Icon name="next-page" /></IconButton>
      <span className="sl-slide-navigation-separator" aria-hidden="true" />
      <Button aria-label={open ? '슬라이드 탐색 접기' : '슬라이드 탐색 펼치기'} tone="quiet" className="sl-slide-navigation-fold"
        data={{ 'filmstrip-toggle': 'true' }} aria-controls={panelId} aria-expanded={open}
        onMouseDown={event => event.preventDefault()}
        onPointerDownCapture={() => { if (open) renameVisible.current = false; }}
        onClick={() => {
          if (open) close();
          else { renameVisible.current = true; setOpen(true); }
        }}><Icon name="outline" /></Button>
    </Toolbar>
    </div>
  </div>;
}
