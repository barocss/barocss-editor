import { useEffect, useLayoutEffect, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@barocss/editor-core';
import { DOMSelectionHandler } from '@barocss/editor-view-dom';
import katex from 'katex';
import { Button, Choice, Dialog, FloatingSurface } from '@barocss/office-ui';
import { useEditorRevision } from './revision';
import { MathInplaceEditor, type MathInplaceDraft } from './math-inplace-editor';
import { MathSourceEditor } from './math-source-editor';
import 'katex/dist/katex.min.css';
import './latex-editor.css';

export function latexPreview(tex: string, displayMode: boolean): { html: string; error?: string } {
  if (!tex.trim()) return { html: '', error: 'LaTeX 수식을 입력하세요.' };
  if (tex.length > 10000) return { html: '', error: '수식은 10,000자 이내로 입력하세요.' };
  try {
    return {
      html: katex.renderToString(tex, {
        displayMode,
        throwOnError: true,
        trust: false,
        maxExpand: 1000,
        maxSize: 20,
        output: 'htmlAndMathml',
      }),
    };
  } catch {
    return { html: '', error: '수식 문법을 확인하세요. 중괄호와 명령어가 올바른지 확인해 주세요.' };
  }
}
/** Shared atom rendering and source editing; document-specific insertion menus live in products. */
export function LatexEditor({
  editor,
  scope,
  structured = false,
  inPlace = false,
  onEditingFocusChange,
  registerBeforeLeave,
}: {
  editor: Editor;
  scope: RefObject<HTMLElement | null>;
  structured?: boolean;
  inPlace?: boolean;
  onEditingFocusChange?: (focused: boolean) => void;
  registerBeforeLeave?: (flush: () => Promise<boolean>) => () => void;
}) {
  const revision = useEditorRevision(editor);
  const [targets, setTargets] = useState<{ id: string; element: HTMLElement }[]>([]);
  const [selected, setSelected] = useState<string>();
  const [inlineEditing, setInlineEditing] = useState<string>();
  const [expandedFormat, setExpandedFormat] = useState<{ fontSize?: number; alignment?: string }>({});
  const [visual, setVisual] = useState(false);
  const [mathDocument, setMathDocument] = useState('');
  const [editing, setEditing] = useState<string>(),
    [draft, setDraft] = useState(''),
    [saving, setSaving] = useState(false),
    [error, setError] = useState('');
  useLayoutEffect(() => {
    const scan = () => {
      const next = [
        ...(scope.current?.querySelectorAll<HTMLElement>('[data-latex-node]') ?? []),
      ].map((host) => {
        let element = host.querySelector<HTMLElement>(':scope > [data-latex-mount]');
        if (!element) {
          element = document.createElement('span');
          element.dataset.latexMount = '';
          element.dataset.editorInputOwner = 'math';
          host.appendChild(element);
        }
        return { id: host.dataset.latexNode!, element };
      });
      setTargets((previous) =>
        previous.length === next.length &&
        previous.every((item, i) => item.element === next[i].element && item.id === next[i].id)
          ? previous
          : next,
      );
    };
    scan();
    const observer = new MutationObserver(scan);
    if (scope.current) observer.observe(scope.current, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [scope, revision]);
  useEffect(() => {
    const host = scope.current;
    if (!host) return;
    const update = () => {
      const selection = host.ownerDocument.getSelection();
      const range =
        selection && !selection.isCollapsed && selection.rangeCount
          ? selection.getRangeAt(0)
          : undefined;
      host.querySelectorAll<HTMLElement>('[data-latex-node]').forEach((atom) => {
        // KaTeX has many layout spans, but a formula is one document atom.
        atom.classList.toggle('oe-latex-range-selected', !!range?.intersectsNode(atom));
      });
    };
    update();
    host.ownerDocument.addEventListener('selectionchange', update);
    return () => host.ownerDocument.removeEventListener('selectionchange', update);
  }, [scope, targets]);
  useEffect(() => {
    const host = scope.current;
    if (!host) return;
    const converter = new DOMSelectionHandler(editor, { contentEditableElement: host });
    const key = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.shiftKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        !['ArrowLeft', 'ArrowRight'].includes(event.key) ||
        (event.target instanceof Element && event.target.closest('button,input,textarea,select'))
      )
        return;
      const native = host.ownerDocument.getSelection();
      if (!native?.anchorNode || !host.contains(native.anchorNode) || !native.isCollapsed) return;
      const range = converter.convertDOMSelectionToModel(native);
      if (
        !range ||
        range.type !== 'range' ||
        range.startNodeId !== range.endNodeId ||
        range.startOffset !== range.endOffset
      )
        return;
      const run = editor.dataStore.getNode(range.startNodeId);
      if (!run?.parentId || typeof run.text !== 'string') return;
      const direction = event.key === 'ArrowLeft' ? -1 : 1;
      if (range.startOffset !== (direction < 0 ? 0 : run.text.length)) return;
      const siblings = editor.dataStore.getNode(run.parentId)?.content ?? [],
        index = siblings.indexOf(run.sid!);
      const atom = editor.dataStore.getNode(String(siblings[index + direction]));
      const next = editor.dataStore.getNode(String(siblings[index + direction * 2]));
      if (atom?.stype !== 'mathInline' || typeof next?.text !== 'string') return;
      event.preventDefault();
      event.stopPropagation();
      const offset = direction < 0 ? next.text.length : 0;
      editor.setRange({
        type: 'range',
        startNodeId: next.sid!,
        endNodeId: next.sid!,
        startOffset: offset,
        endOffset: offset,
        collapsed: true,
      });
    };
    host.addEventListener('keydown', key, true);
    return () => host.removeEventListener('keydown', key, true);
  }, [editor, scope]);
  const node = editing ? editor.dataStore.getNode(editing) : undefined;
  const preview = latexPreview(draft, node?.stype === 'mathBlock');
  const selectedNode = selected ? editor.dataStore.getNode(selected) : undefined;
  const selectedTarget = targets.find((target) => target.id === selected)?.element;
  const change = async (patch: Record<string, unknown>) => {
    if (!selectedNode || saving) return;
    setSaving(true);
    setError('');
    try {
      if (
        !(await editor.executeCommand('setMathSource', {
          nodeId: selected,
          tex: String(selectedNode.attributes?.tex ?? ''),
          ...patch,
        }))
      )
        setError('수식 설정을 적용하지 못했습니다.');
    } catch {
      setError('수식 설정을 적용하지 못했습니다. 다시 시도하세요.');
    } finally {
      setSaving(false);
    }
  };
  const edit = (id: string, visualMode = false) => {
    const target = editor.dataStore.getNode(id);
    if (!target) return;
    setExpandedFormat({});
    setVisual(visualMode);
    setMathDocument(String(target.attributes?.mathDocument ?? ''));
    setEditing(id);
    setDraft(String(target.attributes?.tex ?? ''));
    setError('');
    setSelected(undefined);
  };

  return (
    <>
      {targets.map(({ id, element }) => {
        const node = editor.dataStore.getNode(id);
        if (!node) return null;
        const tex = String(node.attributes?.tex ?? ''),
          // The in-place editor uses full-size fractions. Keep the same math style
          // when reading; CSS retains the atom's inline document placement.
          rendered = latexPreview(tex, inPlace || node.stype === 'mathBlock');
        if (inlineEditing === id && editor.isEditable) return createPortal(
          <MathInplaceEditor key={id} editor={editor} nodeId={id} registerBeforeLeave={registerBeforeLeave} onFocusChange={onEditingFocusChange}
            onClose={(showTools = true) => { setInlineEditing(current => current === id ? undefined : current); setSelected(showTools ? id : undefined); }}
            onExpand={(value: MathInplaceDraft) => {
              edit(id, true);
              setDraft(value.tex); setMathDocument(value.mathDocument);
              setExpandedFormat({ fontSize: value.fontSize, alignment: value.alignment });
              setInlineEditing(undefined);
            }} />,
          element, id,
        );
        return createPortal(
          <button
            type="button"
            className="oe-latex"
            data-inplace={inPlace || undefined}
            style={{
              fontSize: Number(node.attributes?.fontSize) || (node.stype === 'mathBlock' ? 24 : 18),
            }}
            aria-label={`${node.stype === 'mathBlock' ? '블록' : '인라인'} 수식 편집`}
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (!inPlace) setSelected(id);
            }}
            onMouseDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onClick={() => {
              if (inPlace && structured && editor.isEditable) { setSelected(undefined); setInlineEditing(id); }
              else if (structured && !tex.trim() && editor.isEditable) edit(id, true);
              else setSelected(id);
            }}
            onDoubleClick={() => {
              if (!inPlace && structured && editor.isEditable) edit(id, true);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && structured && editor.isEditable) {
                event.preventDefault();
                if (inPlace) setInlineEditing(id); else edit(id, true);
              }
            }}
          >
            {rendered.error ? (
              <span>{tex ? '수식 오류 · 편집' : '수식 입력'}</span>
            ) : (
              <span dangerouslySetInnerHTML={{ __html: rendered.html }} />
            )}
          </button>,
          element,
          id,
        );
      })}
      <FloatingSurface
        open={!!selectedNode && !editing}
        at={selectedTarget?.getBoundingClientRect() ?? null}
        variant="toolbar"
        aria-label="수식 도구"
        ownedElements={[selectedTarget ?? null]}
        onDismiss={() => setSelected(undefined)}
      >
        <div className="oe-latex-actions" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
          <Choice
            ariaLabel="수식 크기 바로 변경"
            value={String(
              selectedNode?.attributes?.fontSize ?? (selectedNode?.stype === 'mathBlock' ? 24 : 18),
            )}
            disabled={saving || !editor.isEditable}
            onChange={(value) => void change({ fontSize: Number(value) })}
          >
            {[16, 18, 20, 24, 32, 40, 48].map((value) => (
              <option key={value} value={value}>
                {value}px
              </option>
            ))}
          </Choice>
          {selectedNode?.stype === 'mathBlock' && (
            <Choice
              ariaLabel="수식 정렬"
              value={String(selectedNode.attributes?.alignment ?? 'center')}
              disabled={saving || !editor.isEditable}
              onChange={(value) => void change({ alignment: value })}
            >
              <option value="left">왼쪽</option>
              <option value="center">가운데</option>
              <option value="right">오른쪽</option>
            </Choice>
          )}
          <>
            {structured && (
              <Button
                disabled={!editor.isEditable}
                onClick={() => selected && edit(selected, true)}
              >
                수식 편집
              </Button>
            )}
            <Button onClick={() => selected && edit(selected)}>수식 원문 편집</Button>
          </>
          {error && <span role="alert">{error}</span>}
        </div>
      </FloatingSurface>
      <Dialog
        open={!!node}
        onOpenChange={(open) => {
          if (!open && !saving) setEditing(undefined);
        }}
        title="수학 수식"
        className={structured ? 'oe-math-dialog' : undefined}
        footer={
          <div className="oe-latex-actions">
            <Button disabled={saving} onClick={() => setEditing(undefined)}>
              취소
            </Button>
            <Button
              tone="accent"
              disabled={saving || !editor.isEditable || !!preview.error}
              onClick={async () => {
                setSaving(true);
                try {
                  if (
                    await editor.executeCommand('setMathSource', {
                      nodeId: editing,
                      tex: draft,
                      ...expandedFormat,
                      ...(structured ? { mathDocument } : {}),
                    })
                  )
                    setEditing(undefined);
                  else setError('수식을 저장하지 못했습니다. 항목이 삭제되었는지 확인하세요.');
                } catch {
                  setError('수식을 저장하지 못했습니다. 다시 시도하세요.');
                } finally {
                  setSaving(false);
                }
              }}
            >
              수식 적용
            </Button>
          </div>
        }
        description={
          structured
            ? '수식을 직접 편집하거나 LaTeX 원문을 입력하세요.'
            : 'LaTeX를 입력하고 미리보기를 확인하세요.'
        }
      >
        <div className="oe-latex-editor">
          {structured && node ? (
            <MathSourceEditor
              key={editing}
              tex={draft}
              savedDocument={mathDocument}
              visual={visual}
              inline={node.stype === 'mathInline'}
              readOnly={!editor.isEditable}
              onChange={(tex, document) => {
                setDraft(tex);
                setMathDocument(document);
                setError('');
              }}
            />
          ) : (
            <label>
              LaTeX 수식
              <textarea
                aria-label="LaTeX 수식"
                value={draft}
                maxLength={10000}
                readOnly={!editor.isEditable}
                onChange={(event) => {
                  setDraft(event.target.value);
                  setError('');
                }}
                placeholder={'\\frac{a}{b} + x^2'}
              />
            </label>
          )}

          <div aria-label="수식 미리보기" className="oe-latex-preview">
            <div className="oe-latex-preview-label">미리보기</div>
            {preview.error ? (
              <p role="status">{preview.error}</p>
            ) : (
              <span dangerouslySetInnerHTML={{ __html: preview.html }} />
            )}
          </div>
          {error && <p role="alert">{error}</p>}

        </div>
      </Dialog>
    </>
  );
}
