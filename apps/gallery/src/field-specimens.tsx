import { useState } from 'react';
import { Button, ChoiceSelect, NumberField, PropertyGroup, PropertyPanel, PropertyRow, TextField } from '@barocss/office-ui';

const options = [
  { id: 'brief', label: '간단한 요약' },
  { id: 'long', label: '이번 분기 제품 출시 계획과 팀별 검토 내용을 함께 정리한 문서' },
  { id: 'disabled', label: '권한이 필요한 항목', disabled: true },
  ...Array.from({ length: 18 }, (_, i) => ({ id: `template-${i}`, label: `문서 템플릿 ${i + 1}` })),
];
export function FieldSpecimens() {
  const [name, setName] = useState('분기 계획');
  const [search, setSearch] = useState('');
  const [number, setNumber] = useState(12.34567);
  const [mixed, setMixed] = useState<number | null>(null);
  const [choice, setChoice] = useState<string | null>('long');
  const [count, setCount] = useState(0);
  const [requiredName, setRequiredName] = useState('');
  const [requiredChoice, setRequiredChoice] = useState<string | null>(null);
  const commitName = (value: string) => { setName(value); setCount(n => n + 1); };
  const commitNumber = (value: number) => { setNumber(value); setCount(n => n + 1); };
  return <div className="ds-field-examples">
    <div className="ds-surface ds-field-cases">
      <div><strong>텍스트 입력</strong><TextField ariaLabel="확정형 문서 이름" value={name} onCommit={commitName} /><p>Enter 또는 다른 곳을 누르면 적용합니다. Esc는 취소합니다.</p><TextField ariaLabel="실시간 문서 검색" value={search} onChange={setSearch} placeholder="문서 검색" /><p data-field-search>검색어: {search || '없음'}</p></div>
      <div><strong>숫자 입력</strong><NumberField ariaLabel="정밀한 길이" value={number} decimals={2} min={0} max={100} step={.1} prefix="W" suffix="cm" onCommit={commitNumber} /><p>0–100cm · 화면은 소수 둘째 자리까지 표시합니다. 편집 전 값의 정밀도는 유지합니다.</p><NumberField ariaLabel="혼합 길이" value={mixed} suffix="cm" onCommit={setMixed} onClear={() => setMixed(null)} /><p>여러 값은 —로 표시합니다. 이 예시는 빈 값을 허용합니다.</p></div>
      <div><strong>선택 상자</strong><ChoiceSelect ariaLabel="긴 문서 형식" value={choice} options={options} onChange={setChoice} className="w-full" /><p>긴 값은 입력칸에서 줄여 표시하고, 펼친 목록에서 전체 이름을 보여줍니다.</p><Button tone="quiet" onClick={() => setChoice(null)}>혼합 선택 확인</Button></div>
      <p>숫자는 ↑·↓로 조정합니다. Shift는 10배, Alt는 1/10 단위로 조정합니다. Enter·Tab은 적용하고 Esc는 취소합니다.</p>
      <p role="status" data-field-result>적용 횟수: {count} · 이름: {name} · 저장 값: {number}</p>
    </div>
    <PropertyPanel title="입력 상태 비교"><PropertyGroup label="읽기와 권한">
      <PropertyRow label="읽기 전용"><TextField ariaLabel="읽기 전용 예시" value="검토 완료" readOnly /></PropertyRow>
      <PropertyRow label="비활성"><TextField ariaLabel="비활성 입력 예시" value="편집 권한 없음" disabled /></PropertyRow>
      <PropertyRow label="선택"><ChoiceSelect ariaLabel="비활성 선택 예시" value="brief" options={options} onChange={() => {}} disabled className="w-full" /></PropertyRow>
    </PropertyGroup><PropertyGroup label="오류 표시"><TextField ariaLabel="오류 입력 예시" value={requiredName} onChange={setRequiredName} invalid={!requiredName.trim()} describedBy={!requiredName.trim() ? "field-example-error" : undefined} placeholder="이름 입력" />{!requiredName.trim() && <p id="field-example-error" className="ds-field-error">이름을 입력하세요.</p>}<ChoiceSelect ariaLabel="오류 선택 예시" value={requiredChoice} options={options} onChange={setRequiredChoice} invalid={requiredChoice === null} describedBy={requiredChoice === null ? "field-choice-error" : undefined} className="w-full" />{requiredChoice === null && <p id="field-choice-error" className="ds-field-error">문서 형식을 선택하세요.</p>}</PropertyGroup></PropertyPanel>
  </div>;
}
