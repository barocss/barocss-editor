import { useMemo, useState } from 'react';
import type { Editor } from '@barocss/editor-core';
import { selectedNodeIds, watchAnswers } from '@barocss/editor-core';
import {
  ChoiceSelect,
  ColorField,
  NumberField,
  PropertyEmpty,
  PropertyGroup,
  PropertyPanel,
  PropertyRow,
  PropertyTabs,
  PropertyToggle,
  TextField,
  useRevision,
  type ThemeSwatch
} from '@barocss/office-ui';
import {
  BREAKPOINTS,
  attrsAt,
  kindOfBlock,
  labelOfBlock,
  overriddenAt,
  type BreakpointId
} from '@barocss/office-site';

/** 15 twips to the CSS pixel, exactly — the conversion every length in this app makes. */
const PX = 15;

/**
 * What the selected blocks are, and everything a reader can change about them.
 *
 * ## Built by looking at a document that uses the schema
 *
 * The first version had three groups and was written from the schema. It looked complete and was
 * not: the sample it was tested against used six attributes. So the sample was made **dense** —
 * five pages, a grid, a fixed sidebar, two data lists, design tokens, a bound button — and the panel
 * was written from *that*. Every group below exists because something on the site needed it, and the
 * ones a reader could see and not change are what the exercise found.
 *
 * ## Two things it says that a document's panel does not
 *
 * **Which width it is talking about.** Every value is resolved for the width being edited and every
 * value this width *overrides* is marked, because the commonest complaint about responsive builders
 * is that a reader changes something and cannot tell whether it applied everywhere.
 *
 * **What a colour is following.** A site's `fill` may hold `var:강조` rather than a hex — a design
 * token — and `ColorField` is the deck's own control for exactly that distinction: two blocks the
 * same blue are a coincidence, two blocks on `var:강조` are a decision.
 */
export function Inspector({
  editor,
  at,
  onAt,
  page
}: {
  editor: Editor;
  /** The width being edited. The widest is the page itself; the others say only what differs. */
  at: BreakpointId;
  onAt: (at: BreakpointId) => void;
  /** The page on screen, so the panel has something to say when nothing is selected. */
  page?: string;
}) {
  const revision = useRevision((reread) => watchAnswers(editor, reread), [editor]);
  const [tab, setTab] = useState('block');

  const store = (editor as never as { dataStore?: { getNode: (sid: string) => any } }).dataStore;
  const node = (sid: string | undefined) => (sid ? store?.getNode(sid) : undefined);

  const shown = useMemo(() => {
    const ids = selectedNodeIds((editor as never as { selection?: never }).selection) ?? [];
    const nodes = ids.map((sid) => store?.getNode(sid)).filter(Boolean);
    if (nodes.length === 0) return null;

    const doc = { getNode: (sid: string) => store?.getNode(sid) };
    /*
     * The first of them decides what is shown, and every change is applied to all of them. A mixed
     * state per field is what a mature inspector has and is a slice of its own; what matters first
     * is that selecting three cards and typing one number changes three cards.
     */
    const first = nodes[0] as Record<string, any>;
    return {
      ids,
      count: nodes.length,
      stype: String(first.stype),
      label: labelOfBlock(doc, ids[0]),
      /** Resolved for the width being edited — what the reader is looking at. */
      attrs: attrsAt(first.attributes ?? {}, at),
      /** And unresolved, because a colour that *follows a token* must not be shown as a hex. */
      raw: (first.attributes ?? {}) as Record<string, any>,
      overridden: new Set(overriddenAt(first.attributes ?? {}, at)),
      values: ((first.content ?? []) as unknown[])
        .filter((sid): sid is string => typeof sid === 'string')
        .map((sid) => store?.getNode(sid))
        .filter((child: any) => child?.stype === 'componentValue')
        .map((child: any) => ({
          sid: String(child.sid),
          name: String(child.attributes?.name),
          value: String(child.attributes?.value ?? '')
        }))
    };
  }, [editor, at, revision, store]);

  /**
   * The site's own colours, offered as swatches.
   *
   * The deck offers a theme's twelve slots; a site offers what its author named — the same control
   * and a different list. Choosing one writes `var:강조`, a reference rather than a colour, so
   * changing the token later changes every block that follows it.
   */
  const tokens = useMemo((): ThemeSwatch[] => {
    const rootId = (editor as never as { getRootId?: () => string })?.getRootId?.();
    const root = rootId ? store?.getNode(rootId) : undefined;
    const holder = ((root?.content ?? []) as string[])
      .map((sid) => store?.getNode(sid))
      .find((child: any) => child?.stype === 'variables');

    return ((holder?.content ?? []) as string[])
      .map((sid) => store?.getNode(sid))
      .filter((one: any) => one?.stype === 'variable' && one?.attributes?.kind === 'color')
      .map((one: any) => ({
        value: `var:${one.attributes.name}`,
        colour: String(one.attributes.value ?? '#000000'),
        label: String(one.attributes.label ?? one.attributes.name)
      }));
  }, [editor, revision, store]);

  const run = (name: string, payload: Record<string, unknown>) =>
    (editor as never as { executeCommand?: (n: string, p?: unknown) => void }).executeCommand?.(name, payload);

  const set = (field: string, value: unknown) =>
    run('setBlockFormat', { nodeIds: shown?.ids, at, [field]: value });

  /** A property whose value at this width is this width's own rather than the page's. */
  const mark = (field: string) => (shown?.overridden.has(field) ? ' ·' : '');

  const twips = (field: string) => {
    const value = shown?.attrs[field];
    return value === undefined ? null : Math.round(Number(value) / PX);
  };

  const isStack = shown?.stype === 'frame' || shown?.stype === 'collection';

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
        <PageSettings page={page} node={node} run={run} />
      ) : (
        <>
          <PropertyTabs
            tabs={[
              { id: 'block', label: '블록' },
              { id: 'style', label: '모양' },
              ...(shown.stype === 'collection' ? [{ id: 'data', label: '데이터' }] : []),
              ...(shown.stype === 'instance' ? [{ id: 'values', label: '값' }] : [])
            ]}
            active={tab}
            onChange={setTab}
          />

          {tab === 'block' ? (
            <>
              <PropertyGroup label={shown.count > 1 ? `${shown.count}개 선택됨` : shown.label}>
                <PropertyRow label="종류">
                  <span className="st-kind">{kindOfBlock(shown.stype) ?? shown.stype}</span>
                </PropertyRow>
                {shown.count === 1 ? (
                  <PropertyRow label={`이름${mark('name')}`}>
                    {/* What a reader calls it: the layer list shows it and the drawing says it. */}
                    <TextField
                      value={typeof shown.attrs.name === 'string' ? shown.attrs.name : ''}
                      onCommit={(value) => set('name', value || undefined)}
                      ariaLabel="이름"
                      placeholder={kindOfBlock(shown.stype) ?? ''}
                    />
                  </PropertyRow>
                ) : null}
                {at !== 'desktop' ? (
                  <PropertyRow label="편집 중인 폭">
                    <span className="st-at-note">
                      {BREAKPOINTS.find((one) => one.id === at)?.label}에서 바꾼 값만 이 폭에 적용됩니다
                    </span>
                  </PropertyRow>
                ) : null}
              </PropertyGroup>

              {isStack ? (
                <PropertyGroup label="배치">
                  <PropertyRow label={`방향${mark('layoutMode')}`}>
                    <ChoiceSelect
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
                  {shown.attrs.layoutMode === 'grid' ? (
                    <PropertyRow label={`열${mark('columns')}`}>
                      <NumberField
                        value={Number(shown.attrs.columns ?? 3)}
                        onCommit={(value) => set('columns', Math.max(1, Math.round(value)))}
                        ariaLabel="열"
                        min={1}
                      />
                    </PropertyRow>
                  ) : null}
                  <PropertyRow label={`간격${mark('gap')}`}>
                    <NumberField
                      value={twips('gap') ?? 0}
                      onCommit={(value) => set('gap', Math.max(0, value) * PX)}
                      ariaLabel="간격"
                      suffix="px"
                      min={0}
                    />
                  </PropertyRow>
                  <PropertyRow label={`안쪽 여백${mark('padding')}`}>
                    <NumberField
                      value={twips('padding') ?? 0}
                      onCommit={(value) => set('padding', Math.max(0, value) * PX)}
                      ariaLabel="안쪽 여백"
                      suffix="px"
                      min={0}
                    />
                  </PropertyRow>
                  <PropertyRow label={`맞춤${mark('alignItems')}`}>
                    <ChoiceSelect
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
                </PropertyGroup>
              ) : null}

              <PropertyGroup label="크기">
                <PropertyRow label={`폭${mark('sizing')}`}>
                  {/*
                    Three answers, because there are three — and silence is not one of them: a `div`
                    hugs, a flex child fills, so "nothing stated" is the absence of an intent rather
                    than an intent (`sizing.ts`).
                  */}
                  <ChoiceSelect
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
                  <NumberField
                    value={twips('minWidth')}
                    onCommit={(value) => set('minWidth', value > 0 ? value * PX : undefined)}
                    ariaLabel="최소 폭"
                    suffix="px"
                    min={0}
                  />
                </PropertyRow>
                <PropertyRow label={`최대${mark('maxWidth')}`}>
                  <NumberField
                    value={twips('maxWidth')}
                    onCommit={(value) => set('maxWidth', value > 0 ? value * PX : undefined)}
                    ariaLabel="최대 폭"
                    suffix="px"
                    min={0}
                  />
                </PropertyRow>
              </PropertyGroup>
            </>
          ) : null}

          {tab === 'style' ? (
            <>
              <PropertyGroup label="바탕">
                <PropertyRow label={`배경${mark('fill')}`}>
                  {/*
                    The site's own colours beside any colour at all. Choosing one writes `var:강조` —
                    a reference rather than a hex — so changing the token later changes every block
                    that follows it. `varSwatches` is the deck's control doing a site's job.
                  */}
                  <ColorField
                    value={typeof shown.raw.fill === 'string' ? shown.raw.fill : null}
                    varSwatches={tokens}
                    onChange={(value) => set('fill', value)}
                    onClear={() => set('fill', undefined)}
                    ariaLabel="배경"
                  />
                </PropertyRow>
              </PropertyGroup>

              {/*
                The box itself — the two things a page's frame says that a canvas's frame does not.

                A **radius** because a card is a frame and only a `rectangle` could be rounded, so the
                single most ordinary box on a web page was undrawable; and **clipping** because
                `frameCss` writes `overflow: hidden` by default and the page silently unclips
                (`renderers.ts`), which makes this a reader asking for a window rather than a reader
                escaping a default. Measured before either existed: nine clipping stacks on the
                sample's desktop board, and nothing anywhere that could turn one off.

                Stacks only. A picture and a heading have no box of their own to round here — a
                picture's corners are the frame's it sits in, which is how every layout tool
                answers this.
              */}
              {isStack ? (
                <PropertyGroup label="상자">
                  <PropertyRow label={`둥글기${mark('cornerRadius')}`}>
                    <NumberField
                      value={twips('cornerRadius')}
                      onCommit={(value) => set('cornerRadius', value > 0 ? value * PX : undefined)}
                      ariaLabel="모서리 둥글기"
                      suffix="px"
                      min={0}
                    />
                  </PropertyRow>
                  <PropertyRow label={`넘침${mark('clipsContent')}`}>
                    <PropertyToggle
                      value={shown.attrs.clipsContent === true}
                      onChange={(value) => set('clipsContent', value ? true : undefined)}
                      label="자르기"
                      ariaLabel="넘치는 것 자르기"
                    />
                  </PropertyRow>
                </PropertyGroup>
              ) : null}

              <PropertyGroup label="테두리">
                <PropertyRow label={`색${mark('stroke')}`}>
                  <ColorField
                    value={typeof shown.raw.stroke === 'string' ? shown.raw.stroke : null}
                    varSwatches={tokens}
                    onChange={(value) => set('stroke', value)}
                    onClear={() => set('stroke', undefined)}
                    ariaLabel="테두리 색"
                  />
                </PropertyRow>
                <PropertyRow label={`두께${mark('strokeWidth')}`}>
                  <NumberField
                    value={twips('strokeWidth')}
                    onCommit={(value) => set('strokeWidth', value > 0 ? value * PX : undefined)}
                    ariaLabel="테두리 두께"
                    suffix="px"
                    min={0}
                  />
                </PropertyRow>
              </PropertyGroup>

              {shown.stype === 'picture' ? (
                <PropertyGroup label="이미지">
                  <PropertyRow label="주소">
                    <TextField
                      value={String(shown.attrs.src ?? '')}
                      onCommit={(value) => set('src', value)}
                      ariaLabel="이미지 주소"
                    />
                  </PropertyRow>
                  <PropertyRow label="설명">
                    {/* Not decoration: it is what a reader of the published page hears. */}
                    <TextField
                      value={String(shown.attrs.alt ?? '')}
                      onCommit={(value) => set('alt', value)}
                      ariaLabel="대체 텍스트"
                    />
                  </PropertyRow>
                  <PropertyRow label={`채우기${mark('fit')}`}>
                    <ChoiceSelect
                      value={String(shown.attrs.fit ?? 'cover')}
                      options={[
                        { id: 'cover', label: '꽉 채움' },
                        { id: 'contain', label: '전체 보임' },
                        { id: 'fill', label: '늘림' }
                      ]}
                      onChange={(value) => set('fit', value)}
                      ariaLabel="채우기"
                    />
                  </PropertyRow>
                </PropertyGroup>
              ) : null}

              {shown.stype === 'heading' ? (
                <PropertyGroup label="제목">
                  <PropertyRow label="단계">
                    <ChoiceSelect
                      value={String(shown.attrs.level ?? 2)}
                      options={[1, 2, 3, 4, 5, 6].map((level) => ({
                        id: String(level),
                        label: `제목 ${level}`
                      }))}
                      onChange={(value) => set('level', Number(value))}
                      ariaLabel="제목 단계"
                    />
                  </PropertyRow>
                </PropertyGroup>
              ) : null}
            </>
          ) : null}

          {tab === 'data' ? <DataGroup shown={shown} set={set} mark={mark} editor={editor} /> : null}

          {tab === 'values' ? (
            <PropertyGroup label="이 블록의 값">
              {shown.count > 1 ? (
                <PropertyEmpty>한 블록만 선택했을 때 값을 바꿀 수 있습니다.</PropertyEmpty>
              ) : shown.values.length === 0 ? (
                <PropertyEmpty>이 정의는 묻는 것이 없습니다.</PropertyEmpty>
              ) : (
                shown.values.map((one) => (
                  <PropertyRow key={one.sid} label={one.name}>
                    <TextField
                      value={one.value}
                      onCommit={(value) =>
                        run('setComponentValue', { nodeId: shown.ids[0], name: one.name, value })
                      }
                      ariaLabel={one.name}
                    />
                  </PropertyRow>
                ))
              )}
            </PropertyGroup>
          ) : null}
        </>
      )}
    </PropertyPanel>
  );
}

/**
 * What a list draws.
 *
 * The half of the data feature a reader could not see: which dataset, in what order, how many of
 * them, and filtered to what. The columns come from the dataset's own declaration, so a reader
 * **picks** one rather than typing it — which is why `dataset.fields` is declared rather than
 * inferred from the first row.
 */
function DataGroup({
  shown,
  set,
  mark,
  editor
}: {
  shown: { attrs: Record<string, any> };
  set: (field: string, value: unknown) => void;
  mark: (field: string) => string;
  editor: Editor;
}) {
  const store = (editor as never as { dataStore?: { getNode: (sid: string) => any } }).dataStore;
  const rootId = (editor as never as { getRootId?: () => string })?.getRootId?.();

  const datasets = useMemo(() => {
    const root = rootId ? store?.getNode(rootId) : undefined;
    const resources = ((root?.content ?? []) as string[])
      .map((sid) => store?.getNode(sid))
      .find((child: any) => child?.stype === 'resources');
    return ((resources?.content ?? []) as string[])
      .map((sid) => store?.getNode(sid))
      .filter((one: any) => one?.stype === 'dataset')
      .map((one: any) => ({
        name: String(one.attributes.name),
        label: String(one.attributes.label ?? one.attributes.name),
        fields: (one.attributes.fields ?? []) as string[],
        rows: ((one.attributes.records ?? []) as unknown[]).length
      }));
  }, [store, rootId]);

  const chosen = datasets.find((one) => one.name === shown.attrs.source);
  const columns = [
    { id: '', label: '없음' },
    ...(chosen?.fields ?? []).map((field) => ({ id: field, label: field }))
  ];

  return (
    <>
      <PropertyGroup label="데이터">
        <PropertyRow label="목록">
          <ChoiceSelect
            value={String(shown.attrs.source ?? '')}
            options={datasets.map((one) => ({ id: one.name, label: `${one.label} (${one.rows})` }))}
            onChange={(value) => set('source', value)}
            ariaLabel="데이터 목록"
          />
        </PropertyRow>
        <PropertyRow label={`정렬${mark('sortBy')}`}>
          <ChoiceSelect
            value={String(shown.attrs.sortBy ?? '')}
            options={columns}
            onChange={(value) => set('sortBy', value || undefined)}
            ariaLabel="정렬 기준"
          />
        </PropertyRow>
        <PropertyRow label="순서">
          <ChoiceSelect
            value={String(shown.attrs.sortDir ?? 'asc')}
            options={[
              { id: 'asc', label: '오름차순' },
              { id: 'desc', label: '내림차순' }
            ]}
            onChange={(value) => set('sortDir', value)}
            ariaLabel="정렬 순서"
          />
        </PropertyRow>
        <PropertyRow label={`개수${mark('limit')}`}>
          {/* Empty means all of them, which is what a list with nothing said has always drawn. */}
          <NumberField
            value={shown.attrs.limit === undefined ? null : Number(shown.attrs.limit)}
            onCommit={(value) => set('limit', value > 0 ? Math.round(value) : undefined)}
            ariaLabel="개수"
            min={0}
          />
        </PropertyRow>
      </PropertyGroup>

      <PropertyGroup label="거르기">
        <PropertyRow label="칸">
          <ChoiceSelect
            value={String(shown.attrs.where ?? '')}
            options={columns}
            onChange={(value) => set('where', value || undefined)}
            ariaLabel="거를 칸"
          />
        </PropertyRow>
        <PropertyRow label="값">
          <TextField
            value={String(shown.attrs.equals ?? '')}
            onCommit={(value) => set('equals', value || undefined)}
            ariaLabel="거를 값"
            disabled={!shown.attrs.where}
          />
        </PropertyRow>
      </PropertyGroup>
    </>
  );
}

/**
 * The page, when nothing is selected.
 *
 * Where every builder of this kind puts it, and the only place a page's **address** can be edited at
 * all: a page is the board rather than a block, so it is never in a selection — `SELECTABLE` leaves
 * it out on purpose, because a selection whose only meaning is "everything" is what clicking nothing
 * already means.
 */
function PageSettings({
  page,
  node,
  run
}: {
  page?: string;
  node: (sid: string | undefined) => any;
  run: (name: string, payload: Record<string, unknown>) => void;
}) {
  const current = node(page);
  if (!current) {
    return (
      <PropertyEmpty>
        페이지에서 블록을 선택하세요. 한 번 누르면 바깥쪽 블록, 두 번 누르면 그 안쪽입니다.
      </PropertyEmpty>
    );
  }

  return (
    <>
      <PropertyGroup label="페이지">
        <PropertyRow label="이름">
          <TextField
            value={String(current.attributes?.name ?? '')}
            onCommit={(value) => run('setPageInfo', { nodeId: page, name: value })}
            ariaLabel="페이지 이름"
          />
        </PropertyRow>
        <PropertyRow label="주소">
          {/* What a site *is*: two pages may be called the same thing and only one answers on `/`. */}
          <TextField
            value={String(current.attributes?.path ?? '')}
            onCommit={(value) => run('setPageInfo', { nodeId: page, path: value })}
            ariaLabel="페이지 주소"
          />
        </PropertyRow>
      </PropertyGroup>
      <PropertyEmpty>
        블록을 선택하면 그 블록의 속성이 여기에 나옵니다. 한 번 누르면 바깥쪽, 두 번 누르면 그 안쪽입니다.
      </PropertyEmpty>
    </>
  );
}
