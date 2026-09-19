import type { NoteDatabase } from './database';
import { readNoteDelimited } from './note-exchange';

/** Clipboard rows have no header. Resolve the displayed range before changing any records. */
export function databaseRangeRecords(db: NoteDatabase, rowIds: unknown, fieldNames: unknown, text: unknown) {
  if (typeof text !== 'string' || !Array.isArray(rowIds) || !Array.isArray(fieldNames) ||
    !rowIds.length || !fieldNames.length || new Set(rowIds).size !== rowIds.length || new Set(fieldNames).size !== fieldNames.length) throw new Error('붙여넣을 시작 셀을 선택하세요.');
  const grid = readNoteDelimited(text, '\t');
  if (grid.length > rowIds.length) throw new Error('붙여넣을 행이 부족합니다. 행을 추가한 뒤 다시 붙여넣으세요.');
  if (grid[0].length > fieldNames.length) throw new Error('붙여넣을 열이 부족합니다. 시작 셀이나 표시할 속성을 확인하세요.');
  const records = structuredClone(db.records);
  grid.forEach((row, r) => {
    const index = db.rowIds.indexOf(rowIds[r]);
    if (index < 0) throw new Error('붙여넣을 항목이 삭제되었습니다. 다시 선택하세요.');
    row.forEach((raw, c) => {
      const field = db.fields.find(field => field.name === fieldNames[c]);
      if (!field) throw new Error('붙여넣을 속성이 없습니다.');
      const fail = (message: string): never => { throw new Error(`${r + 1}행 “${field.label || field.name}”: ${message}`); };
      let value: unknown = raw;
      if (['formula', 'rollup', 'relation', 'richText'].includes(field.kind)) fail('계산·관계·본문 속성에는 셀 범위를 붙여넣을 수 없습니다.');
      if (field.kind === 'number' && raw !== '') {
        value = Number(raw); if (!raw.trim() || !Number.isFinite(value)) fail('올바른 숫자를 입력하세요.');
      }
      if (field.kind === 'boolean') {
        if (!['', 'true', 'false', '예', '아니오'].includes(raw.trim().toLowerCase())) fail('true 또는 false를 입력하세요.');
        value = ['true', '예'].includes(raw.trim().toLowerCase());
      }
      if (field.kind === 'choices') {
        try { value = raw === '' ? [] : JSON.parse(raw); } catch { fail('다중 선택은 ["옵션1","옵션2"] 형식으로 입력하세요.'); }
        if (!Array.isArray(value) || value.some(v => typeof v !== 'string')) fail('다중 선택은 문자열 배열이어야 합니다.');
        if ((value as string[]).some(v => !field.options?.includes(v))) fail('속성 설정에 없는 옵션입니다.');
      }
      if (field.kind === 'choice' && raw && !field.options?.includes(raw)) fail('속성 설정에 없는 옵션입니다.');
      records[index][field.name] = value;
    });
  });
  return records;
}
