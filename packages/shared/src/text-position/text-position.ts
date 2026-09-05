import {
  binarySearchRun,
  buildTextRunIndex,
  skipsInIndex,
  type ContainerRuns
} from '../text-run-index';

/**
 * **DOM 의 한 점과 모델의 한 점을 맞바꾸는 곳.** 규칙과 잰 표는 `docs/specs/text-position.md` 에
 * 있고, 여기에는 그 규칙만 있다.
 *
 * **왜 뷰 층이 아니라 여기인가.** 2026-09-05 회차에 같은 이음매를 세 번 따로 기웠고 — 접힌 범위,
 * 접는 쪽, 타이핑 경로 — 세 번 다 브라우저 회차가 찾아 줬다. 규칙이 두 곳에 있으면 고칠 때마다 한
 * 곳만 고치게 된다. 두 뷰의 같은 이름 메서드 열아홉을 기계로 대보니 **표기만 다른 것 여섯, 논리가
 * 다른 것 하나(빈 그릇), 뷰의 것 열** 이었다.
 *
 * 여기 있는 것은 **의존이 없다**: DOM 과, 인자로 받은 `getNode` 뿐이다. 편집기도 뷰도 모른다.
 */

/** 이 계산이 문서에 물어야 하는 것 전부. */
export interface PositionContext {
  /** sid 로 모델 노드를 찾는다. `text` 가 문자열인 노드가 **그릇**이다. */
  getNode(sid: string): { text?: unknown; stype?: unknown } | null | undefined;
}

/** 모델의 한 점. */
export interface ModelPoint {
  nodeId: string;
  offset: number;
}

/** DOM 의 한 점. */
export interface DOMPoint {
  node: Node;
  offset: number;
}

/**
 * **이 노드가 글자를 담나** — 이름이 아니라 `text` 로 묻는다.
 *
 * 엔진의 열여섯 자리가 `stype === 'inline-text'` 로 물었고, 그건 **제품이 다른 이름을 쓰는 순간까지만
 * 통한다.** office 스키마의 `inline` 그룹에 여덟이 있고 그 중 **일곱이 원자** 라서, 이름으로 묻는
 * 자리는 그 일곱에 아니라고 답한다 — 우연히 맞는 답이지만 이유가 틀렸다.
 *
 * **타입에 물어야 할 때** 는 스키마가 답한다: `group === 'inline' && !atom` 이 office 스키마에서
 * 정확히 `inline-text` 하나다(런타임으로 셌다). **인스턴스를 손에 쥐고 있을 때** 는 이것이 더 짧고
 * 더 옳다 — 그리고 그 열여섯 자리는 전부 인스턴스를 쥐고 있었다.
 *
 * 원칙은 `extensions/range-delete.ts` 의 `isInline` 에 이미 적혀 있었다 — *"이름으로 짐작하는 것은
 * 제품이 다른 이름을 쓰는 순간까지만 통한다."*
 */
export function holdsText<T>(node: T): node is T & { text: string } {
  return typeof (node as { text?: unknown } | null | undefined)?.text === 'string';
}

/**
 * **그릇인지는 `text` 로 묻는다** — 이름도 그룹도 아니다.
 *
 * 이름으로 짐작하는 것은 제품이 다른 이름을 쓰는 순간까지만 통한다. office 스키마의 `inline` 그룹
 * 여덟 중 **일곱이 원자** 라서, 이름으로 묻는 자리는 그 일곱에 아니라고 답한다.
 */
export function isTextContainer(el: Element, ctx: PositionContext): boolean {
  const sid = el.getAttribute('data-bc-sid');
  if (!sid) return false;
  return holdsText(ctx.getNode(sid));
}

/** `data-bc-sid` 를 가진 가장 가까운 요소 — 자신을 포함해서. */
export function closestDataNode(node: Node): Element | null {
  if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node as Element;
    if (el.hasAttribute('data-bc-sid')) return el;
  }
  let cur = node.parentElement;
  while (cur) {
    if (cur.hasAttribute('data-bc-sid')) return cur;
    cur = cur.parentElement;
  }
  return null;
}

/**
 * 블록 **안**의 그릇 하나 — 앞의 것이거나 뒤의 것이거나.
 *
 * 브라우저는 블록을 넘을 때 경계를 **요소**에 둔다. 그때 블록을 그대로 돌려주면 `text` 가 없으므로
 * 거기 붙은 오프셋을 아무도 해석할 수 없고, 그 오프셋으로 만든 명령은 엉뚱한 자리를 가리킨다.
 *
 * 어느 쪽인지는 *범위의 어느 끝인가* 가 정한다 — 그게 브라우저가 자식 색인의 경계로 뜻하는 것이다:
 * *여기서부터 전부* 이거나 *여기까지 전부*.
 */
export function textContainerInside(root: Element, ctx: PositionContext, forEnd: boolean): Element | null {
  /* `shared` 의 tsconfig 는 downlevelIteration 을 안 켜므로 NodeList 를 펼치지 않는다. */
  const all = root.querySelectorAll('[data-bc-sid]');
  const list: Element[] = [];
  for (let i = 0; i < all.length; i += 1) {
    const one = all[i];
    if (isTextContainer(one, ctx)) list.push(one);
  }
  return list.length ? (forEnd ? list[list.length - 1] : list[0]) : null;
}

/**
 * 이 DOM 노드가 속한 **그릇**. 위로 찾고, 없으면 아래로 내려간다.
 *
 * `forEnd` 는 4번 단계에서만 쓰인다 — 아래로 내려갈 때 첫 런인지 마지막 런인지.
 */
export function bestContainer(node: Node, ctx: PositionContext, forEnd = false): Element | null {
  const el = closestDataNode(node);
  if (!el) return null;
  if (isTextContainer(el, ctx)) return el;

  let cur: Element | null = el;
  while (cur) {
    if (isTextContainer(cur, ctx)) return cur;
    cur = cur.parentElement?.closest?.('[data-bc-sid]') ?? null;
  }

  /* 위에 없으면 안으로. 어느 쪽 끝인가가 첫 런과 마지막 런을 가른다. */
  const inside = textContainerInside(el, ctx, forEnd);
  if (inside) return inside;

  /*
   * 안에도 없다. 문서는 선택의 그릇이 아니므로 포기하고, 그 밖의 블록은 **그 자신**을 돌려준다 —
   * 오프셋은 해석할 수 없지만 sid 는 있고, 부르는 쪽이 그것으로 무엇을 할지 정한다.
   */
  const sid = el.getAttribute('data-bc-sid');
  if (sid && ctx.getNode(sid)?.stype === 'document') return null;
  return el;
}

/** 그릇의 런 색인. 만들 수 없으면 `null`. */
export function runsOf(container: Element): ContainerRuns | null {
  try {
    const sid = container.getAttribute('data-bc-sid');
    return buildTextRunIndex(container, sid ?? undefined, { buildReverseMap: true });
  } catch {
    return null;
  }
}

/**
 * 요소 경계의 자식 색인을 모델 오프셋으로.
 *
 * 자식 색인 `offset` 이 가리키는 자식을 기준으로, 그 **뒤의 첫 글자 노드**가 있으면 그 런의 처음,
 * 없으면 **앞의 마지막 글자 노드**의 런의 끝. 글자가 하나도 없는 그릇에서만 *범위의 어느 쪽인가* 가
 * 답을 정한다.
 */
export function offsetAtElementBoundary(
  containerEl: Element,
  el: Element,
  offset: number,
  runs: ContainerRuns,
  isEnd: boolean
): number {
  const child = el.childNodes.item(offset) ?? null;

  const walker = document.createTreeWalker(containerEl, NodeFilter.SHOW_TEXT);
  let lastBefore: Text | null = null;
  let firstAtOrAfter: Text | null = null;

  for (let t = walker.nextNode() as Text | null; t; t = walker.nextNode() as Text | null) {
    if (!child) {
      lastBefore = t;
      continue;
    }
    /**
     * **자기 자신도 *뒤* 다.** `child.compareDocumentPosition(child)` 는 0 이므로 비교만으로는
     * *앞* 으로 분류된다 — 자식 색인이 가리키는 것이 글자 노드일 때 그 일이 난다.
     *
     * 재본 것: `가나[다라]마바` 를 담은 그릇에 경계를 `(t1, 0)` 으로 두면 모델 **2** 가 나왔다.
     * 자식 0 은 `"가나"` 이고 그 자리는 모델 **0** 인데, 자기 자신이 앞으로 밀려서 다음 런의 처음이
     * 답이 됐다. 앞서 이 비교의 *방향* 을 한 번 고쳤고(`t.compareDocumentPosition(child)` →
     * 반대로), 같은 노드인 경우는 그때도 남아 있었다.
     */
    if (t === child || child.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING) {
      firstAtOrAfter = t;
      break;
    }
    lastBefore = t;
  }

  if (firstAtOrAfter) {
    const entry = runs.byNode?.get(firstAtOrAfter);
    if (entry) return entry.start;
  }
  if (lastBefore) {
    const entry = runs.byNode?.get(lastBefore);
    if (entry) return entry.end;
  }
  return isEnd ? runs.total : 0;
}

/** DOM 오프셋 하나를 모델 오프셋으로 — 글자 노드든 요소든. */
export function offsetWithRuns(
  containerEl: Element,
  container: Node,
  offset: number,
  runs: ContainerRuns,
  isEnd: boolean
): number {
  if (runs.total === 0) return 0;

  if (container.nodeType === Node.TEXT_NODE) {
    const textNode = container as Text;
    const entry = runs.byNode?.get(textNode);
    if (entry) {
      /* `domStart` 가 채움을 건너뛰므로, ZWNBSP 바로 뒤가 모델 오프셋 0 이다. */
      const localLen = entry.end - entry.start;
      const clamped = Math.max(0, Math.min(offset - entry.domStart, localLen));
      return entry.start + clamped;
    }
    const idx = binarySearchRun(runs.runs, Math.max(0, Math.min(offset, runs.total - 1)));
    if (idx >= 0) return isEnd ? runs.runs[idx].end : runs.runs[idx].start;
    return 0;
  }

  return offsetAtElementBoundary(containerEl, container as Element, offset, runs, isEnd);
}

/**
 * 모델 오프셋을 DOM 자리로.
 *
 * **경계는 다음 런의 처음이다** — `가나[다라]마바` 에서 `t1:2` 는 `"가나":2` 가 아니라 `"다라":0`.
 * 캐럿이 거기서 글자를 치면 데코레이터 **안**에 들어간다는 뜻이고, 그게 이 저장소의 결정이다.
 *
 * **빈 그릇** 은 채움 글자 **안**, ZWNBSP **뒤** 다. 요소 경계에 두면 브라우저가 다시 해석하고 그
 * 해석은 채움의 앞일 수도 있다 — 채움은 오프셋 계산에서 빠지는 글자이므로 캐럿이 그 앞에 서면 친
 * 글자가 모델에 없는 자리에 들어간다. 두 뷰가 갈렸던 **유일한 논리** 이고, DOM 판이 맞다.
 */
export function domPointFromModelOffset(
  runs: ContainerRuns,
  modelOffset: number,
  container?: Element
): DOMPoint | null {
  if (modelOffset < 0 || modelOffset > runs.total) return null;

  if (runs.runs.length === 0) {
    if (!container) return null;
    const filler = firstTextNodeIn(container);
    return filler ? { node: filler, offset: filler.data.length } : { node: container, offset: 0 };
  }

  if (modelOffset === runs.total) {
    const last = runs.runs[runs.runs.length - 1];
    return { node: last.domTextNode, offset: last.domStart + last.text.length };
  }

  let idx = binarySearchRun(runs.runs, modelOffset);
  if (idx === -1) {
    /* 색인이 못 찾는 자리는 런 사이의 경계다 — 다음 런의 처음으로 간다. */
    idx = runs.runs.findIndex((run, i) =>
      modelOffset < run.start || (modelOffset === run.end && i + 1 < runs.runs.length)
    );
    if (idx === -1) return null;
    if (modelOffset === runs.runs[idx].end) idx += 1;
  }

  const run = runs.runs[idx];
  const local = modelOffset - run.start;
  return { node: run.domTextNode, offset: run.domStart + Math.min(local, run.text.length) };
}

/** `root` 아래 문서 순서의 첫 글자 노드 — 데코레이터가 그린 제 글자는 건너뛴다. */
export function firstTextNodeIn(root: Element): Text | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const parent = (node as Text).parentElement;
      if (parent && parent !== root && skipsInIndex(parent)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  return walker.nextNode() as Text | null;
}

/** 한 그릇의 런 색인 — 색인은 `buildTextRunIndex` 가 요소와 sid 로 캐시한다. */
export function runsIn(containerEl: Element, containerId: string): ContainerRuns {
  return buildTextRunIndex(containerEl, containerId, { buildReverseMap: true });
}

/** 두 경계를 각각 해석한 결과. */
export interface ResolvedBoundaries {
  startNodeId: string;
  startModelOffset: number;
  endNodeId: string;
  endModelOffset: number;
}

/**
 * **DOM 범위의 두 경계를 모델의 두 자리로.** 선택을 읽는 경로와 타이핑 경로가 둘 다 여기를 지난다.
 *
 * 시작과 끝을 **따로** 해석하는 것이 이 함수의 모양이고, 그래서 접힌 범위에 대해서는 부르는 쪽이
 * `collapseBoundaries` 로 하나로 접어야 한다 — 두 해석은 서로 다른 그릇 안을 걷기 때문이다.
 */
export function resolveBoundaries(
  startContainer: Node,
  startOffset: number,
  endContainer: Node,
  endOffset: number,
  ctx: PositionContext
): ResolvedBoundaries | null {
  const startNode = bestContainer(startContainer, ctx);
  const endNode = bestContainer(endContainer, ctx, true);
  if (!startNode || !endNode) return null;

  const startNodeId = startNode.getAttribute('data-bc-sid');
  const endNodeId = endNode.getAttribute('data-bc-sid');
  if (!startNodeId || !endNodeId) return null;

  if (!ctx.getNode(startNodeId) || !ctx.getNode(endNodeId)) return null;

  const startRuns = runsIn(startNode, startNodeId);
  const endRuns = startNode === endNode ? startRuns : runsIn(endNode, endNodeId);

  return {
    startNodeId,
    startModelOffset: offsetWithRuns(startNode, startContainer, startOffset, startRuns, false),
    endNodeId,
    endModelOffset: offsetWithRuns(endNode, endContainer, endOffset, endRuns, true)
  };
}

/**
 * 범위가 앞으로 그어졌나 뒤로 그어졌나.
 *
 * 브라우저의 anchor/focus 가 먼저다 — 그것이 *사람이 어느 쪽에서 끌었나* 이고, 문서 순서는 그 답을
 * 모른다. anchor/focus 로 못 정할 때에만 문서 순서로 떨어진다.
 */
export function selectionDirection(
  selection: Selection,
  startNode: Element,
  endNode: Element,
  startOffset: number,
  endOffset: number,
  ctx: PositionContext
): 'forward' | 'backward' {
  if (startNode === endNode) return startOffset <= endOffset ? 'forward' : 'backward';

  const anchorNode = selection.anchorNode;
  const focusNode = selection.focusNode;
  if (!anchorNode || !focusNode) {
    return startNode.compareDocumentPosition(endNode) & Node.DOCUMENT_POSITION_FOLLOWING
      ? 'forward'
      : 'backward';
  }

  const anchorContainer = bestContainer(anchorNode, ctx);
  const focusContainer = bestContainer(focusNode, ctx);
  if (anchorContainer && focusContainer) {
    const startNodeId = startNode.getAttribute('data-bc-sid');
    const endNodeId = endNode.getAttribute('data-bc-sid');
    const anchorId = anchorContainer.getAttribute('data-bc-sid');
    const focusId = focusContainer.getAttribute('data-bc-sid');
    if (anchorId === startNodeId && focusId === endNodeId) return 'forward';
    if (anchorId === endNodeId && focusId === startNodeId) return 'backward';
  }

  return startNode.compareDocumentPosition(endNode) & Node.DOCUMENT_POSITION_FOLLOWING
    ? 'forward'
    : 'backward';
}

/**
 * **접힌 DOM 범위를 접힌 모델 자리 하나로.** 어느 쪽으로 접느냐가 답을 바꾼다.
 *
 * 경계가 블록 요소이면 두 해석은 **서로 다른 그릇 안** 을 걷는다: 시작은 그 블록의 *첫 런* 안을,
 * 끝은 *마지막 런* 안을. 그래서 시작 해석은 첫 런을 넘어갈 수 없고, 끝 해석은 마지막 런 앞으로 올
 * 수 없다. 각자 자기 편에서만 맞다.
 *
 * 런 둘(`가나`,`다라`)을 가진 문단에서 잰 것:
 *
 * | 캐럿 | 시작 해석 | 끝 해석 | 맞는 답 |
 * |---|---|---|---|
 * | `(p,0)` | `t1:0` | t2:0 | **시작** |
 * | `(p,1)` | `t1:2` | t2:0 | **시작** |
 * | `(p,2)` | t1:2 | `t2:2` | **끝** |
 *
 * 자식 색인이 자식 수와 같다는 것은 브라우저가 *전부 뒤* 라고 말한 것이고, 첫 런 안을 걷는 해석은
 * 그것을 표현할 방법이 없다. **그때만 끝으로 접는다.**
 *
 * 늘 시작으로 접으면 **문단 끝의 캐럿이 첫 런 끝으로** 간다 — 런이 둘 이상인 문단에서는 글자
 * 한복판이다. 짧은 줄의 오른쪽 빈 곳을 누르는 흔한 몸짓이 거기로 간다.
 *
 * 접지 *않으면* 더 나쁘다: 캐럿이 `t1:2 → t2:2` 라는 범위로 읽히고, 그건 둘째 런 전체를 고른
 * 것이다. 그 자리에서 글자를 치면 고른 것을 지우고 쓴다. 화면에 나타난 자리 하나: 사이트에서 `/`
 * 를 치면 슬래시 메뉴와 **버블 툴바가 같이** 떴다 — 버블 툴바는 `collapsed !== true` 면 뜬다.
 *
 * **여기 있는 이유** 는 뷰 층 둘이 이것을 각자 판단하면 갈라지기 때문이다. 이 저장소에서 그
 * 모양이 이번 회차에만 세 번 나왔다. 규칙 전체는 `docs/specs/text-position.md`.
 */
export function collapseBoundaries(
  container: Node,
  offset: number,
  boundaries: ResolvedBoundaries
): { nodeId: string; offset: number } {
  const pastEveryChild = container.nodeType === Node.ELEMENT_NODE && offset >= container.childNodes.length;
  return pastEveryChild
    ? { nodeId: boundaries.endNodeId, offset: boundaries.endModelOffset }
    : { nodeId: boundaries.startNodeId, offset: boundaries.startModelOffset };
}
