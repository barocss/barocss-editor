import { useState } from 'react';
import type { Editor } from '@barocss/editor-core';
import { Button, Dialog, Icon, RibbonAction, useRevision } from '@barocss/office-ui';
import { MathSourceEditor } from '@barocss/office-editor-ui';
import { createMathDocument, parseLatex, parseMathDocument, toLatex, type MathDocument } from '@barocss/math-editor/core';
import { wordToMathEditor, wordMathExcludedStructures } from './math-editor-bridge';
import { applyWordMathDraft, captureWordMathTarget, type WordMathTarget } from './math-editor-session';

/** Word owns its model/history; the embedded editor owns only a disposable draft. */
export function WordMathEditor({ editor, ribbon = false }: { editor: Editor; ribbon?: boolean }) {
 useRevision(update => { editor.on('editor:selection.model', update); editor.on('editor:content.change', update); return () => { editor.off('editor:selection.model', update); editor.off('editor:content.change', update); }; }, [editor]);
 const [session, setSession] = useState<{ target: WordMathTarget; initial: MathDocument }>();
 const [draft, setDraft] = useState(''), [savedDocument, setSavedDocument] = useState('');
 const [error, setError] = useState(''), [busy, setBusy] = useState(false);
 const target = captureWordMathTarget(editor);
 const open = () => {
  if (!target) return; setError('');
  try { const initial = target.math ? wordToMathEditor(target.math) : createMathDocument(); setDraft(toLatex(initial)); setSavedDocument(JSON.stringify(initial)); setSession({ target, initial }); }
  catch (e) { setError((e as Error).message); }
 };
 const apply = async () => {
  if (!session || busy) return; setBusy(true); setError('');
  try {
   const saved = savedDocument ? parseMathDocument(savedDocument) : undefined;
   const parsed = saved && toLatex(saved) === draft ? { ok: true as const, document: saved } : parseLatex(draft);
   if (!parsed.ok) {
    const issue = parsed.diagnostics[0];
    throw new Error(`LaTeX를 확인해 주세요. ${issue.start + 1}번째 문자: ${issue.code}`);
   }
   await applyWordMathDraft(editor, session.target, parsed.document);
   setSession(undefined);
  }
  catch (e) { setError((e as Error).message); }
  finally { setBusy(false); }
 };
 return <>
  {ribbon ? <RibbonAction id="edit-math" label={target?.math ? '수식 편집' : '수식 삽입'} icon={<Icon name="math" />} disabled={!target} onActivate={open} /> : <Button disabled={!target} onClick={open}>{target?.math ? '수식 편집' : '수식 삽입'}</Button>}
  {error && !session && <span role="alert">{error}</span>}
  <Dialog open={!!session} onOpenChange={open => { if (!open && !busy) { setSession(undefined); setError(''); } }} title={session?.target.math ? '수식 편집' : '수식 삽입'}
   description="수식을 직접 편집하거나 LaTeX 원문을 입력하세요. 적용할 때 문서에 반영됩니다."
   className="oe-math-dialog w-math-editor-dialog" footer={<><Button disabled={busy} onClick={() => { setSession(undefined); setError(''); }}>취소</Button><Button disabled={busy || !editor.isEditable} onClick={() => void apply()}>적용</Button></>}>
   {session && <div className="oe-latex-editor" data-editor-input-owner="word-math-dialog">
    <MathSourceEditor tex={draft} savedDocument={savedDocument} visual inline readOnly={!editor.isEditable}
     excludedStructures={wordMathExcludedStructures}
     onChange={(tex, document) => { setDraft(tex); setSavedDocument(document); setError(''); }} />
   </div>}
   {error && <p role="alert">{error}</p>}
  </Dialog>
 </>;
}
