import type { Exemptions } from '@barocss/conformance';
import type { RendererRegistry } from '@barocss/dsl';
import { assertSlidesNativeReferences } from '../../src/native-identity';
import { createSlidesEditor } from '../../src/slides-kit';
import { createConnectorPass, routeFromEnv } from '../../src/connector-pass';

// Exact native graph readers, not a family-wide exemption for future attributes.
export const nativeIdentityTypes = [
  'frame', 'group', 'rectangle', 'ellipse', 'line', 'picture', 'connector',
  'path', 'sticky', 'textFrame', 'component', 'instance'
] as const;

export function identityFixture(type: string, secondId = 'second-object') {
  return { stype: 'document', content: [{ stype: 'surface', content: [
    { stype: type, attributes: { objectId: 'first-object' } },
    { stype: type, attributes: { objectId: secondId } }
  ] }] };
}

/** The nonvisual claim is admitted only while the real graph reader proves it. */
export function nativeIdentityReaderClaims(): Exemptions {
  return Object.fromEntries(nativeIdentityTypes.map(type => {
    assertSlidesNativeReferences(identityFixture(type));
    let rejectsDuplicate = false;
    try { assertSlidesNativeReferences(identityFixture(type, 'first-object')); }
    catch (error) { rejectsDuplicate = error instanceof Error && error.message === 'Duplicate or invalid Slides object identity.'; }
    if (!rejectsDuplicate) throw new Error(`${type}.objectId no longer rejects a duplicate native identity`);
    return [`${type}.objectId`, {
      reason: `native-identity.ts graph/assertSlidesNativeReferences reads ${type}.objectId to preserve unique durable identity; native-identity-probe.ts verifies unique acceptance and duplicate refusal before this claim is registered`,
      covers: ['every-attribute-is-read']
    }];
  }));
}

export function connectorIdentityFixture(end: 'start' | 'end', targetId: string) {
  return { stype: 'document', content: [{ stype: 'surface', attributes: { kind: 'slide' }, content: [
    { stype: 'rectangle', attributes: { objectId: 'target-a', x: 0, y: 0, width: 2000, height: 1000 } },
    { stype: 'rectangle', attributes: { objectId: 'target-b', x: 6000, y: 4000, width: 2000, height: 1000 } },
    { stype: 'connector', attributes: { objectId: 'line-object', kind: 'straight',
      startX: 10000, startY: 8000, endX: 14000, endY: 11000, [`${end}ObjectId`]: targetId } }
  ] }] };
}

/** A durable endpoint is resolved by the native loader before the real render pass reads it. */
export function drawNativeConnector(registry: RendererRegistry, end: 'start' | 'end', targetId: string) {
  const editor = createSlidesEditor();
  try {
    editor.loadDocument(connectorIdentityFixture(end, targetId));
    const line = [...editor.dataStore.getNodes().values()].find(node => node.attributes?.objectId === 'line-object')!;
    const doc = { rootId: editor.getRootId()!, getNode: (sid: string) => editor.dataStore.getNode(sid) };
    const env = createConnectorPass({ doc })();
    const route = routeFromEnv(env || undefined, line.sid!);
    const template = registry.get('connector')?.template;
    if (!template || typeof template !== 'object' || !('type' in template) || template.type !== 'component' || !template.component)
      throw new Error('Slides connector renderer is unavailable');
    const rendered = template.component({}, line, { id: line.sid!, env: env || {}, state: {}, props: {}, model: line,
      registry, initState() {}, getState() { return undefined; }, setState() {}, toggleState() {} });
    const paths: string[] = [];
    JSON.stringify(rendered, (key, value: unknown) => {
      if (key === 'd' && typeof value === 'string') paths.push(value);
      return value;
    });
    return { route, paths };
  } finally { editor.destroy(); }
}

export function withNativeConnectorRead(registry: RendererRegistry, fallback: (type: string, attr: string) => boolean | null) {
  return (type: string, attr: string): boolean | null => {
    if (type !== 'connector' || (attr !== 'startObjectId' && attr !== 'endObjectId')) return fallback(type, attr);
    const end = attr === 'startObjectId' ? 'start' : 'end';
    const first = drawNativeConnector(registry, end, 'target-a');
    const second = drawNativeConnector(registry, end, 'target-b');
    return !!first.route?.length && !!second.route?.length && first.paths.length > 0 && second.paths.length > 0
      && JSON.stringify(first.route) !== JSON.stringify(second.route)
      && JSON.stringify(first.paths) !== JSON.stringify(second.paths);
  };
}
