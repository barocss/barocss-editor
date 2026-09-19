import type { ReactNode } from 'react';
import { cn } from './cn';
import { useEditorNavigation } from './editor-host';
import { MenuBar } from './menubar';
import type { MenuBlock } from './menu';

/** One product-menu trigger; hosts provide actions and persistence boundaries. */
export function ProductMenu({ product, blocks, onPick, id = 'product', label = `${product} 제품 메뉴` }: {
  product: 'Note' | 'Word' | 'Slides' | 'Site';
  blocks: MenuBlock[];
  onPick: (id: string) => void;
  id?: string;
  label?: string;
}) {
  return <MenuBar className="office-product-menu" label={label} menus={[{ id, label: product, blocks }]} onPick={onPick} />;
}

/** Document identity and file commands. Product code owns the actions and save state. */
export function DocumentBar({ children, className }: { children: ReactNode; className?: string }) {
  return <header className={cn('office-command-surface office-document-bar', className)}>{children}</header>;
}

/** One product signature throughout the suite; document titles remain separate. */
export function ProductLabel({ name }: { name: 'Note' | 'Word' | 'Slides' | 'Site' }) {
  return <span className="office-product-label"><span aria-hidden="true" className="office-product-mark">{name[0]}</span>{name}</span>;
}

/** One header owns workspace navigation, document identity and document menus. */
export function EditorHeader({ product, title, menus, actions, view, fallbackNavigation, className }: {
  product: 'Note' | 'Word' | 'Slides' | 'Site';
  title: ReactNode;
  menus: ReactNode;
  actions?: ReactNode;
  view?: ReactNode;
  fallbackNavigation?: ReactNode;
  className?: string;
}) {
  const Navigation = useEditorNavigation();
  return <div className={cn('office-editor-header office-command-surface', className)}>
    <DocumentBar>
      {Navigation ? <Navigation product={product} /> : fallbackNavigation ?? <div className="office-editor-product"><ProductLabel name={product} /></div>}
      <div className="office-editor-title" data-document-identity>{title}</div>
      <div className="office-editor-commands">
        <div className="office-editor-menus">{menus}</div>
        <div className="office-editor-actions" aria-label="문서 작업">{actions}</div>
      </div>
      {view && <div className="office-editor-view" aria-label="보기 도구">{view}</div>}
    </DocumentBar>
  </div>;
}

/** Navigation and properties share the same section heading and action placement. */
export function PanelHeader({ title, actions, property = false }: { title: string; actions?: ReactNode; property?: boolean }) {
  return <div className="office-panel-header" data-panel-header data-property-header={property || undefined}>
    <h2>{title}</h2>{actions && <div className="office-panel-actions">{actions}</div>}
  </div>;
}
