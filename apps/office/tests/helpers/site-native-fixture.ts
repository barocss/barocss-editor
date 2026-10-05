import { createSampleSite } from '../../../../packages/office-site/src/sample-site';

export type SiteNativeNode = { stype: string; attributes?: Record<string, unknown>; metadata?: Record<string, unknown>;
  text?: string; content?: SiteNativeNode[]; marks?: unknown[] };

export function siteNativeNode(document: SiteNativeNode, stype: string, id: string): SiteNativeNode {
  if (document.stype === stype && (document.attributes?.id === id || document.attributes?.name === id)) return document;
  for (const child of document.content ?? []) {
    try { return siteNativeNode(child, stype, id); } catch { /* Search the next native child. */ }
  }
  throw new Error(`Missing native fixture ${stype}:${id}`);
}
const paragraph = (text: string): SiteNativeNode => ({ stype: 'paragraph', attributes: {}, content: [
  { stype: 'inline-text', attributes: {}, text, marks: [] }
] });

export function siteNativeFixture(deep = false): SiteNativeNode {
  const document = createSampleSite() as SiteNativeNode;
  document.metadata = { provenance: 'synthetic-auth-site', loadedAt: 'native-source', preserve: ['all', 'resources'] };
  const rich = siteNativeNode(document, 'richText', '본문-스택');
  const database = (source: string): SiteNativeNode => ({ stype: 'noteDatabase', attributes: { source } });
  const dataset = (name: string, id: string, title: string): SiteNativeNode => ({ stype: 'dataset', attributes: {
    name, fields: [{ name: '이름', kind: 'text' }], records: [{ 이름: title }], rowIds: [id]
  } });
  rich.content = deep ? [database('outer'), { stype: 'resources', content: [
    dataset('outer', 'outer-item', '상위 작업'), { stype: 'richText', attributes: { id: 'outer-item' }, content: [
      database('inner'), { stype: 'resources', content: [dataset('inner', 'inner-item', '하위 작업'),
        { stype: 'richText', attributes: { id: 'inner-item' }, content: [paragraph('Nested seed')] }
      ] }
    ] }
  ] }] : [paragraph('Native body seed')];
  return document;
}
