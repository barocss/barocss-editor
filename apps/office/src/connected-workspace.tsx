import { useMemo, useState } from 'react';
import { ProjectHome, type ProjectDocument } from '@barocss/office-workspace/project';
import { serverProjectRepository } from './project-client';
import type { TenantRole } from './auth-client';
import '@barocss/office-workspace/style.css';
import { formatWorkspaceRoute, parseWorkspaceRoute } from '@barocss/office-workspace';

export function ConnectedWorkspace({ tenant, workspace, role, onOpen, onLibrary }: { tenant: string; workspace: string; role: TenantRole;
  onOpen(project: string, document: ProjectDocument): Promise<void>; onLibrary(): void }) {
  const repository = useMemo(() => serverProjectRepository(tenant, workspace, role), [tenant, workspace, role]);
  const [projectId, setProjectId] = useState(() => {
    const parsed = parseWorkspaceRoute(location.href);
    return !('error' in parsed) && parsed.route?.kind === 'item' ? parsed.route.itemId : undefined;
  });
  return <ProjectHome repository={repository} initialProjectId={projectId} onLocationChange={id => { setProjectId(id ?? undefined); history.replaceState(history.state, '',
    formatWorkspaceRoute(id ? { kind: 'item', tenantId: tenant, workspaceId: workspace, itemId: id }
      : { kind: 'workspace', tenantId: tenant, workspaceId: workspace, view: 'projects' })); }} onOpen={onOpen} onLibrary={onLibrary} />;
}
