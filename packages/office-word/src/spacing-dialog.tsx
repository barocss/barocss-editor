import { useState } from 'react';
import type { Editor } from '@barocss/editor-core';
import {
  ChoiceSelect,
  Dialog,
  DialogButton,
  PropertyNumber,
  PropertyRow
} from '@barocss/office-ui';
import {
  LINE_PRESETS,
  LINE_RULES,
  LINE_UNIT,
  TWIPS_PER_POINT,
  linesOf,
  withRule,
  type LineRule,
  type SpacingState
} from './spacing-model';
import { currentSpacing } from './spacing-commands';

/**
 * **문단 간격** — Word 의 두 번째 대화상자.
 *
 * 산수는 하나도 여기 없다. 규칙을 바꿀 때 숫자를 옮기는 일, 몇 줄인지 하나로 답하는 일, 혼합을
 * 쓰지 않는 일 — 전부 `spacing-model.ts` 에 있고 밀리초로 재진다.
 *
 * ## 독자는 트윕을 모른다
 *
 * 문서는 트윕으로 저장하고(1pt = 20트윕) 독자는 **포인트**로 읽는다. 그 환산이 이 파일에 있는
 * 이유는 그것이 *보여 주는 방법*이지 문서의 사실이 아니기 때문이다 — 모델이 pt 를 알면 다음에
 * mm 로 보고 싶은 독자가 왔을 때 모델을 고쳐야 한다.
 */

export interface SpacingDialogProps {
  editor: Editor | null;
  open: boolean;
  onClose: () => void;
}

export function SpacingDialog({ editor, open, onClose }: SpacingDialogProps) {
  const [state, setState] = useState<SpacingState>(() => currentSpacing(editor));

  // 다시 열면 지금 문단을 보여 준다 — 테두리와 같은 이유, 같은 모양.
  const [was, setWas] = useState(open);
  if (was !== open) {
    setWas(open);
    if (open) setState(currentSpacing(editor));
  }

  const rule: LineRule = state.rule ?? 'auto';
  const lines = linesOf(state);

  const apply = () => {
    void editor?.executeCommand?.('setParagraphSpacing', { spacing: state });
    onClose();
  };

  /** 트윕을 포인트로, 그리고 되돌려서. 소수 한 자리까지 — Word 가 그렇게 보여 준다. */
  const points = (twips: number | null): number =>
    twips === null ? 0 : Math.round((twips / TWIPS_PER_POINT) * 10) / 10;
  const twips = (pt: number): number => Math.round(pt * TWIPS_PER_POINT);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title="문단 간격"
      description="선택한 문단에 적용됩니다."
      footer={
        <>
          <DialogButton onClick={onClose}>취소</DialogButton>
          <DialogButton variant="primary" data-spacing-apply onClick={apply}>
            확인
          </DialogButton>
        </>
      }
    >
      <div className="flex min-w-72 flex-col gap-3">
        <PropertyRow label="문단 앞">
          <PropertyNumber
            ariaLabel="문단 앞 간격"
            suffix="pt"
            value={points(state.before)}
            onCommit={(value) => setState((now) => ({ ...now, before: twips(value) }))}
          />
        </PropertyRow>

        <PropertyRow label="문단 뒤">
          <PropertyNumber
            ariaLabel="문단 뒤 간격"
            suffix="pt"
            value={points(state.after)}
            onCommit={(value) => setState((now) => ({ ...now, after: twips(value) }))}
          />
        </PropertyRow>

        <PropertyRow label="줄 간격">
          <ChoiceSelect
            ariaLabel="줄 간격 규칙"
            testClass="w-line-rule"
            options={LINE_RULES.map((one) => ({ id: one.rule, label: one.label }))}
            value={state.rule}
            /* 규칙만 바꾸는 것이 아니라 **숫자를 같은 뜻으로 옮긴다** — 모델이 그 일을 한다. */
            onChange={(id) => setState((now) => withRule(now, id as LineRule))}
          />
        </PropertyRow>

        {rule === 'auto' ? (
          <PropertyRow label="몇 줄">
            <ChoiceSelect
              ariaLabel="줄 간격 배수"
              testClass="w-line-preset"
              options={LINE_PRESETS.map((one) => ({ id: String(one.lines), label: one.label }))}
              // 독자가 고른 값이 사다리에 없으면(파일에서 온 1.3줄) 아무것도 안 고른 상태 —
              // 있지도 않은 항목을 켜 두는 것보다 정직하다.
              value={
                lines !== null && LINE_PRESETS.some((one) => one.lines === lines)
                  ? String(lines)
                  : null
              }
              onChange={(id) =>
                setState((now) => ({ ...now, rule: 'auto', line: Number(id) * LINE_UNIT }))
              }
            />
          </PropertyRow>
        ) : (
          <PropertyRow label="최소 높이">
            <PropertyNumber
              ariaLabel="줄 최소 높이"
              suffix="pt"
              value={points(state.line)}
              onCommit={(value) =>
                setState((now) => ({ ...now, rule: 'atLeast', line: twips(value) }))
              }
            />
          </PropertyRow>
        )}

        <label className="flex items-center gap-2 text-[length:var(--ou-text-small)] text-[color:var(--ou-ink)]">
          <input
            type="checkbox"
            data-spacing-contextual
            checked={state.contextual === true}
            onChange={(event) =>
              setState((now) => ({ ...now, contextual: event.currentTarget.checked }))
            }
          />
          같은 스타일의 문단 사이에는 간격을 두지 않음
        </label>
      </div>
    </Dialog>
  );
}
