import { Icon } from '@barocss/office-icons';
import { IconButton } from './controls';

/** Independent row tools. State remains in the product model. */
export function LayerActions({ label, hidden, locked, onHiddenChange, onLockedChange, visibilityData, lockData }: {
  label: string; hidden: boolean; locked: boolean;
  onHiddenChange: (hidden: boolean) => void;
  onLockedChange: (locked: boolean) => void;
  visibilityData?: Record<string, string>; lockData?: Record<string, string>;
}) {
  return <span className="office-layer-actions" data-layer-control data-persistent={hidden || locked || undefined}
    onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}
    onKeyDown={event => { if (['Enter', ' ', 'Delete', 'Backspace', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) event.stopPropagation(); }}>
    <IconButton size="sm" label={`${label} ${hidden ? '보이기' : '숨기기'}`} pressed={hidden} data={visibilityData} onClick={() => onHiddenChange(!hidden)}>
      <Icon name={hidden ? 'hide' : 'shown'} size={14} />
    </IconButton>
    <IconButton size="sm" label={`${label} ${locked ? '잠금 해제' : '잠그기'}`} pressed={locked} data={lockData} onClick={() => onLockedChange(!locked)}>
      <Icon name={locked ? 'locked' : 'unlocked'} size={14} />
    </IconButton>
  </span>;
}
