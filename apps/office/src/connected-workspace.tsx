import { useEffect, useMemo } from 'react';
import { ProjectHome, type ProjectDocument } from '@barocss/office-workspace/project';
import { serverProjectRepository } from './project-client';
import type { TenantRole } from './auth-client';
import '@barocss/office-workspace/style.css';

export function ConnectedWorkspace({ tenant, workspace, role, onOpen, onLibrary }: { tenant: string; workspace: string; role: TenantRole;
  onOpen(project: string, document: ProjectDocument): Promise<void>; onLibrary(): void }) {
  const repository = useMemo(() => serverProjectRepository(tenant, workspace, role), [tenant, workspace, role]);
  useEffect(() => { const url = new URL(location.href); url.searchParams.set('tenant', tenant); url.searchParams.set('workspace', workspace); history.replaceState(null, '', url); }, [tenant, workspace]);
  return <ProjectHome repository={repository} onOpen={onOpen} onLibrary={onLibrary} />;
}
