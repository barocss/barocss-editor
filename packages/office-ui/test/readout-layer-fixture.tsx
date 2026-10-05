import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Menu } from '../src/menu';
import { SelectionReadout } from '../src/selection-readout';
import '../src/tokens.css';

export function mountReadoutLayerFixture() {
  const host = document.createElement('div');
  document.body.replaceChildren(host);
  function Fixture() {
    const [open, setOpen] = useState(false);
    const [readout, setReadout] = useState(false);
    const [picked, setPicked] = useState('none');
    return <>
      <button onClick={() => { setOpen(true); setReadout(true); }}>Open selection menu</button>
      <p contentEditable suppressContentEditableWarning aria-label="Native input" style={{ position: 'absolute', left: 32, top: 300 }}>Native selection content</p>
      <output aria-label="Picked command">{picked}</output>
      {open && <Menu at={{ x: 160, y: 120 }} label="Selection commands" compact
        blocks={[{ id: 'align', items: [
          { id: 'left', label: 'Align left' },
          { id: 'center', label: 'Align center' },
          { id: 'right', label: 'Align right' }
        ] }]}
        onClose={() => setOpen(false)} onPick={id => { setPicked(id); setOpen(false); }} />}
      {/* Later portal insertion reproduces passive feedback painting over an equal-layer menu. */}
      {readout && <SelectionReadout at={{ x: 180, y: 150 }} aria-label="Selection size">520 × 390 · maximum width</SelectionReadout>}
    </>;
  }
  createRoot(host).render(<Fixture />);
}
