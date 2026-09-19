import { useId, useRef, useState } from 'react';
import { MathEditor, type MathEditorHandle, type MathEditorProps } from '@barocss/math-editor/react';
import {
  parseLatex,
  parseMathDocument,
  toLatex,
  type MathDocument,
  type LatexParseResult,
} from '@barocss/math-editor/core';
import { RibbonTabs } from '@barocss/office-ui';
import '@barocss/math-editor/style.css';
import './latex-editor.css';

interface MathSourceEditorProps {
  tex: string;
  savedDocument?: string;
  visual: boolean;
  inline: boolean;
  readOnly: boolean;
  excludedStructures?: MathEditorProps['excludedStructures'];
  onChange: (tex: string, document: string) => void;
}

/** A popup-local draft: mode changes never write to the host document. */
export function MathSourceEditor({
  tex,
  savedDocument,
  visual,
  inline,
  readOnly,
  excludedStructures,
  onChange,
}: MathSourceEditorProps) {
  const load = (): { document?: MathDocument; error?: string } => {
    const saved = savedDocument && parseMathDocument(savedDocument);
    const result =
      saved && toLatex(saved) === tex ? { ok: true as const, document: saved } : parseLatex(tex);
    if (!result.ok) {
      const issue = result.diagnostics[0];
      return {
        error: `이 구문은 아직 시각 편집으로 불러올 수 없습니다. 원문을 수정하거나 그대로 유지하세요. (${
          issue.start + 1
        }번째 문자, ${issue.code})`,
      };
    }
    if (inline && result.document.additionalLines?.length)
      return { error: '인라인 수식에는 여러 줄을 불러올 수 없습니다. 블록 수식을 사용하세요.' };
    return { document: result.document };
  };
  const [initial] = useState(load);
  const api = useRef<MathEditorHandle>(null);
  const panelId = useId();
  const lastVisualSource = useRef(initial.document ? tex : undefined);
  const [mode, setMode] = useState(visual && initial.document && !readOnly ? 'visual' : 'source');
  const [error, setError] = useState(visual ? initial.error : undefined);
  const importError = (result: Extract<LatexParseResult, { ok: false }>) => {
    const issue = result.diagnostics[0];
    return inline && issue.code === 'unsupported-structure'
      ? '인라인 수식에는 여러 줄을 불러올 수 없습니다. 블록 수식을 사용하세요.'
      : `이 구문은 아직 시각 편집으로 불러올 수 없습니다. 원문을 수정하거나 그대로 유지하세요. (${issue.start + 1}번째 문자, ${issue.code})`;
  };
  return (
    <div className="oe-math-source">
      <div className="oe-math-modes">
        <RibbonTabs label="수식 편집 방식" panelId={panelId} value={mode}
          options={readOnly ? [{ id: 'source', label: 'LaTeX 원문' }] : [
            { id: 'visual', label: '시각 편집' }, { id: 'source', label: 'LaTeX 원문' },
          ]}
          onChange={nextMode => {
            if (nextMode === mode) return;
            if (nextMode === 'visual') {
              if (readOnly) return;
              if (tex !== lastVisualSource.current) {
                const result = api.current!.importLatex(tex);
                if (!result.ok) {
                  setError(importError(result));
                  return;
                }
                lastVisualSource.current = toLatex(result.document);
              }
            }
            setError(undefined);
            setMode(nextMode);
          }}
        />

      </div>
      <div role="tabpanel" id={panelId} aria-labelledby={`${panelId}-${mode}`}>
      {error && <p role="alert">{error}</p>}
      {!readOnly && <div hidden={mode !== 'visual'} className="oe-math-surface" aria-label="수식 시각 편집기">
        <MathEditor
          apiRef={api}
          defaultValue={initial.document}
          multiline={!inline}
          excludedStructures={excludedStructures}
          showTokenLegend={false}
          showLineNumbers={false}
          showPopovers={mode === 'visual'}
          locale="ko"
          onChange={(next, latex) => {
            lastVisualSource.current = latex;
            onChange(latex, JSON.stringify(next));
          }}
        />
      </div>}
      {mode === 'source' && (
        <label>
          LaTeX 수식
          <textarea
            aria-label="LaTeX 수식"
            value={tex}
            maxLength={10000}
            readOnly={readOnly}
            onChange={(event) => {
              onChange(event.target.value, '');
              setError(undefined);
            }}
            placeholder={'\\frac{a}{b} + x^2'}
          />
        </label>
      )}
      </div>
    </div>
  );
}
