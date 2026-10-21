import { useMemo, useState } from 'react';
import { ControlRows } from '@barocss/office-editor-ui';
import { Icon, MenuAction, SecondaryPopup, onApple } from '@barocss/office-ui';
import type { Slide } from './deck';
import { keyLabel, shortcutOf } from './keymap';
import { slidesControlActions, type SlidesControlContext } from './toolbar-actions';
import { SLIDES_TOOLBAR } from './toolbar-model';
import './insert-dropdown.css';

/** Controls already visible beside More; keep the two surfaces complementary. */
export const SLIDES_PRIMARY_CONTROL_IDS = ['undo', 'redo', 'slide-new', 'insert-textbox', 'insert-rectangle', 'insert-table', 'insert-image'];

const groups = ['insert', 'slide'].map(id => {
  const group = SLIDES_TOOLBAR.find(group => group.id === id)!;
  return { ...group, controls: group.controls.filter(control => control.id === undefined || !SLIDES_PRIMARY_CONTROL_IDS.includes(control.id)) };
});

/** The existing native command model, in one named, keyboard-walkable menu. */
export function SlidesInsertDropdown({ editor, slides, current, canRunIntent, captureIntent }: SlidesControlContext & {
  slides: Slide[];
}) {
  const [open, setOpen] = useState(false);
  const apple = useMemo(() => onApple(), []);
  const here = slides.find(slide => slide.sid === current);
  const actions = slidesControlActions({ editor, current, number: here?.number, canRunIntent, captureIntent });
  return <div data-slides-more-owner={open || undefined}>
    <SecondaryPopup triggerLabel="추가 Slides 도구" label="Slides 삽입 및 슬라이드 메뉴" variant="menu"
      open={open} onOpenChange={setOpen} disabled={!editor.isEditable} className="sl-insert-dropdown">
      {groups.map((group, index) => <div key={group.id} role="group" aria-label={group.id === 'insert' ? '삽입' : '슬라이드'}>
        {index > 0 && <div className="sl-insert-dropdown-separator" role="separator" />}
        <ControlRows editor={editor} controls={group.controls} options={{
          apple, ...actions, state: control => control.slideFlag === 'hidden' && here?.hidden ? 'on' : 'off'
        }}>{rows => rows.map(row => <MenuAction key={row.key} data-control={row.key} disabled={row.disabled}
          role={row.control.slideFlag ? 'menuitemcheckbox' : 'menuitem'} aria-checked={row.control.slideFlag ? row.state === 'on' : undefined}
          onClick={() => { row.run(); setOpen(false); }}>
          {row.control.icon && <Icon name={row.control.icon} size={16} />}
          <span className="sl-insert-dropdown-label">{row.label}</span>
          {row.state === 'on' ? <Icon name="chosen" size={14} /> :
            <span className="sl-insert-dropdown-shortcut">{keyLabel(shortcutOf(row.control.command), apple)}</span>}
        </MenuAction>)}</ControlRows>
      </div>)}
    </SecondaryPopup>
  </div>;
}
