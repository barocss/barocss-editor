import { useLayoutEffect, useRef } from 'react';
import { createNodeSelection, type Editor } from '@barocss/editor-core';
import type { EditorViewDOM } from '@barocss/editor-view-dom';
import { latexPreview } from '@barocss/office-editor-ui';
import { transaction } from '@barocss/model';
import { wordMathDisplayLatex } from './math-display-latex';
import { registerWordDisplayPreparation } from './display-preparation';
import { captureWordMathTarget, mathTree, type WordMathTarget } from './math-editor-session';

/** A display projection only. OMML nodes remain the source for editing and DOCX. */
export function useWordMathDisplay(editor: Editor, view: EditorViewDOM, onEdit: (target: WordMathTarget) => void) {
  const edit = useRef(onEdit); edit.current = onEdit;
  const reveal = useRef<(id: string) => boolean>(() => false);
  useLayoutEffect(() => {
    const scope = view.contentEditableElement, doc = scope.ownerDocument;
    const records = new Map<HTMLElement, { mount: HTMLElement; key: string; editable: string | null }>();
    let stopped = false;
    let nativeOwner: HTMLElement | undefined;
    let revealingNative = false;
    const resize = new ResizeObserver(() => scan());
    const fit = (owner: HTMLElement, mount: HTMLElement) => {
      if (doc.defaultView?.matchMedia('print').matches) return;
      // Use layout pixels: viewport rectangles include the document zoom.
      const available = owner.clientWidth, natural = mount.scrollWidth;
      const overflow = natural > available + 1 && available > 0;
      if (overflow) owner.dataset.wordMathOverflow = 'true';
      else owner.removeAttribute('data-word-math-overflow');
      const scale = overflow ? String(available / natural) : '1';
      if (owner.style.getPropertyValue('--word-math-print-scale') !== scale) owner.style.setProperty('--word-math-print-scale', scale);
    };
    const restore = (owner: HTMLElement) => {
      const record = records.get(owner);
      resize.unobserve(owner);
      if (record) resize.unobserve(record.mount);
      record?.mount.remove();
      if (record?.editable == null) owner.removeAttribute('contenteditable');
      else owner.setAttribute('contenteditable', record.editable);
      owner.removeAttribute('data-word-math-rendered'); owner.removeAttribute('tabindex');
      owner.removeAttribute('data-word-math-overflow'); owner.style.removeProperty('--word-math-print-scale');
      owner.classList.remove('w-math-selected'); records.delete(owner);
    };
    const scan = () => {
      if (stopped) return;
      for (const owner of records.keys()) if (!scope.contains(owner)) restore(owner);
      for (const owner of scope.querySelectorAll<HTMLElement>('.w-math[data-bc-sid]')) {
        if (owner === nativeOwner || owner.classList.contains('w-math-editing')) continue;
        try {
          const id = owner.dataset.bcSid!;
          const tree = mathTree(editor, id);
          const display = !!owner.closest('.w-math-para');
          const key = JSON.stringify([tree, display]);
          const prior = records.get(owner);
          if (prior?.key === key && prior.mount.parentElement === owner) { fit(owner, prior.mount); continue; }
          const tex = wordMathDisplayLatex(tree);
          // Keep inline placement, but use full-size fractions within the formula.
          const preview = latexPreview(display ? tex : `\\displaystyle ${tex}`, display);
          if (preview.error) throw new Error(preview.error);
          const mount = prior?.mount ?? doc.createElement('span');
          mount.className = 'w-math-display';
          mount.dataset.editorInputOwner = 'word-math-display';
          mount.contentEditable = 'false';
          mount.innerHTML = preview.html;
          records.set(owner, { mount, key, editable: prior ? prior.editable : owner.getAttribute('contenteditable') });
          owner.dataset.wordMathRendered = 'katex'; owner.contentEditable = 'false';
          owner.tabIndex = 0;
          owner.append(mount);
          fit(owner, mount);
          resize.observe(owner); resize.observe(mount);
        } catch {
          // Unsupported structures and formatting keep their original renderer.
          if (records.has(owner)) restore(owner);
        }
      }
    };
    reveal.current = id => {
      const owner = [...records.keys()].find(element => element.dataset.bcSid === id);
      if (!owner) return false;
      nativeOwner = owner;
      restore(owner);
      const firstText = (nodeId: string): string | undefined => {
        const node = editor.dataStore.getNode(nodeId);
        if (node?.stype === 'inline-text') return nodeId;
        for (const child of node?.content ?? []) {
          const found = firstText(typeof child === 'string' ? child : child.sid!);
          if (found) return found;
        }
      };
      const textId = firstText(id);
      if (!textId) { nativeOwner = undefined; scan(); return false; }
      revealingNative = true;
      try {
        scope.focus({ preventScroll: true });
        editor.setRange({ type: 'range', startNodeId: textId, endNodeId: textId, startOffset: 0, endOffset: 0, collapsed: true });
      } finally { revealingNative = false; }
      return true;
    };
    const select = (owner: HTMLElement) => {
      const selection = createNodeSelection([owner.dataset.bcSid!]);
      if (selection) editor.updateSelection(selection);
    };
    const pointer = (event: PointerEvent) => {
      const owner = (event.target as Element)?.closest<HTMLElement>('[data-word-math-rendered]');
      if (!owner || owner.classList.contains('w-math-editing')) return;
      // Let the native horizontal scrollbar drag instead of selecting the math.
      if (owner.hasAttribute('data-word-math-overflow')) {
        const box = owner.getBoundingClientRect();
        const scale = box.height / owner.offsetHeight;
        if (event.clientY >= box.top + owner.clientHeight * scale) return;
      }
      event.preventDefault(); event.stopImmediatePropagation();
      owner.focus({ preventScroll: true }); select(owner);
    };
    const focus = (event: FocusEvent) => {
      const owner = event.target as HTMLElement;
      if (owner.matches('[data-word-math-rendered]') && !owner.classList.contains('w-math-editing')) select(owner);
    };
    const key = (event: KeyboardEvent) => {
      const target = captureWordMathTarget(editor);
      const owner = target && scope.querySelector<HTMLElement>(`[data-bc-sid="${CSS.escape(target.id)}"][data-word-math-rendered]`);
      if (!owner || owner.classList.contains('w-math-editing') || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === 'Enter' || event.key === 'F2') {
        event.preventDefault(); event.stopImmediatePropagation(); edit.current(target!);
      } else if (['ArrowLeft', 'ArrowRight'].includes(event.key) && editor.selection?.type === 'node' && !event.shiftKey) {
        const source = editor.dataStore.getNode(target!.id)!;
        const parent = source.parentId ? editor.dataStore.getNode(source.parentId) : undefined;
        if (!parent || !['paragraph', 'heading'].includes(parent.stype)) return;
        event.preventDefault(); event.stopImmediatePropagation();
        const right = event.key === 'ArrowRight';
        const children = parent.content ?? [];
        const index = children.findIndex(child => (typeof child === 'string' ? child : child.sid) === source.sid);
        const sibling = children[index + (right ? 1 : -1)];
        const next = sibling ? editor.dataStore.getNode(typeof sibling === 'string' ? sibling : sibling.sid!) : undefined;
        const id = next?.stype === 'inline-text' ? next.sid! : editor.dataStore.generateId();
        const offset = right ? 0 : next?.stype === 'inline-text' ? next.text?.length ?? 0 : 0;
        const move = () => {
          scope.focus({ preventScroll: true });
          editor.setRange({ type: 'range', startNodeId: id, endNodeId: id, startOffset: offset, endOffset: offset, collapsed: true });
        };
        if (next?.stype === 'inline-text') move();
        else void transaction(editor, [{ type: 'addChild', payload: { parentId: parent.sid, position: index + (right ? 1 : 0), children: [{ sid: id, stype: 'inline-text', text: '' }] } }] as never).commit().then(result => { if (result.success) move(); });
      } else if (['Delete', 'Backspace'].includes(event.key) && editor.selection?.type === 'node') {
        event.preventDefault(); event.stopImmediatePropagation(); void editor.run('deleteNode', { nodeId: target!.id });
      }
    };
    const selectionChanged = () => {
      if (revealingNative) return;
      const selected = editor.selection;
      if (nativeOwner && captureWordMathTarget(editor)?.id !== nativeOwner.dataset.bcSid) {
        nativeOwner = undefined; scan();
      }
      // Legacy commands may return a caret inside an OMML slot. That slot is
      // hidden in display mode, so expose the equation selection instead.
      if (selected?.type === 'range' && selected.collapsed && scope.contains(doc.activeElement)) {
        const target = captureWordMathTarget(editor);
        const owner = target && [...records.keys()].find(element => element.dataset.bcSid === target.id);
        if (owner && !owner.classList.contains('w-math-editing')) { owner.focus({ preventScroll: true }); select(owner); return; }
      }
      for (const owner of records.keys()) owner.classList.toggle('w-math-selected', selected?.type === 'node' && selected.nodeIds?.includes(owner.dataset.bcSid!) === true);
    };
    const unregisterPreparation = registerWordDisplayPreparation(view.container, scan);
    scan();
    const observer = new MutationObserver(scan);
    observer.observe(scope, { childList: true, subtree: true });
    editor.on('editor:content.change', scan);
    editor.on('editor:selection.model', selectionChanged);
    scope.addEventListener('pointerdown', pointer, true);
    scope.addEventListener('focusin', focus);
    scope.addEventListener('keydown', key, true);
    return () => {
      stopped = true; observer.disconnect(); resize.disconnect();
      unregisterPreparation();
      reveal.current = () => false;
      editor.off('editor:content.change', scan); editor.off('editor:selection.model', selectionChanged);
      scope.removeEventListener('pointerdown', pointer, true); scope.removeEventListener('focusin', focus);
      scope.removeEventListener('keydown', key, true);
      for (const owner of records.keys()) restore(owner);
    };
  }, [editor, view]);
  return (id: string) => reveal.current(id);
}
