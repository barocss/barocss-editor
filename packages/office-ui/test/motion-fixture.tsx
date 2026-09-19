import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Dialog, Drawer } from '../src/dialog';
import { SidePeek } from '../src/side-peek';
import { FloatingSurface } from '../src/floating';
import { Tip, TipProvider } from '../src/tip';
import '../src/tokens.css';

export function mountMotionFixture() {
  const host = document.createElement('div'); document.body.appendChild(host);
  function Fixture() {
    const [dialog, setDialog] = useState(false), [peek, setPeek] = useState(false), [menu, setMenu] = useState(false), [drawer, setDrawer] = useState(false);
    return <TipProvider>
      <button onClick={() => setDialog(true)}>Motion dialog</button>
      <button onClick={() => setDrawer(true)}>Motion drawer</button>
      <button onClick={() => setPeek(true)}>Motion peek</button>
      <button onClick={() => setMenu(!menu)}>Motion menu</button>
      <Tip label="Motion tooltip"><button>Motion hint</button></Tip>
      <Dialog open={dialog} onOpenChange={setDialog} title="Motion dialog title" description="Motion test"><input aria-label="Motion input" /></Dialog>
      <Drawer open={drawer} onOpenChange={setDrawer} title="Motion drawer title" description="Drawer test"><p>Drawer body</p></Drawer>
      <SidePeek open={peek} onOpenChange={setPeek} title="Motion peek title"><p>Body</p></SidePeek>
      {menu && <FloatingSurface open at={new DOMRect(100, 100, 80, 20)} role="menu" variant="menu" onDismiss={() => setMenu(false)}><button role="menuitem">Motion action</button></FloatingSurface>}
    </TipProvider>;
  }
  createRoot(host).render(<Fixture />);
}
