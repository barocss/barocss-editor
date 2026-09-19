import { useState } from 'react';
import { Button, ColorField, ColorPicker, Menu, PropertyPanel, PropertyGroup, PropertyRow } from '@barocss/office-ui';

const theme = [
  { value: 'theme:accent1', colour: '#2563eb', label: '코발트' },
  { value: 'theme:accent2', colour: '#15803d', label: '초록' },
  { value: 'theme:accent3', colour: '#b45309', label: '주황' },
];
const variables = [{ value: 'var:brand', colour: '#7c3aed', label: '브랜드 보조색' },
  { value: 'var:campaign', colour: '#0891b2', label: '제품 출시 캠페인과 팀 문서에서 함께 사용하는 강조색' }];
export function ColorMenuSpecimens() {
  const [color, setColor] = useState<string | null>('theme:accent1');
  const [inline, setInline] = useState('#2563eb');
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [message, setMessage] = useState('명령을 선택하세요.');
  const paint = [...theme, ...variables].find(item => item.value === color)?.colour ?? color ?? 'transparent';
  return <div className="ds-color-examples">
    <div className="ds-surface ds-color-sample">
      <h3>색과 값의 일치</h3>
      <p>HEX · RGB(A) · HSL · HSB · OKHSL 형식을 선택합니다. 형식 전환은 표시만 바꾸며 색과 불투명도를 유지합니다.</p>
      <ColorPicker value={inline} onChange={setInline} themeSwatches={theme} varSwatches={variables} recent={['#e11d48', '#0891b2', '#475569']} />
      <p role="status" data-color-result>{inline}</p>
    </div>
    <div className="ds-color-workflow">
      <div className="ds-color-object" style={{ background: paint }} aria-label="색상 적용 예시"><span>제품 출시 계획</span></div>
      <PropertyPanel title="선택한 객체"><PropertyGroup label="채우기"><PropertyRow label="색상">
        <ColorField ariaLabel="예시 채우기" value={color} onChange={setColor} onClear={() => setColor(null)} themeSwatches={theme} varSwatches={variables} />
      </PropertyRow></PropertyGroup></PropertyPanel>
      <p>색상 버튼에서 Enter·Space를 누르면 색상 코드로 이동합니다. Esc는 팝업을 닫고 원래 버튼으로 돌아갑니다.</p>
      <div className="ds-surface ds-color-menu-example">
        <h3>긴 메뉴와 키보드</h3>
        <Button onClick={event => { const box = event.currentTarget.getBoundingClientRect(); setMenu({ x: box.left, y: box.bottom + 6 }); }}>객체 메뉴 열기</Button>
        <p role="status">{message}</p>
      </div>
    </div>
    {menu && <Menu at={menu} label="객체 예시 메뉴" onClose={() => setMenu(null)} onPick={id => { setMessage(`선택한 명령: ${id}`); setMenu(null); }} blocks={[
      { id: 'object', items: [{ id: 'copy', label: '복사', hint: '⌘C' }, { id: 'locked', label: '잠긴 객체는 삭제할 수 없습니다', disabled: true }, { id: 'guide', label: '선택한 객체에 팀에서 함께 사용하는 긴 이름의 디자인 가이드 적용', checked: true }] },
      { id: 'versions', items: Array.from({ length: 16 }, (_, i) => ({ id: `version-${i + 1}`, label: `저장된 스타일 ${i + 1}` })) },
    ]} />}
  </div>;
}
