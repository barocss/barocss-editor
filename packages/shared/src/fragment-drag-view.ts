import type { ModelSelection } from './selection';
import { selectedNodeIds } from './selection';
import { FRAGMENT_CLIPBOARD_TYPE } from './clipboard';
export const FRAGMENT_DRAG_TYPE = 'application/x-wonffice-drag-session';
export const FRAGMENT_NODE_DRAG_TYPE = 'application/x-wonffice-drag-nodes';
export interface FragmentDragFeedback { accepted: boolean; intent: 'copy' | 'move'; reason?: string; noop?: boolean; candidate?: boolean }
export type FragmentDropTarget = { kind: 'children'; parentId: string; index: number } | { kind: 'text'; nodeId: string; from: number; to: number };
export interface FragmentDragViewOptions {
  command(name: string, payload?: unknown): Promise<boolean>;
  selection(): ModelSelection | null | undefined;
  fromSelection(value: Selection): ModelSelection | null | undefined;
  fromRange(value: StaticRange): ModelSelection | null | undefined;
  node(id: string): { parentId?: string; content?: (string | unknown)[]; text?: string } | undefined;
  isBlock(id: string): boolean;
  composing(): boolean;
}

/** Shared DOM geometry and native drag lifecycle; policy decisions stay in editor commands. */
export function attachFragmentDrag(root: HTMLElement, options: FragmentDragViewOptions): { drop(event: DragEvent): void; destroy(): void } {
  const document = root.ownerDocument;
  let owned = false, indicator: HTMLDivElement | undefined, pendingNodes: ModelSelection | undefined;
  const hide = () => { indicator?.remove(); indicator = undefined; };
  const within = (node: Element): boolean => root.contains(node) && node.closest('[contenteditable="true"]') === root;
  const inside = (node: Node): boolean => root.contains(node) && (node.nodeType === 1 ? node as Element : node.parentElement)?.closest('[contenteditable]') === root;
  const ignored = (event: DragEvent): boolean => event.defaultPrevented || options.composing() || !!(event.target as Element | null)?.closest?.('input,textarea') || !!event.dataTransfer?.types.includes('Files');
  const carriesInput = (event: DragEvent): boolean => !!event.dataTransfer?.types.some(type => [FRAGMENT_DRAG_TYPE, FRAGMENT_CLIPBOARD_TYPE, 'text/html', 'text/plain'].includes(type));
  const place = (event: DragEvent): { target: FragmentDropTarget; rect: { x: number; y: number; width: number; height: number } } | undefined => {
    if (event.dataTransfer?.types.includes(FRAGMENT_NODE_DRAG_TYPE)) {
      let element = (event.target as Element | null)?.closest?.('[data-bc-sid]');
      while (element && root.contains(element)) {
        const id = element.getAttribute('data-bc-sid')!, node = options.node(id);
        if (options.isBlock(id) && node?.parentId && within(element)) {
          const siblings = options.node(node.parentId)?.content ?? [], index = siblings.indexOf(id), box = element.getBoundingClientRect();
          if (index < 0) return undefined;
          const after = event.clientY >= box.top + box.height / 2;
          return { target: { kind: 'children', parentId: node.parentId, index: index + Number(after) }, rect: { x: box.x, y: after ? box.bottom : box.top, width: box.width, height: 2 } };
        }
        element = element.parentElement?.closest('[data-bc-sid]') ?? null;
      }
      return undefined;
    }
    const pointDocument = document as Document & { caretPositionFromPoint?(x: number, y: number): { offsetNode: Node; offset: number } | null; caretRangeFromPoint?(x: number, y: number): Range | null };
    const point = pointDocument.caretPositionFromPoint?.(event.clientX, event.clientY), range = document.createRange();
    if (point) range.setStart(point.offsetNode, point.offset);
    else {
      const hit = pointDocument.caretRangeFromPoint?.(event.clientX, event.clientY);
      if (!hit) return undefined;
      range.setStart(hit.startContainer, hit.startOffset);
    }
    range.collapse(true);
    if (!inside(range.startContainer)) return undefined;
    const selection = options.fromRange(range as unknown as StaticRange);
    if (!selection || selection.type !== 'range' || typeof options.node(selection.startNodeId)?.text !== 'string') return undefined;
    const box = range.getBoundingClientRect();
    return { target: { kind: 'text', nodeId: selection.startNodeId, from: selection.startOffset, to: selection.startOffset }, rect: { x: box.x, y: box.y, width: 2, height: box.height || 18 } };
  };
  // Native pointer-down can collapse the selection before dragstart. Keep a selected draggable's
  // node selection only for that gesture; plain text drags still use the live DOM range.
  const pointer = (event: PointerEvent) => {
    const selection = options.selection(), ids = selectedNodeIds(selection);
    const draggable = (event.target as Element | null)?.closest?.('[draggable="true"][data-bc-sid]');
    pendingNodes = draggable && within(draggable) && ids.includes(draggable.getAttribute('data-bc-sid')!) ? selection ?? undefined : undefined;
  };
  const start = (event: DragEvent) => {
    if (ignored(event) || !event.dataTransfer || event.dataTransfer.types.length > 0 && !carriesInput(event)) return;
    if (!pendingNodes && (!(event.target instanceof Node) || !inside(event.target))) return;
    const dom = document.getSelection(), selection = pendingNodes ?? options.selection();
    const model = selectedNodeIds(selection).length ? selection : dom && dom.anchorNode && inside(dom.anchorNode) ? options.fromSelection(dom) : undefined;
    if (!model) return;
    owned = false;
    void options.command('beginFragmentDrag', { selection: model, dataTransfer: event.dataTransfer, onStart: () => { owned = true; } });
    if (owned) event.dataTransfer.effectAllowed = 'copyMove';
    else event.preventDefault();
  };
  const over = (event: DragEvent) => {
    if (event.dataTransfer?.types.includes('Files')) { event.preventDefault(); hide(); return; }
    if (ignored(event) || !carriesInput(event)) { hide(); return; }
    const held = place(event);
    if (!held || !event.dataTransfer) { hide(); return; }
    event.preventDefault(); event.dataTransfer.dropEffect = 'none';
    void options.command('previewFragmentDrop', { target: held.target, intent: event.ctrlKey || event.altKey ? 'copy' : 'move', onDecision: (value: FragmentDragFeedback) => {
      hide(); if (!value.accepted || !event.dataTransfer) return;
      event.dataTransfer.dropEffect = value.intent;
      indicator = document.createElement('div'); indicator.dataset.bcDragPreview = value.candidate ? 'candidate' : 'accepted'; indicator.setAttribute('aria-hidden','true');
      Object.assign(indicator.style, { position: 'fixed', pointerEvents: 'none', zIndex: '2147483647', background: '#2563eb', opacity: value.candidate ? '0.5' : '1', left: `${held.rect.x}px`, top: `${held.rect.y}px`, width: `${held.rect.width}px`, height: `${held.rect.height}px` });
      document.body.append(indicator);
    } });
  };
  const drop = (event: DragEvent) => {
    // Prevent file navigation without stopping bubbling to the product's upload handler.
    if (event.dataTransfer?.types.includes('Files')) { event.preventDefault(); hide(); return; }
    hide(); if (ignored(event) || !carriesInput(event)) return;
    const data = event.dataTransfer; if (!data) return;
    const held = place(event); event.preventDefault();
    if (!held) { void options.command('cancelFragmentDrag'); return; }
    void options.command('dropFragment', { target: held.target, intent: event.ctrlKey || event.altKey ? 'copy' : 'move', token: data.getData(FRAGMENT_DRAG_TYPE) || undefined, clipboardFragment: data.getData(FRAGMENT_CLIPBOARD_TYPE) || undefined, clipboardHtml: data.getData('text/html') || undefined, clipboardText: data.getData('text/plain') || undefined });
  };
  const end = () => { owned = false; pendingNodes = undefined; hide(); void options.command('cancelFragmentDrag'); };
  const leave = (event: DragEvent) => { if (!root.contains(event.relatedTarget as Node | null)) hide(); };
  const input = (event: InputEvent) => { if (owned && event.inputType === 'deleteByDrag') { event.preventDefault(); event.stopImmediatePropagation(); } };
  const key = (event: KeyboardEvent) => { if (event.key === 'Escape') end(); };
  root.addEventListener('pointerdown', pointer, true); root.addEventListener('dragstart', start); root.addEventListener('dragover', over); root.addEventListener('dragend', end); root.addEventListener('dragleave', leave); root.addEventListener('beforeinput', input, true); root.addEventListener('keydown', key);
  return { drop, destroy: () => { end(); root.removeEventListener('pointerdown', pointer, true); root.removeEventListener('dragstart', start); root.removeEventListener('dragover', over); root.removeEventListener('dragend', end); root.removeEventListener('dragleave', leave); root.removeEventListener('beforeinput', input, true); root.removeEventListener('keydown', key); } };
}
