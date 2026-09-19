import type { RendererRegistry } from '@barocss/dsl';
import { createTextEnv } from '../../src/text-context';
import type { DocumentNode } from '../../src/document-access';

/** Table theme paints descendants, so probing an empty table cannot observe its reader.
 * Use each product's real cell renderer over a complete, resolved table fixture.
 */
export function withTableThemeRead(registry: RendererRegistry, fallback: (type: string, attr: string) => boolean | null) {
  return (type: string, attr: string): boolean | null => {
    if (type !== 'bTable' || attr !== 'theme') return fallback(type, attr);
    const template = registry.get('bTableCell')?.template;
    if (!template || typeof template !== 'object' || !('type' in template) || template.type !== 'component' || !template.component) return null;
    const draw = (theme?: string) => {
      const nodes: Record<string, DocumentNode> = {
        root: { sid: 'root', stype: 'document', content: ['table'] },
        table: { sid: 'table', stype: 'bTable', parentId: 'root', attributes: theme ? { theme } : {}, content: ['body'] },
        body: { sid: 'body', stype: 'bTableBody', parentId: 'table', content: ['row'] },
        row: { sid: 'row', stype: 'bTableRow', parentId: 'body', content: ['cell'] },
        cell: { sid: 'cell', stype: 'bTableCell', parentId: 'row', content: ['text'] },
        text: { sid: 'text', stype: 'inline-text', parentId: 'cell', text: 'Visible content' }
      };
      const doc = { rootId: 'root', getNode: (sid: string) => nodes[sid] };
      const model = nodes.cell;
      const rendered = template.component!({}, model, { id: 'cell', env: { word: createTextEnv(doc) }, state: {}, props: {}, model, registry, initState() {}, getState() { return undefined; }, setState() {}, toggleState() {} });
      if (rendered.type !== 'element') return undefined;
      return (rendered.attributes.style as Record<string, unknown> | undefined)?.backgroundColor;
    };
    const plain = draw();
    return ['striped', 'blue'].some(theme => draw(theme) !== plain);
  };
}
