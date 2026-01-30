import type { Schema } from '@barocss/schema';
import type { INode } from '@barocss/datastore';

interface BaseNodeFields {
  sid: string;
  parentId?: string;
  text?: string;
}

export function buildINodeFromSchema(
  schema: Schema | undefined,
  stype: string,
  attrs: Record<string, any> = {},
  content: any[] = [],
  base: BaseNodeFields
): INode {
  const now = new Date();
  if (!schema) {
    return {
      sid: base?.sid || 'unknown',
      stype,
      attributes: attrs,
      content: content as any,
      ...(Array.isArray(content) && (content.length === 0 || typeof content[0] === 'string')
        ? { contentIds: content as unknown as string[] }
        : {}),
      text: base?.text,
      parentId: base?.parentId,
      version: 1,
      createdAt: now,
      updatedAt: now,
    } as INode;
  }

  // Use schema to construct and validate attributes/content shape
  const nodeLike = schema.node(stype, attrs, content);
  return {
    sid: base?.sid || 'unknown',
    stype,
    attributes: (nodeLike as any).attrs || attrs,
    content: (nodeLike as any).content || (content as any),
    ...(Array.isArray(content) && (content.length === 0 || typeof content[0] === 'string')
      ? { contentIds: content as unknown as string[] }
      : {}),
    text: base?.text,
    parentId: base?.parentId,
    version: 1,
    createdAt: now,
    updatedAt: now,
  } as INode;
}


