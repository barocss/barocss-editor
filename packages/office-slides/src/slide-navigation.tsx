import { useId, useLayoutEffect, useRef, useState } from 'react';
import { Button, ChoiceSelect, Icon, IconButton, Toolbar } from '@barocss/office-ui';
import { useEditorRevision } from '@barocss/office-editor-ui';
import { Filmstrip, type FilmstripProps } from './filmstrip';

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
  const renameVisible = useRef(false);
  renameVisible.current = open;
  const rootId = editor?.getRootId();
  const nativeRoot = rootId ? editor?.dataStore.getNode(rootId) : undefined;
  const editable = editor?.isEditable;
  const latest = useRef({ nativeRoot, lifetimeKey, current, slides, onSelect: props.onSelect });
  latest.current = { nativeRoot, lifetimeKey, current, slides, onSelect: props.onSelect };
  useLayoutEffect(() => { renameVisible.current = false; setOpen(false); }, [editor, nativeRoot, lifetimeKey, readOnly, editable]);
  const at = slides.findIndex(slide => slide.sid === current);
  const choose = (sid: string) => {
    const now = latest.current;
    if (!owner.current?.isConnected || owner.current.closest('[hidden], [inert]') ||
      nativeRoot !== now.nativeRoot || lifetimeKey !== now.lifetimeKey || current !== now.current ||
      !now.slides.some(slide => slide.sid === sid)) return;
    if (sid !== now.current) now.onSelect(sid);
  };
  const close = () => {
    renameVisible.current = false; setOpen(false);
    owner.current?.querySelector<HTMLButtonElement>('[data-filmstrip-toggle]')?.focus({ preventScroll: true });
  };
  return <div ref={owner} className="sl-slide-navigation" data-slide-navigation>
    <div ref={panel} id={panelId} className="sl-slide-navigation-panel" data-filmstrip-panel hidden={!open} inert={!open}
      onKeyDown={event => {
        if (event.key !== 'Escape' || event.defaultPrevented || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229 ||
          (event.target instanceof Element && event.target.closest('input, [role="listbox"], [role="menu"]'))) return;
        event.preventDefault(); event.stopPropagation(); close();
      }}>
      <Filmstrip {...props} orientation="horizontal" thumbnailWidth={props.thumbnailWidth ?? 128} active={open}
        canRename={() => renameVisible.current && !panel.current?.closest('[hidden], [inert]')}
        onSelect={choose} />
    </div>
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
  </div>;
}
