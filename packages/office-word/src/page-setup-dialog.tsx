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
  PAPERS,
  TWIPS_PER_INCH,
  isUsable,
  orientationOf,
  paperOf,
  roomFor,
  withOrientation,
  withPaper,
  type Orientation,
  type PageSetup
} from './page-setup-model';
import { currentPageSetup } from './page-setup-commands';

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
  const [setup, setSetup] = useState<PageSetup>(() => currentPageSetup(editor));

  const [was, setWas] = useState(open);
  if (was !== open) {
    setWas(open);
    if (open) setSetup(currentPageSetup(editor));
  }

  /** 트윕을 밀리미터로, 그리고 되돌려서 — 독자가 여백을 재는 단위. */
  const mm = (twips: number | null): number =>
    twips === null ? 0 : Math.round((twips / TWIPS_PER_INCH) * 25.4 * 10) / 10;
  const toTwips = (value: number): number => Math.round((value / 25.4) * TWIPS_PER_INCH);

  const margin = (key: 'marginTop' | 'marginBottom' | 'marginLeft' | 'marginRight', label: string) => (
    <PropertyRow label={label}>
      <PropertyNumber
        ariaLabel={`${label} 여백`}
        suffix="mm"
        value={mm(setup[key])}
        onCommit={(value) => setSetup((now) => ({ ...now, [key]: toTwips(value) }))}
      />
    </PropertyRow>
  );

  const room = roomFor(setup);
  const usable = isUsable(setup);

  const apply = () => {
    void editor?.executeCommand?.('setPageSetup', { setup });
    onClose();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title="페이지 설정"
      description="이 구역의 모든 페이지에 적용됩니다."
      footer={
        <>
          <DialogButton onClick={onClose}>취소</DialogButton>
          <DialogButton variant="primary" data-page-apply disabled={!usable} onClick={apply}>
            확인
          </DialogButton>
        </>
      }
    >
      <div className="flex min-w-80 flex-col gap-3">
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

        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          {margin('marginTop', '위')}
          {margin('marginBottom', '아래')}
          {margin('marginLeft', '왼쪽')}
          {margin('marginRight', '오른쪽')}
        </div>

        <PropertyRow label="제본용 여백">
          <PropertyNumber
            ariaLabel="제본용 여백"
            suffix="mm"
            value={mm(setup.gutter)}
            onCommit={(value) => setSetup((now) => ({ ...now, gutter: toTwips(value) }))}
          />
        </PropertyRow>

        <label className="flex items-center gap-2 text-[length:var(--ou-text-small)] text-[color:var(--ou-ink)]">
          <input
            type="checkbox"
            data-gutter-top
            checked={setup.gutterAtTop === true}
            onChange={(event) =>
              setSetup((now) => ({ ...now, gutterAtTop: event.currentTarget.checked }))
            }
          />
          제본용 여백을 위쪽에
        </label>

        <PropertyRow label="단">
          <PropertyNumber
            ariaLabel="단 수"
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
                value={mm(setup.columnSpacing)}
                onCommit={(value) => setSetup((now) => ({ ...now, columnSpacing: toTwips(value) }))}
              />
            </PropertyRow>
            <label className="flex items-center gap-2 text-[length:var(--ou-text-small)] text-[color:var(--ou-ink)]">
              <input
                type="checkbox"
                data-column-separator
                checked={setup.columnSeparator === true}
                onChange={(event) =>
                  setSetup((now) => ({ ...now, columnSeparator: event.currentTarget.checked }))
                }
              />
              단 사이에 구분선
            </label>
          </>
        ) : null}

        {/**
         * **꺼진 단추는 이유를 말해야 한다.** 확인이 왜 눌리지 않는지 모른 채 닫는 독자에게는
         * 이 대화상자가 고장난 것이다.
         */}
        <p
          data-page-room
          className={[
            'text-[length:var(--ou-text-small)]',
            usable ? 'text-[color:var(--ou-muted)]' : 'text-[color:var(--ou-danger,#c92a2a)]'
          ].join(' ')}
        >
          {room === null
            ? '용지 크기를 정하세요.'
            : usable
              ? `글이 놓이는 자리 ${mm(room.across)} × ${mm(room.down)} mm`
              : '여백이 용지보다 넓어 글을 놓을 자리가 없습니다.'}
        </p>
      </div>
    </Dialog>
  );
}
