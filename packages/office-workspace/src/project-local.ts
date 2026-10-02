import { OfficeWorkspace } from './workspace';
import type { ProjectRepository } from './project-ui';

export function localProjectRepository(workspace: OfficeWorkspace): ProjectRepository {
  return {
    writable: true,
    list: () => workspace.projects(),
    read: id => workspace.project(id),
    create: (title, goal) => workspace.createProject(title, goal),
    save: (record, revision) => workspace.saveProject(record, revision),
    documents: async () => (await workspace.list()).map(row => ({ product: row.product, id: row.id, title: row.title, unavailable: row.trashedAt !== null })),
    createDocument: async (product, title) => ({ product, id: await workspace.create(product, title), title }),
    pin: document => workspace.pin(document),
    readPin: async (projectId, pinId) => {
      const project = await workspace.project(projectId);
      if (!project) throw new Error('프로젝트가 없습니다.');
      const pin = [...project.record.results.flatMap(one => one.inputs), ...project.record.comments.map(one => one.pin), ...project.record.works.flatMap(one => one.inputs)].find(one => one.id === pinId);
      if (!pin) throw new Error('보관한 버전이 없습니다.');
      if ((await workspace.meta(`${pin.document.product}:${pin.document.id}`)).trashedAt !== null) throw new Error('원본이 휴지통에 있습니다. 복원 후 참고 버전을 확인하세요.');
      const rows = await workspace.list();
      if (!rows.some(one => one.product === pin.document.product && one.id === pin.document.id)) return { ...pin, sourceState: 'unavailable' };
      const current = await workspace.require(pin.document.product, pin.document.id);
      return { ...pin, sourceState: current.row.revision === pin.revision && current.text === pin.text ? 'current' : 'changed' };
    }
  };
}
