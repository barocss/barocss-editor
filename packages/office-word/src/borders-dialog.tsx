import { useFormattingDialog } from './use-formatting-dialog';
import { selectedBlocks } from './selected-blocks';
import type { Editor } from '@barocss/editor-core';
import {
  ChoiceSelect,
  ColorField,
  Dialog,
  DialogButton,
  PropertyNumber,
  PropertyRow,
  StatusNotice,
  Button
} from '@barocss/office-ui';
import {
  BORDER_EDGES,
  BORDER_STYLES,
  BORDER_WIDTHS,
  applyPreset,
  presetOf,
  type BorderEdge,
  type BorderPreset,
  type BorderState
} from './border-model';
import { currentBorders } from './border-commands';

/**
 * **테두리 및 음영** — Word 가 갖지 못했던 첫 대화상자.
 *
 * `office-ui` 의 `Dialog` 를 덱과 사이트가 쓰고 Word 만 안 썼다. 부품은 이미 있었으므로 여기 있는
 * 것은 *Word 의 테두리가 무엇인가* 뿐이고, 산수는 하나도 없다 — 전부 `border-model.ts` 에 있고
 * 밀리초로 재진다.
 *
 * ## 미리보기가 컨트롤이다
 *
 * Word 의 이 상자에서 네 변은 **미리보기를 눌러서** 켜고 끈다. 체크상자 넷을 따로 두는 편이 만들기는
 * 쉽지만, 그러면 *어느 변이 왼쪽인가* 를 독자가 이름으로 읽어야 한다. 여기서는 그림의 그 자리를
 * 누른다. 각 단추는 진짜 단추이고 `aria-label` 로 이름을 말하므로 키보드로도 같은 순서로 닿는다.
 */

const PRESETS: readonly { id: BorderPreset; label: string; hint: string }[] = [
  { id: 'none', label: '없음', hint: '테두리를 모두 지웁니다' },
  { id: 'box', label: '상자', hint: '문단을 둘러싸는 네 변' },
  { id: 'all', label: '모두', hint: '네 변과 문단 사이의 선' }
];

const EDGE_LABEL: Record<BorderEdge, string> = {
  top: '위쪽 테두리',
  bottom: '아래쪽 테두리',
  left: '왼쪽 테두리',
  right: '오른쪽 테두리',
  between: '문단 사이 테두리'
};

/** 미리보기 안에서 각 변이 앉는 자리 — 격자의 어느 칸인가. */
const EDGE_BOX: Record<BorderEdge, string> = {
  top: 'left-6 right-6 top-3 h-2',
  bottom: 'left-6 right-6 bottom-3 h-2',
  left: 'top-6 bottom-6 left-3 w-2',
  right: 'top-6 bottom-6 right-3 w-2',
  between: 'left-6 right-6 top-1/2 -translate-y-1/2 h-2'
};

export interface BordersDialogProps {
  editor: Editor | null;
  open: boolean;
  onClose: () => void;
}

export function BordersDialog({ editor, open, onClose }: BordersDialogProps) {
  const { state, setState, selection, busy, problem, close, apply: submit } = useFormattingDialog(editor, open, currentBorders, onClose);
  const hasTarget = !!editor && selectedBlocks(editor, selection).length > 0;

  const preset = presetOf(state);

  const toggle = (edge: BorderEdge) =>
    setState((now) => ({
      ...now,
      // 혼합(`null`)을 누르면 켜진다 — 세 값 중 독자가 고를 수 있는 것은 둘이고, 한 번의 누름은
      // *이 변을 그리자* 는 뜻이다.
      edges: { ...now.edges, [edge]: now.edges[edge] !== true }
    }));

  const apply = () => {
    if (editor && hasTarget) void submit(() => editor.executeCommand('setParagraphBorders', { borders: state, selection }));
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && close()}
      title="테두리 및 음영"
      description="선택한 문단에 적용됩니다."
      footer={
        <>
          <DialogButton disabled={busy} onClick={close}>취소</DialogButton>
          <DialogButton variant="primary" data-borders-apply disabled={busy || !hasTarget} onClick={apply}>
            {busy ? '적용 중…' : '확인'}
          </DialogButton>
        </>
      }
    >
      <fieldset disabled={busy} className="w-borders-settings" aria-busy={busy || undefined}>
        <div className="w-border-presets" role="group" aria-label="미리 설정">
          {PRESETS.map((entry) => (
            <Button key={entry.id} tone="quiet" data-border-preset={entry.id} pressed={preset === entry.id}
              title={entry.hint} disabled={busy} onClick={() => setState(now => applyPreset(now, entry.id))}>
              {entry.label}
            </Button>
          ))}
        </div>

        {/**
         * 미리보기. 각 변이 단추이고, 지금 고른 모양·두께·색으로 그려진다 — 확인을 누르기 전에
         * 이중선 3pt 가 어떤 두께인지 보여 주는 것이 이 그림의 일이다.
         */}
        <div
          className="relative h-40 w-44 shrink-0 rounded-[var(--ou-radius)] bg-[color:var(--ou-ground)]"
          role="group"
          aria-label="테두리 미리보기"
        >
          <div className="absolute inset-8 flex flex-col justify-center gap-2" aria-hidden="true">
            <div className="h-1 rounded-full bg-[color:var(--ou-faint)]" />
            <div className="h-1 rounded-full bg-[color:var(--ou-faint)]" />
            <div className="h-1 w-2/3 rounded-full bg-[color:var(--ou-faint)]" />
          </div>

          {BORDER_EDGES.map((edge) => {
            const on = state.edges[edge] === true;
            const mixed = state.edges[edge] === null;
            const vertical = edge === 'left' || edge === 'right';
            return (
              <button
                key={edge}
                type="button"
                data-border-edge={edge}
                aria-label={EDGE_LABEL[edge]}
                aria-pressed={on}
                data-mixed={mixed ? 'true' : 'false'}
                onClick={() => toggle(edge)}
                className={`absolute ${EDGE_BOX[edge]} flex items-center justify-center rounded-sm hover:bg-[color:var(--ou-accent-soft)]`}
              >
                <span
                  className={vertical ? 'h-full' : 'w-full'}
                  style={
                    on
                      ? {
                          borderLeftWidth: vertical ? previewWidth(state) : undefined,
                          borderTopWidth: vertical ? undefined : previewWidth(state),
                          borderStyle: state.style ?? 'solid',
                          borderColor: `#${state.color ?? '000000'}`
                        }
                      : {
                          borderLeftWidth: vertical ? 1 : undefined,
                          borderTopWidth: vertical ? undefined : 1,
                          borderStyle: 'dashed',
                          // 꺼진 변도 자리는 보여 준다 — 누를 수 있는 곳임을 알아야 하므로.
                          borderColor: mixed ? 'var(--ou-accent)' : 'var(--ou-line)'
                        }
                  }
                />
              </button>
            );
          })}
        </div>

        <div className="w-border-fields">
          <PropertyRow label="모양">
            <ChoiceSelect
              ariaLabel="테두리 모양"
              testClass="w-border-style"
              options={BORDER_STYLES.map((one) => ({ id: one.style, label: one.label }))}
              value={state.style}
              onChange={(id) => setState((now) => ({ ...now, style: id as BorderState['style'] }))}
            />
          </PropertyRow>

          <PropertyRow label="두께">
            <ChoiceSelect
              ariaLabel="테두리 두께"
              testClass="w-border-width"
              options={BORDER_WIDTHS.map((one) => ({
                id: String(one.eighths),
                label: one.label
              }))}
              value={state.width === null ? null : String(state.width)}
              onChange={(id) => setState((now) => ({ ...now, width: Number(id) }))}
            />
          </PropertyRow>

          <PropertyRow label="색">
            <ColorField
              ariaLabel="테두리 색"
              value={state.color ? `#${state.color}` : '#000000'}
              onChange={(next) =>
                // Word 는 `#` 없이 여섯 자리로 저장한다 — `paragraphCss` 가 그렇게 읽는다.
                setState((now) => ({ ...now, color: next.replace(/^#/, '').toUpperCase() }))
              }
            />
          </PropertyRow>

          <PropertyRow label="글과의 간격">
            <PropertyNumber
              ariaLabel="테두리와 글 사이"
              suffix="pt" min={0}
              value={state.space ?? 0}
              onCommit={(value) =>
                setState((now) => ({ ...now, space: value > 0 ? Math.round(value) : null }))
              }
            />
          </PropertyRow>
        </div>
      </fieldset>
      {!hasTarget && <StatusNotice tone="warning" title="문단을 먼저 선택하세요">설정창을 닫고 본문에서 문단을 선택하세요.</StatusNotice>}
      {problem && <StatusNotice className="w-page-error" tone="danger" title="적용하지 못했습니다">{problem}</StatusNotice>}
    </Dialog>
  );
}

/**
 * 미리보기에 그릴 두께 — **화면 픽셀이 아니라 포인트를 보여 준다.**
 *
 * ¼pt 를 0.25px 로 그리면 아무것도 안 보인다. 사다리의 아홉 칸이 서로 다르게 보이도록 최소 1px 을
 * 두되, 비율은 지킨다 — 6pt 가 1pt 보다 여섯 배 굵어 보이는 것이 이 그림의 유일한 약속이다.
 */
function previewWidth(state: BorderState): number {
  const eighths = state.width ?? 8;
  return Math.max(1, Math.round(eighths / 8));
}
