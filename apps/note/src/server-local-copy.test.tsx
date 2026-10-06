// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readNoteSnapshotFile, serializeNoteFile } from '@barocss/office-note/file';
import { ServerLocalNoteCopy } from './server-local-copy';
const library = vi.hoisted(() => ({ rows: vi.fn(), read: vi.fn(), write: vi.fn(), remove: vi.fn() }));
vi.mock('@barocss/shared', async original => ({ ...await original<typeof import('@barocss/shared')>(), documentLibrary: () => library }));
beforeEach(() => { (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
let root: Root | undefined; let host: HTMLDivElement | undefined;
afterEach(async () => { if (root) await act(async () => root!.unmount()); host?.remove(); vi.clearAllMocks(); root = undefined; });
const native = {
  "format": "barocss-note",
  "version": 2,
  "schemaBundle": {
    "bundleVersion": 1,
    "digestAlgorithm": "wonffice.canonical-json.sha256.v1",
    "selected": [
      {
        "schemaId": "11111111-1111-1111-1111-111111111111",
        "version": 1,
        "digest": "1d5ed747190992707c92ff635f4b6a4747531a8bd4066e75d1b9064c4c75298b"
      }
    ],
    "definitions": [
      {
        "reference": {
          "schemaId": "11111111-1111-1111-1111-111111111111",
          "version": 1,
          "digest": "1d5ed747190992707c92ff635f4b6a4747531a8bd4066e75d1b9064c4c75298b"
        },
        "definitionText": "{\n  \"dialect\": \"wonffice.note-fields.v1\",\n  \"scope\": {\n    \"tenantId\": \"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\",\n    \"workspaceId\": \"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb\"\n  },\n  \"schemaId\": \"11111111-1111-1111-1111-111111111111\",\n  \"version\": 1,\n  \"parent\": null,\n  \"dependencies\": [],\n  \"requiredCapabilities\": [\n    \"note.field.text.v1\"\n  ],\n  \"dataset\": {\n    \"name\": \"items\",\n    \"fields\": [\n      {\n        \"name\": \"Title\",\n        \"kind\": \"text\"\n      }\n    ]\n  }\n}\n"
      }
    ]
  },
  "document": {
    "stype": "note",
    "content": [
      {
        "stype": "paragraph",
        "content": [
          {
            "stype": "inline-text",
            "text": "Café",
            "marks": [
              {
                "stype": "bold",
                "range": [
                  0,
                  5
                ]
              }
            ]
          }
        ]
      }
    ]
  }
};
it.each(['native1', 'native2'])('selects a local %s row with version-specific admission and no automatic server publication', async version => {
  const text = version === 'native2' ? JSON.stringify(native) : serializeNoteFile({ stype: 'note', attributes: { title: 'Local' }, content: native.document.content });
  if (version === 'native2') expect(readNoteSnapshotFile(text)).toEqual({ document: native.document, fileVersion: 2, schemaBundle: native.schemaBundle });
  else expect(readNoteSnapshotFile(text)).not.toHaveProperty('error');
  const row = { name: 'local-source', title: 'Local', savedAt: '2026-10-06T00:00:00Z' };
  const source = { row, text }, before = JSON.stringify(source);
  library.rows.mockResolvedValue([row]); library.read.mockResolvedValue(source);
  const onSelect = vi.fn();
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root!.render(<ServerLocalNoteCopy disabled={false} onSelect={onSelect} />));
  const click = async (label: string) => {
    const button = Array.from(host!.querySelectorAll('button')).find(b => b.textContent === label);
    expect(button).toBeDefined(); await act(async () => button!.click());
  };
  await click('로컬 노트 사본 가져오기'); await click('이 기기의 로컬 노트 목록 확인'); await click('서버 사본 준비 Local');
  expect(library.read).toHaveBeenCalledWith('local-source');
  if (version === 'native2') {
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('더 새로운 버전(2)');
    expect(onSelect).not.toHaveBeenCalled();
  } else expect(onSelect).toHaveBeenCalledWith({ name: row.name, snapshotText: text });
  expect(library.write).not.toHaveBeenCalled(); expect(library.remove).not.toHaveBeenCalled();
  expect(JSON.stringify(source)).toBe(before);
});
