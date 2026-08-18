import { useEffect, useMemo, useReducer, useState } from 'react';
import type { Editor } from '@barocss/editor-core';
import {
  PropertyColor,
  PropertyEmpty,
  PropertyGroup,
  PropertyNumber,
  PropertyPanel,
  PropertyRow,
  PropertyToggle,
  LENGTH_UNITS,
  fromDisplay,
  stepFor,
  toDisplay,
  unitSuffix,
  type LengthUnit
} from '@barocss/office-ui';
import { boxAt, type Slide } from '@barocss/office-slides';

/**
 * The properties of what the reader is on.
 *
 * The panel every Office product has, drawn with the suite's components so it is
 * the same panel a reader has already used. What is in it is Slides': a box has
 * a position and a size, which is the whole difference between a slide and a
 * page.
 *
 * ## What it is looking at
 *
 * The nearest box above wherever the selection starts, which answers both
 * questions with one reading. A node selection carries the selected box as its
 * start, so clicking a shape shows that shape; a caret in a paragraph starts
 * inside a text frame, so typing shows the frame being typed in. When neither
 * is in a box it shows the slide, which is the next thing out.
 *
 * (This used to say a node selection did not exist yet. It does, and `boxAt`
 * had been answering for both cases since it did — the note was the stale part,
 * which is the failure this repository keeps finding in its own comments.)
 *
 * ## Why nothing here holds state
 *
 * A field that remembered what was typed would disagree with the document after
 * an undo. Values are read from the model on every render and go back through a
 * command, so the panel cannot be the reason the document and the screen differ.
 * The reading itself is `boxAt` in `office-slides` — pure, and shared with
 * whatever draws the handles later, so the panel and the handles cannot come to
 * different conclusions about which box is being edited.
 *
 * ## What it offers is what the node declares
 *
 * A rectangle has a corner radius and a line does not; a frame clips its
 * contents and an ellipse has nothing to clip. So the rows are not a fixed list
 * — the panel asks the schema which attributes *this* node type declares and
 * draws a control for the ones it knows how to draw.
 *
 * The alternative is a list here and a list in the command and a declaration in
 * the schema, all saying the same thing until one of them stops. That already
 * happened: `cornerRadius`, `locked` and `visible` were declared, drawn, and
 * named by neither command — three attributes a reader could see on the page
 * and nothing could change.
 *
 * ## The unit is the reader's
 *
 * The model is in twips because a slide is a physical surface. A reader is not,
 * so the fields convert — through `@barocss/office-ui`'s converter, shared with
 * whatever Word grows, because two products in one suite showing the same kind
 * of number in different units is the sort of thing nobody decides and everybody
 * inherits.
 *
 * This panel used to show pixels, with a reason: a reader is looking at a
 * 1280×720 slide. The reason does not survive the zoom control — it divided
 * twips by fifteen and stopped, so at half size a box occupying 48 screen pixels
 * read as 96. Neither a physical length nor the reader's pixels, but the pixels
 * it would be at 100%. Centimetres by default, and pixels still on the menu for
 * a deck that is never going to be paper.
 */
export function Properties({
  editor,
  slides,
  current
}: {
  editor: Editor | null;
  slides: Slide[];
  current?: string;
}) {
  const [tick, bump] = useReducer((n: number) => n + 1, 0);
  /**
   * Which unit the fields are in. The reader's, and the panel's — not the
   * document's, which measures in twips whatever anybody is looking at.
   */
  const [unit, setUnit] = useState<LengthUnit>('cm');
  useEffect(() => {
    if (!editor) return;
    // `selection.model`, not `selection.change`. Copied wrongly from Word's
    // ribbon at first, and nothing said so: the handler simply never ran, so the
    // toolbar and this panel kept whatever they had read at mount and looked
    // like a caret that never moved.
    editor.on('editor:selection.model', bump);
    editor.on('editor:content.change', bump);
    return () => {
      (editor as any).off?.('editor:selection.model', bump);
      (editor as any).off?.('editor:content.change', bump);
    };
  }, [editor]);

  const box = useMemo(() => {
    if (!editor) return undefined;
    const store = (editor as any).dataStore;
    const rootId = (editor as any).getRootId?.();
    if (!store || !rootId) return undefined;

    const at = (editor as any).selection?.startNodeId as string | undefined;
    return boxAt({ rootId, getNode: (sid: string) => store.getNode(sid) }, at);
  }, [editor, tick]);

  const here = useMemo(() => slides.find((slide) => slide.sid === current), [slides, current]);

  /**
   * Which attributes this node type declares, asked of the schema.
   *
   * The panel draws a control only for what the node actually has, so a line
   * gets no corner radius and a group — which declares no fill — gets no fill
   * swatch offering to set one the renderer would ignore.
   */
  const declares = useMemo(() => {
    const schema = (editor as any)?.dataStore?.getActiveSchema?.();
    const attrs = box?.stype ? schema?.getNodeType?.(box.stype)?.attrs : undefined;
    return (key: string) => !!attrs && key in attrs;
  }, [editor, box, tick]);

  const number = (key: 'x' | 'y' | 'width' | 'height'): number | null => {
    const value = box?.attributes?.[key];
    return typeof value === 'number' ? toDisplay(value, unit) : null;
  };

  const colour = (key: 'fill' | 'stroke'): string | null => {
    const value = box?.attributes?.[key];
    return typeof value === 'string' && value.length > 0 ? value : null;
  };

  const locked = box?.attributes?.locked === true;
  const visible = box?.attributes?.visible !== false;

  /** A number the model keeps in twips, shown in whatever the reader chose. */
  const lengthOf = (key: string): number | null => {
    const value = box?.attributes?.[key];
    return typeof value === 'number' ? toDisplay(value, unit) : null;
  };

  /** A number the model keeps as itself — degrees, a ratio. */
  const plain = (key: string, fallback: number | null = null): number | null => {
    const value = box?.attributes?.[key];
    return typeof value === 'number' ? value : fallback;
  };

  const setGeometry = (key: string, value: number) => {
    void (editor as any)?.executeCommand?.('setBoxGeometry', {
      nodeId: box?.sid,
      [key]: fromDisplay(value, unit)
    });
  };

  const setStyle = (patch: Record<string, unknown>) => {
    void (editor as any)?.executeCommand?.('setBoxStyle', { nodeId: box?.sid, ...patch });
  };

  const setGeometryRaw = (patch: Record<string, unknown>) => {
    void (editor as any)?.executeCommand?.('setBoxGeometry', { nodeId: box?.sid, ...patch });
  };

  /**
   * Locking goes through its own command.
   *
   * Every other box command is refused for a locked box — that is what `locked`
   * means — so a lock set through `setBoxStyle` could never be taken off again.
   */
  const setLocked = (value: boolean) => {
    void (editor as any)?.executeCommand?.('setBoxLocked', { nodeId: box?.sid, locked: value });
  };

  return (
    <PropertyPanel
      title="속성"
      className="sl-properties"
      action={
        <select
          aria-label="단위"
          className="sl-unit h-6 rounded border border-neutral-300 bg-transparent px-1 text-[11px] dark:border-neutral-700"
          value={unit}
          onChange={(event) => setUnit(event.target.value as LengthUnit)}
        >
          {LENGTH_UNITS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      }
    >
      {box ? (
        <>
          <PropertyGroup label={labelFor(box.stype, box.role)}>
            {locked && (
              <PropertyEmpty>
                잠긴 상자입니다. 위치와 크기를 바꿀 수 없습니다.
              </PropertyEmpty>
            )}
            <PropertyRow label="위치">
              <PropertyNumber
                ariaLabel="X"
                value={number('x')}
                suffix="X"
                step={stepFor(unit)}
                disabled={locked}
                onCommit={(value) => setGeometry('x', value)}
              />
              <PropertyNumber
                ariaLabel="Y"
                value={number('y')}
                suffix="Y"
                step={stepFor(unit)}
                disabled={locked}
                onCommit={(value) => setGeometry('y', value)}
              />
            </PropertyRow>
            <PropertyRow label="크기">
              <PropertyNumber
                ariaLabel="너비"
                value={number('width')}
                suffix="W"
                step={stepFor(unit)}
                disabled={locked}
                onCommit={(value) => setGeometry('width', value)}
              />
              <PropertyNumber
                ariaLabel="높이"
                value={number('height')}
                suffix="H"
                step={stepFor(unit)}
                disabled={locked}
                onCommit={(value) => setGeometry('height', value)}
              />
            </PropertyRow>
            {declares('rotation') && (
              <PropertyRow label="회전">
                <PropertyNumber
                  ariaLabel="회전"
                  // Degrees, which is what the model keeps — no conversion, and
                  // no rounding for a reader to notice.
                  value={plain('rotation', 0)}
                  suffix="°"
                  disabled={locked}
                  onCommit={(value) => setGeometryRaw({ rotation: value })}
                />
              </PropertyRow>
            )}
            {declares('opacity') && (
              <PropertyRow label="투명도">
                <PropertyNumber
                  ariaLabel="불투명도"
                  // Per cent, because that is what a reader of any other tool
                  // types. The model keeps 0–1.
                  value={Math.round((plain('opacity', 1) ?? 1) * 100)}
                  suffix="%"
                  step={5}
                  disabled={locked}
                  onCommit={(value) =>
                    setGeometryRaw({ opacity: Math.min(1, Math.max(0, value / 100)) })
                  }
                />
              </PropertyRow>
            )}
            <PropertyRow label="상태">
              {declares('visible') && (
                <PropertyToggle
                  ariaLabel="표시"
                  label="표시"
                  value={visible}
                  disabled={locked}
                  onChange={(value) => setGeometryRaw({ visible: value })}
                />
              )}
              {declares('locked') && (
                <PropertyToggle
                  ariaLabel="잠금"
                  label="잠금"
                  value={locked}
                  // Not disabled by `locked`: this is the one control that has to
                  // work on a locked box, because it is what unlocks it.
                  onChange={setLocked}
                />
              )}
            </PropertyRow>
          </PropertyGroup>

          {(declares('fill') || declares('stroke') || declares('cornerRadius')) && (
          <PropertyGroup label="채우기와 선">
            {declares('fill') && (
            <PropertyRow label="채우기">
              <PropertyColor
                ariaLabel="채우기 색"
                value={colour('fill')}
                disabled={locked}
                onChange={(value) => setStyle({ fill: value })}
                // `null`, not an empty string: "no fill" is a real answer, and a
                // text box over a picture usually wants it.
                onClear={() => setStyle({ fill: null })}
              />
            </PropertyRow>
            )}
            {declares('stroke') && (
            <PropertyRow label="선">
              <PropertyColor
                ariaLabel="선 색"
                value={colour('stroke')}
                disabled={locked}
                onChange={(value) => setStyle({ stroke: value })}
                onClear={() => setStyle({ stroke: null })}
              />
            </PropertyRow>
            )}
            {declares('strokeWidth') && (
              <PropertyRow label="선 두께">
                <PropertyNumber
                  ariaLabel="선 두께"
                  value={lengthOf('strokeWidth')}
                  suffix={unitSuffix(unit)}
                  step={stepFor(unit)}
                  disabled={locked}
                  onCommit={(value) => setStyle({ strokeWidth: fromDisplay(value, unit) })}
                />
              </PropertyRow>
            )}
            {/*
              * A rectangle declares this and nothing else does, which is the
              * whole reason the rows come from the schema rather than a list.
              */}
            {declares('cornerRadius') && (
              <PropertyRow label="모서리">
                <PropertyNumber
                  ariaLabel="모서리 둥글기"
                  value={lengthOf('cornerRadius') ?? 0}
                  suffix={unitSuffix(unit)}
                  step={stepFor(unit)}
                  disabled={locked}
                  onCommit={(value) => setStyle({ cornerRadius: fromDisplay(Math.max(0, value), unit) })}
                />
              </PropertyRow>
            )}
          </PropertyGroup>
          )}
        </>
      ) : (
        <PropertyGroup label={here ? `슬라이드 ${here.number}` : '슬라이드'}>
          {/*
           * What the panel says when the caret is not in a box, which is most of
           * the time until a box can be selected outright.
           */}
          <PropertyEmpty>
            상자 안을 클릭하면 위치와 크기를 볼 수 있습니다.
          </PropertyEmpty>
          {here && (
            <>
              <PropertyRow label="레이아웃">
                <span className="text-neutral-500">{here.layoutId ?? '없음'}</span>
              </PropertyRow>
              <PropertyRow label="발표">
                <span className="text-neutral-500">
                  {here.hidden ? '건너뜀' : '표시'}
                </span>
              </PropertyRow>
            </>
          )}
        </PropertyGroup>
      )}
    </PropertyPanel>
  );
}

/**
 * What to call the thing that is selected.
 *
 * By role first, because a title and a body are both `textFrame` and the role is
 * the difference the reader cares about — naming both "텍스트 상자" would make
 * the panel say the same thing about two different jobs.
 */
function labelFor(stype: string, role?: string): string {
  if (role === 'title') return '제목 상자';
  if (role === 'subtitle') return '부제목 상자';
  if (role === 'body') return '본문 상자';

  const names: Record<string, string> = {
    textFrame: '텍스트 상자',
    frame: '프레임',
    group: '그룹',
    rectangle: '사각형',
    ellipse: '타원',
    line: '선',
    path: '경로',
    sticky: '메모',
    connector: '연결선',
    component: '컴포넌트',
    instance: '인스턴스'
  };
  return names[stype] ?? stype;
}
