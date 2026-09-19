import { useState } from 'react';
import { Button, EmptyState, Icon, NavigationItem, PropertyTabs, TextField } from '@barocss/office-ui';
const pages = ['분기 출시 계획', '제품 기능과 팀별 검토 내용을 정리한 긴 이름의 문서', '주간 회의록'];
export function NavigationSpecimens() {
  const [tab, setTab] = useState('pages');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(pages[0]);
  const rows = pages.filter(page => page.includes(query));
  return <div className="ds-navigation-examples">
    <div className="ds-navigation-panel">
      <PropertyTabs panelId="navigation-example-panel" active={tab} onChange={setTab} tabs={[
        { id: 'pages', label: '페이지' }, { id: 'unavailable', label: '연결', disabled: true },
        { id: 'favorites', label: '즐겨찾기' }, { id: 'archive', label: '지난 분기 프로젝트 보관함' },
      ]} />
      <div id="navigation-example-panel" role="tabpanel" aria-labelledby={`navigation-example-panel-${tab}`}>
        {tab === 'pages' ? <>
          <div className="ds-navigation-search"><TextField ariaLabel="목록 예시 검색" placeholder="페이지 검색" value={query} onChange={setQuery} /></div>
          <nav aria-label="예시 페이지 목록" className="ds-navigation-list">
            {rows.map(page => <NavigationItem key={page} selected={selected === page} aria-current={selected === page ? 'page' : undefined}
              leading={<Icon name="type-page" size={16} />} onClick={() => setSelected(page)}>{page}</NavigationItem>)}
          </nav>
          {!rows.length && <EmptyState title="검색 결과가 없습니다" action={<Button onClick={() => setQuery('')}>검색 지우기</Button>}>다른 검색어를 입력하거나 검색을 지우세요.</EmptyState>}
        </> : <EmptyState title={tab === 'favorites' ? '즐겨찾는 페이지가 없습니다' : '보관한 페이지가 없습니다'} icon={<Icon name={tab === 'favorites' ? 'favorite' : 'type-page'} size={20} />}
          action={<Button onClick={() => setTab('pages')}>전체 페이지 보기</Button>}>페이지를 선택한 뒤 필요한 자료를 이곳에 모으세요.</EmptyState>}
      </div>
    </div>
    <div className="ds-navigation-guidance"><strong>하나의 선택 기준</strong><p>방향키와 Home·End로 탭을 옮깁니다. 비활성 탭은 건너뜁니다.</p><p>목록의 긴 이름은 줄바꿈합니다. 선택 항목은 마우스를 올려도 강조를 유지합니다.</p><span>선택한 페이지: {selected}</span></div>
  </div>;
}
