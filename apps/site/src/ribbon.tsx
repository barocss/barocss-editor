import { useMemo } from 'react';
import type { Editor } from '@barocss/editor-core';
import { markState, watchAnswers } from '@barocss/editor-core';
import {
  Icon,
  ChoiceSelect,
  SegmentedControl,
  Toolbar,
  ToolbarGroup,
  ToolbarSeparator,
  ToolbarToggle,
  useRevision
} from '@barocss/office-ui';
import {
  pageLinkOf,
  pagesIn,
  siteControlsIn
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
}: {
  editor: Editor;
  mode: PointerMode;
  onMode: (mode: PointerMode) => void;
}) {
  const revision = useRevision((reread) => watchAnswers(editor, reread), [editor]);

  /**
   * What the selection has to say about itself, re-read whenever it moves.
   *
   * A pressed button that remembers being pressed lies after an undo, which is the reason both other
   * products re-read this rather than holding it in state — and the reason it is read here at all is
   * that a formatting toggle has three states, not two.
   */
  const summary = useMemo(() => editor.getSelectionSummary(), [editor, revision]);
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
          The pointer's owner, said out loud — and said as **one of these**.

          A reader gets here by double-clicking into text and leaves by pressing Escape, so the
          control is rarely the way it changes; what it is for is naming the mode, so that a reader
          whose gesture went wrong can see why.

          A segmented control and not two toggles, which is what it was. 선택/텍스트 is *one* of them
          and the board toggles beside it are *any* of them, and both were an accent-bordered
          `ToolbarToggle` — so nothing on screen said that turning off 태블릿 is allowed and turning
          off 선택 is not. `SegmentedControl` says it with shape.
        */}
        <SegmentedControl
          id="mode"
          label="포인터 모드"
          value={mode}
          options={[
            { id: 'select' as PointerMode, label: '선택' },
            { id: 'text' as PointerMode, label: '텍스트', shortcut: 'Escape' }
          ]}
          onChange={onMode}
        />
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
            {/*
              The picture, not the word — and all four already declared one that nothing drew.

              복제 · 삭제 · 컴포넌트로 · 컴포넌트 해제 were plain text on a strip where everything
              else in this suite is an icon with a tooltip, so they read as links rather than as
              buttons and nothing among them was primary. The label is still the accessible name and
              still the tooltip; what changed is what a reader's eye lands on.
            */}
            <Icon name={control.icon ?? 'add'} />
          </ToolbarToggle>
        ))}
      </ToolbarGroup>

      <ToolbarSeparator />

      {/*
        **What a word looks like** — drawn only when there are words selected.

        Measured after the selection sync was fixed: this product registered four formatting commands
        and offered none of them anywhere. The gap was invisible for as long as text could not be
        selected, because every one of them was correctly refusing a collapsed caret.

        Contextual for the reason Word's and the deck's groups are: these mean nothing to a reader who
        has a *block* selected, and a page builder's reader has a block selected most of the time.
        `state` rather than a plain toggle because bold on a partly-bold selection is neither on nor
        off — `mixed` is the third state this control has for exactly that.
      */}
      {siteControlsIn('text').some((control) => can(control.command)) && (
        <>
          <ToolbarGroup id="text">
            {siteControlsIn('text').map((control) => (
              <ToolbarToggle
                key={control.command}
                id={control.command}
                label={control.title ?? control.label}
                shortcut={control.shortcut}
                state={control.mark ? markState(summary, control.mark) : 'off'}
                disabled={!can(control.command)}
                onActivate={() => run(control.command)}
              >
                <Icon name={control.icon ?? 'bold'} />
              </ToolbarToggle>
            ))}
          </ToolbarGroup>
          <ToolbarSeparator />
        </>
      )}

      {/*
        Where the selected words go — **drawn only when there are words**.

        A picker rather than a button, and one that offers **pages** rather than an address box: a
        page's address is a value a reader edits in the panel, so a link that spelled it would go
        nowhere the first time they did. The link stores the page's id and the address is worked out
        where it is drawn — see `page-link.ts`.

        A 144-pixel dropdown reading 링크 없음 sat here at all times, and it was the last item of the
        chrome audit: what a block links to is a fact about *words*, and a reader who has selected a
        card is not being asked about it. Chasing whether it could ever be enabled is what found the
        selection sync — it could not, in any state.
      */}
      {siteControlsIn('link').some((control) => can(control.command)) && (
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
      )}

      {/*
        The board toggles used to be here, and they are in **보기** now.

        Which boards are on screen is a *view* setting — something a reader changes rarely and needs
        to be able to find — and a toolbar holds what acts on the selection. Three accent-bordered
        toggles beside 선택/텍스트 also put two different questions into one vocabulary: one of these
        against any of these, drawn identically, so nothing said that turning all three boards off is
        allowed while turning both modes off is not.
      */}
    </Toolbar>
  );
}
