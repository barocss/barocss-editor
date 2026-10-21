import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { Editor } from '@barocss/editor-core';
import { Icon } from '@barocss/office-ui';
import { componentsOf, definitionAt, documentVars, surfaceOf, surfaceVars, varBindsOf, varInScope, UNBINDABLE, type CanvasAccess } from '@barocss/office-canvas';
import './property-variable.css';

const ATTRS = new Set(['text', 'x', 'y', 'width', 'height', 'rotation', 'fill', 'stroke', 'strokeWidth', 'cornerRadius', 'opacity', 'visible', 'gap', 'padding', 'layoutStretch', 'layoutGrow']);
const kindsFor = (attr: string) => attr === 'text' ? ['text', 'number', 'choice'] : ['fill', 'stroke'].includes(attr) ? ['color', 'text'] : ['visible', 'layoutStretch'].includes(attr) ? ['boolean'] : ['number', 'text'];
export interface PropertyVariable {
  name: string; label: string; value: string;
}
export interface FieldBinding {
  name: string | null; mixed: boolean; resolved: string | null; resolvedLabel?: string;
  options: PropertyVariable[]; component?: { id: string; part: string };
}

/** Bindings and declarations are resolved at every target, never from the first shape alone. */
export function propertyBinding(editor: Editor | null, targets: string[], attr: string): FieldBinding | undefined {
  if (!editor || !targets.length || !ATTRS.has(attr) || UNBINDABLE.has(attr)) return undefined;
  const store = editor.dataStore;
  const rootId = editor.getRootId();
  if (!rootId) return undefined;
  const doc: CanvasAccess = { rootId, getNode: sid => store.getNode(sid) };
  const nodes = targets.map(sid => store.getNode(sid));
  if (nodes.some(node => !node || (attr === 'text' ? !['textFrame', 'sticky'].includes(node.stype) : !(attr in (store.getActiveSchema()?.getNodeType(node.stype)?.attrs ?? {}))))) return undefined;
  const definitions = targets.map(sid => definitionAt(doc, sid));
  if (definitions.some(Boolean)) {
    // Component bindings name one durable part. No multi-part command exists.
    if (targets.length !== 1 || !definitions[0]) return undefined;
    const definition = componentsOf(doc).find(one => one.sid === definitions[0]);
    const part = nodes[0]?.attributes?.partId;
    if (!definition || typeof part !== 'string' || !part) return undefined;
    const name = definition.binds.find(one => one.part === part && one.attr === attr)?.var ?? null;
    const options = definition.vars.filter(one => kindsFor(attr).includes(one.kind)).map(one => ({ name: one.name, label: one.label || one.name, value: one.value }));
    const stackedFill = attr === 'fill' && Array.isArray(nodes[0]?.attributes?.fills);
    if (stackedFill && !name) return undefined;
    return { name, mixed: false, resolved: options.find(one => one.name === name)?.value ?? null, options: stackedFill ? [] : options, component: { id: definition.id, part } };
  }
  const names = nodes.map(node => varBindsOf(node).find(one => one.attr === attr)?.var ?? null);
  const mixed = names.some(name => name !== names[0]);
  // A paint list owns its individual colors via var: references. A flat fill binding cannot drive it.
  const stackedFill = attr === 'fill' && nodes.some(node => Array.isArray(node?.attributes?.fills));
  if (stackedFill && names.every(name => !name)) return undefined;
  const declarations = [...documentVars(doc), ...targets.flatMap(sid => surfaceVars(doc, surfaceOf(doc, sid)))];
  const options = [...new Set(declarations.map(one => one.name))].flatMap(name => {
    const scoped = targets.map(sid => varInScope(doc, sid, name));
    if (scoped.some(one => !one || !kindsFor(attr).includes(one.kind))) return [];
    const first = scoped[0]!;
    const agrees = scoped.every(one => one?.value === first.value);
    return [{ name, label: first.label, value: agrees ? first.value : '선택마다 다른 값' }];
  });
  const values = targets.map((sid, index) => varInScope(doc, sid, names[index] ?? undefined)?.value ?? null);
  return { name: mixed ? null : names[0], mixed, resolved: values.every(value => value === values[0]) ? values[0] : null, resolvedLabel: values.every(value => value === values[0]) ? undefined : '선택마다 다른 값', options: stackedFill ? [] : options };
}

/** A field and its variable stay in one row. The picker stays inside the inspector's focus owner. */
export function PropertyVariableField({ binding, label, disabled, onBind, children }: {
  binding?: FieldBinding; label: string; disabled?: boolean;
  onBind: (name: string | null, component?: FieldBinding['component']) => void; children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [position, setPosition] = useState({ left: 0, top: 0, width: 220, maxHeight: 260 });
  const picker = useRef<HTMLSpanElement>(null);
  const host = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      const panel = host.current?.closest('[data-workspace-panel="inspector"]')?.getBoundingClientRect();
      const leftEdge = Math.max(8, (panel?.left ?? 0) + 8);
      const rightEdge = Math.min(window.innerWidth - 8, (panel?.right ?? window.innerWidth) - 8);
      const topEdge = Math.max(8, (panel?.top ?? 0) + 8);
      const bottomEdge = Math.min(window.innerHeight - 8, (panel?.bottom ?? window.innerHeight) - 8);
      const width = Math.min(220, Math.max(32, rightEdge - leftEdge));
      const maxHeight = Math.max(32, bottomEdge - topEdge);
      const height = Math.min(picker.current?.getBoundingClientRect().height ?? 260, maxHeight);
      const below = bottomEdge - rect.bottom - 4;
      const above = rect.top - topEdge - 4;
      const top = below < height && above > below ? rect.top - height - 4 : rect.bottom + 4;
      const next = { left: Math.max(leftEdge, Math.min(rect.right - width, rightEdge - width)), top: Math.max(topEdge, Math.min(top, bottomEdge - height)), width, maxHeight };
      setPosition(previous => Object.keys(next).every(key => previous[key as keyof typeof next] === next[key as keyof typeof next]) ? previous : next);
    };
    measure(); window.addEventListener('resize', measure); window.addEventListener('scroll', measure, true);
    return () => { window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true); };
  }, [open, query, binding?.name, binding?.mixed]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!host.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, [open]);
  if (!binding || (!binding.options.length && !binding.name && !binding.mixed)) return children;
  const bound = !!binding.name || binding.mixed;
  const current = binding.options.find(one => one.name === binding.name);
  const choose = (name: string | null) => {
    if (disabled || !host.current?.isConnected) return;
    onBind(name, binding.component); setOpen(false); trigger.current?.focus({ preventScroll: true });
  };
  return <span className="sl-variable-field" ref={host} data-variable-field={label}>
    <span className="sl-variable-value">{bound ? <button type="button" className="sl-variable-token" disabled={disabled}
      title={binding.mixed ? '선택한 객체의 변수 연결이 다릅니다.' : `${binding.name}: ${binding.resolvedLabel ?? binding.resolved ?? '값 없음'}`}
      aria-label={`${label} 변수 ${binding.mixed ? '서로 다름' : binding.name}`} onClick={() => { setQuery(''); setOpen(!open); }}>
      {!binding.resolvedLabel && <Icon name="type-url" size={12} />}<span>{binding.mixed ? '서로 다름' : binding.resolvedLabel ?? current?.label ?? binding.name}</span>
      {!binding.mixed && !binding.resolvedLabel && binding.resolved !== null && <small>{binding.resolved}</small>}
    </button> : children}{bound && <span hidden><fieldset disabled>{children}</fieldset></span>}</span>
    <button ref={trigger} type="button" className="sl-variable-attach" disabled={disabled} aria-label={`${label} 변수 연결`}
      title={`${label} 변수 연결`} aria-haspopup="dialog" aria-expanded={open} onClick={() => { setQuery(''); setOpen(!open); }}><Icon name="type-url" size={13} /></button>
    {open && <span ref={picker} className="sl-variable-picker" style={position} role="dialog" aria-label={`${label} 변수 선택`} onKeyDown={event => {
      if (event.key === 'Escape' && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus({ preventScroll: true }); }
    }}>
      <input autoFocus className="office-field" aria-label={`${label} 변수 검색`} placeholder="변수 검색…" value={query} onChange={event => setQuery(event.target.value)} />
      <span className="sl-variable-options">
        {bound && <button type="button" onClick={() => choose(null)}><Icon name="close" size={12} />연결 해제</button>}
        {binding.options.filter(one => `${one.label} ${one.name}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map(one =>
          <button type="button" key={one.name} aria-pressed={binding.name === one.name} onClick={() => choose(one.name)}><span>{one.label}</span><small>{one.value || '값 없음'}</small></button>)}
        {!binding.options.length && <small>사용할 변수가 없습니다.</small>}
      </span>
    </span>}
  </span>;
}
