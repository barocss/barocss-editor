import type { ReactNode } from 'react';
import './workspace-heading.css';

/** A shared location row inside the existing Workspace shell. Actions remain owned by each view. */
export function WorkspaceHeading({ workspaceLabel, location, title, actions }: {
  workspaceLabel: string; location: string; title: string; actions?: ReactNode;
}) {
  return <header className="ow-workspace-heading">
    <div className="ow-workspace-heading-identity">
      <p className="ow-workspace-breadcrumb"><span>{workspaceLabel}</span><span aria-hidden> / </span><span>{location}</span></p>
      <h1 title={title}>{title}</h1>
    </div>
    {actions && <div className="ow-workspace-heading-actions">{actions}</div>}
  </header>;
}
