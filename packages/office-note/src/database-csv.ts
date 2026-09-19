import { readNoteCSV } from './note-exchange';
import type { NoteDatabase } from './database';

export function databaseCSVRows(source: string, db: NoteDatabase): Record<string, unknown>[] {
  const [header, ...rows] = readNoteCSV(source);
  if (!header?.length || header.some(name => !name || ['__proto__', 'prototype', 'constructor'].includes(name)) || new Set(header).size !== header.length) throw new Error('첫 행에 중복되지 않는 필드 이름을 입력하세요.');
  const fields = header.map(name => {
    const field = db.fields.find(field => field.name === name);
    if (!field) throw new Error(`필드 “${name}”이 없습니다. 필드를 먼저 추가하세요.`);
    if (['formula', 'rollup', 'relation'].includes(field.kind)) throw new Error(`“${name}”은 CSV로 입력할 수 없는 계산·관계 필드입니다.`);
    return field;
  });
  if (!rows.length) throw new Error('가져올 데이터 행이 없습니다.');
  return rows.map((row, index) => Object.fromEntries(fields.map((field, column) => {
    const raw = row[column] ?? ''; let value: unknown = raw;
    if (raw !== '' && field.kind === 'number') { value = Number(raw); if (!raw.trim() || !Number.isFinite(value)) throw new Error(`${index + 2}행 “${field.name}”에 올바른 숫자를 입력하세요.`); }
    if (raw !== '' && field.kind === 'boolean') { if (!['true', 'false'].includes(raw.toLowerCase())) throw new Error(`${index + 2}행 “${field.name}”은 true 또는 false여야 합니다.`); value = raw.toLowerCase() === 'true'; }
    if (field.kind === 'choices') { try { value = raw === '' ? [] : JSON.parse(raw); } catch { throw new Error(`${index + 2}행 “${field.name}”은 JSON 배열이어야 합니다.`); } if (!Array.isArray(value) || value.some(v => typeof v !== 'string')) throw new Error('다중 선택은 문자열 배열로 입력하세요.'); }
    return [field.name, value];
  })));
}
export function databaseCSVText(db: NoteDatabase): string {
  const quote = (value: unknown) => '"' + (value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value)).replace(/"/g, '""') + '"';
  return '\uFEFF' + [db.fields.map(field => field.name), ...db.computedRecords.map(row => db.fields.map(field => row[field.name]))].map(row => row.map(quote).join(',')).join('\r\n');
}
