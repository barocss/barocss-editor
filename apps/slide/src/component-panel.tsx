import type { Editor } from '@barocss/editor-core';
import { Button, Icon, IconButton } from '@barocss/office-ui';
import { componentSignature, componentStale, deckComponents, type ComponentDef } from '@barocss/office-slides';
import { useEditorRevision } from './revision';

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
 * Its name, and whether the deck has placements that have **fallen behind** it. That second
 * one is the whole reason apply is offered rather than automatic (§10b-4), and it belongs
 * here rather than in the renderer: an instance's node does not change when its definition
 * does, so a renderer that drew this would draw a stale answer — the connector's fault
 * (§8.11), which this panel avoids by being redrawn with the document.
 */
export function ComponentPanel({
  editor,
  open,
  editing,
  onOpen,
  onClose,
  onCloseDefinition
}: {
  editor: Editor | null;
  open: boolean;
  /** The definition being edited, if any. */
  editing?: ComponentDef;
  onOpen: (sid: string) => void;
  /** Close the panel. */
  onClose: () => void;
  /** Leave the definition and go back to the deck. */
  onCloseDefinition: () => void;
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
   * How many placements of this definition have fallen behind it.
   *
   * Counted from the document rather than remembered, because it is derived: what a placement
   * last took (`appliedFrom`) against what the definition says now. Nothing is written until
   * a reader asks for it to be applied.
   */
  const behind = (definition: ComponentDef): number => {
    if (!doc) return 0;
    const signature = componentSignature(doc as never, definition);
    void signature;
    let count = 0;
    const walk = (sid: string, depth: number) => {
      if (depth > 32) return;
      const node = (doc as any).getNode(sid);
      if (!node) return;
      if (node.stype === 'instance' && node.attributes?.componentId === definition.sid) {
        if (componentStale(doc as never, node, definition)) count += 1;
      }
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
        * Where a reader is, and the way back.
        *
        * Drawn only while a definition is open, because a way out of somewhere you are not is
        * a control that means nothing.
        */}
      {/*
        * Named by the **durable id**, like the row is: a test and a reader are asking about the
        * same component, and the sid is only where it happens to be in this session.
        */}
      {editing && (
        <div
          className="sl-components-editing"
          data-editing-component={editing.id}
          data-editing-sid={editing.sid}
        >
          <span>편집 중: {editing.name || '이름 없음'}</span>
          {/* A real button, because it is the way out: the suite's, not this file's. */}
          <Button title="슬라이드로 돌아가기" data={{ 'component-close': '' }} onClick={onCloseDefinition}>
            슬라이드로 돌아가기
          </Button>
        </div>
      )}

      {components.length === 0 ? (
        <p className="sl-components-empty">
          아직 컴포넌트가 없습니다. 여러 상자를 고르고 컴포넌트로 만들면 여기에 나타납니다.
        </p>
      ) : (
        <ol className="sl-components-list">
          {components.map((definition) => {
            const stale = behind(definition);
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
                    * A count rather than a dot: "three placements have not taken this" is
                    * something a reader can decide with, and a dot is something they have to
                    * press to find out about.
                    */}
                  {stale > 0 && (
                    <span className="sl-component-behind" data-component-behind={stale}>
                      {stale}곳 뒤처짐
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </aside>
  );
}
