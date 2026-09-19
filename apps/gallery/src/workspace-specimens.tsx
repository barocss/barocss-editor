import { useState } from 'react';
import { AdaptiveWorkspace, WorkspaceSidePanel, ChoiceSelect, PropertyPanel, PropertyGroup, PropertyRow, TextField, NavigationItem, ProductMenu } from '@barocss/office-ui';

export function WorkspaceSpecimens() {
  const [width, setWidth] = useState('560');
  const [menuResult, setMenuResult] = useState('제품 이름을 눌러 공통 메뉴를 확인하세요.');
  const [page, setPage] = useState('출시 계획');
  const [titles, setTitles] = useState<Record<string, string>>({ '출시 계획': '출시 계획', '검토 기록': '검토 기록' });
  const title = titles[page];
  const setTitle = (value: string) => setTitles(current => ({ ...current, [page]: value }));
  return <div className="ds-workspace-example">
    <div className="ds-product-menu-samples" aria-label="제품 메뉴 비교">
      {(['Note', 'Word', 'Slides', 'Site'] as const).map(product => <ProductMenu key={product} product={product}
        blocks={[{ id: 'navigation', items: [{ id: 'library', label: '자료함' }, { id: 'references', label: '연결한 자료' }] }]}
        onPick={id => setMenuResult(`${product} · ${id === 'library' ? '자료함' : '연결한 자료'} 선택`)} />)}
    </div>
    <p role="status" data-product-menu-result>{menuResult}</p>
    <ChoiceSelect ariaLabel="작업 공간 예시 너비" value={width} onChange={setWidth} options={[{ id: '560', label: '560px · 패널 접기' }, { id: '1080', label: '1080px · 나란히 보기' }]} />
    <div className="ds-workspace-frame" style={{ width: Number(width) }}><AdaptiveWorkspace>
      <WorkspaceSidePanel side="navigation" width={200}><nav className="ds-workspace-nav" aria-label="예시 탐색"><strong>페이지</strong>{Object.keys(titles).map(name => <NavigationItem key={name} selected={page === name} onClick={() => setPage(name)}>{titles[name]}</NavigationItem>)}</nav></WorkspaceSidePanel>
      <main data-workspace-main className="ds-workspace-canvas"><article><small>문서 미리보기</small><h3>{title}</h3><p>좁은 화면에서도 내용을 확인하며 편집합니다.</p></article></main>
      <WorkspaceSidePanel side="inspector" width={280}><PropertyPanel title="속성"><PropertyGroup label="문서"><PropertyRow label="이름"><TextField ariaLabel="패널 예시 문서 이름" value={title} onCommit={setTitle} /></PropertyRow></PropertyGroup></PropertyPanel></WorkspaceSidePanel>
    </AdaptiveWorkspace></div>
    <p>좁은 화면에서는 탐색 또는 속성 중 하나만 엽니다. 입력칸 밖에서 Escape를 누르거나 문서 영역을 클릭하면 닫습니다. 넓은 화면으로 돌아가면 두 패널을 다시 나란히 표시합니다.</p>
  </div>;
}
