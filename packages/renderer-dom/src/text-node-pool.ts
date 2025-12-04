/**
 * sid 기반 Text Node Pool
 *
 * 편집 중 Selection 보존을 위해 동일 sid의 텍스트는 가능한 한 동일 DOM Text 노드를 재사용합니다.
 * renderer-dom은 브라우저 Selection API를 알지 않습니다. selectionTextNode는 외부(예: editor-view-dom)에서 주입합니다.
 *
 * 자세한 배경 및 설계는 docs/text-node-pool-selection-preservation.md 참고.
 */

export interface TextNodePoolLike {
  addOrReuseTextNode(sid: string, desiredText: string, selectionTextNode?: Text | null): Text;
  register(sid: string, node: Text): void;
  getSidByTextNode(node: Text): string | undefined;
  cleanup?(opts?: { maxEntries?: number; maxIdleMs?: number; protectedTextNodes?: Set<Text> }): void;
}

export interface TextNodePoolEntry {
  sid: string;
  nodes: Text[];          // 좌→우 순서 유지
  lastUsedAt: number;     // LRU 정리용
}

export class SidTextNodePool implements TextNodePoolLike {
  private sidToEntry: Map<string, TextNodePoolEntry> = new Map();
  private textToSid: Map<Text, string> = new Map();

  getTextNodesBySid(sid: string): Text[] {
    return this.sidToEntry.get(sid)?.nodes || [];
  }

  getSidByTextNode(text: Text): string | undefined {
    return this.textToSid.get(text);
  }

  register(sid: string, node: Text): void {
    let entry = this.sidToEntry.get(sid);
    if (!entry) {
      entry = { sid, nodes: [], lastUsedAt: Date.now() };
      this.sidToEntry.set(sid, entry);
    }
    if (!entry.nodes.includes(node)) {
      entry.nodes.push(node);
      this.textToSid.set(node, sid);
      console.log('[TextNodePool] registered text node', {
        sid,
        text: node.data.slice(0, 30),
        parentSid: node.parentElement?.getAttribute('data-bc-sid'),
        parentStype: node.parentElement?.getAttribute('data-bc-stype'),
        totalNodesForSid: entry.nodes.length
      });
    }
    entry.lastUsedAt = Date.now();
  }

  addOrReuseTextNode(sid: string, desiredText: string, selectionTextNode?: Text | null): Text {
    const candidates = this.getTextNodesBySid(sid);
    console.log('[TextNodePool] addOrReuseTextNode', {
      sid,
      desiredText: desiredText.slice(0, 30),
      candidatesCount: candidates.length,
      hasSelectionTextNode: !!selectionTextNode,
      selectionTextNodeInCandidates: selectionTextNode ? candidates.includes(selectionTextNode) : false,
      candidatesPreview: candidates.slice(0, 3).map(t => ({
        data: t.data.slice(0, 20),
        parentSid: t.parentElement?.getAttribute('data-bc-sid'),
        parentStype: t.parentElement?.getAttribute('data-bc-stype')
      }))
    });
    
    // 1) Selection 우선
    if (selectionTextNode && candidates.includes(selectionTextNode)) {
      const t = selectionTextNode;
      if (t.data !== desiredText) t.data = desiredText;
      this.touchSid(sid);
      console.log('[TextNodePool] reused selection text node', { sid, text: t.data.slice(0, 30) });
      return t;
    }
    // 2) 첫 후보 재사용
    if (candidates.length > 0) {
      const t = candidates[0];
      if (t.data !== desiredText) t.data = desiredText;
      this.touchSid(sid);
      console.log('[TextNodePool] reused existing text node', { sid, text: t.data.slice(0, 30) });
      return t;
    }
    // 3) 신규 생성
    const t = document.createTextNode(desiredText);
    this.register(sid, t);
    console.log('[TextNodePool] created new text node', { sid, text: t.data.slice(0, 30) });
    return t;
  }

  cleanup(opts: { maxEntries?: number; maxIdleMs?: number; protectedTextNodes?: Set<Text> } = {}): void {
    const { maxEntries, maxIdleMs, protectedTextNodes = new Set() } = opts;
    const now = Date.now();

    if (maxIdleMs !== undefined) {
      for (const [sid, entry] of this.sidToEntry.entries()) {
        if (now - entry.lastUsedAt > maxIdleMs) {
          entry.nodes = entry.nodes.filter((n) => protectedTextNodes.has(n));
          if (entry.nodes.length === 0) {
            this.sidToEntry.delete(sid);
          }
        }
      }
    }

    if (maxEntries !== undefined) {
      const entries = Array.from(this.sidToEntry.values());
      if (entries.length > maxEntries) {
        entries.sort((a, b) => a.lastUsedAt - b.lastUsedAt);
        const overflow = entries.slice(0, entries.length - maxEntries);
        for (const e of overflow) {
          e.nodes = e.nodes.filter((n) => protectedTextNodes.has(n));
          if (e.nodes.length === 0) {
            this.sidToEntry.delete(e.sid);
          } else {
            this.sidToEntry.set(e.sid, e); // 갱신
          }
        }
      }
    }
  }

  private touchSid(sid: string): void {
    const e = this.sidToEntry.get(sid);
    if (e) e.lastUsedAt = Date.now();
  }
}


