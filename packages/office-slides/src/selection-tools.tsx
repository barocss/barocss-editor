import { useState, type RefObject } from 'react';
import type { Editor } from '@barocss/editor-core';
import { ControlRows } from '@barocss/office-editor-ui';
import { ChoiceSelect, ColorPalette, Icon, MenuAction, PropertyNumber, SecondaryPopup } from '@barocss/office-ui';
import { WORD_TEXT_COLOR } from '@barocss/office-controls';
import { Ribbon } from './ribbon';
import { SLIDES_TOOLBAR } from './toolbar-model';
import { slidesControlActions } from './toolbar-actions';
import type { Slide } from './deck';
import './selection-tools.css';

export type SlidesToolContext = 'text' | 'objectText' | 'caret' | 'table' | 'textFrame' | 'picture' | 'shape' | 'line' | 'multiple' | 'object';
const primary: Record<SlidesToolContext, string[]> = {
  text: ['bold', 'italic', 'underline', 'strike'], objectText: ['bold', 'italic', 'underline', 'strike'], caret: ['align-left', 'align-center', 'align-right', 'bullet-list'],
  table: ['row-below', 'column-right', 'cells-merge', 'cell-split'], textFrame: ['duplicate-boxes', 'bring-forward', 'send-backward'],
  picture: ['flip-h', 'flip-v', 'duplicate-boxes'], shape: ['flip-h', 'flip-v', 'duplicate-boxes'],
  line: ['bring-forward', 'send-backward', 'duplicate-boxes'], multiple: ['align-boxes-left', 'align-boxes-centre', 'align-boxes-top', 'group-boxes', 'ungroup-boxes'],
  object: ['duplicate-boxes', 'bring-forward', 'send-backward']
};
const secondary: Record<SlidesToolContext, string[]> = {
  objectText: ['duplicate-boxes', 'bring-front', 'bring-forward', 'send-backward', 'send-back', 'delete-boxes'],
  text: ['align-left', 'align-center', 'align-right', 'align-justify', 'bullet-list', 'ordered-list', 'outdent', 'indent'],
  caret: ['align-justify', 'ordered-list', 'outdent', 'indent'],
  table: ['row-above', 'column-left', 'row-delete', 'column-delete', 'table-delete', 'align-left', 'align-center', 'align-right'],
  textFrame: ['flip-h', 'flip-v', 'bring-front', 'send-back', 'delete-boxes'],
  picture: ['bring-front', 'bring-forward', 'send-backward', 'send-back', 'delete-boxes'],
  shape: ['bring-front', 'bring-forward', 'send-backward', 'send-back', 'delete-boxes'],
  line: ['bring-front', 'send-back', 'delete-boxes'],
  multiple: ['align-boxes-right', 'align-boxes-middle', 'align-boxes-bottom', 'distribute-h', 'distribute-v', 'bring-front', 'bring-forward', 'send-backward', 'send-back', 'duplicate-boxes', 'delete-boxes'],
  object: ['bring-front', 'send-back', 'delete-boxes']
};

/** The native command inventory stays shared with Ribbon; this surface only chooses context. */
export function SlidesSelectionTools({ editor, slides, current, context, nodeIds, owner, canRunIntent }: {
  editor: Editor; slides: Slide[]; current?: string; context: SlidesToolContext; nodeIds: string[];
  owner: RefObject<HTMLElement | null>; canRunIntent: () => boolean;
}) {
  const [open, setOpen] = useState(false);
  const summary = editor.getSelectionSummary();
  const actions = slidesControlActions({ editor, current, canRunIntent });
  const groups = SLIDES_TOOLBAR.filter(group => group.controls.some(control => !!control.id && primary[context].includes(control.id)));
  const more = SLIDES_TOOLBAR.map(group => ({ ...group, controls: group.controls.filter(control => !!control.id && secondary[context].includes(control.id)) })).filter(group => group.controls.length);
  const shared = (key: string) => {
    const values = nodeIds.map(id => editor.dataStore.getNode(id)?.attributes?.[key]);
    return values.length && values.every(value => value === values[0]) ? values[0] : null;
  };
  const permits = (key: string, value: unknown) => editor.isEditable && editor.canExecuteCommand('setBoxStyle', { nodeIds, [key]: value });
  const write = (key: string, value: unknown) => {
    if (canRunIntent() && permits(key, value)) void editor.executeCommand('setBoxStyle', { nodeIds, [key]: value, canApply: canRunIntent });
  };
  const choice = (key: string, label: string, options: { id: string; label: string }[], fallback: string) => <ChoiceSelect
    ariaLabel={label} portalContainer={owner} options={options} value={typeof shared(key) === 'string' ? String(shared(key)) : shared(key) === undefined ? fallback : null}
    disabled={!permits(key, options[0].id)} onChange={value => write(key, value)} className="sl-selection-choice" />;
  return <>
    {context === 'textFrame' && choice('verticalAlign', '세로 맞춤', [{id:'top',label:'위'},{id:'middle',label:'가운데'},{id:'bottom',label:'아래'}], 'top')}
    {context === 'picture' && choice('fit', '그림 맞춤', [{id:'contain',label:'전체 보기'},{id:'cover',label:'가득 채우기'},{id:'fill',label:'늘이기'}], 'contain')}
    {(context === 'shape' || context === 'line') && <>
      <ColorPalette id="selection-stroke" label="선 색" icon={<Icon name="insert-line" />} value={typeof shared('stroke') === 'string' && /^#?[0-9a-f]{6}$/i.test(String(shared('stroke'))) ? String(shared('stroke')).replace(/^#/,'') : null}
        swatches={WORD_TEXT_COLOR.swatches} disabled={!permits('stroke','#000000')} clearLabel="선 없음" onPick={value => write('stroke',`#${value}`)} onClear={() => write('stroke',null)} />
      <span className="sl-selection-number"><PropertyNumber ariaLabel="선 두께" value={typeof shared('strokeWidth') === 'number' ? Number(shared('strokeWidth')) / 20 : shared('strokeWidth') === undefined ? 0 : null} min={0} suffix="pt" step={0.25} disabled={!permits('strokeWidth',15)} onCommit={value => write('strokeWidth',Math.round(value * 20))} /></span>
    </>}
    <Ribbon inline editor={editor} slides={slides} current={current} groupIds={groups.map(group => group.id)} controlIds={primary[context]}
      fontControls={(context === 'text' || context === 'objectText') ? ['family','size','color'] : []} directControls portalContainer={owner} canRunIntent={canRunIntent} />
    <div data-slides-more-owner={open || undefined}>
      <SecondaryPopup triggerLabel="선택 도구 더보기" label="선택한 Slides 추가 도구" variant="menu" className="sl-selection-menu" open={open} onOpenChange={setOpen}>
        {more.map((group,index) => <div key={group.id} role="group" aria-label={group.id}>
          {index > 0 && <div role="separator" className="sl-selection-menu-separator" />}
          <ControlRows editor={editor} controls={group.controls} options={{...actions,state:control => control.state?.(summary) ?? 'off'}}>{rows => rows.map(row =>
            <MenuAction key={row.key} data-control={row.key} disabled={row.disabled} role={row.control.state ? 'menuitemcheckbox' : 'menuitem'} aria-checked={row.control.state ? row.state === 'mixed' ? 'mixed' : row.state === 'on' : undefined} onClick={() => { row.run(); setOpen(false); }}>
              {row.control.icon && <Icon name={row.control.icon} size={16} />}<span>{row.label}</span>{row.control.state && row.state === 'on' && <Icon name="chosen" size={14} />}
            </MenuAction>)}</ControlRows>
        </div>)}
      </SecondaryPopup>
    </div>
  </>;
}
