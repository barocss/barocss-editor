import { useEffect, useRef, useState } from 'react';
import type { Editor } from '@barocss/editor-core';
import { useEditorRevision } from '@barocss/office-editor-ui';
import { Button, FloatingSurface, FloatingPanelHeader, FloatingPanelFooter, PropertyToggle, StatusNotice, Icon, MenuAction, TextField } from '@barocss/office-ui';
import type { DataField, DatasetView } from '@barocss/schema';
import { getNoteDatabaseViews } from './database-views';
import './database-views.css';

const layouts = [
  { id: 'table', label: '테이블 보기', icon: 'insert-table' },
  { id: 'board', label: '보드 보기', icon: 'frame-grid' },
  { id: 'gallery', label: '갤러리 보기', icon: 'type-image' },
  { id: 'calendar', label: '캘린더 보기', icon: 'type-date' }
] as const;

/** Named views change how records are shown, never which dataset owns them. */
export function DatabaseViewTabs({ editor, nodeId, disabled }: { editor: Editor; nodeId: string; disabled: boolean }) {
  useEditorRevision(editor);
  const state = getNoteDatabaseViews(editor, nodeId);
  const active = state.views.find(view => view.id === state.activeId);
  const [popup, setPopup] = useState<'add' | 'manage'>();
  const [name, setName] = useState('');
  const [layout, setLayout] = useState<DatasetView['view']>('table');
  const [error, setError] = useState('');
  const add = useRef<HTMLButtonElement>(null);
  const manage = useRef<HTMLButtonElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (popup !== 'add') return;
    const frame = requestAnimationFrame(() => nameInput.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [popup]);
  const pending = useRef(false);
  const dismiss = (reason?: unknown) => {
    const anchor = popup === 'add' ? add.current : manage.current;
    setPopup(undefined);
    requestAnimationFrame(() => { if (reason === 'escape' || document.activeElement === document.body) anchor?.focus({ preventScroll: true }); });
  };
  const run = async (command: string, payload: Record<string, unknown>) => {
    if (pending.current || disabled) return false;
    pending.current = true; setSaving(true);
    try {
      const ok = await editor.executeCommand(command, { nodeId, ...payload });
      setError(ok ? '' : '보기를 변경하지 못했습니다. 이름과 설정을 확인하세요.');
      return !!ok;
    } catch { setError('보기를 변경하지 못했습니다. 다시 시도하세요.'); return false; }
    finally { pending.current = false; setSaving(false); }
  };
  if (!active) return null;
  return <div className="ondb-view-strip">
    <div className="ondb-view-tabs" role="tablist" aria-label="저장된 데이터베이스 보기" onKeyDown={event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      const tabs = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role=tab]')];
      const index = tabs.indexOf(document.activeElement as HTMLButtonElement);
      if (index < 0) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      tabs[next]?.focus(); tabs[next]?.click();
    }}>
      {state.views.map(view => <button type="button" key={view.id} role="tab" aria-selected={view.id === state.activeId} tabIndex={view.id === state.activeId ? 0 : -1} disabled={disabled} data-db-view={view.id}
        onClick={() => { if (view.id !== state.activeId) void run('selectNoteDatabaseView', { viewId: view.id }); }}>
        <Icon name={layouts.find(layout => layout.id === view.view)?.icon ?? 'insert-table'} size={15} />{view.name}
      </button>)}
    </div>
    <Button ref={add} square tone="quiet" aria-label="보기 추가" disabled={disabled} onClick={() => { setName(''); setLayout('table'); setError(''); setPopup(popup === 'add' ? undefined : 'add'); }}><Icon name="add" size={16} /></Button>
    <Button ref={manage} square tone="quiet" className="ondb-view-manage" aria-label="현재 보기 메뉴" disabled={disabled} onClick={() => { setError(''); setPopup(popup === 'manage' ? undefined : 'manage'); }}><Icon name="more" /></Button>
    {popup === 'add' && <FloatingSurface open at={add.current?.getBoundingClientRect() ?? null} role="dialog" aria-label="새 보기" variant="panel" prefer="below" align="start" className="ondb-view-popup" ownedElements={[add]} onDismiss={dismiss}>
      <FloatingPanelHeader title="새 보기" onClose={() => dismiss('escape')} />
      <form onSubmit={event => event.preventDefault()}>
        <TextField inputRef={nameInput} ariaLabel="새 보기 이름" value={name} disabled={saving} placeholder="예: 진행 중인 작업" onChange={setName}
          onKeys={event => { if (event.key === 'Enter') { event.preventDefault(); if (name.trim()) void run('createNoteDatabaseView', { name: name.trim(), view: layout }).then(ok => { if (ok) dismiss('escape'); }); } }} />
        <div className="ondb-view-layout" role="group" aria-label="새 보기 레이아웃">
          {layouts.map(item => <Button disabled={saving} key={item.id} pressed={layout === item.id} onClick={() => setLayout(item.id)}><Icon name={item.icon} />{item.label}</Button>)}
        </div>
        {error && <StatusNotice tone="danger" title={error} />}
        <FloatingPanelFooter><Button disabled={saving} onClick={() => dismiss('escape')}>취소</Button><Button tone="accent" disabled={saving || !name.trim()} onClick={() => void run('createNoteDatabaseView', { name: name.trim(), view: layout }).then(ok => { if (ok) dismiss('escape'); })}>{saving ? '만드는 중…' : '보기 만들기'}</Button></FloatingPanelFooter>
      </form>
    </FloatingSurface>}
    {popup === 'manage' && <FloatingSurface open at={manage.current?.getBoundingClientRect() ?? null} role="dialog" aria-label="현재 보기 편집" variant="panel" prefer="below" align="end" className="ondb-view-popup" ownedElements={[manage]} onDismiss={dismiss}>
      <FloatingPanelHeader title="현재 보기" onClose={() => dismiss('escape')} /><label>보기 이름<TextField disabled={saving} ariaLabel="보기 이름" value={active.name} onCommit={name => { if (name.trim() !== active.name) void run('renameNoteDatabaseView', { viewId: active.id, name }); }} /></label>
      <MenuAction disabled={saving} onClick={() => void run('createNoteDatabaseView', { duplicateId: active.id }).then(ok => { if (ok) dismiss(); })}><Icon name="duplicate" />보기 복제</MenuAction>
      <MenuAction disabled={saving || state.views.length < 2} onClick={() => void run('removeNoteDatabaseView', { viewId: active.id }).then(ok => { if (ok) dismiss(); })}><Icon name="delete" />보기 삭제</MenuAction>
      {error && <StatusNotice tone="danger" title={error} />}
    </FloatingSurface>}
    {error && !popup && <p className="ondb-view-error" role="alert">{error}</p>}
  </div>;
}

export function DatabaseVisibleProperties({ fields, hidden, disabled, onChange }: { fields: DataField[]; hidden: string[]; disabled: boolean; onChange: (hidden: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const title = fields.find(field => field.kind === 'text')?.name;
  return <>
    <Button ref={trigger} aria-expanded={open} aria-label="보기에 표시할 속성" disabled={disabled} onClick={() => setOpen(!open)}>속성 표시 <span>{fields.filter(field => !hidden.includes(field.name)).length}/{fields.length}</span></Button>
    {open && <FloatingSurface open at={trigger.current?.getBoundingClientRect() ?? null} role="dialog" aria-label="속성 표시 설정" variant="panel" prefer="below" align="start" className="ondb-view-popup" focusOnOpen ownedElements={[trigger]} onDismiss={reason => { setOpen(false); if (reason === 'escape') trigger.current?.focus(); }}>
      <FloatingPanelHeader title="속성 표시" onClose={() => { setOpen(false); trigger.current?.focus(); }} />
      <p className="ondb-properties-hint">제목은 항상 표시합니다. 나머지 속성은 이 보기에서 숨길 수 있습니다.</p>
      {fields.map(field => <div className="ondb-property-check" key={field.name}>
        <PropertyToggle ariaLabel={`${field.label || field.name} 속성 표시`} label={field.label || field.name} value={!hidden.includes(field.name)} disabled={disabled || field.name === title}
          onChange={checked => onChange(checked ? hidden.filter(name => name !== field.name) : [...hidden, field.name])} />
        {field.name === title && <small>제목</small>}
      </div>)}
    </FloatingSurface>}
  </>;
}
