import { useMemo } from 'react';
import type { Editor } from '@barocss/editor-core';
import { selectedNodeIds, watchAnswers } from '@barocss/editor-core';
import {
  PropertyChoice,
  PropertyColor,
  PropertyEmpty,
  PropertyGroup,
  PropertyNumber,
  PropertyPanel,
  PropertyRow,
  useRevision
} from '@barocss/office-ui';
import {
  BREAKPOINTS,
  attrsAt,
  labelOfBlock,
  overriddenAt,
  type BreakpointId
} from '@barocss/office-site';

/** 15 twips to the CSS pixel, exactly — the conversion every length in this app makes. */
const PX = 15;

/**
 * What the selected blocks are, and what a reader can change about them.
 *
 * ## The one thing this panel does that a document's does not
 *
 * It says **which width it is talking about**. Every value shown is resolved for the width being
 * edited, and every value the reader is *overriding* at that width is marked — because the single
 * most common complaint about responsive builders is that a reader changes something, cannot tell
 * whether it applied everywhere or only here, and finds out on another screen.
 *
 * Marked rather than merely resolved, and this is the whole reason `overriddenAt` exists: showing
 * the right number is not enough, because a right number that came from somewhere else looks
 * exactly like one that came from here.
 *
 * ## Why it writes commands and not attributes
 *
 * `setStackFormat` takes the width. A panel that wrote `setAttrs` would have to know that the base
 * width is the node and a narrower one is a difference — which is the model's rule, and a rule
 * spelled out in a React component is a rule that will be spelled differently in the next one.
 */
export function Inspector({
  editor,
  at,
  onAt
}: {
  editor: Editor;
  /** The width being edited. The widest is the page itself; the others say only what differs. */
  at: BreakpointId;
  onAt: (at: BreakpointId) => void;
}) {
  const revision = useRevision((reread) => watchAnswers(editor, reread), [editor]);

  const shown = useMemo(() => {
    const store = (editor as never as { dataStore?: { getNode: (sid: string) => any } }).dataStore;
    const ids = selectedNodeIds((editor as never as { selection?: never }).selection) ?? [];
    const nodes = ids.map((sid) => store?.getNode(sid)).filter(Boolean);
    if (nodes.length === 0) return null;

    const doc = { getNode: (sid: string) => store?.getNode(sid) };
    /*
     * The first of them decides what is shown, and every change is applied to all of them.
     *
     * The honest alternative is a mixed state per field, which every mature inspector has and which
     * is a slice of its own: what matters first is that selecting three cards and typing one number
     * changes three cards.
     */
    const first = nodes[0] as Record<string, any>;
    return {
      ids,
      count: nodes.length,
      stype: String(first.stype),
      label: labelOfBlock(doc, ids[0]),
      attrs: attrsAt(first.attributes ?? {}, at),
      overridden: new Set(overriddenAt(first.attributes ?? {}, at))
    };
  }, [editor, at, revision]);

  const set = (name: string, value: unknown) =>
    (editor as never as { executeCommand?: (n: string, p?: unknown) => void }).executeCommand?.(
      'setStackFormat',
      { nodeIds: shown?.ids, at, [name]: value }
    );

  /** A property whose value at this width is this width's own, not the page's. */
  const mark = (name: string) => (shown?.overridden.has(name) ? ' ·' : '');

  return (
    <PropertyPanel
      title="속성"
      action={
        <div className="st-at" data-editing-at={at}>
          {BREAKPOINTS.map((one) => (
            <button
              key={one.id}
              type="button"
              data-at={one.id}
              data-current={one.id === at ? 'true' : undefined}
              title={`${one.label}에서 편집`}
              onClick={() => onAt(one.id)}
            >
              {one.label[0]}
            </button>
          ))}
        </div>
      }
    >
      {!shown ? (
        <PropertyEmpty>
          페이지에서 블록을 선택하세요. 한 번 누르면 바깥쪽 블록, 두 번 누르면 그 안쪽입니다.
        </PropertyEmpty>
      ) : (
        <>
          <PropertyGroup label={shown.count > 1 ? `${shown.count}개 선택됨` : shown.label}>
            <PropertyRow label="종류">
              <span className="st-kind" data-stype={shown.stype}>
                {shown.stype}
              </span>
            </PropertyRow>
            {at !== 'desktop' ? (
              <PropertyRow label="편집 중인 폭">
                {/* Said out loud, because a reader who forgets which width they are editing writes a
                    change nobody else can see. */}
                <span className="st-at-note">
                  {BREAKPOINTS.find((one) => one.id === at)?.label} — 여기서 바꾼 값만 이 폭에 적용됩니다
                </span>
              </PropertyRow>
            ) : null}
          </PropertyGroup>

          {shown.stype === 'frame' || shown.stype === 'collection' ? (
            <PropertyGroup label="배치">
              <PropertyRow label={`방향${mark('layoutMode')}`}>
                <PropertyChoice
                  value={String(shown.attrs.layoutMode ?? 'column')}
                  options={[
                    { id: 'column', label: '세로' },
                    { id: 'row', label: '가로' },
                    { id: 'grid', label: '그리드' }
                  ]}
                  onChange={(value) => set('layoutMode', value)}
                  ariaLabel="방향"
                />
              </PropertyRow>
              <PropertyRow label={`간격${mark('gap')}`}>
                <PropertyNumber
                  value={Math.round(Number(shown.attrs.gap ?? 0) / PX)}
                  onCommit={(value) => set('gap', Math.max(0, value) * PX)}
                  suffix="px"
                  ariaLabel="간격"
                />
              </PropertyRow>
              <PropertyRow label={`안쪽 여백${mark('padding')}`}>
                <PropertyNumber
                  value={Math.round(Number(shown.attrs.padding ?? 0) / PX)}
                  onCommit={(value) => set('padding', Math.max(0, value) * PX)}
                  suffix="px"
                  ariaLabel="안쪽 여백"
                />
              </PropertyRow>
              <PropertyRow label={`맞춤${mark('alignItems')}`}>
                <PropertyChoice
                  value={String(shown.attrs.alignItems ?? 'stretch')}
                  options={[
                    { id: 'stretch', label: '채움' },
                    { id: 'start', label: '앞' },
                    { id: 'center', label: '가운데' },
                    { id: 'end', label: '뒤' }
                  ]}
                  onChange={(value) => set('alignItems', value)}
                  ariaLabel="맞춤"
                />
              </PropertyRow>
              {shown.attrs.layoutMode === 'grid' ? (
                <PropertyRow label={`열${mark('columns')}`}>
                  <PropertyNumber
                    value={Number(shown.attrs.columns ?? 3)}
                    onCommit={(value) => set('columns', Math.max(1, Math.round(value)))}
                    ariaLabel="열"
                  />
                </PropertyRow>
              ) : null}
            </PropertyGroup>
          ) : null}

          <PropertyGroup label="크기">
            <PropertyRow label={`폭${mark('sizing')}`}>
              {/*
                Three answers, because there are three — and silence is not one of them: a `div`
                hugs, a flex child fills, so "nothing stated" is the absence of an intent rather than
                an intent (`sizing.ts`).
              */}
              <PropertyChoice
                value={String(shown.attrs.sizing ?? 'fill')}
                options={[
                  { id: 'fill', label: '채우기' },
                  { id: 'hug', label: '내용만큼' },
                  { id: 'fixed', label: '고정' }
                ]}
                onChange={(value) => set('sizing', value)}
                ariaLabel="폭"
              />
            </PropertyRow>
            <PropertyRow label={`최소${mark('minWidth')}`}>
              <PropertyNumber
                value={shown.attrs.minWidth === undefined ? null : Math.round(Number(shown.attrs.minWidth) / PX)}
                onCommit={(value) => set('minWidth', value > 0 ? value * PX : undefined)}
                suffix="px"
                ariaLabel="최소 폭"
              />
            </PropertyRow>
            <PropertyRow label={`최대${mark('maxWidth')}`}>
              <PropertyNumber
                value={shown.attrs.maxWidth === undefined ? null : Math.round(Number(shown.attrs.maxWidth) / PX)}
                onCommit={(value) => set('maxWidth', value > 0 ? value * PX : undefined)}
                suffix="px"
                ariaLabel="최대 폭"
              />
            </PropertyRow>
          </PropertyGroup>

          <PropertyGroup label="모양">
            <PropertyRow label={`배경${mark('fill')}`}>
              <PropertyColor
                value={typeof shown.attrs.fill === 'string' ? shown.attrs.fill : null}
                onChange={(value) => set('fill', value)}
                onClear={() => set('fill', undefined)}
                ariaLabel="배경"
              />
            </PropertyRow>
          </PropertyGroup>
        </>
      )}
    </PropertyPanel>
  );
}
