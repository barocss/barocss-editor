import type { DocumentNode } from './document-access';

export type TableTheme = 'plain' | 'striped' | 'blue';

/** A semantic table theme follows current row positions, including newly inserted rows.
 * Applied beneath a cell's own attributes so explicit cell colors always win.
 */
export function tableThemeCellFormat(table: DocumentNode, row: number): Record<string, unknown> | undefined {
  const theme = table.attributes?.theme;
  if (theme !== 'plain' && theme !== 'striped' && theme !== 'blue') return undefined;
  const shadingFill = theme === 'plain' ? '' : theme === 'blue'
    ? row === 0 ? 'DBEAFE' : 'EFF6FF'
    : row === 0 ? 'F1F5F9' : row % 2 === 0 ? 'F8FAFC' : '';
  return { shadingFill, shadingPattern: '', shadingColor: '' };
}
