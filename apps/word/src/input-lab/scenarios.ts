/**
 * What to type, and what the recording is meant to catch.
 *
 * These are not a survey of everything a word processor can do. Each one is a
 * place this editor has actually come apart, or a place the browser suite cannot
 * reach: a real IME, a real keyboard's timing, a reader's own habits. The order
 * runs from the plainest thing a person does to the ones that have historically
 * broken, so a session that stops early still covers the things that matter most.
 */

export type Scenario = {
  id: string;
  title: string;
  /** Where to put the caret before starting. */
  where: string;
  /** What to type, in the reader's own hands. */
  does: string;
  /** What should be true afterwards, in plain words. */
  expects: string;
  /** Why this one is here — the fault it is looking for. */
  hunting: string;
  group: string;
};

export const SCENARIOS: Scenario[] = [
  {
    id: 'one-letter',
    group: '기본',
    title: '문단 중간에 한 글자',
    where: '아무 문단의 글자 사이를 클릭',
    does: 'a 한 번',
    expects: '누른 자리에 a 하나. 커서는 a 바로 뒤.',
    hunting: '가장 단순한 경로가 흔들리면 나머지는 볼 필요도 없습니다.'
  },
  {
    id: 'fast-burst',
    group: '기본',
    title: '빠르게 열 글자 연타',
    where: '아무 문단의 글자 사이',
    does: 'abcdefghij 를 최대한 빠르게',
    expects: '열 글자가 친 순서 그대로. 빠진 글자도 뒤바뀐 글자도 없어야 합니다.',
    hunting: '느린 기계에서 순서가 무너지던 자리. ×4까지는 잡았고 ×8 이상은 화면이 문서를 못 따라왔습니다.'
  },
  {
    id: 'paragraph-end',
    group: '기본',
    title: '문단 맨 끝에 입력',
    where: '문단 마지막 글자 바로 뒤',
    does: 'XY',
    expects: '문단 끝에 XY. 커서가 앞으로 튀지 않아야 합니다.',
    hunting: '“문단 마지막 글자 뒤에 커서를 두고 싶어도 한 글자 앞으로 간다”고 하신 그 문제.'
  },
  {
    id: 'trailing-spaces',
    group: '기본',
    title: '문단 끝 공백 뒤에 글자',
    where: '문단 마지막 글자 바로 뒤',
    does: '스페이스 세 번, 그 다음 Z',
    expects: '공백 세 칸이 다 보이고 그 뒤에 Z.',
    hunting: '아직 못 고친 자리입니다. 공백이 하나로 뭉치거나 Z가 공백 앞으로 들어갑니다.'
  },
  {
    id: 'hangul-word',
    group: '한글',
    title: '한글 한 단어',
    where: '아무 문단의 글자 사이',
    does: '“안녕하세요” 를 평소 속도로',
    expects: '다섯 음절 그대로. 조각난 자모가 남으면 안 됩니다.',
    hunting: '합성 IME가 아니라 진짜 IME의 이벤트 순서 — 테스트가 못 닫는 유일한 위험.'
  },
  {
    id: 'hangul-fast',
    group: '한글',
    title: '한글 빠르게 한 줄',
    where: '아무 문단의 글자 사이',
    does: '한 줄 분량을 최대한 빠르게',
    expects: '친 대로. 음절이 깨지거나 순서가 바뀌면 안 됩니다.',
    hunting: '조합 커밋과 렌더가 겹치는 구간. 손이 빠를수록 겹칩니다.'
  },
  {
    id: 'hangul-backspace',
    group: '한글',
    title: '조합 중 Backspace',
    where: '아무 문단의 글자 사이',
    does: '“갑” 을 치고 조합이 끝나기 전에 Backspace 한 번, 이어서 “가”',
    expects: '“가” 하나만 남아야 합니다.',
    hunting: '조합을 되감는 경로. 자모가 하나 남거나 음절이 통째로 사라집니다.'
  },
  {
    id: 'mixed',
    group: '한글',
    title: '한글과 영문 섞어치기',
    where: '아무 문단의 글자 사이',
    does: '“한a글b” 처럼 한/영을 번갈아, 쉬지 않고',
    expects: '친 순서 그대로.',
    hunting: '연타 가드와 조합 상태가 만나는 경계. 양쪽 다 이 자리에서 틀렸던 적이 있습니다.'
  },
  {
    id: 'ime-toggle',
    group: '한글',
    title: '한/영 키만 눌러보기',
    where: '아무 문단의 글자 사이',
    does: '한/영 전환키를 두어 번 누르고, 아무것도 입력하지 않은 채 리본에서 굵게를 눌러보기',
    expects: '굵게가 화면에 즉시 반영되어야 합니다.',
    hunting: 'IME가 키만 삼키고 조합을 안 하면 조합 상태가 남아 화면이 안 그려지던 문제.'
  },
  {
    id: 'empty-paragraph',
    group: '구조',
    title: '빈 문단에 입력',
    where: '문단 끝에서 Enter 를 눌러 빈 줄을 만든 뒤 거기',
    does: '아무 글자 하나',
    expects: '빈 줄에 그 글자만.',
    hunting: '빈 문단은 화면상 비어 있지 않습니다 — 커서 자리를 잡아두는 폭 없는 문자가 들어 있습니다.'
  },
  {
    id: 'enter-split',
    group: '구조',
    title: 'Enter 로 문단 나누기',
    where: '문단 한가운데',
    does: 'Enter 한 번, 이어서 글자 몇 개',
    expects: '문단이 둘로 나뉘고 뒷 문단 맨 앞에 친 글자.',
    hunting: '나눈 직후 커서가 어느 쪽에 있는지, 페이지가 다시 나뉘는지.'
  },
  {
    id: 'backspace-join',
    group: '구조',
    title: 'Backspace 로 문단 합치기',
    where: '어떤 문단의 맨 앞',
    does: 'Backspace 한 번, 이어서 글자 몇 개',
    expects: '두 문단이 하나로. 친 글자는 이어붙은 자리에.',
    hunting: '문단 경계를 지우는 경로. 커서가 엉뚱한 노드로 가기 쉽습니다.'
  },
  {
    id: 'replace-selection',
    group: '구조',
    title: '선택한 글자 위에 입력',
    where: '몇 글자를 드래그로 선택',
    does: '아무 글자 하나',
    expects: '선택한 글자가 사라지고 친 글자 하나만.',
    hunting: '지우기와 넣기가 한 키에 같이 일어나는 유일한 경로.'
  },
  {
    id: 'in-equation',
    group: '특수 영역',
    title: '수식 안에 입력',
    where: '수식의 글자 사이',
    does: '글자 두어 개, 그리고 한글도 한 음절',
    expects: '수식 안 그 자리에. 수식 밖으로 새면 안 됩니다.',
    hunting: '“수식에서 입력이 자꾸 안 된다”고 하신 자리.'
  },
  {
    id: 'in-table',
    group: '특수 영역',
    title: '표 셀 안에 입력',
    where: '표의 어느 셀',
    does: '글자 몇 개, 그리고 Tab 으로 다음 셀',
    expects: '친 셀에만 들어가고, Tab 이 다음 셀로 옮겨야 합니다.',
    hunting: '셀은 문단과 다른 경로로 그려집니다.'
  },
  {
    id: 'in-header',
    group: '특수 영역',
    title: '머리글/바닥글 편집',
    where: '페이지 위나 아래의 반복되는 글자를 더블클릭',
    does: '글자 몇 개 치고 ESC, 그리고 본문을 클릭',
    expects: '편집 중인 영역이 눈에 보이고, ESC 나 본문 클릭으로 빠져나와야 합니다.',
    hunting: '“편집되고 있다는 표시가 없어 헷갈린다”고 하신 자리.'
  },
  {
    id: 'paste',
    group: '되돌리기·붙여넣기',
    title: '붙여넣기',
    where: '아무 문단의 글자 사이',
    does: '다른 곳에서 복사해 온 글을 붙여넣기',
    expects: '붙인 내용이 문서에도 들어가야 합니다 — 화면에만 있으면 안 됩니다.',
    hunting: '붙여넣기는 beforeinput 을 거치지 않는 경로입니다.'
  },
  {
    id: 'undo-redo',
    group: '되돌리기·붙여넣기',
    title: '되돌리기와 다시하기',
    where: '아무 문단',
    does: '글자 몇 개 치고 Ctrl/Cmd+Z 두어 번, 그리고 Shift+Ctrl/Cmd+Z',
    expects: '친 만큼 되돌아가고 다시 돌아와야 합니다.',
    hunting: '되돌리기는 타이핑이 아닌 변경입니다 — 화면이 안 따라오는 부류.'
  },
  {
    id: 'long-typing',
    group: '오래 쓰기',
    title: '한 문단을 통째로 써보기',
    where: '빈 줄',
    does: '평소처럼 한 문단을 끝까지. 줄이 넘어가고 페이지가 넘어가도록.',
    expects: '쓴 대로 남고, 줄바꿈과 페이지 넘김이 따라와야 합니다.',
    hunting: '짧은 시나리오가 못 잡는 것 — 오래 쓸수록 쌓이는 어긋남.'
  }
];
