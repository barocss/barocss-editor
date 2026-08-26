import type { Editor } from '@barocss/editor-core';
import { watchAnswers } from '@barocss/editor-core';
import {
  ChoiceSelect,
  Toolbar,
  ToolbarGroup,
  ToolbarSeparator,
  ToolbarToggle,
  useRevision
} from '@barocss/office-ui';
import {
  BREAKPOINTS,
  pageLinkOf,
  pagesIn,
  siteControlsIn,
  type BreakpointId
} from '@barocss/office-site';
import type { PointerMode } from './overlay';

/**
 * What a reader can do to the page, along the top.
 *
 * ## Every control asks the editor whether it can run
 *
 * `canExecute`, on every render, rather than a rule written here about when a section may be
 * inserted. The command already knows — it has to, because a key binding and a menu reach the same
 * command and a rule kept in a toolbar is a rule the keyboard does not follow. So a control that is
 * grey is grey because the command said no.
 *
 * ## Why the widths are a set of toggles and not a picker
 *
 * They are all on at once. That is the product's opening claim — a reader answering "what does this
 * look like on a phone" while they are still deciding what it says — and a picker would quietly make
 * it one-at-a-time again, which is the tool this is meant not to be.
 */
export function Ribbon({
  editor,
  mode,
  onMode,
  shown,
  onShown
}: {
  editor: Editor;
  mode: PointerMode;
  onMode: (mode: PointerMode) => void;
  shown: BreakpointId[];
  onShown: (shown: BreakpointId[]) => void;
}) {
  const revision = useRevision((reread) => watchAnswers(editor, reread), [editor]);
  /*
   * `canExecuteCommand`, which is the editor's own name for it — asked on every render rather than
   * cached, because a control that remembers being available is wrong the moment something is
   * undone.
   */
  const can = (name: string) =>
    (editor as never as { canExecuteCommand?: (n: string) => boolean }).canExecuteCommand?.(name) ?? false;
  const run = (name: string, payload?: unknown) =>
    (editor as never as { executeCommand?: (n: string, p?: unknown) => void }).executeCommand?.(name, payload);

  // Read so the enabled state is recomputed when the selection or the document moves.
  void revision;

  /**
   * The pages a link can go to — **this document's**, read on every render.
   *
   * Not declared in `toolbar-model.ts` with the control, because a list of pages written anywhere
   * but the document is a list that is wrong as soon as a reader adds one. The control is declared
   * there; its choices are asked here.
   */
  const store = editor.dataStore;
  const rootId = editor.getRootId();
  const pages =
    store && rootId ? pagesIn({ rootId, getNode: (sid: string) => store.getNode(sid) as never }) : [];

  /** Where the selected words already go, so the picker shows the answer rather than a blank. */
  const linked = (() => {
    const selection = editor.selection as { startNodeId?: string } | undefined;
    const at = selection?.startNodeId ? store?.getNode(selection.startNodeId) : undefined;
    return pageLinkOf(at as never);
  })();

  return (
    <Toolbar className="st-ribbon" label="사이트 도구">
      <ToolbarGroup id="mode">
        {/*
          The pointer's owner, said out loud.

          A reader gets here by double-clicking into text and leaves by pressing Escape, so the
          toggle is rarely the way it changes — but a mode nothing on screen names is a mode a reader
          cannot get out of when a gesture goes wrong.
        */}
        <ToolbarToggle
          id="mode-select"
          label="선택"
          state={mode === 'select' ? 'on' : 'off'}
          onActivate={() => onMode('select')}
        >
          선택
        </ToolbarToggle>
        <ToolbarToggle
          id="mode-text"
          label="텍스트"
          shortcut="Esc"
          state={mode === 'text' ? 'on' : 'off'}
          onActivate={() => onMode('text')}
        >
          텍스트
        </ToolbarToggle>
      </ToolbarGroup>

      <ToolbarSeparator />

      {/*
        What a reader does **to what they have selected**, read from the product's own declaration.
        
        It used to be written out here in JSX — which is a declaration nothing can read, and the
        whole reason `toolbar-model.ts` exists: `every-command-can-be-reached` asks the product what
        a reader can run, and a ribbon that answers only to itself is a ribbon that can drift from
        the check that is supposed to hold it.
      */}
      <ToolbarGroup id="arrange">
        {siteControlsIn('arrange').map((control) => (
          <ToolbarToggle
            key={control.command}
            id={control.command}
            label={control.title ?? control.label}
            shortcut={control.shortcut}
            state="off"
            disabled={!can(control.command)}
            onActivate={() => run(control.command)}
          >
            {control.label}
          </ToolbarToggle>
        ))}
      </ToolbarGroup>

      <ToolbarSeparator />

      {/*
        Where the selected words go.

        A picker rather than a button, and one that offers **pages** rather than an address box: a
        page's address is a value a reader edits in the panel, so a link that spelled it would go
        nowhere the first time they did. The link stores the page's id and the address is worked out
        where it is drawn — see `page-link.ts`.
      */}
      <ToolbarGroup id="link">
        {siteControlsIn('link').map((control) =>
          control.command === 'linkToPage' ? (
            <ChoiceSelect
              key={control.command}
              options={pages.map((one) => ({ id: one.id, label: one.name }))}
              value={linked ?? null}
              ariaLabel={control.title ?? control.label}
              disabled={!can(control.command)}
              onChange={(id) => run(control.command, { id })}
              testClass="st-link-page"
            />
          ) : (
            <ToolbarToggle
              key={control.command}
              id={control.command}
              label={control.title ?? control.label}
              state="off"
              // Only when there is a link to take away — and `removeLink` cannot say so itself,
              // because it is the shared kit's and a page's link is this product's reading of it.
              disabled={!linked}
              onActivate={() => run(control.command)}
            >
              {control.label}
            </ToolbarToggle>
          )
        )}
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup id="widths">
        {BREAKPOINTS.map((one) => (
          <ToolbarToggle
            key={one.id}
            id={`width-${one.id}`}
            label={`${one.label} · ${one.width}px`}
            state={shown.includes(one.id) ? 'on' : 'off'}
            onActivate={() =>
              onShown(
                shown.includes(one.id) ? shown.filter((id) => id !== one.id) : [...shown, one.id]
              )
            }
          >
            {one.label}
          </ToolbarToggle>
        ))}
      </ToolbarGroup>
    </Toolbar>
  );
}
