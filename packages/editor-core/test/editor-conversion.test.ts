import { describe, it, expect, vi } from 'vitest';
import { Editor } from '../src/editor';
import { DocumentState } from '../src/types';
import { createSchema, getMinimalSchemaDefinition } from '@barocss/schema';

describe('Editor 문서 변환/동기화', () => {
  it('loadDocument는 stype/sid 트리를 DocumentState로 변환한다', () => {
    const treeDocument = {
      sid: 'doc-1',
      stype: 'document',
      content: [
        {
          sid: 'p-1',
          stype: 'paragraph',
          text: 'Hello',
          marks: [
            {
              stype: 'bold',
              attrs: { weight: 'bold' },
              range: [0, 5] as [number, number]
            }
          ]
        }
      ]
    };

    const editor = new Editor();
    editor.loadDocument(treeDocument, 'test-session');

    const document = editor.document;
    expect(document.type).toBe('document');
    expect(document.content).toHaveLength(1);
    expect(document.content[0]).toEqual(expect.objectContaining({
      id: 'p-1',
      type: 'paragraph',
      text: 'Hello'
    }));
    expect(document.content[0].marks).toEqual([
      {
        type: 'bold',
        attributes: { weight: 'bold' },
        range: [0, 5]
      }
    ]);
    expect(editor.getRootId()).toBe('doc-1');
  });

  it('setContent는 내부 문서를 INode 기반 트리로 동기화한다', () => {
    const content: DocumentState = {
      type: 'document',
      version: 1,
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      content: [
        {
          id: 'p-1',
          type: 'paragraph',
          content: [
            {
              id: 't-1',
              type: 'inline-text',
              text: 'Hello'
            }
          ]
        }
      ]
    };

    const editor = new Editor();
    editor.setContent(content);

    const exported = editor.exportDocument();

    expect(exported?.stype).toBe('document');
    expect(exported?.content).toHaveLength(1);
    expect(exported?.content?.[0]).toMatchObject({
      stype: 'paragraph',
      text: undefined,
      sid: expect.any(String)
    });
    expect(exported?.content?.[0].content?.[0]).toMatchObject({
      stype: 'inline-text',
      sid: expect.any(String),
      text: 'Hello'
    });
    expect(exported).not.toHaveProperty('content.0.type');
  });

  it('loadDocument 호출 시 editor:content.change 이벤트 payload가 DocumentState 형식이어야 한다', () => {
    const treeDocument = {
      sid: 'doc-2',
      stype: 'document',
      content: [
        {
          sid: 'p-2',
          stype: 'paragraph',
          text: 'Hello'
        }
      ]
    };

    const editor = new Editor();
    const handler = vi.fn();
    editor.on('editor:content.change', handler);

    editor.loadDocument(treeDocument, 'test-session');

    expect(handler).toHaveBeenCalledTimes(1);
    const payload = handler.mock.calls[0][0];
    expect(payload).toMatchObject({
      transaction: null,
      rootId: 'doc-2'
    });
    expect(payload.content).toMatchObject({
      type: 'document',
      content: expect.arrayContaining([
        expect.objectContaining({ type: 'paragraph', text: 'Hello' })
      ])
    });
  });

  it('exportDocument는 기본 스키마 metadata를 attributes.schema에 기록해야 한다', () => {
    const editor = new Editor();
    const exported = editor.exportDocument();

    expect((exported as any).attributes).toHaveProperty('schema');
    expect((exported as any).attributes.schema.topNode).toBe('document');
  });

  it('editor 생성 시 options.schema가 주어지면 schema metadata가 반영되어야 한다', () => {
    const customSchema = createSchema('custom-doc', getMinimalSchemaDefinition());
    const editor = new Editor({ schema: customSchema });
    const exported = editor.exportDocument();

    expect((exported as any).attributes?.schema.name).toBe('custom-doc');
  });
});
