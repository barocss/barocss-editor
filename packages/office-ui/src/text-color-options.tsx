import { useState } from 'react';
import { Button } from './controls';
import { MenuAction } from './menu-action';
import { Icon } from '@barocss/office-icons';

const COLORS = [
  ['회색', '#787774', '#f1f1ef'], ['갈색', '#9f6b53', '#f4eeee'],
  ['주황', '#c76b20', '#fbecdd'], ['노랑', '#a87d13', '#fbf3db'],
  ['초록', '#448361', '#edf3ec'], ['파랑', '#337ea9', '#e7f3f8'],
  ['보라', '#9065b0', '#f4f0f7'], ['분홍', '#b45082', '#f9eef3'],
  ['빨강', '#d44c47', '#fbe4e4']
] as const;

/** Palette content only. Editor commands and saved selections belong to office-editor-ui. */
export function TextColorOptions({ onPick, onReset, textColor, backgroundColor }: {
  onPick: (kind: 'text' | 'background', value: string) => void;
  onReset: (kind: 'text' | 'background') => void;
  textColor?: string | null;
  backgroundColor?: string | null;
}) {
  const [kind, setKind] = useState<'text' | 'background'>('text');
  const current = kind === 'text' ? textColor : backgroundColor;
  const rows = [['기본', null, null], ...COLORS] as const;
  return <div role="group" aria-label="글자 색상" style={{ width: 216 }}>
    <div className="flex gap-1 border-b border-[color:var(--ou-line)] p-1 pb-2" role="group" aria-label="색상 종류">
      <Button tone="quiet" pressed={kind === 'text'} onClick={() => setKind('text')}>글자색</Button>
      <Button tone="quiet" pressed={kind === 'background'} onClick={() => setKind('background')}>배경색</Button>
    </div>
    <div className="pt-1">
      {rows.map(([label, ink, background]) => {
        const value = kind === 'text' ? ink : background;
        const selected = current === value;
        const name = label === '기본' ? (kind === 'text' ? '기본 글자색' : '배경색 없음') : `${kind === 'text' ? '글자색' : '배경색'} ${label}`;
        return <MenuAction key={label} role="menuitemradio" aria-checked={selected} aria-label={name}
          className="gap-3 py-1" onClick={() => value ? onPick(kind, value) : onReset(kind)}>
          <span aria-hidden="true" style={{ display: 'grid', placeItems: 'center', flexShrink: 0, width: 24, height: 24,
            border: '1px solid var(--ou-line)', borderRadius: 4, fontWeight: 600,
            color: kind === 'text' && ink ? ink : 'var(--ou-ink)', background: kind === 'background' && background ? background : 'var(--ou-panel)' }}>A</span>
          <span className="flex-1">{label === '기본' && kind === 'background' ? '배경 없음' : label}</span>
          {selected && <Icon name="chosen" size={14} />}
        </MenuAction>;
      })}
    </div>
  </div>;
}
