import { useState } from 'react';
import {
  Button,
  Choice,
  ChoiceSelect,
  ColorField,
  ColorPalette,
  ColorPicker,
  Dialog,
  DialogButton,
  Field,
  FieldGroup,
  Icon,
  IconButton,
  Menu,
  NumberField,
  PropertyChoice,
  PropertyColor,
  PropertyEmpty,
  PropertyGroup,
  PropertyNumber,
  PropertyPanel,
  PropertyRow,
  PropertyTabs,
  PropertyToggle,
  FilePick,
  StackList,
  StackRow,
  TextField,
  Waveform,
  Toolbar,
  ToolbarGroup,
  ToolbarSeparator,
  ToolbarToggle,
  ZoomControl
} from '@barocss/office-ui';
import { iconNames } from '@barocss/office-icons';

/**
 * Every control the suite has, in every state it has.
 *
 * ## What a gallery is for, and what it is not
 *
 * It is for **seeing the library as a library**. A component looked at inside the product that uses
 * it is a component you judge against that product's page; thirty-six of them side by side is the
 * only view in which "these two are the same control at two sizes" or "this one has no pressed
 * state" is a thing you notice rather than a thing you go looking for.
 *
 * It is not a test and it is not a product. Nothing here means anything — every control holds local
 * state so it can be pressed, and pressing it changes only itself.
 *
 * ## Why the states are laid out rather than hovered for
 *
 * A row that shows *default, hover, pressed, disabled* as four separate controls would be lying: two
 * of those are things a browser does, not things a component can be told. So the states that can be
 * *given* — on, mixed, off, disabled, empty, too-long — are drawn side by side, and the ones a
 * pointer produces are left to the pointer. What the eye is being asked is whether the four look
 * like one family.
 */
export function Gallery() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [density, setDensity] = useState<'comfortable' | 'compact'>('comfortable');

  return (
    <div className="ga-shell" data-theme={theme} data-density={density === 'compact' ? 'dense' : undefined}>
      <header className="ga-top">
        <h1>Barocss UI</h1>
        <p className="ga-count">36 controls</p>

        <div className="ga-switches">
          {/*
            The two things a shared library has to survive, and the two nothing could be checked
            against before this page: **the other theme**, and **the tighter density**. Both are
            token-level claims — a component that hardcodes a colour or a height passes every test in
            its product and breaks here.
          */}
          <ChoiceSelect
            value={theme}
            options={[
              { id: 'light', label: '밝게' },
              { id: 'dark', label: '어둡게' }
            ]}
            onChange={(one) => setTheme(one as 'light' | 'dark')}
            ariaLabel="테마"
          />
          <ChoiceSelect
            value={density}
            options={[
              { id: 'comfortable', label: '보통' },
              { id: 'compact', label: '좁게' }
            ]}
            onChange={(one) => setDensity(one as 'comfortable' | 'compact')}
            ariaLabel="밀도"
          />
        </div>
      </header>

      <main className="ga-body">
        <Section name="Toolbar" note="워드와 덱의 리본, 사이트의 도구 줄">
          <Toolbar label="갤러리">
            <ToolbarGroup id="marks">
              <ToolbarToggle id="b" label="굵게" shortcut="⌘B" state="on" onActivate={() => {}}>
                <Icon name="bold" size={16} />
              </ToolbarToggle>
              <ToolbarToggle id="i" label="기울임" shortcut="⌘I" state="off" onActivate={() => {}}>
                <Icon name="italic" size={16} />
              </ToolbarToggle>
              {/* The third state, and the one only a shared library has: several things selected
                  that do not agree. */}
              <ToolbarToggle id="u" label="밑줄" state="mixed" onActivate={() => {}}>
                <Icon name="underline" size={16} />
              </ToolbarToggle>
              <ToolbarToggle id="s" label="취소선" state="off" disabled onActivate={() => {}}>
                <Icon name="strike" size={16} />
              </ToolbarToggle>
            </ToolbarGroup>
            <ToolbarSeparator />
            <ToolbarGroup id="words">
              <ToolbarToggle id="text" label="글자만" state="off" onActivate={() => {}}>
                섹션
              </ToolbarToggle>
              <ToolbarToggle id="text2" label="글자만, 꺼짐" state="off" disabled onActivate={() => {}}>
                그리드
              </ToolbarToggle>
            </ToolbarGroup>
          </Toolbar>
        </Section>

        <Section name="Buttons" note="누르는 것들 — 같은 가족으로 보여야 하는 네 가지">
          <Row>
            <Button onClick={() => {}}>기본</Button>
            <Button tone="accent" onClick={() => {}}>
              강조
            </Button>
            <Button disabled onClick={() => {}}>
              꺼짐
            </Button>
            <IconButton label="지우기" onClick={() => {}}>
              <Icon name="delete" size={16} />
            </IconButton>
            <IconButton label="눌린 것" pressed onClick={() => {}}>
              <Icon name="shown" size={16} />
            </IconButton>
            <IconButton label="작게" size="sm" onClick={() => {}}>
              <Icon name="close" size={14} />
            </IconButton>
          </Row>
          <Row>
            {/* `Choice` is the native `<select>` of the pair; `ChoiceSelect` is the Radix one. Two
                controls that do one job, which is a thing this page exists to make visible. */}
            <Choice value="row" onChange={() => {}} ariaLabel="배치">
              <option value="column">세로</option>
              <option value="row">가로</option>
              <option value="grid">그리드</option>
            </Choice>
            <ChoiceSelect
              value="row"
              options={[
                { id: 'column', label: '세로' },
                { id: 'row', label: '가로' },
                { id: 'grid', label: '그리드' }
              ]}
              onChange={() => {}}
              ariaLabel="배치 (Radix)"
            />
          </Row>
        </Section>

        <Section name="Fields" note="읽고 고치는 것들. 숫자는 자릿수가 맞아야 합니다">
          <Row>
            <Field label="이름">
              <TextField value="히어로" onCommit={() => {}} ariaLabel="이름" />
            </Field>
            {/* The unit as the row's third column… */}
            <Field label="간격" unit="px">
              <NumberField value={32} onCommit={() => {}} ariaLabel="간격" />
            </Field>
            {/* …and as the field's own suffix, which is the other of the two and never both. */}
            <Field label="여백">
              {/* `null` is *not agreed*, which a set of three cards produces constantly. */}
              <NumberField value={null} onCommit={() => {}} suffix="px" ariaLabel="여백" />
            </Field>
            <Field label="꺼짐">
              <TextField value="" onCommit={() => {}} ariaLabel="꺼짐" disabled placeholder="비어 있음" />
            </Field>
          </Row>
          <Row>
            <FieldGroup label="긴 값">
              <TextField
                value="아주 긴 이름이 들어오면 잘려야 하고 줄을 넘기면 안 됩니다"
                onCommit={() => {}}
                ariaLabel="긴 값"
              />
            </FieldGroup>
          </Row>
        </Section>

        <Section name="Colour" note="색을 고르는 세 가지 — 값이 색이 아닐 수도 있습니다">
          <ColourBits />
        </Section>

        <Section name="Property panel" note="덱과 사이트의 오른쪽 패널">
          <PanelBits />
        </Section>

        <Section name="Stack" note="레이어와 목록">
          <StackBits />
        </Section>

        <Section name="Zoom, menu, dialog" note="나머지">
          <OtherBits />
        </Section>

        <Section name="Icons" note={`${iconNames().length}개 — 굵기가 하나로 보여야 합니다`}>
          <div className="ga-icons">
            {iconNames().map((name) => (
              <figure key={name}>
                <Icon name={name} size={18} />
                <figcaption>{name}</figcaption>
              </figure>
            ))}
          </div>
        </Section>
      </main>
    </div>
  );
}

function Section({ name, note, children }: { name: string; note: string; children: React.ReactNode }) {
  return (
    <section className="ga-section" data-section={name}>
      <header>
        <h2>{name}</h2>
        <p>{note}</p>
      </header>
      <div className="ga-stage">{children}</div>
    </section>
  );
}

const Row = ({ children }: { children: React.ReactNode }) => <div className="ga-row">{children}</div>;

function ColourBits() {
  const [fill, setFill] = useState<string | null>('#2563eb');
  const [followed, setFollowed] = useState<string | null>('var:강조');
  const [open, setOpen] = useState(false);

  const tokens = [
    { value: 'var:강조', colour: '#2563eb', label: '강조색' },
    { value: 'var:바탕', colour: '#f8fafc', label: '카드 바탕' },
    { value: 'var:먹', colour: '#0f172a', label: '어두운 바탕' }
  ];

  return (
    <>
      <Row>
        <Field label="색">
          <ColorField value={fill} onChange={setFill} onClear={() => setFill(null)} ariaLabel="색" />
        </Field>
        <Field label="따라가는 색">
          {/* The distinction the control exists for: two blocks the same blue are a coincidence,
              two on `var:강조` are a decision — so the trigger says the name, not the hex. */}
          <ColorField
            value={followed}
            varSwatches={tokens}
            onChange={setFollowed}
            onClear={() => setFollowed(null)}
            ariaLabel="따라가는 색"
          />
        </Field>
        <Field label="없음">
          <ColorField value={null} onChange={() => {}} ariaLabel="없음" />
        </Field>
      </Row>
      {/*
        `ColorPalette` is drawn **inside a toolbar**, and it has to be.
        
        Found by this page on its first run: it is built out of Radix's toolbar primitives, so used
        anywhere else it throws `RovingFocusGroupItem must be used within RovingFocusGroup` and takes
        the whole render down with it. Nothing in its props or its name says so — it is the only
        control in the library with a container requirement, and until there was a page that drew
        every control, there was nowhere for that to show up.
      */}
      <Toolbar label="색 고르기">
        <ToolbarGroup id="colour">
          <ColorPalette
            id="text-colour"
            label="글자색"
            icon={<Icon name="bold" size={16} />}
            value="#b22222"
            swatches={[
              { value: '#18181b', label: '먹' },
              { value: '#b22222', label: '빨강' },
              { value: '#2563eb', label: '파랑' },
              { value: '#15803d', label: '초록' },
              { value: '#a16207', label: '갈색' }
            ]}
            clearLabel="없음"
            onPick={() => {}}
            onClear={() => {}}
          />
        </ToolbarGroup>
      </Toolbar>
      <Row>
        <Button onClick={() => setOpen((was) => !was)}>{open ? '고르개 닫기' : '고르개 열기'}</Button>
      </Row>
      {open ? (
        <div className="ga-picker">
          <ColorPicker value={fill ?? '#2563eb'} onChange={setFill} varSwatches={tokens} />
        </div>
      ) : null}
    </>
  );
}

function PanelBits() {
  const [tab, setTab] = useState('block');
  const [choice, setChoice] = useState('row');
  const [on, setOn] = useState(true);

  return (
    <div className="ga-panels">
      <PropertyPanel title="속성">
        <PropertyTabs
          tabs={[
            { id: 'block', label: '블록' },
            { id: 'style', label: '모양' },
            { id: 'data', label: '데이터' }
          ]}
          active={tab}
          onChange={setTab}
        />
        <PropertyGroup label="배치">
          <PropertyRow label="방향">
            <PropertyChoice
              value={choice}
              options={[
                { id: 'column', label: '세로' },
                { id: 'row', label: '가로' }
              ]}
              onChange={setChoice}
              ariaLabel="방향"
            />
          </PropertyRow>
          <PropertyRow label="간격">
            <PropertyNumber value={16} onCommit={() => {}} suffix="px" ariaLabel="간격" />
          </PropertyRow>
          <PropertyRow label="맞춤 없음">
            <PropertyNumber value={null} onCommit={() => {}} suffix="px" ariaLabel="맞춤 없음" />
          </PropertyRow>
          <PropertyRow label="배경">
            <PropertyColor value="#f8fafc" onChange={() => {}} onClear={() => {}} ariaLabel="배경" />
          </PropertyRow>
          <PropertyRow label="테두리">
            <PropertyToggle value={on} onChange={setOn} label="보이기" ariaLabel="테두리" />
          </PropertyRow>
        </PropertyGroup>
        <PropertyGroup label="비어 있을 때">
          <PropertyEmpty>블록을 선택하면 그 블록의 속성이 여기에 나옵니다.</PropertyEmpty>
        </PropertyGroup>
      </PropertyPanel>
    </div>
  );
}

function StackBits() {
  const [shown, setShown] = useState(true);
  return (
    <div className="ga-stack">
      <StackList empty="아직 아무것도 없습니다.">
        <StackRow index={0} name="칠" visible={shown} onVisible={setShown} onRemove={() => {}}>
          <span>단색 채우기</span>
        </StackRow>
        <StackRow index={1} name="칠" visible onRemove={() => {}} dragging>
          <span>끌고 있는 줄</span>
        </StackRow>
        <StackRow index={2} name="칠" disabled>
          <span>못 만지는 줄</span>
        </StackRow>
      </StackList>
      <StackList empty="아직 아무것도 없습니다.">{null}</StackList>
    </div>
  );
}

/**
 * A shape, not a recording.
 *
 * Generated rather than sampled so the page has no asset to load and no network to wait for, and
 * shaped like a spoken phrase — a swell, a gap, a second swell — because a flat block of noise would
 * make the trim handles look right whatever they did.
 */
const PEAKS = Array.from({ length: 160 }, (_, i) => {
  const t = i / 160;
  const phrase = Math.exp(-((t - 0.22) ** 2) / 0.01) + 0.8 * Math.exp(-((t - 0.68) ** 2) / 0.02);
  return Math.min(1, phrase * (0.55 + 0.45 * Math.abs(Math.sin(i * 1.7))));
});

function OtherBits() {
  const [zoom, setZoom] = useState(0.75);
  const [window_, setWindow] = useState({ from: 0.12, to: 0.82 });
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
  const [dialog, setDialog] = useState(false);

  return (
    <>
      <Row>
        <ZoomControl zoom={zoom} onChange={setZoom} onFit={() => setZoom(1)} fitLabel="맞춤" />
        {/*
          `FilePick` and `Waveform` were the two controls this page did not draw, and a control a
          gallery does not draw is a control the gallery cannot find anything wrong with — which is
          the whole argument for the page. Four of the six it still misses are `AppShell` and its
          parts, which *are* the page's own layout and cannot be drawn inside themselves.
        */}
        <FilePick accept="image/*" onPick={() => {}} ariaLabel="그림 고르기">
          그림…
        </FilePick>
        {/* `Button` takes no event — a menu needs where the pointer was, so this is the one place
            the gallery reaches for a plain element. Worth noticing: a control that cannot say
            *where* it was pressed cannot open a menu at the pointer. */}
        <button
          type="button"
          className="ga-plain"
          onClick={(event) => setMenuAt({ x: event.clientX, y: event.clientY })}
        >
          메뉴
        </button>
        <Button onClick={() => setDialog(true)}>대화상자</Button>
      </Row>

      <Row>
        <Waveform
          peaks={PEAKS}
          window={window_}
          onChange={setWindow}
          label="예시 소리"
          className="ga-wave"
        />
      </Row>

      {menuAt ? (
        <Menu
          at={menuAt}
          label="예시 메뉴"
          blocks={[
            {
              id: 'edit',
              items: [
                { id: 'copy', label: '복사', hint: '⌘C' },
                { id: 'paste', label: '붙여넣기', hint: '⌘V', disabled: true }
              ]
            },
            { id: 'danger', items: [{ id: 'delete', label: '삭제', hint: 'Delete' }] }
          ]}
          onPick={() => setMenuAt(null)}
          onClose={() => setMenuAt(null)}
        />
      ) : null}

      <Dialog
        open={dialog}
        onOpenChange={setDialog}
        title="이름 바꾸기"
        footer={
          <>
            <DialogButton onClick={() => setDialog(false)}>취소</DialogButton>
            <DialogButton variant="primary" onClick={() => setDialog(false)}>
              바꾸기
            </DialogButton>
          </>
        }
      >
        <Field label="이름">
          <TextField value="머리말" onCommit={() => {}} ariaLabel="이름" />
        </Field>
      </Dialog>
    </>
  );
}
