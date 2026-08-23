import { useMemo } from 'react';
import type { Editor } from '@barocss/editor-core';
import { Icon, IconButton } from '@barocss/office-ui';
import { auditCount, auditDeck, labelOfBox, type AuditHit } from '@barocss/office-slides';
import { useEditorRevision } from './revision';

/**
 * What the deck's own check found.
 *
 * ## Why a list and not a badge
 *
 * The point of an audit is to be *acted on*, and every row of it is somewhere to go:
 * a picture with no alt text is a shape on a slide, and the fix is to be standing in
 * front of it. So a row takes the reader there — the slide **and** the shape — which
 * is the whole reason this is beside the deck rather than in a report.
 *
 * ## Two counts, not one number
 *
 * "3개" says nothing a reader can decide with. **고칠 것** is certainly wrong and
 * **볼 것** needs a person, and those are two different afternoons. Three grades and
 * a reader spends the time reading grades; see `audit.ts` for the rest of that
 * argument.
 *
 * ## Everything about *what* is wrong is a model
 *
 * `auditDeck` reads the document and no DOM, which is what lets it sweep the slides
 * nobody is looking at — and is why it is tested in milliseconds. This file draws
 * the answer and takes the reader to it, and knows nothing about alt text or
 * contrast ratios.
 */
export function AuditPanel({
  editor,
  open,
  onClose,
  onGoTo
}: {
  editor: Editor | null;
  open: boolean;
  onClose: () => void;
  /** Show this slide, because the thing to fix is on it. */
  onGoTo: (slideSid: string) => void;
}) {
  const revision = useEditorRevision(editor);

  const { hits, doc } = useMemo(() => {
    const store = (editor as any)?.dataStore;
    const rootId = (editor as any)?.getRootId?.();
    if (!store || !rootId) return { hits: [] as AuditHit[], doc: null };
    const access = { rootId, getNode: (sid: string) => store.getNode(sid) };
    return { hits: auditDeck(access as never), doc: access };
    // Re-run with the document: a list of faults older than the deck sends a reader
    // to a shape they have already fixed.
  }, [editor, revision]);

  if (!open) return null;

  const counted = auditCount(hits);

  /** Where the deck's slides are numbered, so a row can say "4장". */
  const numberOf = (slideSid: string) => {
    const store = (editor as any)?.dataStore;
    const root = store?.getNode((editor as any)?.getRootId?.());
    const slides = ((root?.content ?? []) as string[]).filter(
      (sid) => store?.getNode(sid)?.stype === 'surface'
    );
    return slides.indexOf(slideSid) + 1;
  };

  const goTo = (hit: AuditHit) => {
    onGoTo(hit.slideSid);
    // And the shape, so the reader is standing in front of the thing to fix rather
    // than looking for it.
    if (hit.sid) void (editor as any)?.executeCommand?.('setNode', { nodeIds: [hit.sid] });
  };

  return (
    <aside className="sl-audit" aria-label="덱 검사">
      <div className="sl-audit-title">
        검사
        <span className="sl-audit-count" data-audit-count>
          {hits.length === 0
            ? '문제 없음'
            : `고칠 것 ${counted.must} · 볼 것 ${counted.check}`}
        </span>
        {/*
          * The same control as every other pane's close.
          *
          * It was a `Button` — a *form control*, with a border — while the layers pane's
          * was a hand-rolled borderless one, so two panes in one app closed with two
          * different-looking buttons. Which is the fault the shared primitive is for.
          */}
        <IconButton label="검사 닫기" data={{ 'audit-close': '' }} onClick={onClose}>
          <Icon name="close" size={14} />
        </IconButton>
      </div>

      {hits.length === 0 ? (
        <p className="sl-audit-empty">
          대체 텍스트, 작은 글씨, 판 밖 도형, 대비를 훑었습니다. 걸린 것이 없습니다.
        </p>
      ) : (
        <ol className="sl-audit-list">
          {hits.map((hit, index) => (
            <li
              key={`${hit.slideSid}-${hit.sid ?? 'slide'}-${hit.kind}-${index}`}
              data-audit={hit.kind}
              data-audit-level={hit.level}
            >
              <button type="button" onClick={() => goTo(hit)} title={hit.hint}>
                {/* The level as a word, not a colour: a reader who cannot tell red
                    from amber still has to be able to read this list. */}
                <span className="sl-audit-level">
                  {hit.level === 'must' ? '고칠 것' : '볼 것'}
                </span>
                <span className="sl-audit-where">
                  {numberOf(hit.slideSid)}장
                  {hit.sid && doc ? ` · ${labelOfBox(doc as never, hit.sid)}` : ''}
                </span>
                <span className="sl-audit-what">{hit.what}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}
