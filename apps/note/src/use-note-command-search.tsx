import { useCallback, useEffect, useRef, useState } from 'react';
import { CommandSearch, StatusNotice, useOfficeLocale } from '@barocss/office-ui';
import type { NoteCommandTarget, NoteInputDelivery } from '@barocss/office-note/view';
import { noteSearchCommands, noteSearchEntries } from './note-command-search';

/** The host supplies its actual session/authority lease and deepest delivery. */
export interface NoteCommandHost {
  flush: NoteInputDelivery;
  isCurrent(): boolean;
  capturePrepared(): (() => boolean) | undefined;
}
export function useNoteCommandSearch({ captureHost }: {
  captureHost(): NoteCommandHost | undefined;
}) {
  const { t } = useOfficeLocale();
  const targets = useRef(new Set<NoteCommandTarget>());
  const activeTarget = useRef<NoteCommandTarget | undefined>(undefined);
  const openingEpoch = useRef(0);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; openingEpoch.current += 1; };
  }, []);
  const [, setRevision] = useState(0);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [recent, setRecent] = useState<string[]>([]);
  const intent = useRef<{ target: NoteCommandTarget; input: NonNullable<ReturnType<NoteCommandTarget['capture']>>;
    current(): boolean; parentCurrent(): boolean } | undefined>(undefined);
  const registerCommandTarget = useCallback((target: NoteCommandTarget) => {
    targets.current.add(target);
    if (!activeTarget.current) activeTarget.current = target;
    const changed = () => setRevision(value => value + 1);
    target.editor.on('editor:selection.model', changed);
    target.editor.on('editor:content.change', changed);
    target.editor.on('editor:editable.change', changed);
    changed();
    return () => {
      targets.current.delete(target);
      if (activeTarget.current === target) { activeTarget.current = undefined; openingEpoch.current += 1; }
      target.editor.off('editor:selection.model', changed);
      target.editor.off('editor:content.change', changed);
      target.editor.off('editor:editable.change', changed);
    };
  }, []);
  useEffect(() => {
    const activated = (event: Event) => {
      if (!(event.target instanceof Node)) return;
      const found = [...targets.current].filter(target => target.isCurrent() && target.element.contains(event.target as Node));
      found.sort((a, b) => a.element.contains(b.element) ? 1 : b.element.contains(a.element) ? -1 : 0);
      if (found[0] && activeTarget.current !== found[0]) {
        activeTarget.current = found[0]; openingEpoch.current += 1;
      }
    };
    document.addEventListener('focusin', activated, true);
    document.addEventListener('pointerdown', activated, true);
    return () => {
      document.removeEventListener('focusin', activated, true);
      document.removeEventListener('pointerdown', activated, true);
    };
  }, []);
  const openSearch = async () => {
    const epoch = ++openingEpoch.current;
    const target = activeTarget.current, host = captureHost();
    const owns = () => mounted.current && openingEpoch.current === epoch &&
      activeTarget.current === target && !!target && targets.current.has(target) && target.isCurrent() && !!host?.isCurrent();
    if (!target || !host || !owns()) return;
    try {
      const delivered = await host.flush();
      if (!owns()) return;
      if (!delivered) { setError(t('note.commandSearch.finishInput')); return; }
      const input = target.capture(), prepared = host.capturePrepared(), parentInput = host.flush.captureInputIntent?.();
      if (!owns()) return;
      if (!input || !prepared?.() || !parentInput) { setError(t('note.commandSearch.finishInput')); return; }
      intent.current = { target, input,
        parentCurrent: () => host.isCurrent() && parentInput(),
        current: () => owns() && prepared() && input.isCurrent() };
      setError(''); setOpen(true);
    } catch { if (owns()) setError(t('note.commandSearch.inputFailed')); }
  };
  useEffect(() => {
    const search = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.altKey ||
        !(event.metaKey || event.ctrlKey) || !event.shiftKey || event.key.toLowerCase() !== 'p' || open) return;
      const target = activeTarget.current;
      if (!(event.target instanceof Node) || !target?.isCurrent()) return;
      const selection = target.element.ownerDocument.getSelection();
      const readonlyPeek = !target.editor.isEditable && event.target === target.element.closest('[data-side-peek]') &&
        !!selection?.anchorNode && !!selection.focusNode && target.element.contains(selection.anchorNode) && target.element.contains(selection.focusNode);
      if (!target.element.contains(event.target) && !readonlyPeek) return;
      event.preventDefault(); void openSearch();
    };
    // Database portals retain their other keys in bubble phase. Only this owned shortcut uses capture.
    document.addEventListener('keydown', search, true);
    return () => document.removeEventListener('keydown', search, true);
  });
  const capturePick = (id: string) => {
    const captured = intent.current, entry = noteSearchEntries(t).find(entry => entry.id === id);
    if (!captured?.current() || !entry) { setError(t('note.commandSearch.changed')); return undefined; }
    return () => {
      if (!captured.current()) { setError(t('note.commandSearch.changed')); return; }
      const { target, input } = captured;
      if (entry.command && (!target.editor.isEditable || !target.editor.canExecuteCommand(entry.command))) return;
      if (input.selection) target.editor.updateSelection({ ...input.selection });
      const finish = (accepted: boolean) => {
        if (!captured.parentCurrent()) return;
        if (accepted) setRecent(previous => [id, ...previous.filter(value => value !== id)].slice(0, 5));
        else setError(t('note.commandSearch.failed'));
      };
      if (entry.command) void target.execute(entry.command, captured.parentCurrent).then(finish).catch(() => finish(false));
      else if (entry.view === 'insertion') finish(target.openInsertion());
      else if (entry.view === 'find' || entry.view === 'outline') { finish(target.openNavigation(entry.view)); }
    };
  };
  const captureTarget = () => {
    const target = activeTarget.current;
    if (!target || !targets.current.has(target) || !target.isCurrent()) return undefined;
    const capture = target.capture();
    return capture ? { target, capture } : undefined;
  };
  return { registerCommandTarget, captureTarget, openSearch, dialog: <>
    <CommandSearch open={open} onOpenChange={setOpen} commands={noteSearchCommands(intent.current?.target ?? activeTarget.current, t).map(entry => open && !intent.current?.current() ?
      { ...entry, disabled: true, disabledReason: t('note.commandSearch.reopen') } : entry)}
      recentIds={recent} onPick={() => undefined} onPickIntent={capturePick} />
    {error && <StatusNotice tone="danger" title={t('note.commandSearch.errorTitle')}>{error}</StatusNotice>}
  </> };
}
