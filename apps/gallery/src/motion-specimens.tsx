import { useEffect, useRef, useState } from 'react';
import { Button, ChoiceSelect, ColorField, Dialog, DialogButton, Drawer, FloatingSurface, Menu, TextField, Tip } from '@barocss/office-ui';

/** Use production surfaces so the comparison also exercises their focus and dismissal. */
export function MotionSpecimens() {
  const [modal, setModal] = useState<'dialog' | 'drawer' | null>(null);
  const [choice, setChoice] = useState('team');
  const [color, setColor] = useState('#2563eb');
  const [name, setName] = useState('제품 출시 계획');
  const [result, setResult] = useState('명령을 선택하세요.');
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState<DOMRect | null>(null);
  const anchor = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const measure = () => setAt(anchor.current?.getBoundingClientRect() ?? null);
    measure(); window.addEventListener('scroll', measure, true); window.addEventListener('resize', measure);
    return () => { window.removeEventListener('scroll', measure, true); window.removeEventListener('resize', measure); };
  }, [open]);
  return <>
    <div className="ds-selection-controls">
      <ChoiceSelect ariaLabel="모션 선택 목록" value={choice} onChange={setChoice} options={[{ id: 'team', label: '팀 문서' }, { id: 'private', label: '개인 문서' }]} />
      <Tip label="설명을 확인한 뒤 작업을 계속하세요."><Button>모션 툴팁 확인</Button></Tip>
      <Button onClick={event => { const box = event.currentTarget.getBoundingClientRect(); setMenu({ x: box.left, y: box.bottom + 6 }); }}>모션 메뉴 열기</Button>
      <button ref={anchor} type="button" className="office-button" data-button-tone="neutral" aria-expanded={open} onClick={() => setOpen(!open)}>모션 팝오버 열기</button>
      <Button onClick={() => setModal('dialog')}>모션 Dialog 열기</Button>
      <Button onClick={() => setModal('drawer')}>모션 Drawer 열기</Button>
      <ColorField ariaLabel="모션 색상" value={color} onChange={setColor} />
    </div>
    <p role="status">{result}</p>
    <table className="ds-motion-table"><caption>공통 모션 기준</caption><thead><tr><th>UI</th><th>열기</th><th>닫기</th></tr></thead><tbody>
      <tr><td>선택 목록·메뉴·팝오버</td><td>140ms · 페이드와 3px 이동</td><td>즉시</td></tr>
      <tr><td>색상 팝오버</td><td>140ms · 위치를 유지하는 페이드</td><td>즉시</td></tr>
      <tr><td>툴팁</td><td>100ms · 페이드</td><td>즉시</td></tr>
      <tr><td>Dialog</td><td>180ms · 페이드</td><td>100ms · 페이드</td></tr>
      <tr><td>Drawer·옆으로 보기</td><td>200ms · 20px 측면 이동</td><td>140ms · 12px 측면 이동</td></tr>
    </tbody></table>
    <p>열자마자 키보드와 클릭을 사용할 수 있습니다. 툴팁 간 이동은 즉시 표시합니다. 시스템의 동작 줄이기를 켜면 모션을 생략합니다. 선택선·핸들·크기 표시는 지연 없이 갱신합니다.</p>
    {menu && <Menu at={menu} label="모션 예시 메뉴" onClose={() => setMenu(null)} onPick={id => { setResult(`선택: ${id}`); setMenu(null); }} blocks={[{ id: 'commands', items: [{ id: '복사', label: '복사' }, { id: '복제', label: '복제' }] }]} />}
    <FloatingSurface open={open} at={at} variant="panel" aria-label="모션 팝오버" ownedElements={[anchor]} onDismiss={() => setOpen(false)}>
      <TextField ariaLabel="팝오버 문서 이름" value={name} onChange={setName} />
      <Button onClick={() => setOpen(false)}>팝오버 닫기</Button>
    </FloatingSurface>
    <Dialog open={modal === 'dialog'} onOpenChange={value => { if (!value) setModal(null); }} title="모션 문서 설정" description="내용을 입력하고 적용하세요."
      footer={<DialogButton variant="primary" onClick={() => setModal(null)}>적용</DialogButton>}>
      <TextField ariaLabel="모션 문서 이름" value={name} onChange={setName} />
    </Dialog>
    <Drawer open={modal === 'drawer'} onOpenChange={value => { if (!value) setModal(null); }} title="모션 문서 속성" description="패널이 열리는 동안에도 입력할 수 있습니다.">
      <TextField ariaLabel="모션 문서 이름" value={name} onChange={setName} />
    </Drawer>
  </>;
}
