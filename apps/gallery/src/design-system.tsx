import { TextAreaSpecimens } from './textarea-specimens';
import { PanelActionSpecimens } from './panel-action-specimens';
import { TaskSpecimens } from './task-specimens';
import { CommandSpecimens } from './command-specimens';
import { FileSpecimens } from './file-specimens';
import { SearchSpecimens } from './search-specimens';
import { MotionSpecimens } from './motion-specimens';
import { SelectionSpecimens } from './selection-specimens';
import { WorkspaceSpecimens } from './workspace-specimens';
import { OverflowSpecimens } from './overflow-specimens';
import { DataTableSpecimens } from './data-table-specimens';
import { PropertySpecimens } from './property-specimens';
import { ContextSpecimens } from './context-specimens';
import { LayerSpecimens } from './layer-specimens';
import { NavigationSpecimens } from './navigation-specimens';
import { StatusSpecimens } from './status-specimens';
import { ModalSpecimens } from './modal-specimens';
import { ColorMenuSpecimens } from './color-menu-specimens';
import { FieldSpecimens } from './field-specimens';
import { ButtonSpecimens } from './button-specimens';
import { useEffect, useState, type ReactNode } from 'react';
import {
  Button, ChoiceSelect, Dialog, DialogButton, Icon, IconButton, MenuBar,
  NumberField, PropertyGroup, PropertyNumber, PropertyPanel, PropertyRow,
  PropertyToggle, RibbonGroup, RibbonToolbar, TextField, Toolbar, ToolbarToggle,
} from '@barocss/office-ui';

const tokens = [
  ['--ou-panel', '작업 표면'], ['--ou-ground', '배경'], ['--ou-line', '구분선'],
  ['--ou-ink', '주요 텍스트'], ['--ou-muted', '보조 텍스트'], ['--ou-accent', '강조'],
  ['--ou-accent-soft', '선택 배경'], ['--ou-danger', '오류'],
];
const sizes = [
  ['--ou-header-height', '앱 헤더'], ['--ou-toolbar-height', '기본 도구 모음'],
  ['--ou-inspector-control-height', '속성 입력칸'],
  ['--ou-command-height', '도구 버튼'], ['--ou-command-text', '도구 텍스트'],
  ['--ou-command-radius', '도구 모서리'], ['--ou-inspector-width', '속성 패널'],
  ['--ou-quick', '상태 전환'], ['--ou-motion-enter', '표면 열기'],
];

function Section({ id, number, title, description, children }: { id: string; number: string; title: string; description: string; children: ReactNode }) {
  return <section id={id} className="ds-section"><header><span>{number}</span><div><h2>{title}</h2><p>{description}</p></div></header>{children}</section>;
}

/** A working reference built from shipped components, with isolated sample state. */
export function DesignSystem() {
  const [theme, setTheme] = useState('light');
  const [values, setValues] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState(true);
  const [checked, setChecked] = useState(true);
  const [unchecked, setUnchecked] = useState(false);
  const [mixed, setMixed] = useState<'mixed' | 'on' | 'off'>('mixed');
  const [name, setName] = useState('분기 계획');
  const [invalidName, setInvalidName] = useState('');
  const [message, setMessage] = useState('샘플의 값은 이 화면에서만 바뀝니다.');
  const [dialog, setDialog] = useState(false);
  const [bold, setBold] = useState(false);
  const [align, setAlign] = useState('left');
  const [width, setWidth] = useState(240);
  const [radius, setRadius] = useState(12);
  const [outline, setOutline] = useState(true);
  const [size, setSize] = useState('16');
  useEffect(() => {
    const previous = document.documentElement.dataset.theme;
    document.documentElement.dataset.theme = theme;
    const style = getComputedStyle(document.documentElement);
    setValues(Object.fromEntries([...tokens, ...sizes].map(([token]) => [token, style.getPropertyValue(token).trim()])));
    return () => { if (previous) document.documentElement.dataset.theme = previous; else delete document.documentElement.dataset.theme; };
  }, [theme]);
  useEffect(() => {
    const target = document.getElementById(location.hash.slice(1));
    target?.scrollIntoView({ block: 'start' });
  }, []);
  const reset = () => { setBold(false); setAlign('left'); setWidth(240); setRadius(12); setOutline(true); setSize('16'); setMessage('작업 예시를 초기화했습니다.'); };
  return <div className="ds-shell">
    <header className="ds-top"><a href="./" className="ds-brand">wonffice<span>Interface system</span></a><span className="ds-version">기준안 01</span>
      <div className="ds-top-actions"><a href="?catalogue">전체 컴포넌트</a><ChoiceSelect ariaLabel="시스템 테마" value={theme} options={[{ id: 'light', label: '밝은 테마' }, { id: 'dark', label: '어두운 테마' }]} onChange={setTheme} /></div>
    </header>
    <div className="ds-layout"><aside className="ds-navigation"><p>DESIGN SYSTEM</p><nav aria-label="디자인 기준"><a href="#foundations">01 기본 값</a><a href="#states">02 컴포넌트 상태</a><a href="#buttons">버튼 상세</a><a href="#fields">입력·선택 상세</a><a href="#multiline">다중행 입력</a><a href="#colors">색상·메뉴 상세</a><a href="#modals">다이얼로그·Drawer</a><a href="#feedback">로딩·저장·복구</a><a href="#navigation">탭·목록·빈 상태</a><a href="#layers">트리·레이어</a><a href="#context">툴팁·문맥 도구</a><a href="#properties">복합 속성 패널</a><a href="#data-table">데이터 표</a><a href="#overflow">좁은 도구 모음</a><a href="#workspace">작업 공간 배치</a><a href="#selection-tools">객체 선택 도구</a><a href="#motion">모션</a><a href="#search-select">검색·태그</a><a href="#files">파일·미디어</a><a href="#commands">명령 검색</a><a href="#tasks">작업 상태</a><a href="#panel-actions">팝업 작업 영역</a><a href="#patterns">03 작업 예시</a><a href="#rules">04 사용 규칙</a></nav><div className="ds-navigation-note">실제 office-ui 컴포넌트<br/>로컬 샘플 · 문서 저장 없음</div></aside>
    <main className="ds-main"><div className="ds-intro"><span>WONFFICE / OFFICE-UI</span><h1>인터페이스 기준</h1><p>같은 역할의 도구는 같은 모양과 동작을 갖습니다.<br/>실제 컴포넌트를 조작하며 상태와 작업 흐름을 확인합니다.</p></div>
      <Section id="foundations" number="01" title="기본 값" description="표시된 값은 현재 테마의 CSS 토큰에서 직접 읽습니다.">
        <div className="ds-swatches">{tokens.map(([token, label]) => <div key={token}><div className="ds-swatch" style={{ background: `var(${token})` }} /><strong>{label}</strong><code>{token}</code><span>{values[token]}</span></div>)}</div>
        <div className="ds-measures">{sizes.map(([token, label]) => <div key={token}><span>{label}</span><strong>{values[token]}</strong><code>{token}</code></div>)}</div>
      </Section>
      <Section id="states" number="02" title="컴포넌트 상태" description="마우스를 올리고 Tab 키로 이동해 보세요. hover와 focus는 브라우저의 실제 상태로 확인합니다.">
        <div className="ds-surface ds-state-table">
          <div className="ds-state-labels"><span>종류</span><span>기본</span><span>선택</span><span>혼합 / 오류</span><span>비활성</span></div>
          <div className="ds-state-row"><strong>동작</strong><Button onClick={() => setDialog(true)}>이름 변경</Button><Button tone="accent" onClick={() => setMessage('샘플 설정을 적용했습니다.')}>적용</Button><Button onClick={() => { setSelected(true); setMixed('mixed'); setInvalidName(''); setMessage('상태 예시를 초기화했습니다.'); }}>초기화</Button><Button disabled>공유</Button></div>
          <div className="ds-state-row"><strong>선택 도구</strong><IconButton label="기본 굵게" onClick={() => setMessage('기본 도구를 눌렀습니다.')}><Icon name="bold" /></IconButton><IconButton label="선택 상태" pressed={selected} onClick={() => setSelected(!selected)}><Icon name="align-center" /></IconButton><Toolbar label="혼합 상태"><ToolbarToggle id="mixed-bold" label="혼합 굵게" state={mixed} onActivate={() => setMixed(mixed === 'on' ? 'off' : 'on')}><Icon name="bold" /></ToolbarToggle></Toolbar><IconButton label="비활성 삭제" disabled><Icon name="delete" /></IconButton></div>
          <div className="ds-state-row"><strong>체크박스</strong><PropertyToggle ariaLabel="기본 체크박스" label="표시" value={unchecked} onChange={setUnchecked} /><PropertyToggle ariaLabel="선택 체크박스" label="표시" value={checked} onChange={setChecked} /><span className="ds-state-note">Space 키로 전환</span><div><PropertyToggle ariaLabel="비활성 선택 체크박스" label="선택됨" value={true} disabled onChange={() => {}} /><PropertyToggle ariaLabel="비활성 기본 체크박스" label="꺼짐" value={false} disabled onChange={() => {}} /></div></div>
          <div className="ds-state-row ds-fields"><strong>텍스트</strong><TextField ariaLabel="기본 문서명" value={name} onCommit={setName} /><TextField ariaLabel="읽기 전용 문서명" value="공유 문서" readOnly /><div><TextField ariaLabel="필수 문서명" value={invalidName} onChange={setInvalidName} invalid={!invalidName.trim()} describedBy={!invalidName.trim() ? 'ds-name-error' : undefined} placeholder="문서 이름" />{!invalidName.trim() && <small id="ds-name-error">이름을 입력하세요.</small>}</div><TextField ariaLabel="비활성 문서명" value="권한 없음" disabled /></div>
          <div className="ds-state-row ds-fields"><strong>숫자</strong><NumberField ariaLabel="기본 너비" value={width} onCommit={setWidth} min={80} max={320} /><span className="ds-state-note">선택 값은 작업 예시와 연결</span><NumberField ariaLabel="혼합 너비" value={null} onCommit={value => setMessage(`혼합 너비를 ${value}px로 지정했습니다.`)} /><NumberField ariaLabel="비활성 너비" value={240} disabled onCommit={() => {}} /></div>
        </div><p role="status" className="ds-feedback">{message}</p>
      </Section>
      <Section id="buttons" number="02.1" title="버튼 상세" description="버튼 종류와 상태를 같은 기준으로 비교합니다. 속성 패널과 다이얼로그에서도 같은 색을 유지해야 합니다."><ButtonSpecimens /></Section>
      <Section id="multiline" number="02.20" title="다중행 입력" description="Enter는 줄바꿈, Ctrl/⌘+Enter 또는 포커스 이동은 적용, Escape는 취소입니다."><TextAreaSpecimens /></Section>
      <Section id="fields" number="02.2" title="입력·선택 상세" description="긴 값, 혼합 값, 읽기 전용과 오류를 확인합니다. 입력 중인 값과 적용된 값을 구분합니다."><FieldSpecimens /></Section>
      <Section id="colors" number="02.3" title="색상·메뉴 상세" description="색상표, HEX 입력과 불투명도를 함께 확인합니다. 팝업을 열고 키보드로 이동해 보세요."><ColorMenuSpecimens /></Section>
      <Section id="modals" number="02.4" title="다이얼로그·Drawer" description="본문 스크롤, 포커스 복귀와 중첩 팝업의 닫기 순서를 확인합니다."><ModalSpecimens /></Section>
      <Section id="feedback" number="02.5" title="로딩·저장·복구" description="진행 상태를 구분하고, 실패한 작업을 현재 입력을 유지한 채 다시 시도합니다."><StatusSpecimens /></Section>
      <Section id="navigation" number="02.6" title="탭·목록·빈 상태" description="탭 이동과 목록 선택을 확인합니다. 검색 결과가 없어도 다음 동작을 제공합니다."><NavigationSpecimens /></Section>
      <Section id="layers" number="02.7" title="트리·레이어" description="객체 선택과 숨김·잠금 도구를 구분합니다. 접기·펼치기는 선택한 객체를 바꾸지 않습니다."><LayerSpecimens /></Section>
      <Section id="context" number="02.8" title="툴팁·문맥 도구" description="설명은 화면 안에 표시합니다. 문맥 도구는 편집 대상과 입력 상태에 맞춰 열고 닫습니다."><ContextSpecimens /></Section>
      <Section id="properties" number="02.9" title="복합 속성 패널" description="긴 그룹 제목, 여러 객체의 혼합 값과 범위가 정해진 초기화를 확인합니다."><PropertySpecimens /></Section>
      <Section id="data-table" number="02.10" title="데이터 표" description="행 선택, 셀 포커스, 입력 중인 값과 계산 결과를 구분합니다."><DataTableSpecimens /></Section>
      <Section id="overflow" number="02.11" title="좁은 도구 모음" description="숨은 도구의 위치를 찾고, 기존 선택과 입력 상태를 유지합니다."><OverflowSpecimens /></Section>
      <Section id="selection-tools" number="02.13" title="객체 선택 도구" description="선택 상태와 확대율에 따른 테두리·핸들을 비교합니다."><SelectionSpecimens /></Section>
      <Section id="panel-actions" number="02.19" title="팝업 작업 영역" description="임시 값을 편집한 뒤 초기화·취소·적용합니다. 오류가 발생하면 입력을 유지합니다."><PanelActionSpecimens /></Section>
      <Section id="tasks" number="02.18" title="작업 상태" description="처리 중·완료·실패를 표시하고 가능한 다음 작업을 제공합니다."><TaskSpecimens /></Section>
      <Section id="commands" number="02.17" title="명령 검색" description="현재 상태에서 실행할 작업을 이름으로 찾습니다."><CommandSpecimens /></Section>
      <Section id="files" number="02.16" title="파일·미디어 선택" description="파일을 가져오거나 문서 안의 이미지를 선택합니다."><FileSpecimens /></Section>
      <Section id="search-select" number="02.15" title="검색형 선택과 태그" description="긴 목록에서 자료를 찾고 선택한 항목을 관리합니다."><SearchSpecimens /></Section>
      <Section id="motion" number="02.14" title="모션" description="실제 컴포넌트를 열고 닫으며 반응 속도와 키보드 동작을 비교합니다."><MotionSpecimens /></Section>
      <Section id="workspace" number="02.12" title="작업 공간 배치" description="화면 너비에 맞춰 패널을 접고 편집 영역을 확보합니다."><WorkspaceSpecimens /></Section>
      <Section id="patterns" number="03" title="작업 예시" description="Word의 한 줄 도구와 Slides의 속성 편집을 같은 컴포넌트로 구성합니다. 제품 렌더러를 대체하는 화면은 아닙니다.">
        <div className="ds-surface ds-editor-example">
          <div className="ds-example-heading"><strong>Word · 기본 서식</strong><MenuBar label="예시 문서 메뉴" menus={[{ id: 'sample', label: '문서', blocks: [{ id: 'actions', items: [{ id: 'rename', label: '이름 변경' }, { id: 'reset', label: '작업 예시 초기화' }] }] }]} onPick={id => id === 'rename' ? setDialog(true) : reset()} /></div>
          <RibbonToolbar compact label="문서 예시 도구"><RibbonGroup id="sample-font" label="글자 크기"><ChoiceSelect ariaLabel="예시 글자 크기" value={size} options={[{ id: '14', label: '14' }, { id: '16', label: '16' }, { id: '20', label: '20' }]} onChange={setSize} /></RibbonGroup><RibbonGroup id="sample-bold" label="글자"><ToolbarToggle id="sample-bold" label="예시 굵게" state={bold ? 'on' : 'off'} onActivate={() => setBold(!bold)}><Icon name="bold" /></ToolbarToggle></RibbonGroup><RibbonGroup id="sample-align" label="정렬">{['left', 'center', 'right'].map(value => <ToolbarToggle id={`sample-${value}`} key={value} label={`예시 ${value === 'left' ? '왼쪽' : value === 'center' ? '가운데' : '오른쪽'} 정렬`} state={align === value ? 'on' : 'off'} onActivate={() => setAlign(value)}><Icon name={`align-${value}`} /></ToolbarToggle>)}</RibbonGroup></RibbonToolbar>
          <div className="ds-document"><span>기획 문서 / 2026</span><h3>{name}</h3><p data-sample-paragraph style={{ fontSize: Number(size), fontWeight: bold ? 650 : 400, textAlign: align as 'left' | 'center' | 'right' }}>이번 분기에는 문서 작성과 팀의 검토 과정을 하나로 연결합니다. 작은 도구도 같은 규칙으로 작동해야 합니다.</p><div className="ds-document-rule" /></div>
        </div>
        <div className="ds-surface ds-object-example"><div className="ds-object-stage"><span>Slides · 선택한 객체</span><div data-sample-object className="ds-sample-object" style={{ width, borderRadius: radius, outline: outline ? '1px solid var(--ou-accent)' : 'none' }}><span>01 / PRODUCT</span><h3>함께 만드는 업무 공간</h3><p>문서에서 실행까지</p></div><span className="ds-object-measure">{width}px · 모서리 {radius}px</span></div>
          <PropertyPanel title="객체 속성"><PropertyGroup label="배치"><PropertyRow label="너비"><PropertyNumber ariaLabel="객체 너비" value={width} min={80} max={320} suffix="px" onCommit={setWidth} /></PropertyRow><PropertyRow label="모서리"><PropertyNumber ariaLabel="객체 모서리" value={radius} min={0} max={48} suffix="px" onCommit={setRadius} /></PropertyRow></PropertyGroup><PropertyGroup label="표시"><PropertyRow label="선택 표시"><PropertyToggle ariaLabel="객체 선택 표시" label="표시" value={outline} onChange={setOutline} /></PropertyRow></PropertyGroup></PropertyPanel>
        </div>
      </Section>
      <Section id="rules" number="04" title="사용 규칙" description="컴포넌트 기준을 정한 뒤 실제 제품 화면에서 다시 확인합니다."><div className="ds-rules"><article><h3>의미부터 선택</h3><p>실행은 버튼, 단일 선택은 선택 상자, 상태 전환은 토글을 사용합니다. 색만으로 의미를 구분하지 않습니다.</p></article><article><h3>제품에서 다시 꾸미지 않기</h3><p>제품은 명령과 데이터를 연결합니다. 버튼 높이·색·모서리 변경은 공통 컴포넌트에서 검토합니다.</p></article><article><h3>상태를 함께 검증</h3><p>기본·선택·혼합·비활성·오류를 밝은 테마와 어두운 테마에서 확인합니다. 키보드 동작도 함께 확인합니다.</p></article></div></Section>
    </main></div>
    <Dialog open={dialog} onOpenChange={setDialog} title="샘플 이름 변경" description="실제 문서는 변경되지 않습니다."><TextField ariaLabel="샘플 이름" value={name} onChange={setName} /><div className="ds-dialog-actions"><DialogButton onClick={() => setDialog(false)}>닫기</DialogButton></div></Dialog>
  </div>;
}
