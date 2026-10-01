import { useEffect, useState } from 'react';
import { captureTextSelection, createParagraphProposalPreview, ownsEditorSelection } from '@barocss/office-editor-ui';
import { ParagraphProposalReview } from '@barocss/office-ui';
import type { WordRuntime } from './runtime';
import { PARAGRAPH_PROPOSAL_SAMPLE as sample } from './paragraph-proposal-sample';
import './paragraph-proposal.css';

export function ParagraphProposalPanel({ runtime }: { runtime: WordRuntime }) {
  const [, render] = useState(0);
  const [preview, setPreview] = useState<ReturnType<typeof createParagraphProposalPreview>>();
  const scope = runtime.view.contentEditableElement;
  const owner = () => {
    const doc = scope.ownerDocument;
    return !!doc.activeElement && scope.contains(doc.activeElement)
      && !doc.activeElement.closest('[data-editor-input-owner]') && ownsEditorSelection(runtime.editor, doc.getSelection(), scope);
  };
  useEffect(() => {
    const current = createParagraphProposalPreview(runtime.editor, () => render(value => value + 1));
    setPreview(current);
    const doc = scope.ownerDocument;
    let previous: { anchor: Node | null; focus: Node | null; start: number; end: number } | undefined;
    const selectionChanged = () => {
      const selection = doc.getSelection();
      if (!owner() || !selection || !previous || previous.anchor !== selection.anchorNode
        || previous.focus !== selection.focusNode || previous.start !== selection.anchorOffset || previous.end !== selection.focusOffset) current.invalidate();
      previous = selection ? { anchor: selection.anchorNode, focus: selection.focusNode,
        start: selection.anchorOffset, end: selection.focusOffset } : undefined;
    };
    doc.addEventListener('selectionchange', selectionChanged);
    const lostFocus = () => { if (!owner()) current.invalidate(); };
    doc.addEventListener('focusin', lostFocus);
    return () => { doc.removeEventListener('selectionchange', selectionChanged); doc.removeEventListener('focusin', lostFocus); current.dispose(); };
  }, [runtime, scope]);
  return <ParagraphProposalReview {...sample} state={preview?.state ?? 'empty'}
    original={preview?.preview?.original ?? sample.original} before={preview?.preview?.before ?? sample.before}
    after={preview?.preview?.after ?? sample.after}
    onPreview={() => {
      const range = captureTextSelection(runtime.editor, runtime.view);
      const text = range ? runtime.editor.dataStore.getNode(range.startNodeId)?.text : undefined;
      void preview?.queue(text === sample.original ? range : undefined, owner);
    }}
    onReject={() => preview?.reject()} />;
}
