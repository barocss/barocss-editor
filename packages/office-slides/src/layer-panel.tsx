import { useMemo, useState } from 'react';
import { dragGesture } from '@barocss/shared';
import type { Editor } from '@barocss/editor-core';
import { Icon, IconButton, EmptyState, LayerActions } from '@barocss/office-ui';
import { useEditorRevision } from '@barocss/office-editor-ui';
/* 자기 배럴을 거치지 않는다 — 심볼이 사는 모듈에서 곧장. */
import { layerRows, positionFromRow, type LayerRow } from './layers';
import { slideTimeline } from './timeline';

const LAYER_ICONS: Record<string, string> = {
  textFrame: 'insert-textbox', rectangle: 'insert-rectangle', ellipse: 'insert-ellipse',
  line: 'insert-line', picture: 'insert-image', frame: 'insert-frame', group: 'group',
  connector: 'connect', component: 'component', instance: 'component',
  video: 'insert-video', audio: 'insert-audio'
};

/**
 * What is on this slide, in the order it is stacked.
 *
 * ## Why a list beside the canvas
 *
 * Two things the canvas cannot answer. **Picking what is underneath**: a shape
 * covered by another is reached by luck — click through it, or move the thing on
 * top out of the way and put it back. And **where in the stack something goes**:
 * the deck has 맨 앞으로 / 앞으로 / 뒤로 / 맨 뒤로, four buttons for a question
 * whose answer is a *position*, so moving the fourth of six shapes to second is
 * two presses and some counting.
 *
 * Every design tool answers both with the same control, and it is the same control
 * in all of them: a dense list, one row per thing, the front at the top.
 *
 * ## The rows are a model
 *
 * `layerRows` in `office-slides` — what is on the slide, what each is called,
 * which is hidden or locked, which has motion. Tested in milliseconds, and checked
 * against the schema: `every-drawing-can-be-named` exists because the naming table
 * it asks is exactly the kind that falls behind a schema quietly.
 *
 * This file is the drawing and the gestures, and nothing else.
 *
 * ## The toggles show the state, not the act
 *
 * A toolbar button is drawn as what pressing it *does* — `hide` is a crossed-out
 * eye. A row's toggle is drawn as what the row *is*, because it sits beside twelve
 * others and a reader scans the column: an open eye on every visible layer and a
 * crossed-out one on the hidden layer. Drawing the act would put a crossed-out eye
 * on all twelve, which reads as twelve hidden layers.
 *
 * They are also only drawn on hover, or when they are *off* — a lock that is on has
 * to be visible without hunting for it, and a column of twelve identical open eyes
 * is noise that buries the thing the list is for.
 */
/** What the layer list is told. */
export interface LayerPanelProps {
  editor: Editor | null;
  slideSid?: string;
  open: boolean;
  /** Hide the standalone header when hosted in a tabbed sidebar. */
  embedded?: boolean;
  onToggle: () => void;
}

export function LayerPanel({ editor, slideSid, open, onToggle, embedded = false }: LayerPanelProps) {
  const revision = useEditorRevision(editor);

  const rows = useMemo<LayerRow[]>(() => {
    const store = editor?.dataStore;
    const rootId = editor?.getRootId?.();
    if (!store || !rootId || !slideSid) return [];
    const doc = { rootId, getNode: (sid: string) => store.getNode(sid) } as never;

    /**
     * Which shapes have motion, asked of the timeline.
     *
     * Passed into `layerRows` rather than read there: the answer needs the deck's
     * motion track, which is a different walk of the document, and a function
     * about the *stack* should not have to know where time is kept.
     */
    const animated = new Set(
      slideTimeline(doc, slideSid)
        .map((step) => step.targetSid)
        .filter((sid): sid is string => !!sid)
    );

    const selected: string[] = editor?.selection?.nodeIds ?? [];
    return layerRows(doc, slideSid, { selected, animated });
  }, [editor, slideSid, revision]);

  /** Which row is being dragged, and where it would land. */
  const [drag, setDrag] = useState<{ from: number; over: number } | null>(null);

  const run = (command: string, payload: Record<string, unknown>) =>
    void editor?.executeCommand?.(command, payload);

  if (!open) {
    return (
      <IconButton label="레이어 열기" testClass="sl-layers-closed"
        /*
         * A closed pane is a *strip*, not a square: the width, the ground and the border
         * are this app's furniture, and the component's own square sizing has to get out
         * of the way for them. `cn` merges at the call site, so saying so here is enough.
         */
        className="h-auto w-auto items-start rounded-none" onClick={onToggle}>
        <Icon name="outline" size={15} />
      </IconButton>
    );
  }

  /**
   * Dragging a row to a place in the stack.
   *
   * The conversion from "this row of the list" to "this position among the
   * children" is `positionFromRow`, in the model with a test — the list is upside
   * down, and an inversion done wrongly here is a drag that reorders the stack
   * backwards, which is the one fault this control can have that a reader cannot
   * explain.
   *
   * Only rows at the top level are draggable. A row inside a group has its own
   * parent, and dropping it between two of the slide's own shapes would mean
   * taking it out of the group — a different act, and one a reader would not have
   * asked for by dragging inside a list.
   */
  const dragRow = (index: number, row: LayerRow) => (event: React.PointerEvent) => {
    if (row.depth > 0) return;

    void dragGesture(event, {
      start: (pointer) => {
        setDrag({ from: index, over: index });
        return { list: (pointer.currentTarget as HTMLElement).closest('.sl-layers-list'), over: -1 };
      },

      move: (held, moved) => {
        const rowsOnScreen = [...(held.list?.querySelectorAll<HTMLElement>('[data-layer]') ?? [])];
        held.over = rowsOnScreen.findIndex(element => {
          if (element.dataset.layerDepth !== '0') return false;
          const box = element.getBoundingClientRect();
          return moved.x >= box.left && moved.x <= box.right && moved.y >= box.top && moved.y <= box.bottom;
        });
        setDrag({ from: index, over: held.over });
      },

      done: (held, moved) => {
        setDrag(null);
        if (!moved.dragged || held.over < 0 || held.over === index) return;
        const target = rows[held.over];
        const top = rows.filter(entry => entry.depth === 0);
        const position = top.findIndex(entry => entry.sid === target.sid);
        // Commit outside a React state updater: rendering must never repeat a command.
        run('moveBoxTo', { nodeId: row.sid, position: positionFromRow(position, top.length) });
      },

      /* 물러서면 순서는 그대로이고, 끌려 보이던 행만 제자리로 돌아옵니다. */
      abort: () => setDrag(null)
    });
  };

  return (
    <aside className="sl-layers" aria-label="레이어">
      {!embedded && <div className="sl-layers-title">
        레이어
        <IconButton label="레이어 닫기" onClick={onToggle}>
          <Icon name="close" size={14} />
        </IconButton>
      </div>}

      {rows.length === 0 ? (
        <EmptyState title="빈 슬라이드입니다" icon={<Icon name="outline" size={20} />}>상단 삽입 도구에서 텍스트나 도형을 추가하세요.</EmptyState>
      ) : (
        <ol className="sl-layers-list">
          {rows.map((row, index) => (
            <li
              key={row.sid}
              className="office-layer-row"
              data-row-selected={row.selected || undefined}
              data-row-hidden={!row.visible || undefined}
              data-row-drop={drag?.over === index && drag.from !== index ? 'before' : undefined}
              data-layer={row.sid}
              data-layer-depth={row.depth}
              data-layer-selected={row.selected ? 'true' : undefined}
              data-layer-hidden={row.visible ? undefined : 'true'}
              data-layer-locked={row.locked ? 'true' : undefined}
              data-layer-over={drag?.over === index && drag.from !== index ? 'true' : undefined}
              /*
               * The name this row has as a **part of a card**, said in the markup so the list can
               * mark it and a test can ask. Only ever set while the reader is standing inside a
               * definition: "the badge" is a different thing to be looking at from "a rectangle".
               */
              data-layer-part={row.partName}
              style={{ paddingLeft: 8 + row.depth * 12 }}
            >
              {/*
                The row itself selects. `pointerdown` rather than click, like the
                toolbar's buttons and the canvas's own selection: the press is what
                a reader means, and a drag starts from the same press.
              */}
              <button
                type="button"
                className="sl-layer-pick office-layer-pick"
                aria-pressed={row.selected}
                onClick={event => { if (event.detail === 0) run('setNode', { nodeIds: [row.sid] }); }}
                data-layer-pick={row.sid}
                title={row.label}
                onPointerDown={(event) => {
                  if (event.button !== 0) return;
                  run('setNode', { nodeIds: [row.sid] });
                  dragRow(index, row)(event);
                }}
              >
                <span className="sl-layer-kind" title={row.kind}>
                  <span className="sr-only">{row.kind ?? '객체'}</span>
                  <Icon name={LAYER_ICONS[editor?.dataStore.getNode(row.sid)?.stype ?? ''] ?? 'insert-rectangle'} size={14} />
                </span>
                <span className="sl-layer-name">{row.label}</span>
                {/* A dot rather than a word: the list is scanned, and 모션 on
                    every animated row would be read as part of the name. */}
                {row.motion && <span className="sl-layer-motion" aria-label="모션 있음" />}
                {/* A named piece of the card: a mark rather than a word, because the name is what
                    a reader is scanning for. */}
                {row.partName && (
                  <span className="sl-layer-from" aria-label={`컴포넌트 부품 ${row.partName}`}>
                    ◇
                  </span>
                )}
              </button>

              <LayerActions label={row.label} hidden={!row.visible} locked={row.locked}
                visibilityData={{ 'layer-visible': row.sid }} lockData={{ 'layer-locked': row.sid }}
                onHiddenChange={hidden => run('setBoxVisible', { nodeIds: [row.sid], visible: !hidden })}
                onLockedChange={locked => run('setBoxLocked', { nodeIds: [row.sid], locked })} />
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}
