import type { Editor } from '@barocss/editor-core';
import {
  ChoiceSelect,
  Dialog,
  DialogButton,
  PropertyNumber,
  PropertyRow,
  PropertyToggle,
  StatusNotice,
  StatusIndicator
} from '@barocss/office-ui';
import {
  PAPERS,
  TWIPS_PER_INCH,
  isUsable,
  orientationOf,
  paperOf,
  roomFor,
  withOrientation,
  withPaper,
  type Orientation
} from './page-setup-model';
import { currentPageSetup } from './page-setup-commands';
import { useFormattingDialog } from './use-formatting-dialog';

/**
 * **페이지 설정** — Word 의 세 번째 대화상자.
 *
 * 산수는 전부 `page-setup-model.ts` 에 있다: 방향이 두 변의 관계라는 것, 용지를 고를 때 방향을
 * 지키는 것, 글을 놓을 자리가 남는지.
 *
 * ## 확인이 꺼질 수 있는 첫 대화상자
 *
 * 앞의 둘은 어떤 값을 넣어도 문서가 성립했다. 여백은 다르다 — 종이보다 넓은 여백은 한 줄에 한
 * 글자씩 수천 페이지를 만든다. 그래서 확인이 **꺼지고**, 왜 꺼졌는지 한 줄로 말한다: 꺼진 단추가
 * 이유를 말하지 않으면 독자는 자기가 무엇을 잘못했는지 모른 채 대화상자를 닫는다.
 */

const ORIENTATIONS: readonly { id: Orientation; label: string }[] = [
  { id: 'portrait', label: '세로' },
  { id: 'landscape', label: '가로' }
];

export interface PageSetupDialogProps {
  editor: Editor | null;
  open: boolean;
  onClose: () => void;
}

export function PageSetupDialog({ editor, open, onClose }: PageSetupDialogProps) {
  const { state: setup, setState: setSetup, selection, busy, problem, close, apply: submit } = useFormattingDialog(editor, open, currentPageSetup, onClose);

  /** 트윕을 밀리미터로, 그리고 되돌려서 — 독자가 여백을 재는 단위. */
  const mm = (twips: number | null): number =>
    twips === null ? 0 : Math.round((twips / TWIPS_PER_INCH) * 25.4 * 10) / 10;
  const toTwips = (value: number): number => Math.round((value / 25.4) * TWIPS_PER_INCH);

  const margin = (key: 'marginTop' | 'marginBottom' | 'marginLeft' | 'marginRight', label: string) => (
    <PropertyRow label={label}>
      <PropertyNumber
        ariaLabel={`${label} 여백`}
        suffix="mm"
        min={0}
        value={mm(setup[key])}
        onCommit={(value) => setSetup((now) => ({ ...now, [key]: toTwips(value) }))}
      />
    </PropertyRow>
  );

  const room = roomFor(setup);
  const usable = isUsable(setup) && (room?.across ?? 0) > ((setup.columns ?? 1) - 1) * (setup.columnSpacing ?? 0);

  const apply = () => {
    if (editor && usable) void submit(() => editor.executeCommand('setPageSetup', { setup, selection }));
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && close()}
      title="페이지 설정"
      description="이 구역의 모든 페이지에 적용됩니다."
      footer={
        <>
          <DialogButton disabled={busy} onClick={close}>취소</DialogButton>
          <DialogButton variant="primary" data-page-apply disabled={!editor || !usable || busy} onClick={() => void apply()}>
            {busy ? '적용 중…' : '확인'}
          </DialogButton>
        </>
      }
    >
      <fieldset disabled={busy} className="w-page-settings" aria-busy={busy || undefined}>
        <PropertyRow label="용지">
          <ChoiceSelect
            ariaLabel="용지 크기"
            testClass="w-paper"
            options={PAPERS.map((one) => ({ id: one.id, label: one.label }))}
            // 이름 있는 용지가 아니면 아무것도 안 고른 상태 — 사용자 지정이라는 정직한 셋째 값.
            value={paperOf(setup) ?? null}
            onChange={(id) => setSetup((now) => withPaper(now, id))}
          />
        </PropertyRow>

        <PropertyRow label="방향">
          <ChoiceSelect
            ariaLabel="용지 방향"
            testClass="w-orientation"
            options={ORIENTATIONS.map((one) => ({ id: one.id, label: one.label }))}
            /* 저장된 이름이 아니라 **두 변에서** 읽는다 — 그리는 쪽이 그렇게 본다. */
            value={orientationOf(setup)}
            onChange={(id) => setSetup((now) => withOrientation(now, id as Orientation))}
          />
        </PropertyRow>

        <div className="w-page-margins">
          {margin('marginTop', '위')}
          {margin('marginBottom', '아래')}
          {margin('marginLeft', '왼쪽')}
          {margin('marginRight', '오른쪽')}
        </div>

        <PropertyRow label="제본용 여백">
          <PropertyNumber
            ariaLabel="제본용 여백"
            suffix="mm"
            min={0}
            value={mm(setup.gutter)}
            onCommit={(value) => setSetup((now) => ({ ...now, gutter: toTwips(value) }))}
          />
        </PropertyRow>

        <PropertyToggle ariaLabel="제본용 여백을 위쪽에" label="제본용 여백을 위쪽에"
          value={setup.gutterAtTop} disabled={busy} onChange={value => setSetup(now => ({ ...now, gutterAtTop: value }))} />

        <PropertyRow label="단">
          <PropertyNumber
            ariaLabel="단 수"
            min={1}
            value={setup.columns ?? 1}
            /* 0단이나 음수 단은 페이지가 아니다 — 하나는 있어야 글이 들어간다. */
            onCommit={(value) => setSetup((now) => ({ ...now, columns: Math.max(1, Math.round(value)) }))}
          />
        </PropertyRow>

        {(setup.columns ?? 1) > 1 ? (
          <>
            <PropertyRow label="단 간격">
              <PropertyNumber
                ariaLabel="단 간격"
                suffix="mm"
                min={0}
                value={mm(setup.columnSpacing)}
                onCommit={(value) => setSetup((now) => ({ ...now, columnSpacing: toTwips(value) }))}
              />
            </PropertyRow>
            <PropertyToggle ariaLabel="단 사이에 구분선" label="단 사이에 구분선"
              value={setup.columnSeparator} disabled={busy} onChange={value => setSetup(now => ({ ...now, columnSeparator: value }))} />
          </>
        ) : null}

        <div data-page-room>
          {usable && room ? <StatusIndicator>글이 놓이는 자리 {mm(room.across)} × {mm(room.down)} mm</StatusIndicator>
            : <StatusNotice tone="danger" title="설정을 확인하세요">
              {room === null ? '용지 크기를 정하세요.' : '여백 또는 단 간격이 너무 넓어 글을 놓을 자리가 없습니다.'}
            </StatusNotice>}
        </div>
      </fieldset>
      {problem && <StatusNotice className="w-page-error" tone="danger" title="적용하지 못했습니다">{problem}</StatusNotice>}
    </Dialog>
  );
}
