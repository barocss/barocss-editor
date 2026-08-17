import { useEffect, useMemo, useReducer } from 'react';
import type { Editor } from '@barocss/editor-core';
import {
  PropertyColor,
  PropertyEmpty,
  PropertyGroup,
  PropertyNumber,
  PropertyPanel,
  PropertyRow
} from '@barocss/office-ui';
import { boxAt, pxToTwip, twipToPx, type Slide } from '@barocss/office-slides';

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
 * The nearest box above the caret. Not a node selection — that does not exist
 * yet and is the next thing this product needs — and deliberately not a
 * stand-in for one: this is the honest answer to "where is the reader" while
 * they are typing, and it is what the panel is for most of the time. When the
 * caret is not in a box it shows the slide, which is the next thing out.
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
 * ## Pixels, not twips
 *
 * The model is in twips because a slide is a physical surface. A reader is not:
 * they are looking at a 1280×720 slide and thinking in pixels, so the fields
 * convert. Exactly — fifteen twips to the pixel at 96dpi — so a number typed in
 * comes back the same number.
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

  const number = (key: 'x' | 'y' | 'width' | 'height'): number | null => {
    const value = box?.attributes?.[key];
    return typeof value === 'number' ? twipToPx(value) : null;
  };

  const colour = (key: 'fill' | 'stroke'): string | null => {
    const value = box?.attributes?.[key];
    return typeof value === 'string' && value.length > 0 ? value : null;
  };

  const locked = box?.attributes?.locked === true;

  const setGeometry = (key: string, px: number) => {
    void (editor as any)?.executeCommand?.('setBoxGeometry', {
      nodeId: box?.sid,
      [key]: pxToTwip(px)
    });
  };

  const setStyle = (patch: Record<string, unknown>) => {
    void (editor as any)?.executeCommand?.('setBoxStyle', { nodeId: box?.sid, ...patch });
  };

  return (
    <PropertyPanel title="속성" className="sl-properties">
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
                disabled={locked}
                onCommit={(value) => setGeometry('x', value)}
              />
              <PropertyNumber
                ariaLabel="Y"
                value={number('y')}
                suffix="Y"
                disabled={locked}
                onCommit={(value) => setGeometry('y', value)}
              />
            </PropertyRow>
            <PropertyRow label="크기">
              <PropertyNumber
                ariaLabel="너비"
                value={number('width')}
                suffix="W"
                disabled={locked}
                onCommit={(value) => setGeometry('width', value)}
              />
              <PropertyNumber
                ariaLabel="높이"
                value={number('height')}
                suffix="H"
                disabled={locked}
                onCommit={(value) => setGeometry('height', value)}
              />
            </PropertyRow>
          </PropertyGroup>

          <PropertyGroup label="채우기와 선">
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
            <PropertyRow label="선">
              <PropertyColor
                ariaLabel="선 색"
                value={colour('stroke')}
                disabled={locked}
                onChange={(value) => setStyle({ stroke: value })}
                onClear={() => setStyle({ stroke: null })}
              />
            </PropertyRow>
          </PropertyGroup>
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
