import type { ReactNode, RefObject } from 'react';
import { cn } from './cn';
import { useEditorNavigation } from './editor-host';
import { MenuBar, type MenuBarMenu } from './menubar';
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

/** A single named entry keeps existing command groups and shortcuts discoverable. */
export function DocumentMenu({ menus, onPick, label = '문서 메뉴', triggerLabel, portalContainer }: {
  menus: MenuBarMenu[];
  onPick: (id: string) => void;
  label?: string;
  triggerLabel?: string;
  portalContainer?: RefObject<HTMLElement | null>;
}) {
  const blocks = menus.flatMap(menu => menu.blocks.map((block, index) => ({
    ...block, id: `${menu.id}:${block.id}`, label: index === 0 ? menu.label : block.label
  })));
  return <MenuBar compact label={label} className="office-document-menu" menus={[{ id: 'document', label: triggerLabel ?? label, ariaLabel: label, blocks }]} onPick={onPick} portalContainer={portalContainer} />;
}

/** Document identity and file commands. Product code owns the actions and save state. */
export function DocumentBar({ children, className, compact = false }: { children: ReactNode; className?: string; compact?: boolean }) {
  return <header data-compact={compact || undefined} className={cn('office-command-surface office-document-bar', className)}>{children}</header>;
}

/** One product signature throughout the suite; document titles remain separate. */
export function ProductLabel({ name }: { name: 'Note' | 'Word' | 'Slides' | 'Site' }) {
  return <span className="office-product-label"><span aria-hidden="true" className="office-product-mark">{name[0]}</span>{name}</span>;
}

/** One header owns workspace navigation, document identity and document menus. */
export function EditorHeader({ product, title, menus, actions, view, fallbackNavigation, className, compact = false }: {
  product: 'Note' | 'Word' | 'Slides' | 'Site';
  title: ReactNode;
  menus: ReactNode;
  actions?: ReactNode;
  view?: ReactNode;
  fallbackNavigation?: ReactNode;
  className?: string;
  /** Shared one-row header geometry; the caller supplies its grouped document menu. */
  compact?: boolean;
}) {
  const Navigation = useEditorNavigation();
  const navigation = Navigation ? <Navigation product={product} /> : fallbackNavigation ?? <div className="office-editor-product"><ProductLabel name={product} /></div>;
  const identity = <div className="office-editor-title" data-document-identity title={typeof title === 'string' ? title : undefined}>{title}</div>;
  const menu = <div className="office-editor-menus">{menus}</div>;
  const action = <div className="office-editor-actions" aria-label="문서 작업">{actions}</div>;
  return <div data-compact={compact || undefined} className={cn('office-editor-header office-command-surface', className)}>
    <DocumentBar compact={compact}>
      {compact ? <><div className="office-editor-identity">{navigation}{identity}{menu}</div>{action}</> :
        <>{navigation}{identity}<div className="office-editor-commands">{menu}{action}</div></>}
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
