import { useState } from 'react';
import type { Editor } from '@barocss/editor-core';
import { Button, Choice, Icon, IconButton, TextField } from '@barocss/office-ui';
import { componentSourceOf, deckComponents, type ComponentDef } from '@barocss/office-slides';
import { useEditorRevision } from './revision';

/**
 * What a definition can be **asked for**, declared while it is open.
 *
 * ## Why here and not on the parts
 *
 * A variable belongs to the card, not to any one box in it: an accent colour used by three
 * parts is one decision, which is the whole reason a declaration exists rather than three
 * copies of a value. So it is declared beside the definition being edited, and *bound* in the
 * properties panel where the part is — two panels because they are two questions, and a reader
 * who has selected a rectangle is asking about that rectangle.
 *
 * ## Why a name cannot be edited and a label can
 *
 * The name is what a part binds to and what every placement answers, in the document — so
 * renaming one is a migration through every deck that ever copied this card, not an edit. The
 * label is what a reader reads. The same rule as a definition's `id`, a part's `partId` and a
 * shape's motion name, for the same reason: a durable reference is only durable if nothing
 * renames it.
 */
function VarList({ editor, definition }: { editor: Editor | null; definition: ComponentDef }) {
  const [adding, setAdding] = useState('');

  const set = (payload: Record<string, unknown>) =>
    void (editor as any)?.executeCommand?.('setComponentVar', {
      componentId: definition.id,
      ...payload
    });

  const add = () => {
    const name = adding.trim();
    if (!name) return;
    set({ name, label: name, kind: 'text', value: '' });
    setAdding('');
  };

  return (
    <div className="sl-var-list" data-var-list={definition.id}>
      <div className="sl-var-title">변수</div>

      {definition.vars.length === 0 ? (
        <p className="sl-var-empty">
          변수를 만들면 이 컴포넌트를 놓은 자리마다 다르게 채울 수 있습니다.
        </p>
      ) : (
        <ol className="sl-var-rows">
          {definition.vars.map((one) => (
            <li key={one.name} data-var-row={one.name}>
              {/* The name, shown and not editable — see above. */}
              <code className="sl-var-name">{one.name}</code>
              <TextField
                ariaLabel={`${one.name} 이름표`}
                value={one.label}
                onCommit={(label) => set({ name: one.name, label })}
              />
              <Choice
                ariaLabel={`${one.name} 종류`}
                value={one.kind}
                onChange={(kind) => set({ name: one.name, kind })}
              >
                <option value="text">글자</option>
                <option value="color">색</option>
                <option value="number">숫자</option>
                <option value="boolean">켜기</option>
                <option value="choice">고르기</option>
              </Choice>
              <TextField
                ariaLabel={`${one.name} 기본값`}
                value={one.value}
                onCommit={(value) => set({ name: one.name, value })}
              />
              {/*
                * Choices, as one line of text.
                *
                * A list of options is a list, and a row of controls for adding and removing
                * one at a time is a form. Comma-separated is what a reader can type and read
                * back, and the command takes an array — so the splitting is here, once.
                */}
              {one.kind === 'choice' && (
                <TextField
                  ariaLabel={`${one.name} 고를 것`}
                  value={one.choices.join(', ')}
                  onCommit={(text) =>
                    set({
                      name: one.name,
                      choices: text
                        .split(',')
                        .map((choice) => choice.trim())
                        .filter((choice) => choice.length > 0)
                    })
                  }
                />
              )}
              <IconButton
                label={`${one.name} 지우기`}
                data={{ 'var-remove': one.name }}
                onClick={() => set({ name: one.name, remove: true })}
              >
                <Icon name="close" size={12} />
              </IconButton>
            </li>
          ))}
        </ol>
      )}

      <div className="sl-var-add">
        <TextField
          ariaLabel="새 변수 이름"
          testClass="sl-var-new"
          data={{ 'var-new': '' }}
          value={adding}
          onChange={setAdding}
          onKeys={(event) => {
            if (event.key === 'Enter') add();
          }}
        />
        <Button title="이 이름으로 변수를 만듭니다" data={{ 'var-add': '' }} disabled={!adding.trim()} onClick={add}>
          추가
        </Button>
      </div>
    </div>
  );
}

/**
 * The components a deck defines, and the way in and out of one.
 *
 * ## Why a list beside the deck rather than a place on the canvas
 *
 * A definition is a surface of its own kind: not in the deck's sequence, never presented,
 * drawn only when a reader opens it (canvas-model §10c). Which means there has to be
 * *somewhere to open it from*, and this is that — the same shape PowerPoint's master view has,
 * and the reason it is not "a page of the file you scroll to" is that Figma's canvas has
 * nowhere else to put a definition, not that a canvas is the right place for one.
 *
 * The way **out** matters as much as the way in: a reader who opens a definition and cannot
 * see how to get back to their deck has been trapped by a feature. So the open one says it is
 * open, and 닫기 goes back to the slide they were on — remembered from the moment they left,
 * because a deck they have since edited may not have the slide that was showing.
 *
 * ## What a row says
 *
 * Its name, how many pieces it is made of, and **how many places use it** — which is the
 * question a reader actually has before editing a card: this change is about to appear in
 * eleven places. It used to say how many placements had fallen *behind* the definition, and that
 * whole state is gone: a placement draws the definition, so there is nothing to fall behind and
 * nothing to apply (§10b-2a).
 *
 * Counted here rather than drawn by a renderer for the reason the connector taught us (§8.11): an
 * instance's own node does not change when its definition does, so a renderer would draw a stale
 * answer. This panel is redrawn with the document.
 */
export function ComponentPanel({
  editor,
  open,
  editing,
  onOpen,
  onClose,
  canMake,
  onMake,
  behindSource,
  onPlace
}: {
  editor: Editor | null;
  open: boolean;
  /** The definition being edited, if any. */
  editing?: ComponentDef;
  onOpen: (sid: string) => void;
  /** Close the panel. */
  onClose: () => void;
  /** Whether anything is selected to make a component out of. */
  canMake: boolean;
  onMake: () => void;
  /** Put one on the surface the reader is on — which only the app knows. */
  onPlace: (componentId: string) => void;
  /**
   * The imported definitions whose source deck has moved on, by sid.
   *
   * A set rather than a question this panel can ask: the answer needs the *other* deck open, which
   * is storage, and this panel has none.
   */
  behindSource?: Set<string>;
}) {
  const revision = useEditorRevision(editor);

  const doc = (() => {
    const store = (editor as any)?.dataStore;
    const rootId = (editor as any)?.getRootId?.();
    if (!store || !rootId) return null;
    return { rootId, getNode: (sid: string) => store.getNode(sid) };
  })();

  const components = doc ? deckComponents(doc as never) : [];
  void revision;

  /**
   * The deck a definition came from, when it came from one.
   *
   * Whether it has since **moved on** is not asked here, and that is deliberate: answering it means
   * reading the other deck, which is storage — the library dialog has the file in its hand and says
   * it there, beside the button that brings the newer copy in.
   */
  const from = (definition: ComponentDef): string | undefined =>
    componentSourceOf(doc as never, definition)?.deck;

  /**
   * How many places use this definition.
   *
   * Counted from the document rather than remembered, for the reason every derived thing here is:
   * a number kept on the definition would have to be maintained by a write on every placement
   * added, moved or deleted — and would then be wrong exactly when it mattered.
   */
  const placed = (definition: ComponentDef): number => {
    if (!doc) return 0;
    let count = 0;
    const walk = (sid: string, depth: number) => {
      if (depth > 32) return;
      const node = (doc as any).getNode(sid);
      if (!node) return;
      /*
       * By the **durable** id, which is what a placement points at.
       *
       * This compared the placement's `componentId` with the definition's *sid* — so it
       * matched nothing, and the count was always zero: a badge that could never appear,
       * about the one thing the panel is here to say. Saving strips sids, which is why the
       * document is written in durable ids in the first place (canvas-model §10b-5).
       */
      if (node.stype === 'instance' && node.attributes?.componentId === definition.id) count += 1;
      for (const child of node.content ?? []) if (typeof child === 'string') walk(child, depth + 1);
    };
    walk((doc as any).rootId, 0);
    return count;
  };

  /**
   * Nothing at all when there is nothing to open.
   *
   * The layer list keeps its strip because every slide has layers; a deck with no components
   * has nothing behind this one, and a strip that opens an empty list is chrome for nothing.
   *
   * It is also the honest fix for something measured: the strip took 24px from the stage on
   * every deck, the slide re-fitted, and the ruler test found the ruler six pixels off the
   * slide it measures. A control that changes the layout of every deck to offer a feature no
   * deck uses is paying for itself with everybody's room.
   */
  if (!open && components.length === 0) return null;

  if (!open) {
    return (
      <IconButton
        label="컴포넌트 열기"
        testClass="sl-components-closed"
        /* A closed pane is a strip, not a square — the same override the layer list's uses. */
        className="h-auto w-auto items-start rounded-none"
        onClick={onClose}
      >
        <Icon name="group" size={15} />
      </IconButton>
    );
  }

  return (
    <aside className="sl-components" aria-label="컴포넌트">
      <div className="sl-components-title">
        컴포넌트
        <IconButton label="컴포넌트 닫기" onClick={onClose}>
          <Icon name="close" size={14} />
        </IconButton>
      </div>

      {/*
        * Where a reader is and the way back are **not here** any more.
        *
        * They were, and then a layout became something a reader could open — so the way out of
        * a definition would have needed a second copy somewhere else, for a panel that may not
        * even be open. What all three kinds share is the sentence "you are not on a slide", so
        * it is drawn once above the stage (`sl-editing` in `app.tsx`).
        */}

      {/* What this card can be asked for — declared here, bound on the parts themselves. */}
      {editing && <VarList editor={editor} definition={editing} />}

      {/*
        * Making one, which is the gesture the whole feature starts from.
        *
        * The reader's boxes *become* the definition and what stays on the slide is a placement
        * of it — anything else leaves two things that look identical and behave differently,
        * which is the fault of every tool where "create component" copies.
        *
        * Always drawn, disabled when nothing is selected, because a control that appears only
        * once you have done the right thing cannot teach anybody the gesture.
        */}
      <div className="sl-components-make">
        <Button
          title="고른 상자들을 하나의 컴포넌트로 만듭니다"
          data={{ 'component-make': '' }}
          disabled={!canMake}
          onClick={onMake}
        >
          고른 것으로 만들기
        </Button>
      </div>

      {components.length === 0 ? (
        <p className="sl-components-empty">
          아직 컴포넌트가 없습니다. 여러 상자를 고르고 컴포넌트로 만들면 여기에 나타납니다.
        </p>
      ) : (
        <ol className="sl-components-list">
          {components.map((definition) => {
            const uses = placed(definition);
            return (
              <li key={definition.sid} data-component={definition.id}>
                {/*
                  * The row says both: what this **is** (`data-component-id`, the durable name a
                  * placement points at and a saved file keeps) and what pressing it **opens**
                  * (the sid, which is where the definition happens to be in this session).
                  * Two answers because they are two facts, and a row that offered only the sid
                  * made a test look for the wrong one.
                  */}
                <button
                  type="button"
                  data-component-id={definition.id}
                  data-component-open={definition.sid}
                  aria-current={editing?.sid === definition.sid ? 'true' : undefined}
                  onClick={() => onOpen(definition.sid)}
                >
                  <span className="sl-component-name">{definition.name || '이름 없음'}</span>
                  <span className="sl-component-parts">{definition.parts.length}개</span>
                  {/*
                    * Whose definition this is. Said only about the ones that came from somewhere —
                    * a deck's own cards are the ordinary case, and a badge on every row would be a
                    * badge a reader stops reading.
                    */}
                  {from(definition) && (
                    <span className="sl-component-from" data-component-from={from(definition)}>
                      {from(definition)}
                    </span>
                  )}
                  {/*
                    * And whether that deck has **moved on** since this copy was made.
                    *
                    * Handed in rather than worked out here: answering it means opening the other
                    * deck, which is storage, and this panel has none — the same split the whole
                    * library follows (the naming is a question about documents, the bytes are the
                    * host's). What a reader does about it is in the library dialog, where the file
                    * already is.
                    */}
                  {behindSource?.has(definition.sid) && (
                    <span className="sl-component-behind" data-component-outdated={definition.id}>
                      라이브러리가 새로워짐
                    </span>
                  )}
                  {/*
                    * A count rather than a dot: "eleven places use this" is something a reader can
                    * decide with before they edit it, and a dot is something they have to press to
                    * find out about.
                    */}
                  {uses > 0 && (
                    <span className="sl-component-uses" data-component-uses={uses}>
                      {uses}곳에 놓임
                    </span>
                  )}
                </button>
                {/*
                  * What a reader does with a definition that is *not* opening it: put one on the
                  * slide they are looking at. 모두 적용 stood beside it and is gone — every
                  * placement already draws this definition, so the button's whole job was done by
                  * removing the copies.
                  */}
                <span className="sl-component-actions">
                  <Button
                    title="이 컴포넌트를 지금 보고 있는 곳에 놓습니다"
                    data={{ 'component-place': definition.id }}
                    onClick={() => onPlace(definition.id)}
                  >
                    놓기
                  </Button>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </aside>
  );
}
