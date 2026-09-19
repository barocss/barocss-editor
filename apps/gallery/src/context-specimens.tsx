import { useEffect, useRef, useState } from 'react';
import { Button, FloatingSurface, Icon, IconButton, Tip } from '@barocss/office-ui';

const longLabel = '선택한 객체의 표시 상태를 바꿉니다. 문서에 저장된 내용과 다른 객체의 선택은 유지합니다.';
export function ContextSpecimens() {
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState<DOMRect | null>(null);
  const [bold, setBold] = useState(false);
  useEffect(() => {
    if (!open) return;
    const measure = () => setAt(anchor.current?.getBoundingClientRect() ?? null);
    measure(); window.addEventListener('scroll', measure, true); window.addEventListener('resize', measure);
    return () => { window.removeEventListener('scroll', measure, true); window.removeEventListener('resize', measure); };
  }, [open]);
  return <div className="ds-context-examples">
    <div className="ds-context-clip">
      <strong>잘리는 패널 안의 툴팁</strong>
      <div className="ds-context-tools">
        <Tip label={longLabel} shortcut="⇧⌘H"><button type="button" className="office-layer-disclosure" aria-label="긴 설명 확인"><Icon name="shown" size={16} /></button></Tip>
        <IconButton label="선택한 객체 복제" shortcut="⌘D"><Icon name="duplicate" size={16} /></IconButton>
      </div>
      <p>아이콘에 마우스를 올리거나 Tab 키로 이동하세요. 긴 설명은 화면 안에서 줄바꿈합니다.</p>
    </div>
    <div className="ds-context-stage">
      <strong>문맥 도구의 배치</strong>
      <p>스크롤과 화면 크기를 바꾸며 도구의 위치를 확인하세요. 실제 텍스트 선택은 Note에서 검증합니다.</p>
      <button ref={anchor} type="button" className="office-navigation-item" data-context-anchor aria-expanded={open}
        onClick={() => setOpen(!open)}>이 문장 위에 도구 표시</button>
      <FloatingSurface open={open} at={at} aria-label="문맥 도구 예시" ownedElements={[anchor]} onDismiss={() => setOpen(false)}>
        <IconButton label="예시 굵게" shortcut="⌘B" pressed={bold} onClick={() => setBold(!bold)}><Icon name="bold" size={16} /></IconButton>
        <Button tone="quiet" onClick={() => setOpen(false)}>편집 마치기</Button>
      </FloatingSurface>
      <span role="status">굵게: {bold ? '켜짐' : '꺼짐'}</span>
    </div>
  </div>;
}
